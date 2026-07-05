import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import type * as storage from '@crawlee/types';
import { AsyncQueue } from '@sapphire/async-queue';
import { s } from '@sapphire/shapeshift';
import type { RequestQueueFileSystemEntry } from '../fs/request-queue/fs.js';

import { scheduleBackgroundTask } from '../background-handler/index.js';
import { createRequestQueueStorageImplementation } from '../fs/request-queue/index.js';
import type { FileSystemStorageClient } from '../index.js';
import { purgeNullsFromObject, resolveWithinDirectory, uniqueKeyToRequestId } from '../utils.js';
import { BaseClient } from './common/base-client.js';

const requestShape = s
    .object({
        id: s.string(),
        url: s.string().url({ allowedProtocols: ['http:', 'https:'] }),
        uniqueKey: s.string(),
        method: s.string().optional(),
        retryCount: s.number().int().optional(),
        handledAt: s.union([s.string(), s.date().valid()]).optional(),
    })
    .passthrough();

const requestShapeWithoutId = requestShape.omit(['id']);

const batchRequestShapeWithoutId = requestShapeWithoutId.array();

const requestOptionsShape = s.object({
    forefront: s.boolean().optional(),
});

export interface RequestQueueClientOptions {
    name?: string;
    id?: string;
    /**
     * The directory name to use on disk. When provided, takes precedence over `name` and `id`
     * for the directory path. This allows alias-opened storages to have a directory name
     * that differs from their metadata `name` (which is `undefined` for unnamed storages).
     */
    directoryName?: string;
    baseStorageDirectory: string;
    client: FileSystemStorageClient;
}

export interface InternalRequest {
    id: string;
    orderNo: number | null;
    url: string;
    uniqueKey: string;
    method: storage.RequestSchema['method'];
    retryCount: number;
    json: string;
}

/**
 * Default time (in seconds) for which a request fetched via {@link RequestQueueClient.fetchNextRequest}
 * stays locked (in progress) before it becomes available again. Aligns with the historical request queue
 * locking default. A consumer (e.g. a crawler) can raise this per queue via
 * {@link RequestQueueClient.setExpectedRequestProcessingTimeSecs}.
 */
const DEFAULT_REQUEST_LOCK_SECS = 3 * 60;

/**
 * A request is "locked" (in progress) when its `orderNo` is pushed beyond the current time. The sign of
 * `orderNo` is preserved so the original forefront / normal ordering is restored once the lock expires
 * or the request is reclaimed.
 */
function isRequestLocked(orderNo: number | null, now: number): boolean {
    return orderNo !== null && Math.abs(orderNo) > now;
}

export class RequestQueueClient extends BaseClient implements storage.RequestQueueClient {
    name?: string;
    /**
     * The key used for directory naming and cache lookup. For named storages, this equals
     * the name. For alias (unnamed) storages, this is the alias string. Falls back to id.
     */
    directoryName: string;
    createdAt = new Date();
    accessedAt = new Date();
    modifiedAt = new Date();
    handledRequestCount = 0;
    pendingRequestCount = 0;
    requestQueueDirectory: string;
    /**
     * Serializes every operation that reads-then-writes this client's shared queue state — the
     * `requests` map, the `forefrontRequestIds` array, the `inProgressRequestIds` set and the request
     * counts. Those mutations span `await` points (disk/storage I/O), so without this lock a concurrent
     * operation could interleave and corrupt them (e.g. a head scan pruning `forefrontRequestIds` while
     * `addBatchOfRequests` pushes to it). Held by every mutating method as well as by `isEmpty`/
     * `isFinished`, whose head scan also prunes `forefrontRequestIds`.
     */
    private readonly queueStateMutex = new AsyncQueue();
    private forefrontRequestIds: string[] = [];

    /**
     * IDs of requests this client has locked (fetched but not yet handled or reclaimed). Used by
     * {@link releaseOwnLocks} to free our own in-progress requests on process termination, so that
     * a crashed/migrated consumer does not block its requests for the full lock duration.
     */
    private readonly inProgressRequestIds = new Set<string>();

