export const LOCAL_STORAGE_SUBDIR: string;
export const QUERY_HEAD_MIN_LENGTH: 100;
export const QUERY_HEAD_BUFFER: 3;
export const API_PROCESSED_REQUESTS_DELAY_MILLIS: number;
export const MAX_QUERIES_FOR_CONSISTENCY: 6;
export const STORAGE_CONSISTENCY_DELAY_MILLIS: 3000;
/**
 * A helper class that is used to report results from various
 * {@link RequestQueue} functions as well as
 * {@link utils#enqueueLinks}.
 *
 * @typedef QueueOperationInfo
 * @property {boolean} wasAlreadyPresent Indicates if request was already present in the queue.
 * @property {boolean} wasAlreadyHandled Indicates if request was already marked as handled.
 * @property {string} requestId The ID of the added request
 * @property {Request} request The original {@link Request} object passed to the `RequestQueue` function.
 */
/**
 * Represents a queue of URLs to crawl, which is used for deep crawling of websites
 * where you start with several URLs and then recursively
 * follow links to other pages. The data structure supports both breadth-first and depth-first crawling orders.
 *
 * Each URL is represented using an instance of the {@link Request} class.
 * The queue can only contain unique URLs. More precisely, it can only contain {@link Request} instances
 * with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
 * To add a single URL multiple times to the queue,
 * corresponding {@link Request} objects will need to have different `uniqueKey` properties.
 *
 * Do not instantiate this class directly, use the
 * {@link Apify#openRequestQueue} function instead.
 *
 * `RequestQueue` is used by {@link BasicCrawler}, {@link CheerioCrawler}
 * and {@link PuppeteerCrawler} as a source of URLs to crawl.
 * Unlike {@link RequestList}, `RequestQueue` supports dynamic adding and removing of requests.
 * On the other hand, the queue is not optimized for operations that add or remove a large number of URLs in a batch.
 *
 * `RequestQueue` stores its data either on local disk or in the Apify Cloud,
 * depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variable is set.
 *
 * If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the queue data is stored in
 * that local directory as follows:
 * ```
 * {APIFY_LOCAL_STORAGE_DIR}/request_queues/{QUEUE_ID}/{STATE}/{NUMBER}.json
 * ```
 * Note that `{QUEUE_ID}` is the name or ID of the request queue. The default queue has ID: `default`,
 * unless you override it by setting the `APIFY_DEFAULT_REQUEST_QUEUE_ID` environment variable.
 * Each request in the queue is stored as a separate JSON file, where `{STATE}` is either `handled` or `pending`,
 * and `{NUMBER}` is an integer indicating the position of the request in the queue.
 *
 * If the `APIFY_TOKEN` environment variable is set but `APIFY_LOCAL_STORAGE_DIR` not, the data is stored in the
 * [Apify Request Queue](https://docs.apify.com/storage/request-queue)
 * cloud storage. Note that you can force usage of the cloud storage also by passing the `forceCloud`
 * option to {@link Apify#openRequestQueue} function,
 * even if the `APIFY_LOCAL_STORAGE_DIR` variable is set.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Open the default request queue associated with the actor run
 * const queue = await Apify.openRequestQueue();
 *
 * // Open a named request queue
 * const queueWithName = await Apify.openRequestQueue('some-name');
 *
 * // Enqueue few requests
 * await queue.addRequest({ url: 'http://example.com/aaa' });
 * await queue.addRequest({ url: 'http://example.com/bbb' });
 * await queue.addRequest({ url: 'http://example.com/foo/bar' }, { forefront: true });
 *
 * // Get requests from queue
 * const request1 = await queue.fetchNextRequest();
 * const request2 = await queue.fetchNextRequest();
 * const request3 = await queue.fetchNextRequest();
 *
 * // Mark a request as handled
 * await queue.markRequestHandled(request1);
 *
 * // If processing of a request fails then reclaim it back to the queue, so that it's crawled again
 * await queue.reclaimRequest(request2);
 * ```
 * @hideconstructor
 */
