import { randomUUID } from 'node:crypto';

import type * as storage from '@crawlee/types';
import { AsyncQueue } from '@sapphire/async-queue';
import { s } from '@sapphire/shapeshift';
import type { MemoryStorageClient } from '../memory-storage.js';
import { purgeNullsFromObject, uniqueKeyToRequestId } from '../utils.js';
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
     * The key used for cache lookup. When provided, takes precedence over `name` and `id`.
     * This allows alias-opened storages to have a cache key that differs from their
     * metadata `name` (which is `undefined` for unnamed storages).
     */
    cacheKey?: string;
    client: MemoryStorageClient;
}

export interface InternalRequest {
    id: string;
    orderNo: number | null;
    url: string;
    uniqueKey: string;
    method: Exclude<storage.RequestOptions['method'], undefined>;
    retryCount: number;
    json: string;
}

export class RequestQueueClient extends BaseClient implements storage.RequestQueueClient {
    name?: string;
    /**
     * The key used for cache lookup. For named storages, this equals the name. For alias (unnamed)
     * storages, this is the alias string. Falls back to id.
     */
    cacheKey: string;
    createdAt = new Date();
    accessedAt = new Date();
    modifiedAt = new Date();
    handledRequestCount = 0;
    pendingRequestCount = 0;
    /**
     * Serializes every operation that reads-then-writes this client's shared queue state — the
     * `requests` map, the `forefrontRequestIds` array, the `inProgressRequestIds` set and the request
     * counts. Those mutations span `await` points, so without this mutex a concurrent operation could
     * interleave and corrupt them (e.g. a head scan pruning `forefrontRequestIds` while
     * `addBatchOfRequests` pushes to it). Held by every mutating method as well as by `isEmpty`/
     * `isFinished`, whose head scan also prunes `forefrontRequestIds`.
     */
    private readonly queueStateMutex = new AsyncQueue();
    private forefrontRequestIds: string[] = [];

    /**
     * IDs of requests currently fetched but not yet handled or reclaimed. A request in this set is
     * "in progress" and will not be handed out again by {@link fetchNextRequest}.
     *
     * Unlike the file-system / platform clients, the in-memory queue lives entirely within a single
     * process and is never shared with another consumer, so there is no need for an expiring,
     * cross-process-visible lock — tracking in-progress requests in this set is enough.
     */
    private readonly inProgressRequestIds = new Set<string>();

    private readonly requests = new Map<string, InternalRequest>();
    private readonly client: MemoryStorageClient;

