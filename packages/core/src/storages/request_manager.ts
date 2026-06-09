import type { Request, Source } from '../request.js';
import type { IRequestLoader } from './request_loader.js';
import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    RequestQueueOperationInfo,
    RequestQueueOperationOptions,
} from './request_provider.js';

export type RequestsLike = AsyncIterable<Source | string> | Iterable<Source | string> | (Source | string)[];

/**
 * Extends the read-only {@apilink IRequestLoader} interface with the capability to enqueue new requests
 * and reclaim failed ones.
 */
export interface IRequestManager extends IRequestLoader {
    /**
     * Reclaims request to the provider if its processing failed.
     * The request will become available in the next `fetchNextRequest()`.
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
}
