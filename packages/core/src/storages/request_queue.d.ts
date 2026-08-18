import type { BatchAddRequestsResult, Dictionary, ProcessedRequest, QueueOperationInfo, RequestQueueBackend, RequestQueueInfo } from '@crawlee/types';
import type { ReadonlyDeep } from 'type-fest';
import { LruCache } from '@apify/datastructures';
import type { CrawleeLogger } from '../log.js';
import type { IProxyConfiguration } from '../proxy_configuration.js';
import type { Source } from '../request.js';
import { Request } from '../request.js';
import type { JournalEntry } from './transaction.js';
import type { IRequestManager, RequestsLike } from './request_manager.js';
import type { RequestQueueStats } from './storage_stats.js';
import type { IStorage, StorageIdentifier } from './storage_instance_manager.js';
import type { StorageOpenOptions } from './utils.js';
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
export declare class RequestQueue implements IStorage, IRequestManager {
    #private;
    readonly id: string;
    readonly name?: string;
    readonly backend: RequestQueueBackend;
    readonly log: CrawleeLogger;
    get requestCache(): LruCache<RequestLruItem>;
    get inProgressRequestBatchCount(): number;
    set inProgressRequestBatchCount(value: number);
    /**
     * Backend-independent usage counters tracked for this request queue (write operations and
     * queue-head reads issued to the underlying storage backend). Counted per backend call.
     */
    get stats(): RequestQueueStats;
    /**
     * @internal
     */
    constructor(options: RequestQueueOptions);
    /**
     * Returns the total number of requests in the queue (i.e. pending + handled).
     *
     * Survives restarts and actor migrations.
     */
    getTotalCount(): Promise<number>;
    /**
     * Returns the total number of pending requests in the queue.
     *
     * Survives restarts and Actor migrations.
     */
    getPendingCount(): Promise<number>;
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
    addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo>;
    /**
     * Journals an addition for introspection only; these entries are never replayed. A no-op unless the
     * transaction is open, so detached and outliving writers stay out of the journal.
     */
    private recordRequestJournalEntry;
    /**
     * The requests buffered by the given transaction for this queue, keyed by `uniqueKey` — a dedup
     * index derived from the transaction journal.
     */
    private bufferedRequests;
    /**
     * Adds a request under the `deferred` policy: journaled now, really added by the commit replay.
     * A new request's `requestId` is the local `uniqueKey` hash and is **provisional** — never write it
     * to `request.id` or the dedup caches. Dedup is cheapest-first: buffer, caches, then a backend probe.
     */
    private addRequestDeferred;
    /** @internal */
    commitJournalEntries(entries: JournalEntry[]): Promise<void>;
    /**
     * Adds requests to the queue in batches of 25. This method will wait till all the requests are added
     * to the queue before resolving. You should prefer using `queue.addRequestsBatched()` or `crawler.addRequests()`
     * if you don't want to block the processing, as those methods will only wait for the initial 1000 requests,
     * start processing right after that happens, and continue adding more in the background.
     *
     * If a request passed in is already present due to its `uniqueKey` property being the same,
     * it will not be updated. You can find out whether this happened by finding the request in the resulting
     * {@apilink BatchAddRequestsResult} object.
     *
     * @param requestsLike {@apilink Request} objects or vanilla objects with request data.
     * Note that the function sets the `uniqueKey` and `id` fields to the passed requests if missing.
     * @param [options] Request queue operation options.
     */
    addRequests(requestsLike: RequestsLike, options?: RequestQueueOperationOptions): Promise<BatchAddRequestsResult>;
    /**
     * Adds requests to the queue in batches. By default, it will resolve after the initial batch is added, and continue
     * adding the rest in the background. You can configure the batch size via `batchSize` option and the sleep time in between
     * the batches via `waitBetweenBatchesMillis`. If you want to wait for all batches to be added to the queue, you can use
     * the `waitForAllRequestsToBeAdded` promise you get in the response object.
     *
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    addRequestsBatched(requests: ReadonlyDeep<RequestsLike>, options?: AddRequestsBatchedOptions): Promise<AddRequestsBatchedResult>;
    /**
     * Gets the request from the queue specified by its `uniqueKey`.
     *
     * @param uniqueKey Unique key of the request.
     * @returns Returns the request object, or `null` if it was not found.
     */
    getRequest<T extends Dictionary = Dictionary>(uniqueKey: string): Promise<Request<T> | null>;
    /**
     * Returns a next request in the queue to be processed, or `null` if there are no more pending requests.
     *
     * Once you successfully finish processing of the request, you need to call
     * {@apilink RequestQueue.markRequestAsHandled}
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
    markRequestAsHandled(request: Request): Promise<RequestQueueOperationInfo | null>;
    /**
     * Reclaims a failed request back to the queue, so that it can be returned for processing later again
     * by another call to {@apilink RequestQueue.fetchNextRequest}.
     * The request record in the queue is updated using the provided `request` parameter.
     * For example, this lets you store the number of retries or error messages for the request.
     */
    reclaimRequest(request: Request, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo | null>;
    /**
     * Resolves to `true` if the next call to {@apilink RequestQueue.fetchNextRequest} would return
     * `null`, i.e. there are no pending requests to fetch right now. Otherwise it resolves to `false`.
     *
     * Note that even if the queue is empty, there might be some requests currently being processed
     * (fetched but not yet handled or reclaimed). An empty queue therefore does not mean crawling is
     * finished — those in-progress requests may still be reclaimed, and background tasks may still be
     * adding more requests. To check whether all activity in the queue has finished, use
     * {@apilink RequestQueue.isFinished}.
     */
    isEmpty(): Promise<boolean>;
    /**
     * Resolves to `true` if all requests were already handled and there are no more left — including no
     * requests currently in progress (fetched but not yet handled or reclaimed, including requests
     * locked by other clients sharing the same queue) and no background add operations still in flight.
     *
     * Due to the nature of distributed storage used by the queue, the function may occasionally return
     * a false negative, but it shall never return a false positive.
     */
    isFinished(): Promise<boolean>;
    /**
     * Tells the queue how long a consumer expects to hold a fetched request before marking it handled
     * or reclaiming it (typically the request-handler timeout plus padding), so that a storage backend
     * that reserves requests via locking does not hand the same request out again while it is still
     * being processed.
     *
     * Several consumers may share one queue (and therefore one client) in a single process, so we only
     * ever raise the reservation duration, never lower it — otherwise a short-lived consumer could cut
     * short the reservation of a long-lived one and have its in-flight request stolen.
     */
    setExpectedRequestProcessingTimeSecs(secs: number): Promise<void>;
    /**
     * Caches information about request to beware of unneeded addRequest() calls.
     */
    private cacheRequest;
    /**
     * Removes the queue either from the Apify Cloud storage or from the local database,
     * depending on the mode of operation.
     */
    drop(): Promise<void>;
    /**
     * Remove all requests from the queue but keep the queue itself, resetting it
     * so it can be reused (e.g. across multiple `crawler.run()` calls).
     */
    purge(): Promise<void>;
    /**
     * @inheritdoc
     */
    [Symbol.asyncIterator](): AsyncGenerator<Request<Dictionary>, void, unknown>;
    /**
     * Returns the number of handled requests.
     *
     * This function is just a convenient shortcut for:
     *
     * ```javascript
     * const { handledRequestCount } = await queue.getInfo();
     * ```
     * @inheritdoc
     */
    getHandledCount(): Promise<number>;
    /**
     * Returns an object containing general information about the request queue.
     *
     * **Example:**
     * ```
     * {
     *   id: "WkzbQMuFYuamGv3YF",
     *   name: "my-queue",
     *   createdAt: new Date("2015-12-12T07:34:14.202Z"),
     *   modifiedAt: new Date("2015-12-13T08:36:13.202Z"),
     *   accessedAt: new Date("2015-12-14T08:36:13.202Z"),
     *   totalRequestCount: 25,
     *   handledRequestCount: 5,
     *   pendingRequestCount: 20,
     * }
     * ```
     *
     * @throws If the underlying storage no longer exists (e.g. it was deleted externally).
     */
    getInfo(): Promise<RequestQueueInfo>;
    /**
     * Fetches URLs from requestsFromUrl and returns them in format of list of requests
     */
    private fetchRequestsFromUrl;
    /**
     * Adds all fetched requests from a URL from a remote resource.
     */
    private addFetchedRequests;
    /**
     * @internal wraps public utility for mocking purposes
     */
    private downloadListOfUrls;
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
     * @param [identifier]
     *   ID or name of the request queue to be opened. If a string is provided, it will first be
     *   looked up as an ID; if no such storage exists, it will be treated as a name.
     *   If `null` or `undefined`, the function returns the default request queue associated with the crawler run.
     * @param [options] Open Request Queue options.
     */
    static open(identifier?: string | StorageIdentifier | null, options?: StorageOpenOptions): Promise<RequestQueue>;
}
interface RequestLruItem {
    uniqueKey: string;
    isHandled: boolean;
    id: string;
    hydrated: Request | null;
    lockExpiresAt: number | null;
    forefront: boolean;
}
export interface RequestQueueOptions {
    /** Resolved metadata for the request queue, as returned by the backend's `getMetadata()`. */
    metadata: RequestQueueInfo;
    backend: RequestQueueBackend;
    /**
     * Used to pass the proxy configuration for the `requestsFromUrl` objects.
     * Takes advantage of the internal address rotation and authentication process.
     * If undefined, the `requestsFromUrl` requests will be made without proxy.
     */
    proxyConfiguration?: IProxyConfiguration;
}
export interface RequestQueueOperationOptions {
    /**
     * If set to `true`:
     *   - while adding the request to the queue: the request will be added to the foremost position in the queue.
     *   - while reclaiming the request: the request will be placed to the beginning of the queue, so that it's returned
     *   in the next call to {@apilink RequestQueue.fetchNextRequest}.
     * By default, it's put to the end of the queue.
     *
     * In case the request is already present in the queue, this option has no effect.
     *
     * If more requests are added with this option at once, their order in the following `fetchNextRequest` call
     * is arbitrary.
     * @default false
     */
    forefront?: boolean;
    /**
     * Should the requests be added to the local LRU cache?
     * @default false
     * @internal
     */
    cache?: boolean;
}
export interface RequestQueueOperationInfo extends QueueOperationInfo {
    uniqueKey: string;
    forefront: boolean;
}
export interface AddRequestsBatchedOptions extends RequestQueueOperationOptions {
    /**
     * Whether to wait for all the provided requests to be added, instead of waiting just for the initial batch of up to `batchSize`.
     * @default false
     */
    waitForAllRequestsToBeAdded?: boolean;
    /**
     * @default 1000
     */
    batchSize?: number;
    /**
     * @default 1000
     */
    waitBetweenBatchesMillis?: number;
    /**
     * If set, only this many *actually new* requests (i.e. not already present in the queue) will be added.
     * Once the budget is reached, remaining requests from the iterable will be collected in
     * {@apilink AddRequestsBatchedResult.requestsOverLimit|`requestsOverLimit`} instead.
     *
     * This is useful in combination with `maxRequestsPerCrawl` to avoid duplicate URLs consuming the budget.
     *
     * **Note:** Setting this option implicitly enables {@apilink AddRequestsBatchedOptions.waitForAllRequestsToBeAdded|`waitForAllRequestsToBeAdded`},
     * since all batches must complete before leftover requests can be accurately reported.
     */
    maxNewRequests?: number;
}
export interface AddRequestsBatchedResult {
    addedRequests: ProcessedRequest[];
    /**
     * A promise which will resolve with the rest of the requests that were added to the queue.
     *
     * Alternatively, we can set {@apilink AddRequestsBatchedOptions.waitForAllRequestsToBeAdded|`waitForAllRequestsToBeAdded`} to `true`
     * in the {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} options.
     *
     * **Example:**
     *
     * ```ts
     * // Assuming `requests` is a list of requests.
     * const result = await crawler.addRequests(requests);
     *
     * // If we want to wait for the rest of the requests to be added to the queue:
     * await result.waitForAllRequestsToBeAdded;
     * ```
     */
    waitForAllRequestsToBeAdded: Promise<ProcessedRequest[]>;
    /**
     * Requests from the input that were not added to the queue because the
     * {@apilink AddRequestsBatchedOptions.maxNewRequests|`maxNewRequests`} budget was reached.
     * Empty when `maxNewRequests` is not set.
     */
    requestsOverLimit?: Source[];
}
export {};
