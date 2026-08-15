import type { Request, Source } from '../request.js';
import type { IRequestLoader } from './request_loader.js';
import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    RequestQueueOperationInfo,
    RequestQueueOperationOptions,
} from './request_queue.js';

export type RequestsLike = AsyncIterable<Source | string> | Iterable<Source | string> | (Source | string)[];

/**
 * Extends the read-only {@apilink IRequestLoader} interface with the capability to enqueue new requests
 * and reclaim failed ones.
 */
export interface IRequestManager extends IRequestLoader {
    /**
     * Reclaims request to the provider if its processing failed.
     * The request will be returned by some subsequent `fetchNextRequest()` call.
     */
    reclaimRequest(request: Request, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo | null>;

    addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo>;

    addRequestsBatched(requests: RequestsLike, options?: AddRequestsBatchedOptions): Promise<AddRequestsBatchedResult>;

    /**
     * Remove all requests from the queue but keep the queue itself, resetting it
     * so it can be reused (e.g. across multiple `crawler.run()` calls).
     *
     * Implementations that do not support purging may leave this `undefined`.
     */
    purge?(): Promise<void>;

    /**
     * Tells the manager how long a consumer expects to hold a request fetched via `fetchNextRequest()`
     * before marking it handled or reclaiming it (typically the request-handler timeout plus padding).
     *
     * Managers backed by a storage backend that reserves requests via locking use this to avoid handing
     * the same request out again while it is still being processed. Implementations that do not need
     * this hint may leave it `undefined`.
     */
    setExpectedRequestProcessingTimeSecs?(secs: number): Promise<void>;

    /**
     * Extends the lock on a request previously handed out by `fetchNextRequest()` that is still being
     * processed, on managers backed by a storage backend that reserves requests via locking. Used when
     * the time a request needs is only apparent once it is already running (e.g. via
     * {@apilink CrawlingContext.extendTimeout|`context.extendTimeout`}), so the request is not handed
     * out again — possibly to another consumer sharing the queue — while the current one is still
     * working on it.
     *
     * Resolves to `true` when the lock was prolonged, `false` when it was not (the manager does not
     * lock requests, or no longer holds this one locked). Implementations that do not lock requests
     * may leave it `undefined`, in which case callers treat it as `false`.
     */
    prolongRequestLock?(request: Request, secs: number): Promise<boolean>;
}
