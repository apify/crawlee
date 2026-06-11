import type { Dictionary } from '@crawlee/types';

import type { Request } from '../request.js';
import type { IRequestManager } from './request_manager.js';
import type { RequestQueueOperationInfo } from './request_queue.js';

/**
 * An abstract interface defining a read-only stream of requests to crawl.
 *
 * Request loaders are used to manage and provide access to a storage of crawling requests.
 *
 * Key responsibilities:
 * - Fetching the next request to be processed.
 * - Marking requests as handled once they are no longer in progress.
 * - Managing state information such as the total and handled request counts.
 *
 * ## Request lifecycle contract
 *
 * Every request returned by {@apilink IRequestLoader.fetchNextRequest} is considered **in progress**
 * until it is passed to {@apilink IRequestLoader.markRequestAsHandled}. Once you fetch a request, you are
 * obligated to eventually mark it as handled — there is no way to hand a request back to a loader
 * (only an {@apilink IRequestManager} can reclaim requests for a retry). "Handled" therefore means
 * "finished with this request", whether processing succeeded or was abandoned after exhausting retries.
 *
 * Honoring this contract matters for three reasons:
 * - **Restarts and migrations:** loaders that persist their state (see {@apilink IRequestLoader.persistState})
 *   treat in-progress requests as interrupted and re-serve them after a restart. A request that is fetched
 *   but never marked handled will be crawled again.
 * - **Termination detection:** {@apilink IRequestLoader.isFinished} only resolves to `true` once nothing is
 *   in progress. Leaving a request unmarked keeps the crawler running indefinitely.
 * - **Bookkeeping:** the handled and pending counts are derived from the set of in-progress requests, so
 *   skipping {@apilink IRequestLoader.markRequestAsHandled} corrupts {@apilink IRequestLoader.getHandledCount}
 *   and {@apilink IRequestLoader.getPendingCount}.
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
     *
     * The returned request is marked as **in progress** and remains so until it is passed to
     * {@apilink IRequestLoader.markRequestAsHandled}. The caller is responsible for eventually marking
     * every fetched request as handled; otherwise the loader never considers itself finished and the
     * request may be re-served after a restart. See the request lifecycle contract on {@apilink IRequestLoader}.
     */
    fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null>;

    /**
     * Can be used to iterate over the loader instance in a `for await .. of` loop.
     * Provides an alternative for the repeated use of `fetchNextRequest`.
     */
    [Symbol.asyncIterator](): AsyncGenerator<Request>;

    /**
     * Marks a request previously returned by {@apilink IRequestLoader.fetchNextRequest} as handled,
     * removing it from the set of in-progress requests.
     *
     * Call this once you are done with the request — whether processing succeeded or was abandoned after
     * exhausting retries. Because a loader cannot take a request back, marking it handled is the only way to
     * signal completion; failing to do so prevents {@apilink IRequestLoader.isFinished} from ever resolving to
     * `true` and skews the handled and pending counts. See the request lifecycle contract on {@apilink IRequestLoader}.
     */
    markRequestAsHandled(request: Request): Promise<RequestQueueOperationInfo | void | null>;

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