    private readonly requests = new Map<string, RequestQueueFileSystemEntry>();
    private readonly client: FileSystemStorageClient;

    /**
     * How long (in seconds) a request fetched from this client stays locked (in progress). Defaults to
     * {@link DEFAULT_REQUEST_LOCK_SECS} and is overridable via {@link setExpectedRequestProcessingTimeSecs}.
     */
    private lockSecs = DEFAULT_REQUEST_LOCK_SECS;

    constructor(options: RequestQueueClientOptions) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.directoryName = options.directoryName ?? this.name ?? this.id;
        this.requestQueueDirectory = resolveWithinDirectory(options.baseStorageDirectory, this.directoryName);
        this.client = options.client;
    }

    /**
     * Applies how long {@link fetchNextRequest} locks a request before it becomes available again. The
     * caller (the `RequestQueue` frontend) owns the policy of what this value should be — this method
     * just applies it.
     */
    async setExpectedRequestProcessingTimeSecs(secs: number): Promise<void> {
        this.lockSecs = secs;
    }

    async getMetadata(): Promise<storage.RequestQueueInfo> {
        this.updateTimestamps(false);
        return this.toRequestQueueInfo();
    }

    async drop(): Promise<void> {
        // Serialize against other mutators (and the head scans in `isEmpty`/`isFinished`) so a concurrent
        // operation cannot observe half-cleared state — e.g. a forefront id whose request has already been
        // removed, which `listPendingHead` would then dereference as `undefined`.
        await this.queueStateMutex.wait();

        try {
            const storeIndex = this.client.requestQueueCache.findIndex((queue) => queue.id === this.id);

            if (storeIndex !== -1) {
                const [oldClient] = this.client.requestQueueCache.splice(storeIndex, 1);
                oldClient.pendingRequestCount = 0;
                // Clear all in-memory state, consistent with `purge`. Clearing `requests` alone would
                // leave dangling ids in `forefrontRequestIds`/`inProgressRequestIds`, which a later head
                // scan would resolve to a missing request and dereference.
                oldClient.requests.clear();
                oldClient.forefrontRequestIds = [];
                oldClient.inProgressRequestIds.clear();

                await rm(oldClient.requestQueueDirectory, { recursive: true, force: true });
            }
        } finally {
            this.queueStateMutex.shift();
        }
    }

    async purge(): Promise<void> {
        // Serialize against other mutators (and the head scans in `isEmpty`/`isFinished`) so a concurrent
        // operation cannot observe or repopulate half-cleared state across the `await` below.
        await this.queueStateMutex.wait();

        try {
            // Clear all in-memory state
            this.requests.clear();
            this.forefrontRequestIds = [];
            this.inProgressRequestIds.clear();
            this.handledRequestCount = 0;
            this.pendingRequestCount = 0;

            // Reset the lock duration back to the default so a value raised via
            // `setExpectedRequestProcessingTimeSecs` in an earlier run does not leak into a later one
            this.lockSecs = DEFAULT_REQUEST_LOCK_SECS;

            // Remove request files from disk but keep the directory
            const { readdir } = await import('node:fs/promises');
            const entries = await readdir(this.requestQueueDirectory).catch(() => []);
            for (const entry of entries) {
                if (entry !== '__metadata__.json') {
                    await rm(resolve(this.requestQueueDirectory, entry), { force: true });
                }
            }

            this.updateTimestamps(true);
        } finally {
            this.queueStateMutex.shift();
        }
    }

    private *requestKeyIterator(): IterableIterator<string> {
        for (let i = this.forefrontRequestIds.length - 1; i >= 0; i--) {
            yield this.forefrontRequestIds[i];
        }

        for (const key of this.requests.keys()) {
            yield key;
        }
    }

    /**
     * Scans the queue and returns the pending head — requests that are neither handled nor currently
     * locked (in progress) — ordered by `orderNo`, deduplicated.
     *
     * When `detectLockedRequests` is set, the result also carries a `hasLockedRequests` flag telling
     * whether any unhandled-but-locked request was skipped along the way. This mirrors the Apify
     * platform shared client's `queueHasLockedRequests` signal: it lets {@link isFinished} distinguish
     * "no work left at all" from "work remains, but it is currently locked by some consumer (possibly
     * another process)". Without it, a consumer would consider the queue finished and let the crawler
     * shut down while another consumer still holds the last requests.
     *
     * Computing the flag is expensive: because a lock may sit anywhere in the queue, it forces a scan
     * of every pending entry even when only `limit` items are wanted. Callers that only need the head
     * (e.g. {@link fetchNextRequest}, {@link isEmpty}) leave it off so the scan can stop as soon as the
     * page is filled, keeping those calls O(head) instead of O(N).
     *
     * Lock state lives in the persisted `orderNo` (see {@link isRequestLocked}), so that processes
     * sharing the same on-disk queue observe each other's locks. We therefore re-read entries from
     * storage to obtain fresh lock state, except for entries we can cheaply rule out as permanently
     * handled via their cached `orderNo === null`.
     */
    private async listPendingHead(
        limit: number,
        detectLockedRequests = false,
    ): Promise<{ items: InternalRequest[]; hasLockedRequests?: boolean }> {
        const now = Date.now();
        const items: InternalRequest[] = [];
        let hasLockedRequests = false;

        // Tracks processed request IDs to avoid duplicates (request in both `forefrontRequestIds` and `requests`).
        const seenRequestIds = new Set<string>();
        // Tracks handled request IDs from `forefrontRequestIds` to be removed.
        const handledForefrontIds = new Set<string>();

        for (const requestId of this.requestKeyIterator()) {
            // Once the requested page is filled we can stop — unless the caller asked us to detect locked
            // requests and we have not yet seen one, in which case we must keep scanning to find them.
            if (items.length >= limit && (!detectLockedRequests || hasLockedRequests)) {
                break;
            }

            if (seenRequestIds.has(requestId)) {
                continue;
            }

            seenRequestIds.add(requestId);

            const storageEntry = this.requests.get(requestId)!;

            // Cheap rejection of permanently-handled requests using the cached `orderNo` (handled is a
            // terminal state, so the cached value can be trusted without re-reading from storage).
            if (storageEntry.orderNo === null) {
                if (this.forefrontRequestIds.includes(requestId)) {
                    handledForefrontIds.add(requestId);
                }
                continue;
            }

            // Re-read from storage to get fresh lock state — another process may have locked (or handled)
            // this request since we last cached it.
            const request = await storageEntry.get(true);

            // Handled in the meantime.
            if (request.orderNo === null) {
                if (this.forefrontRequestIds.includes(requestId)) {
                    handledForefrontIds.add(requestId);
                }
                continue;
            }

            // Locked (in progress) by us or another process — skip until the lock expires, but remember
            // that the queue is not truly empty.
            if (isRequestLocked(request.orderNo, now)) {
                hasLockedRequests = true;
                continue;
            }

            if (items.length < limit) {
                items.push(request);
            }
        }

        this.forefrontRequestIds = this.forefrontRequestIds.filter((id) => !handledForefrontIds.has(id));

        return {
            items: items.sort((a, b) => a.orderNo! - b.orderNo!),
            hasLockedRequests: detectLockedRequests ? hasLockedRequests : undefined,
        };
    }

    async fetchNextRequest(): Promise<storage.UpdateRequestSchema | undefined> {
        this.updateTimestamps(false);

        await this.queueStateMutex.wait();

        try {
            const {
                items: [head],
            } = await this.listPendingHead(1);

            if (!head) {
                return undefined;
            }

            // Lock the request by pushing its `orderNo` beyond the lock expiry, preserving the sign so
            // its original (forefront / normal) position is restored once the lock expires. The lock is
            // persisted so other processes sharing this queue will not fetch the same request.
            const lockExpiresAt = Date.now() + this.lockSecs * 1000;
            head.orderNo = lockExpiresAt * (head.orderNo! > 0 ? 1 : -1);
            await this.requests.get(head.id)!.update(head);

            // Remember that this client owns the lock, so we can release it on process termination
            // (see `releaseOwnLocks`) instead of leaving the request stuck until the lock expires.
            this.inProgressRequestIds.add(head.id);

            return this._jsonToRequest(head.json) ?? undefined;
        } finally {
            this.queueStateMutex.shift();
        }
    }

    async addBatchOfRequests(
        requests: storage.RequestSchema[],
        options: storage.RequestQueueOperationOptions = {},
    ): Promise<storage.BatchAddRequestsResult> {
        batchRequestShapeWithoutId.parse(requests);
        requestOptionsShape.parse(options);

        // Serialize against other mutators (and the head scans in `isEmpty`/`isFinished`) so that the
        // shared `requests` map, `forefrontRequestIds` array and request counts are not corrupted by a
        // concurrent operation interleaving at one of the `await` points below.
        await this.queueStateMutex.wait();

        try {
            const result: storage.BatchAddRequestsResult = {
                processedRequests: [],
                unprocessedRequests: [],
            };

            for (const model of requests) {
                const requestModel = this._createInternalRequest(model, options.forefront);

                const existingRequestWithIdEntry = this.requests.get(requestModel.id);

                if (existingRequestWithIdEntry) {
                    const existingRequestWithId = await existingRequestWithIdEntry.get();

                    result.processedRequests.push({
                        requestId: existingRequestWithId.id,
                        uniqueKey: existingRequestWithId.uniqueKey,
                        wasAlreadyHandled: existingRequestWithId.orderNo === null,
                        wasAlreadyPresent: true,
                    });

                    continue;
                }

                const newEntry = createRequestQueueStorageImplementation({
                    requestId: requestModel.id,
                    storeDirectory: this.requestQueueDirectory,
                });

                await newEntry.update(requestModel);

                this.requests.set(requestModel.id, newEntry);

                if (requestModel.orderNo) {
                    this.pendingRequestCount += 1;
                } else {
                    this.handledRequestCount += 1;
                }

                if (options.forefront) {
                    this.forefrontRequestIds.push(requestModel.id);
                }

                result.processedRequests.push({
                    requestId: requestModel.id,
                    uniqueKey: requestModel.uniqueKey,
                    // We return wasAlreadyHandled: false even though the request may
                    // have been added as handled, because that's how API behaves.
                    wasAlreadyHandled: false,
                    wasAlreadyPresent: false,
                });
            }

            this.updateTimestamps(true);

            return result;
        } finally {
            this.queueStateMutex.shift();
        }
    }

    async getRequest(uniqueKey: string): Promise<storage.UpdateRequestSchema | undefined> {
        s.string().parse(uniqueKey);
        this.updateTimestamps(false);
        const id = uniqueKeyToRequestId(uniqueKey);
        const json = (await this.requests.get(id)?.get())?.json;
        return this._jsonToRequest(json);
    }

    async markRequestAsHandled(request: storage.UpdateRequestSchema): Promise<storage.QueueOperationInfo | undefined> {
        requestShape.parse(request);
        this.updateTimestamps(false);

        // Serialize against other mutators (and the head scans in `isEmpty`/`isFinished`) so the shared
        // `requests` map, `inProgressRequestIds` set and request counts stay consistent across the
        // `await` points below.
        await this.queueStateMutex.wait();

        try {
            const id = uniqueKeyToRequestId(request.uniqueKey);

            const existingEntry = this.requests.get(id);
            const existingRequest = await existingEntry?.get();

            // The request must exist to be marked as handled. We intentionally do NOT require it to still
            // be locked: a consumer whose processing outlived the lock (slow handler, GC/event-loop pause,
            // a low `setExpectedRequestProcessingTimeSecs`) must still be able to mark its request handled,
            // otherwise the request would be handed out again forever and the queue would never finish.
            if (!existingRequest) {
                return undefined;
            }

            // A handled request has `orderNo === null`. Marking it again is an idempotent no-op.
            const wasAlreadyHandled = existingRequest.orderNo === null;

            const handledAt = request.handledAt ?? new Date().toISOString();
            const requestModel = this._createInternalRequest({ ...request, handledAt }, false);

            const newEntry = createRequestQueueStorageImplementation({
                requestId: id,
                storeDirectory: this.requestQueueDirectory,
            });
            await newEntry.update(requestModel);
            this.requests.set(id, newEntry);

            // The request is no longer in progress for this client.
            this.inProgressRequestIds.delete(id);

            if (!wasAlreadyHandled) {
                this.pendingRequestCount -= 1;
                this.handledRequestCount += 1;
            }

            this.updateTimestamps(true);

            return {
                requestId: id,
                wasAlreadyHandled,
                wasAlreadyPresent: true,
            };
        } finally {
            this.queueStateMutex.shift();
        }
    }

    async reclaimRequest(
        request: storage.UpdateRequestSchema,
        options: storage.RequestQueueOperationOptions = {},
    ): Promise<storage.QueueOperationInfo | undefined> {
        requestShape.parse(request);
        requestOptionsShape.parse(options);
        this.updateTimestamps(false);

        // Serialize against other mutators (and the head scans in `isEmpty`/`isFinished`) so the shared
        // `requests` map, `forefrontRequestIds` array and `inProgressRequestIds` set stay consistent
        // across the `await` points below.
        await this.queueStateMutex.wait();

        try {
            const id = uniqueKeyToRequestId(request.uniqueKey);

            const existingEntry = this.requests.get(id);
            const existingRequest = await existingEntry?.get();

            // The request must exist and not already be handled to be reclaimed. As with
            // `markRequestAsHandled`, we do NOT require it to still be locked — a consumer that failed
            // after its lock expired must still be able to return the request to the queue (e.g. to honor
            // a `forefront` reorder), rather than have the reclaim silently dropped.
            if (!existingRequest || existingRequest.orderNo === null) {
                return undefined;
            }

            // Reclaiming resets the `orderNo` to a fresh timestamp, releasing the lock and restoring the
            // request to the queue (at the front if `forefront`).
            const requestModel = this._createInternalRequest(request, options.forefront);

            const newEntry = createRequestQueueStorageImplementation({
                requestId: id,
                storeDirectory: this.requestQueueDirectory,
            });
            await newEntry.update(requestModel);
            this.requests.set(id, newEntry);

            // The request is no longer in progress for this client.
            this.inProgressRequestIds.delete(id);

            if (options.forefront) {
                this.forefrontRequestIds.push(id);
            }

            this.updateTimestamps(true);

            return {
                requestId: id,
                wasAlreadyHandled: false,
                wasAlreadyPresent: true,
            };
        } finally {
            this.queueStateMutex.shift();
        }
    }

    async isEmpty(): Promise<boolean> {
        this.updateTimestamps(false);

        // "Empty" means there is nothing left to fetch right now — i.e. the next `fetchNextRequest`
        // would return `null`. Requests that are currently locked (in progress) are intentionally NOT
        // counted here: they are not fetchable, so the queue is empty from a consumer's point of view.
        // Whether those in-progress requests mean crawling is not yet done is a separate question,
        // answered by `isFinished`.
        //
        // `listPendingHead` prunes `forefrontRequestIds` as it scans, so we must hold the queue-state mutex to avoid
        // racing a concurrent mutator (e.g. `addBatchOfRequests`) at its `await` points.
        await this.queueStateMutex.wait();

        try {
            const { items } = await this.listPendingHead(1);
            return items.length === 0;
        } finally {
            this.queueStateMutex.shift();
        }
    }

    async isFinished(): Promise<boolean> {
        this.updateTimestamps(false);

        // The queue is finished only when there is nothing left to fetch AND nothing currently locked
        // (in progress) by any consumer. Counting locked requests is what allows a crawler to keep
        // waiting while another consumer (possibly another process sharing this on-disk queue) still
        // holds the last requests, instead of finishing prematurely. This mirrors the Apify platform
        // shared client's `queueHasLockedRequests` signal.
        //
        // Detecting locked requests requires a full scan, hence the `detectLockedRequests` flag — unlike
        // `fetchNextRequest`/`isEmpty`, which only need the head and can stop early.
        //
        // `listPendingHead` prunes `forefrontRequestIds` as it scans, so we must hold the queue-state mutex to avoid
        // racing a concurrent mutator (e.g. `addBatchOfRequests`) at its `await` points.
        await this.queueStateMutex.wait();

        try {
            const { items, hasLockedRequests } = await this.listPendingHead(1, true);
            return items.length === 0 && !hasLockedRequests;
        } finally {
            this.queueStateMutex.shift();
        }
    }

    /**
     * Release the locks of all requests this client currently has in progress, returning them to the
     * queue so they can be fetched again immediately.
     *
     * On the Apify platform, a run's locks are released automatically when it migrates or aborts. This
     * client, however, persists fake locks via `orderNo`, so it needs to clean up after itself.
     * `FileSystemStorageClient.teardown()` calls this for every cached queue at the end of the process so that
     * a fetched-but-unhandled request is not stuck (waiting for its lock to expire) for the next consumer
     * of the same on-disk queue.
     */
    async releaseOwnLocks(): Promise<void> {
        if (this.inProgressRequestIds.size === 0) {
            return;
        }

        await this.queueStateMutex.wait();

        try {
            const now = Date.now();

            for (const id of this.inProgressRequestIds) {
                const entry = this.requests.get(id);
                const request = await entry?.get(true);

                // Skip requests that were handled or whose lock already expired/changed — we only undo
                // locks we still hold.
                if (!request || !isRequestLocked(request.orderNo, now)) {
                    continue;
                }

                // Reset the lock to a fresh timestamp, preserving the sign so the request keeps its
                // original (forefront / normal) ordering once unlocked.
                request.orderNo = now * (request.orderNo! > 0 ? 1 : -1);
                await entry!.update(request);
            }

            this.inProgressRequestIds.clear();
            this.updateTimestamps(true);
        } finally {
            this.queueStateMutex.shift();
        }
    }

    toRequestQueueInfo(): storage.RequestQueueInfo {
        return {
            accessedAt: this.accessedAt,
            createdAt: this.createdAt,
            handledRequestCount: this.handledRequestCount,
            id: this.id,
            modifiedAt: this.modifiedAt,
            name: this.name,
            pendingRequestCount: this.pendingRequestCount,
            totalRequestCount: this.requests.size,
        };
    }

    private updateTimestamps(hasBeenModified: boolean) {
        this.accessedAt = new Date();

        if (hasBeenModified) {
            this.modifiedAt = new Date();
        }

        const data = {
            ...this.toRequestQueueInfo(),
            forefrontRequestIds: this.forefrontRequestIds,
        };

        scheduleBackgroundTask(
            {
                action: 'update-metadata',
                data,
                entityType: 'requestQueues',
                entityDirectory: this.requestQueueDirectory,
                id: this.name ?? this.id,
                writeMetadata: this.client.writeMetadata,
            },
            this.client.logger,
        );
    }

    private _jsonToRequest<T>(requestJson?: string): T | undefined {
        if (!requestJson) return undefined;
        const request = JSON.parse(requestJson);
        return purgeNullsFromObject(request);
    }

    private _createInternalRequest(request: storage.RequestSchema, forefront?: boolean): InternalRequest {
        const orderNo = this._calculateOrderNo(request, forefront);
        const id = uniqueKeyToRequestId(request.uniqueKey);

        if (request.id && request.id !== id) {
            throw new Error('Request ID does not match its uniqueKey.');
        }

        const json = JSON.stringify({ ...request, id });
        return {
            id,
            json,
            method: request.method,
            orderNo,
            retryCount: request.retryCount ?? 0,
            uniqueKey: request.uniqueKey,
            url: request.url,
        };
    }

    private _calculateOrderNo(request: storage.RequestSchema, forefront?: boolean) {
        if (request.handledAt) return null;

        const timestamp = Date.now();

        return forefront ? -timestamp : timestamp;
    }
}