export class RequestQueue {
    /**
     * @param {string} queueId
     * @param {string} [queueName]
     * @param {string} [clientKey]
     */
    constructor(queueId: string, queueName?: string | undefined, clientKey?: string | undefined);
    clientKey: string;
    queueId: string;
    queueName: string | undefined;
    /**
     * @type {*}
     * @ignore
     */
    queueHeadDict: any;
    queryQueueHeadPromise: any;
    inProgress: Set<any>;
    recentlyHandled: any;
    assumedTotalCount: number;
    assumedHandledCount: number;
    requestsCache: any;
    /**
     * @ignore
     */
    inProgressCount(): number;
    /**
     * Adds a request to the queue.
     *
     * If a request with the same `uniqueKey` property is already present in the queue,
     * it will not be updated. You can find out whether this happened from the resulting
     * {@link QueueOperationInfo} object.
     *
     * To add multiple requests to the queue by extracting links from a webpage,
     * see the {@link utils#enqueueLinks} helper function.
     *
     * @param {(Request|RequestOptions)} request {@link Request} object or vanilla object with request data.
     * Note that the function sets the `uniqueKey` and `id` fields to the passed object.
     * @param {Object} [options]
     * @param {boolean} [options.forefront=false] If `true`, the request will be added to the foremost position in the queue.
     * @return {Promise<QueueOperationInfo>}
     */
    addRequest(request: Request | RequestOptions, options?: {
        forefront?: boolean;
    } | undefined): Promise<QueueOperationInfo>;
    /**
     * Gets the request from the queue specified by ID.
     *
     * @param {string} requestId ID of the request.
     * @return {Promise<(Request | null)>} Returns the request object, or `null` if it was not found.
     */
    getRequest(requestId: string): Promise<Request | null>;
    /**
     * Returns a next request in the queue to be processed, or `null` if there are no more pending requests.
     *
     * Once you successfully finish processing of the request, you need to call
     * {@link RequestQueue#markRequestHandled}
     * to mark the request as handled in the queue. If there was some error in processing the request,
     * call {@link RequestQueue#reclaimRequest} instead,
     * so that the queue will give the request to some other consumer in another call to the `fetchNextRequest` function.
     *
     * Note that the `null` return value doesn't mean the queue processing finished,
     * it means there are currently no pending requests.
     * To check whether all requests in queue were finished,
     * use {@link RequestQueue#isFinished} instead.
     *
     * @returns {Promise<(Request|null)>}
     * Returns the request object or `null` if there are no more pending requests.
     */
    fetchNextRequest(): Promise<Request | null>;
    /**
     * Marks a request that was previously returned by the
     * {@link RequestQueue#fetchNextRequest}
     * function as handled after successful processing.
     * Handled requests will never again be returned by the `fetchNextRequest` function.
     *
     * @param {Request} request
     * @return {Promise<QueueOperationInfo>}
     */
    markRequestHandled(request: Request): Promise<QueueOperationInfo>;
    /**
     * Reclaims a failed request back to the queue, so that it can be returned for processed later again
     * by another call to {@link RequestQueue#fetchNextRequest}.
     * The request record in the queue is updated using the provided `request` parameter.
     * For example, this lets you store the number of retries or error messages for the request.
     *
     * @param {Request} request
     * @param {Object} [options]
     * @param {boolean} [options.forefront=false]
     * If `true` then the request it placed to the beginning of the queue, so that it's returned
     * in the next call to {@link RequestQueue#fetchNextRequest}.
     * By default, it's put to the end of the queue.
     * @return {Promise<QueueOperationInfo>}
     */
    reclaimRequest(request: Request, options?: {
        forefront?: boolean;
    } | undefined): Promise<QueueOperationInfo>;
    /**
     * Resolves to `true` if the next call to {@link RequestQueue#fetchNextRequest}
     * would return `null`, otherwise it resolves to `false`.
     * Note that even if the queue is empty, there might be some pending requests currently being processed.
     * If you need to ensure that there is no activity in the queue, use {@link RequestQueue#isFinished}.
     *
     * @returns {Promise<boolean>}
     */
    isEmpty(): Promise<boolean>;
    /**
     * Resolves to `true` if all requests were already handled and there are no more left.
     * Due to the nature of distributed storage used by the queue,
     * the function might occasionally return a false negative,
     * but it will never return a false positive.
     *
     * @returns {Promise<boolean>}
     */
    isFinished(): Promise<boolean>;
    /**
     * Caches information about request to beware of unneeded addRequest() calls.
     *
     * @ignore
     */
    _cacheRequest(cacheKey: any, queueOperationInfo: any): void;
    /**
     * We always request more items than is in progress to ensure that something falls into head.
     *
     * @param {boolean} [ensureConsistency=false] If true then query for queue head is retried until queueModifiedAt
     *   is older than queryStartedAt by at least API_PROCESSED_REQUESTS_DELAY_MILLIS to ensure that queue
     *   head is consistent.
     * @param {number} [limit] How many queue head items will be fetched.
     * @param {number} [iteration] Used when this function is called recursively to limit the recursion.
     * @return {Promise<boolean>} Indicates if queue head is consistent (true) or inconsistent (false).
     * @ignore
     */
    _ensureHeadIsNonEmpty(ensureConsistency?: boolean | undefined, limit?: number | undefined, iteration?: number | undefined): Promise<boolean>;
    /**
     * Adds a request straight to the queueHeadDict, to improve performance.
     * @private
     */
    _maybeAddRequestToQueueHead(requestId: any, forefront: any): void;
    /**
     * Removes the queue either from the Apify Cloud storage or from the local directory,
     * depending on the mode of operation.
     *
     * @return {Promise<void>}
     */
    drop(): Promise<void>;
    /** @ignore */
    delete(): Promise<void>;
    /**
     * Returns the number of handled requests.
     *
     * This function is just a convenient shortcut for:
     *
     * ```javascript
     * const { handledRequestCount } = await queue.getInfo();
     * ```
     *
     * @return {Promise<number>}
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
     *
     * @returns {Promise<object>}
     */
    getInfo(): Promise<any>;
}
/**
 * Local directory-based implementation of the `RequestQueue` class.
 * TODO: We should implement this class using the RequestQueueRemote, just replace
 * the underlying API calls with their emulation on filesystem. That will bring
 * all the goodies such as caching and will enable better and more consistent testing
 *
 * @ignore
 */
