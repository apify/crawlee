import type * as storage from '@crawlee/types';
import type { MemoryStorageBackend } from '../memory-storage.js';
import { BaseClient } from './common/base-client.js';
export interface RequestQueueBackendOptions {
    name?: string;
    id?: string;
    /**
     * The key used for cache lookup. When provided, takes precedence over `name` and `id`.
     * This allows alias-opened storages to have a cache key that differs from their
     * metadata `name` (which is `undefined` for unnamed storages).
     */
    cacheKey?: string;
    storageBackend: MemoryStorageBackend;
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
export declare class RequestQueueBackend extends BaseClient implements storage.RequestQueueBackend {
    #private;
    name?: string;
    /**
     * The key used for cache lookup. For named storages, this equals the name. For alias (unnamed)
     * storages, this is the alias string. Falls back to id.
     */
    cacheKey: string;
    createdAt: Date;
    accessedAt: Date;
    modifiedAt: Date;
    handledRequestCount: number;
    pendingRequestCount: number;
    private readonly storageBackend;
    constructor(options: RequestQueueBackendOptions);
    getMetadata(): Promise<storage.RequestQueueInfo>;
    drop(): Promise<void>;
    purge(): Promise<void>;
    private requestKeyIterator;
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
    private listPendingHead;
    fetchNextRequest(): Promise<storage.UpdateRequestSchema | undefined>;
    addBatchOfRequests(requests: storage.RequestSchema[], options?: storage.RequestQueueOperationOptions): Promise<storage.BatchAddRequestsResult>;
    getRequest(uniqueKey: string): Promise<storage.UpdateRequestSchema | undefined>;
    markRequestAsHandled(request: storage.UpdateRequestSchema): Promise<storage.QueueOperationInfo | undefined>;
    reclaimRequest(request: storage.UpdateRequestSchema, options?: storage.RequestQueueOperationOptions): Promise<storage.QueueOperationInfo | undefined>;
    isEmpty(): Promise<boolean>;
    isFinished(): Promise<boolean>;
    /**
     * Returns all pending (not yet handled, not currently in progress) requests in the queue, ordered
     * the same way {@link fetchNextRequest} would hand them out. This does not mutate the queue,
     * nothing is marked in progress.
     */
    listItems(): Promise<storage.UpdateRequestSchema[]>;
    toRequestQueueInfo(): storage.RequestQueueInfo;
    private updateTimestamps;
    private jsonToRequest;
    private createInternalRequest;
    private calculateOrderNo;
}
