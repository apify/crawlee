import { LruCache } from '@apify/datastructures';
import type { BatchAddRequestsResult, Dictionary, QueueOperationInfo, RequestQueueClient, RequestQueueInfo, StorageClient } from '@crawlee/types';
import type { StorageManagerOptions } from './storage_manager';
import type { RequestOptions } from '../request';
import { Request } from '../request';
import { Configuration } from '../configuration';
/**
 * When requesting queue head we always fetch requestsInProgressCount * QUERY_HEAD_BUFFER number of requests.
 * @internal
 */
export declare const QUERY_HEAD_MIN_LENGTH = 100;
/** @internal */
export declare const QUERY_HEAD_BUFFER = 3;
/**
 * If queue was modified (request added/updated/deleted) before more than API_PROCESSED_REQUESTS_DELAY_MILLIS
 * then we assume the get head operation to be consistent.
 * @internal
 */
export declare const API_PROCESSED_REQUESTS_DELAY_MILLIS = 10000;
/**
 * How many times we try to get queue head with queueModifiedAt older than API_PROCESSED_REQUESTS_DELAY_MILLIS.
 * @internal
 */
export declare const MAX_QUERIES_FOR_CONSISTENCY = 6;
/**
 * Indicates how long it usually takes for the underlying storage to propagate all writes
 * to be available to subsequent reads.
 * @internal
 */
export declare const STORAGE_CONSISTENCY_DELAY_MILLIS = 3000;
/**
 * Helper function that creates ID from uniqueKey for local emulation of request queue.
 * It's also used for local cache of remote request queue.
 *
 * This function may not exactly match how requestId is created server side.
 * So we never pass requestId created by this to server and use it only for local cache.
 *
 * @internal
 */
export declare function getRequestId(uniqueKey: string): string;
/**
 * @internal
 */
interface RequestQueueOperationInfo extends QueueOperationInfo {
    /** Indicates if request was already present in the queue. */
    wasAlreadyPresent: boolean;
    /** Indicates if request was already marked as handled. */
    wasAlreadyHandled: boolean;
    /** The ID of the added request */
    requestId: string;
    uniqueKey: string;
}
export interface RequestQueueOperationOptions {
    /**
     * If set to `true`:
     *   - while adding the request to the queue: the request will be added to the foremost position in the queue.
     *   - while reclaiming the request: the request will be placed to the beginning of the queue, so that it's returned
     *   in the next call to {@apilink RequestQueue.fetchNextRequest}.
     * By default, it's put to the end of the queue.
     * @default false
     */
    forefront?: boolean;
}
/**
 * Represents a queue of URLs to crawl, which is used for deep crawling of websites
 * where you start with several URLs and then recursively
 * follow links to other pages. The data structure supports both breadth-first and depth-first crawling orders.
 *
 * Each URL is represented using an instance of the {@apilink Request} class.
 * The queue can only contain unique URLs. More precisely, it can only contain {@apilink Request} instances
 * with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
 * To add a single URL multiple times to the queue,
 * corresponding {@apilink Request} objects will need to have different `uniqueKey` properties.
 *
 * Do not instantiate this class directly, use the {@apilink RequestQueue.open} function instead.
 *
 * `RequestQueue` is used by {@apilink BasicCrawler}, {@apilink CheerioCrawler}, {@apilink PuppeteerCrawler}
 * and {@apilink PlaywrightCrawler} as a source of URLs to crawl.
 * Unlike {@apilink RequestList}, `RequestQueue` supports dynamic adding and removing of requests.
 * On the other hand, the queue is not optimized for operations that add or remove a large number of URLs in a batch.
 *
 * `RequestQueue` stores its data either on local disk or in the Apify Cloud,
 * depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variable is set.
 *
 * If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the queue data is stored in
 * that directory in an SQLite database file.
 *
 * If the `APIFY_TOKEN` environment variable is set but `APIFY_LOCAL_STORAGE_DIR` is not, the data is stored in the
 * [Apify Request Queue](https://docs.apify.com/storage/request-queue)
 * cloud storage. Note that you can force usage of the cloud storage also by passing the `forceCloud`
 * option to {@apilink RequestQueue.open} function,
 * even if the `APIFY_LOCAL_STORAGE_DIR` variable is set.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Open the default request queue associated with the crawler run
 * const queue = await RequestQueue.open();
 *
 * // Open a named request queue
 * const queueWithName = await RequestQueue.open('some-name');
 *
 * // Enqueue few requests
 * await queue.addRequest({ url: 'http://example.com/aaa' });
 * await queue.addRequest({ url: 'http://example.com/bbb' });
 * await queue.addRequest({ url: 'http://example.com/foo/bar' }, { forefront: true });
 * ```
 * @category Sources
 */