    constructor(options: RequestQueueClientOptions) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.cacheKey = options.cacheKey ?? this.name ?? this.id;
        this.client = options.client;
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
     * in progress — ordered by `orderNo`, deduplicated.
     *
     * When `detectInProgressRequests` is set, the result also carries an `hasInProgressRequests` flag
     * telling whether any unhandled-but-in-progress request was skipped along the way. It lets
     * {@link isFinished} distinguish "no work left at all" from "work remains, but it is currently being
     * processed". Without it, a consumer with concurrency could consider the queue finished and shut the
     * crawler down while it is still handling the last requests.
     *
     * Computing the flag is expensive: because an in-progress request may sit anywhere in the queue, it
     * forces a scan of every pending entry even when only `limit` items are wanted. Callers that only
     * need the head (e.g. {@link fetchNextRequest}, {@link isEmpty}) leave it off so the scan can stop as
     * soon as the page is filled, keeping those calls O(head) instead of O(N).
     */
    private async listPendingHead(
        limit: number,
        detectInProgressRequests = false,
    ): Promise<{ items: InternalRequest[]; hasInProgressRequests?: boolean }> {
        const items: InternalRequest[] = [];
        let hasInProgressRequests = false;

        // Tracks processed request IDs to avoid duplicates (request in both `forefrontRequestIds` and `requests`).
        const seenRequestIds = new Set<string>();
        // Tracks handled request IDs from `forefrontRequestIds` to be removed.
        const handledForefrontIds = new Set<string>();

        for (const requestId of this.requestKeyIterator()) {
            // Once the requested page is filled we can stop — unless the caller asked us to detect
            // in-progress requests and we have not yet seen one, in which case we must keep scanning.
            if (items.length >= limit && (!detectInProgressRequests || hasInProgressRequests)) {
                break;
            }

            if (seenRequestIds.has(requestId)) {
                continue;
            }

            seenRequestIds.add(requestId);

            const request = this.requests.get(requestId)!;

            // Permanently-handled requests (`orderNo === null`) are in a terminal state and can be skipped.
            if (request.orderNo === null) {
                if (this.forefrontRequestIds.includes(requestId)) {
                    handledForefrontIds.add(requestId);
                }
                continue;
            }

            // In progress (fetched but not yet handled or reclaimed) — skip it, but remember that the
            // queue is not truly empty.
            if (this.inProgressRequestIds.has(requestId)) {
                hasInProgressRequests = true;
                continue;
            }

            if (items.length < limit) {
                items.push(request);
            }
        }

        this.forefrontRequestIds = this.forefrontRequestIds.filter((id) => !handledForefrontIds.has(id));

        return {
            items: items.sort((a, b) => a.orderNo! - b.orderNo!),
            hasInProgressRequests: detectInProgressRequests ? hasInProgressRequests : undefined,
        };
    }

    async fetchNextRequest(): Promise<storage.RequestOptions | null> {
        this.updateTimestamps(false);

        await this.queueStateMutex.wait();

        try {
            const {
                items: [head],
            } = await this.listPendingHead(1);

            if (!head) {
                return null;
            }

            // Mark the request as in progress so it is not handed out again until it is handled or
            // reclaimed. The request keeps its `orderNo` (and thus its forefront / normal ordering).
            this.inProgressRequestIds.add(head.id);

            return this._jsonToRequest(head.json) ?? null;
        } finally {
            this.queueStateMutex.shift();
        }
    }

