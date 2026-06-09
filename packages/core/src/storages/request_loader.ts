import type { Dictionary } from '@crawlee/types';

import type { Request } from '../request.js';
import type { IRequestManager } from './request_manager.js';
import type { RequestQueueOperationInfo } from './request_provider.js';

/**
 * An abstract interface defining a read-only stream of requests to crawl.
 *
 * Request loaders are used to manage and provide access to a storage of crawling requests.
 *
 * Key responsibilities:
 * - Fetching the next request to be processed.
 * - Marking requests as successfully handled after processing.
 * - Managing state information such as the total and handled request counts.
 *
 * Concrete implementations such as {@apilink RequestList} or {@apilink SitemapRequestLoader} build on this interface.
 * The {@apilink IRequestManager} interface extends it with the capability to enqueue and reclaim requests.
 */
export interface IRequestLoader {
    /**
     * Returns an approximation of the total number of requests in the loader (i.e. pending + handled).
     */
    getTotalCount(): Promise<number>;

    /**
     * Returns an approximation of the number of pending requests in the loader.
     */
    getPendingCount(): Promise<number>;

    /**
     * Returns the number of requests in the loader that have been handled.
     */
    getHandledCount(): Promise<number>;

    /**
     * Returns `true` if all requests were already handled and there are no more left.
     */
    isFinished(): Promise<boolean>;

    /**
     * Resolves to `true` if the next call to {@apilink IRequestLoader.fetchNextRequest} function
     * would return `null`, otherwise it resolves to `false`.
     * Note that even if the loader is empty, there might be some pending requests currently being processed.
     */
    isEmpty(): Promise<boolean>;

    /**
     * Gets the next {@apilink Request} to process, or `null` if there are no more pending requests.
     */
    fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null>;

    /**
     * Can be used to iterate over the loader instance in a `for await .. of` loop.
     * Provides an alternative for the repeated use of `fetchNextRequest`.
     */
    [Symbol.asyncIterator](): AsyncGenerator<Request>;

    /**
     * Marks request as handled after successful processing (or after giving up retrying).
     */
    markRequestHandled(request: Request): Promise<RequestQueueOperationInfo | void | null>;

    /**
     * Persists the current state of the loader into the default {@apilink KeyValueStore}.
     *
     * Not all loaders support persistence; implementations that do not should leave this `undefined`.
     */
    persistState?(): Promise<void>;

    /**
     * Combines the loader with a request manager to support adding and reclaiming requests.
     *
     * @param requestManager Request manager to combine the loader with. If not provided, the default
     *  {@apilink RequestQueue} is used.
     */
    toTandem?(requestManager?: IRequestManager): Promise<IRequestManager>;
}