export declare class RequestQueue {
    readonly config: Configuration;
    log: import("@apify/log/log").Log;
    id: string;
    name?: string;
    timeoutSecs: number;
    clientKey: string;
    client: RequestQueueClient;
    /**
     * Contains a cached list of request IDs from the head of the queue,
     * as obtained in the last query. Both key and value is the request ID.
     * Need to apply a type here to the generated TS types don't try to use types-apify
     */
    private queueHeadDict;
    queryQueueHeadPromise?: Promise<{
        wasLimitReached: boolean;
        prevLimit: number;
        queueModifiedAt: Date;
        queryStartedAt: Date;
        hadMultipleClients?: boolean;
    }> | null;
    inProgress: Set<unknown>;
    lastActivity: Date;
    internalTimeoutMillis: number;
    recentlyHandled: LruCache<any>;
    assumedTotalCount: number;
    assumedHandledCount: number;
    requestsCache: LruCache<{
        uniqueKey: string;
        wasAlreadyHandled: boolean;
        isHandled: boolean;
        id: string;
    }>;
    /**
     * @internal
     */
    constructor(options: RequestQueueOptions, config?: Configuration);
    /**
     * @ignore
     */
    inProgressCount(): number;
    /**
     * Adds a request to the queue.
     *
     * If a request with the same `uniqueKey` property is already present in the queue,
     * it will not be updated. You can find out whether this happened from the resulting
     * {@apilink QueueOperationInfo} object.
     *
     * To add multiple requests to the queue by extracting links from a webpage,
     * see the {@apilink enqueueLinks} helper function.
     *
     * @param requestLike {@apilink Request} object or vanilla object with request data.
     * Note that the function sets the `uniqueKey` and `id` fields to the passed Request.
     * @param [options] Request queue operation options.
     */
    addRequest(requestLike: Request | RequestOptions, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo>;
    /**
     * Adds requests to the queue in batches of 25.
     *
     * If a request that is passed in is already present due to its `uniqueKey` property being the same,
     * it will not be updated. You can find out whether this happened by finding the request in the resulting
     * {@apilink BatchAddRequestsResult} object.
     *
     * @param requestsLike {@apilink Request} objects or vanilla objects with request data.
     * Note that the function sets the `uniqueKey` and `id` fields to the passed requests if missing.
     * @param [options] Request queue operation options.
     */
    addRequests(requestsLike: (Request | RequestOptions)[], options?: RequestQueueOperationOptions): Promise<BatchAddRequestsResult>;
    /**
     * Gets the request from the queue specified by ID.
     *
     * @param id ID of the request.
     * @returns Returns the request object, or `null` if it was not found.
     */
    getRequest<T extends Dictionary = Dictionary>(id: string): Promise<Request<T> | null>;
    /**
     * Returns a next request in the queue to be processed, or `null` if there are no more pending requests.
     *
     * Once you successfully finish processing of the request, you need to call
     * {@apilink RequestQueue.markRequestHandled}
     * to mark the request as handled in the queue. If there was some error in processing the request,
     * call {@apilink RequestQueue.reclaimRequest} instead,
     * so that the queue will give the request to some other consumer in another call to the `fetchNextRequest` function.
     *
     * Note that the `null` return value doesn't mean the queue processing finished,
     * it means there are currently no pending requests.
     * To check whether all requests in queue were finished,
     * use {@apilink RequestQueue.isFinished} instead.
     *
     * @returns
     *   Returns the request object or `null` if there are no more pending requests.
     */
    fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null>;
    /**
     * Marks a request that was previously returned by the
     * {@apilink RequestQueue.fetchNextRequest}
     * function as handled after successful processing.
     * Handled requests will never again be returned by the `fetchNextRequest` function.
     */
    markRequestHandled(request: Request): Promise<RequestQueueOperationInfo | null>;
    /**
     * Reclaims a failed request back to the queue, so that it can be returned for processing later again
     * by another call to {@apilink RequestQueue.fetchNextRequest}.
     * The request record in the queue is updated using the provided `request` parameter.
     * For example, this lets you store the number of retries or error messages for the request.
     */
    reclaimRequest(request: Request, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo | null>;
    /**
     * Resolves to `true` if the next call to {@apilink RequestQueue.fetchNextRequest}
     * would return `null`, otherwise it resolves to `false`.
     * Note that even if the queue is empty, there might be some pending requests currently being processed.
     * If you need to ensure that there is no activity in the queue, use {@apilink RequestQueue.isFinished}.
     */
    isEmpty(): Promise<boolean>;
    /**
     * Resolves to `true` if all requests were already handled and there are no more left.
     * Due to the nature of distributed storage used by the queue,
     * the function might occasionally return a false negative,
     * but it will never return a false positive.
     */
    isFinished(): Promise<boolean>;
    private _reset;
    /**
     * Caches information about request to beware of unneeded addRequest() calls.
     */
    protected _cacheRequest(cacheKey: string, queueOperationInfo: RequestQueueOperationInfo): void;
    /**
     * We always request more items than is in progress to ensure that something falls into head.
     *
     * @param [ensureConsistency] If true then query for queue head is retried until queueModifiedAt
     *   is older than queryStartedAt by at least API_PROCESSED_REQUESTS_DELAY_MILLIS to ensure that queue
     *   head is consistent.
     * @default false
     * @param [limit] How many queue head items will be fetched.
     * @param [iteration] Used when this function is called recursively to limit the recursion.
     * @returns Indicates if queue head is consistent (true) or inconsistent (false).
     */
    protected _ensureHeadIsNonEmpty(ensureConsistency?: boolean, limit?: number, iteration?: number): Promise<boolean>;
    /**
     * Adds a request straight to the queueHeadDict, to improve performance.
     */
    private _maybeAddRequestToQueueHead;
    /**
     * Removes the queue either from the Apify Cloud storage or from the local database,
     * depending on the mode of operation.
     */
    drop(): Promise<void>;
    /**
     * Returns the number of handled requests.
     *
     * This function is just a convenient shortcut for:
     *
     * ```javascript
     * const { handledRequestCount } = await queue.getInfo();
     * ```
     */
    handledCount(): Promise<number>;
    /**
     * Returns an object containing general information about the request queue.
     *
     * The function returns the same object as the Apify API Client's
     * [getQueue](https://docs.apify.com/api/apify-client-js/latest#ApifyClient-requestQueues)
     * function, which in turn calls the
     * [Get request queue](https://apify.com/docs/api/v2#/reference/request-queues/queue/get-request-queue)
     * API endpoint.
     *
     * **Example:**
     * ```
     * {
     *   id: "WkzbQMuFYuamGv3YF",
     *   name: "my-queue",
     *   userId: "wRsJZtadYvn4mBZmm",
     *   createdAt: new Date("2015-12-12T07:34:14.202Z"),
     *   modifiedAt: new Date("2015-12-13T08:36:13.202Z"),
     *   accessedAt: new Date("2015-12-14T08:36:13.202Z"),
     *   totalRequestCount: 25,
     *   handledRequestCount: 5,
     *   pendingRequestCount: 20,
     * }
     * ```
     */
    getInfo(): Promise<RequestQueueInfo | undefined>;
    /**
     * Opens a request queue and returns a promise resolving to an instance
     * of the {@apilink RequestQueue} class.
     *
     * {@apilink RequestQueue} represents a queue of URLs to crawl, which is stored either on local filesystem or in the cloud.
     * The queue is used for deep crawling of websites, where you start with several URLs and then
     * recursively follow links to other pages. The data structure supports both breadth-first
     * and depth-first crawling orders.
     *
     * For more details and code examples, see the {@apilink RequestQueue} class.
     *
     * @param [queueIdOrName]
     *   ID or name of the request queue to be opened. If `null` or `undefined`,
     *   the function returns the default request queue associated with the crawler run.
     * @param [options] Open Request Queue options.
     */
    static open(queueIdOrName?: string | null, options?: StorageManagerOptions): Promise<RequestQueue>;
}
export interface RequestQueueOptions {
    id: string;
    name?: string;
    client: StorageClient;
}
export {};
//# sourceMappingURL=request_queue.d.ts.map