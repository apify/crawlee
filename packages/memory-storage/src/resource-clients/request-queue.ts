import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import type * as storage from '@crawlee/types';
import { AsyncQueue } from '@sapphire/async-queue';
import { s } from '@sapphire/shapeshift';
import type { RequestQueueFileSystemEntry } from '../fs/request-queue/fs.js';
import type { RequestQueueMemoryEntry } from '../fs/request-queue/memory.js';

import { scheduleBackgroundTask } from '../background-handler/index.js';
import { createRequestQueueStorageImplementation } from '../fs/request-queue/index.js';
import type { MemoryStorage } from '../index.js';
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
     * The directory name to use on disk. When provided, takes precedence over `name` and `id`
     * for the directory path. This allows alias-opened storages to have a directory name
     * that differs from their metadata `name` (which is `undefined` for unnamed storages).
     */
    directoryName?: string;
    baseStorageDirectory: string;
    client: MemoryStorage;
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

/**
 * Default time (in seconds) for which a request fetched via {@link RequestQueueClient.fetchNextRequest}
 * stays locked (in progress). The lock is persisted to disk so that other processes sharing the same
 * queue do not fetch the same request, and it expires automatically — this way a crashed consumer does
 * not block its requests forever. Aligns with the historical request queue locking default.
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
    private readonly mutex = new AsyncQueue();
    private forefrontRequestIds: string[] = [];

    private readonly requests = new Map<string, RequestQueueFileSystemEntry | RequestQueueMemoryEntry>();
    private readonly client: MemoryStorage;

    constructor(options: RequestQueueClientOptions) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.directoryName = options.directoryName ?? this.name ?? this.id;
        this.requestQueueDirectory = resolve(options.baseStorageDirectory, this.directoryName);
        this.client = options.client;
    }

    async getMetadata(): Promise<storage.RequestQueueInfo> {
        this.updateTimestamps(false);
        return this.toRequestQueueInfo();
    }

    async drop(): Promise<void> {
        const storeIndex = this.client.requestQueueCache.findIndex((queue) => queue.id === this.id);

        if (storeIndex !== -1) {
            const [oldClient] = this.client.requestQueueCache.splice(storeIndex, 1);
            oldClient.pendingRequestCount = 0;
            oldClient.requests.clear();

            await rm(oldClient.requestQueueDirectory, { recursive: true, force: true });
        }
    }

    async purge(): Promise<void> {
        // Clear all in-memory state
        this.requests.clear();
        this.forefrontRequestIds = [];
        this.handledRequestCount = 0;
        this.pendingRequestCount = 0;

        // Remove request files from disk but keep the directory
        if (this.client.persistStorage) {
            const { readdir } = await import('node:fs/promises');
            const entries = await readdir(this.requestQueueDirectory).catch(() => []);
            for (const entry of entries) {
                if (entry !== '__metadata__.json') {
                    await rm(resolve(this.requestQueueDirectory, entry), { force: true });
                }
            }
        }

        this.updateTimestamps(true);
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
     * Returns the head of the queue — pending requests that are neither handled nor currently locked
     * (in progress) — ordered by `orderNo`, deduplicated.
     *
     * Lock state lives in the persisted `orderNo` (see {@link isRequestLocked}), so that processes
     * sharing the same on-disk queue observe each other's locks. We therefore re-read entries from
     * storage to obtain fresh lock state, except for entries we can cheaply rule out as permanently
     * handled via their cached `orderNo === null`.
     */
    private async listPendingHead(limit: number): Promise<InternalRequest[]> {
        const now = Date.now();
        const items: InternalRequest[] = [];

        // Tracks processed request IDs to avoid duplicates (request in both `forefrontRequestIds` and `requests`).
        const seenRequestIds = new Set<string>();
        // Tracks handled request IDs from `forefrontRequestIds` to be removed.
        const handledForefrontIds = new Set<string>();

        for (const requestId of this.requestKeyIterator()) {
            if (items.length === limit) {
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

            // Locked (in progress) by us or another process — skip until the lock expires.
            if (isRequestLocked(request.orderNo, now)) {
                continue;
            }

            items.push(request);
        }

        this.forefrontRequestIds = this.forefrontRequestIds.filter((id) => !handledForefrontIds.has(id));

        return items.sort((a, b) => a.orderNo! - b.orderNo!);
    }

    async fetchNextRequest(): Promise<storage.RequestOptions | null> {
        this.updateTimestamps(false);

        await this.mutex.wait();

        try {
            const [head] = await this.listPendingHead(1);

            if (!head) {
                return null;
            }

            // Lock the request by pushing its `orderNo` beyond the lock expiry, preserving the sign so
            // its original (forefront / normal) position is restored once the lock expires. The lock is
            // persisted so other processes sharing this queue will not fetch the same request.
            const lockExpiresAt = Date.now() + DEFAULT_REQUEST_LOCK_SECS * 1000;
            head.orderNo = lockExpiresAt * (head.orderNo! > 0 ? 1 : -1);
            await this.requests.get(head.id)!.update(head);

            return this._jsonToRequest(head.json) ?? null;
        } finally {
            this.mutex.shift();
        }
    }

    async addBatchOfRequests(
        requests: storage.RequestSchema[],
        options: storage.RequestOptions = {},
    ): Promise<storage.BatchAddRequestsResult> {
        batchRequestShapeWithoutId.parse(requests);
        requestOptionsShape.parse(options);

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
                persistStorage: this.client.persistStorage,
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
    }

    async getRequest(uniqueKey: string): Promise<storage.RequestOptions | undefined> {
        s.string().parse(uniqueKey);
        this.updateTimestamps(false);
        const id = uniqueKeyToRequestId(uniqueKey);
        const json = (await this.requests.get(id)?.get())?.json;
        return this._jsonToRequest(json);
    }

    async markRequestAsHandled(request: storage.UpdateRequestSchema): Promise<storage.QueueOperationInfo | null> {
        requestShape.parse(request);
        this.updateTimestamps(false);

        const id = uniqueKeyToRequestId(request.uniqueKey);

        const existingEntry = this.requests.get(id);
        const existingRequest = await existingEntry?.get();

        // The request must be in progress (locked) to be marked as handled.
        if (!existingRequest || !isRequestLocked(existingRequest.orderNo, Date.now())) {
            return null;
        }

        const wasAlreadyHandled = existingRequest.orderNo === null;

        const handledAt = request.handledAt ?? new Date().toISOString();
        const requestModel = this._createInternalRequest({ ...request, handledAt }, false);

        const newEntry = createRequestQueueStorageImplementation({
            persistStorage: this.client.persistStorage,
            requestId: id,
            storeDirectory: this.requestQueueDirectory,
        });
        await newEntry.update(requestModel);
        this.requests.set(id, newEntry);

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
    }

    async reclaimRequest(
        request: storage.UpdateRequestSchema,
        options: storage.RequestOptions = {},
    ): Promise<storage.QueueOperationInfo | null> {
        requestShape.parse(request);
        requestOptionsShape.parse(options);
        this.updateTimestamps(false);

        const id = uniqueKeyToRequestId(request.uniqueKey);

        const existingEntry = this.requests.get(id);
        const existingRequest = await existingEntry?.get();

        // The request must be in progress (locked) to be reclaimed.
        if (!existingRequest || !isRequestLocked(existingRequest.orderNo, Date.now())) {
            return null;
        }

        // Reclaiming resets the `orderNo` to a fresh timestamp, releasing the lock and restoring the
        // request to the queue (at the front if `forefront`).
        const requestModel = this._createInternalRequest(request, options.forefront);

        const newEntry = createRequestQueueStorageImplementation({
            persistStorage: this.client.persistStorage,
            requestId: id,
            storeDirectory: this.requestQueueDirectory,
        });
        await newEntry.update(requestModel);
        this.requests.set(id, newEntry);

        if (options.forefront) {
            this.forefrontRequestIds.push(id);
        }

        this.updateTimestamps(true);

        return {
            requestId: id,
            wasAlreadyHandled: false,
            wasAlreadyPresent: true,
        };
    }

    async isEmpty(): Promise<boolean> {
        this.updateTimestamps(false);

        // "Empty" here means there are no pending requests left to fetch. Requests that are currently
        // in progress are intentionally ignored: this matches the `IRequestLoader.isEmpty` contract
        // ("the next `fetchNextRequest` would return null") that the crawler's task scheduling relies on.
        const [head] = await this.listPendingHead(1);
        return head === undefined;
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
                persistStorage: this.client.persistStorage,
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