export class RequestQueueLocal {
    constructor(queueId: any, localStorageDir: any);
    queueId: any;
    localStoragePath: string;
    localHandledEmulationPath: string;
    localPendingEmulationPath: string;
    queueOrderNoCounter: number;
    pendingCount: number;
    _handledCount: number;
    inProgressCount: number;
    requestIdToQueueOrderNo: {};
    queueOrderNoInProgress: {};
    requestsBeingWrittenToFile: Map<any, any>;
    createdAt: Date | null;
    modifiedAt: Date | null;
    accessedAt: Date | null;
    initializationPromise: Promise<void>;
    _initialize(): Promise<void>;
    _saveRequestIdToQueueOrderNo(filepath: any): Promise<void>;
    _getFilePath(queueOrderNo: any, isHandled?: boolean): string;
    _getQueueOrderNo(forefront?: boolean): number;
    _getRequestByQueueOrderNo(queueOrderNo: any): Promise<Request>;
    addRequest(request: any, opts?: {}): Promise<{
        requestId: any;
        wasAlreadyHandled: any;
        wasAlreadyPresent: boolean;
        request: any;
    }>;
    getRequest(requestId: any): Promise<any>;
    fetchNextRequest(): Promise<Request | null>;
    markRequestHandled(request: any): Promise<{
        requestId: any;
        wasAlreadyHandled: boolean;
        wasAlreadyPresent: boolean;
        request: any;
    }>;
    reclaimRequest(request: any, opts?: {}): Promise<{
        requestId: any;
        wasAlreadyHandled: boolean;
        wasAlreadyPresent: boolean;
        request: any;
    }>;
    isEmpty(): Promise<boolean>;
    isFinished(): Promise<boolean>;
    drop(): Promise<void>;
    delete(): Promise<void>;
    handledCount(): Promise<number>;
    getInfo(): Promise<{
        id: any;
        name: any;
        userId: string | null;
        createdAt: Date | null;
        modifiedAt: Date | null;
        accessedAt: Date | null;
        totalRequestCount: number;
        handledRequestCount: number;
        pendingRequestCount: number;
    }>;
    _updateMetadata(isModified: any): void;
}
export function openRequestQueue(queueIdOrName?: string | undefined, options?: {
    forceCloud?: boolean;
} | undefined): Promise<RequestQueue>;
/**
 * A helper class that is used to report results from various
 * {@link RequestQueue} functions as well as
 * {@link utils#enqueueLinks}.
 */
export type QueueOperationInfo = {
    /**
     * Indicates if request was already present in the queue.
     */
    wasAlreadyPresent: boolean;
    /**
     * Indicates if request was already marked as handled.
     */
    wasAlreadyHandled: boolean;
    /**
     * The ID of the added request
     */
    requestId: string;
    /**
     * The original {@link Request} object passed to the `RequestQueue` function.
     */
    request: Request;
};
import Request from "./request";
import { RequestOptions } from "./request";