    async addBatchOfRequests(
        requests: storage.RequestSchema[],
        options: storage.RequestOptions = {},
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

                const existingRequestWithId = this.requests.get(requestModel.id);

                if (existingRequestWithId) {
                    result.processedRequests.push({
                        requestId: existingRequestWithId.id,
                        uniqueKey: existingRequestWithId.uniqueKey,
                        wasAlreadyHandled: existingRequestWithId.orderNo === null,
                        wasAlreadyPresent: true,
                    });

                    continue;
                }

                this.requests.set(requestModel.id, requestModel);

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

    async getRequest(uniqueKey: string): Promise<storage.RequestOptions | undefined> {
        s.string().parse(uniqueKey);
        this.updateTimestamps(false);
        const id = uniqueKeyToRequestId(uniqueKey);
        const json = this.requests.get(id)?.json;
        return this._jsonToRequest(json);
    }

    async markRequestAsHandled(request: storage.UpdateRequestSchema): Promise<storage.QueueOperationInfo | null> {
        requestShape.parse(request);
        this.updateTimestamps(false);

        // Serialize against other mutators (and the head scans in `isEmpty`/`isFinished`) so the shared
        // `requests` map, `inProgressRequestIds` set and request counts stay consistent across the
        // `await` points below.
        await this.queueStateMutex.wait();

        try {
            const id = uniqueKeyToRequestId(request.uniqueKey);

            const existingRequest = this.requests.get(id);

            // The request must exist to be marked as handled. We intentionally do NOT require it to still
            // be in progress: marking an already-released request handled must still succeed, otherwise
            // the request could be handed out again and the queue would never finish.
            if (!existingRequest) {
                return null;
            }

            // A handled request has `orderNo === null`. Marking it again is an idempotent no-op.
            const wasAlreadyHandled = existingRequest.orderNo === null;

            const handledAt = request.handledAt ?? new Date().toISOString();
            const requestModel = this._createInternalRequest({ ...request, handledAt }, false);

            this.requests.set(id, requestModel);

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
        options: storage.RequestOptions = {},
    ): Promise<storage.QueueOperationInfo | null> {
        requestShape.parse(request);
        requestOptionsShape.parse(options);
        this.updateTimestamps(false);

        // Serialize against other mutators (and the head scans in `isEmpty`/`isFinished`) so the shared
        // `requests` map, `forefrontRequestIds` array and `inProgressRequestIds` set stay consistent
        // across the `await` points below.
        await this.queueStateMutex.wait();

        try {
            const id = uniqueKeyToRequestId(request.uniqueKey);

            const existingRequest = this.requests.get(id);

            // The request must exist and not already be handled to be reclaimed. As with
            // `markRequestAsHandled`, we do NOT require it to still be in progress — returning an
            // already-released request to the queue (e.g. to honor a `forefront` reorder) must still
            // work, rather than have the reclaim silently dropped.
            if (!existingRequest || existingRequest.orderNo === null) {
                return null;
            }

            // Reclaiming resets the `orderNo` to a fresh timestamp, restoring the request to the queue
            // (at the front if `forefront`).
            const requestModel = this._createInternalRequest(request, options.forefront);

            this.requests.set(id, requestModel);

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
        // would return `null`. Requests that are currently in progress are intentionally NOT counted
        // here: they are not fetchable, so the queue is empty from a consumer's point of view. Whether
        // those in-progress requests mean crawling is not yet done is a separate question, answered by
        // `isFinished`.
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

        // The queue is finished only when there is nothing left to fetch AND nothing currently in
        // progress. Counting in-progress requests is what allows a crawler with concurrency to keep
        // waiting while it still holds the last requests, instead of finishing prematurely.
        //
        // Detecting in-progress requests requires a full scan, hence the `detectInProgressRequests`
        // flag — unlike `fetchNextRequest`/`isEmpty`, which only need the head and can stop early.
        //
        // `listPendingHead` prunes `forefrontRequestIds` as it scans, so we must hold the queue-state mutex to avoid
        // racing a concurrent mutator (e.g. `addBatchOfRequests`) at its `await` points.
        await this.queueStateMutex.wait();

        try {
            const { items, hasInProgressRequests } = await this.listPendingHead(1, true);
            return items.length === 0 && !hasInProgressRequests;
        } finally {
            this.queueStateMutex.shift();
        }
    }

    /**
     * Returns all pending (not yet handled, not currently in progress) requests in the queue, ordered
     * the same way {@link fetchNextRequest} would hand them out. This does not mutate the queue,
     * nothing is marked in progress.
     */
    async listItems(): Promise<storage.RequestOptions[]> {
        this.updateTimestamps(false);

        // `listPendingHead` prunes `forefrontRequestIds` as it scans, so we must hold the queue-state
        // mutex to avoid racing a concurrent mutator at its `await` points.
        await this.queueStateMutex.wait();

        try {
            const { items } = await this.listPendingHead(Number.POSITIVE_INFINITY);
            return items.map((request) => this._jsonToRequest<storage.RequestOptions>(request.json)!);
        } finally {
            this.queueStateMutex.shift();
        }
    }

    toRequestQueueInfo(): storage.RequestQueueInfo {
        return {
            accessedAt: this.accessedAt,
            createdAt: this.createdAt,
            hadMultipleClients: false,
            handledRequestCount: this.handledRequestCount,
            id: this.id,
            modifiedAt: this.modifiedAt,
            name: this.name,
            pendingRequestCount: this.pendingRequestCount,
            stats: {},
            totalRequestCount: this.requests.size,
            userId: '1',
        };
    }

    private updateTimestamps(hasBeenModified: boolean) {
        this.accessedAt = new Date();

        if (hasBeenModified) {
            this.modifiedAt = new Date();
        }
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
