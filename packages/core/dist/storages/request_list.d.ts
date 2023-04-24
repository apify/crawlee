/// <reference types="node" />
import { Configuration } from '../configuration';
import type { RequestOptions } from '../request';
import { Request } from '../request';
import type { ProxyConfiguration } from '../proxy_configuration';
/** @internal */
export declare const STATE_PERSISTENCE_KEY = "REQUEST_LIST_STATE";
/** @internal */
export declare const REQUESTS_PERSISTENCE_KEY = "REQUEST_LIST_REQUESTS";
export interface RequestListOptions {
    /**
     * An array of sources of URLs for the {@apilink RequestList}. It can be either an array of strings,
     * plain objects that define at least the `url` property, or an array of {@apilink Request} instances.
     *
     * **IMPORTANT:** The `sources` array will be consumed (left empty) after `RequestList` initializes.
     * This is a measure to prevent memory leaks in situations when millions of sources are
     * added.
     *
     * Additionally, the `requestsFromUrl` property may be used instead of `url`,
     * which will instruct `RequestList` to download the source URLs from a given remote location.
     * The URLs will be parsed from the received response.
     *
     * ```
     * [
     *     // A single URL
     *     'http://example.com/a/b',
     *
     *     // Modify Request options
     *     { method: PUT, 'https://example.com/put, payload: { foo: 'bar' }}
     *
     *     // Batch import of URLs from a file hosted on the web,
     *     // where the URLs should be requested using the HTTP POST request
     *     { method: 'POST', requestsFromUrl: 'http://example.com/urls.txt' },
     *
     *     // Batch import from remote file, using a specific regular expression to extract the URLs.
     *     { requestsFromUrl: 'http://example.com/urls.txt', regex: /https:\/\/example.com\/.+/ },
     *
     *     // Get list of URLs from a Google Sheets document. Just add "/gviz/tq?tqx=out:csv" to the Google Sheet URL.
     *     // For details, see https://help.apify.com/en/articles/2906022-scraping-a-list-of-urls-from-a-google-sheets-document
     *     { requestsFromUrl: 'https://docs.google.com/spreadsheets/d/1GA5sSQhQjB_REes8I5IKg31S-TuRcznWOPjcpNqtxmU/gviz/tq?tqx=out:csv' }
     * ]
     * ```
     */
    sources?: Source[];
    /**
     * A function that will be called to get the sources for the `RequestList`, but only if `RequestList`
     * was not able to fetch their persisted version (see {@apilink RequestListOptions.persistRequestsKey}).
     * It must return an `Array` of {@apilink Request} or {@apilink RequestOptions}.
     *
     * This is very useful in a scenario when getting the sources is a resource intensive or time consuming
     * task, such as fetching URLs from multiple sitemaps or parsing URLs from large datasets. Using the
     * `sourcesFunction` in combination with `persistStateKey` and `persistRequestsKey` will allow you to
     * fetch and parse those URLs only once, saving valuable time when your crawler migrates or restarts.
     *
     * If both {@apilink RequestListOptions.sources} and {@apilink RequestListOptions.sourcesFunction} are provided,
     * the sources returned by the function will be added after the `sources`.
     *
     * **Example:**
     * ```javascript
     * // Let's say we want to scrape URLs extracted from sitemaps.
     *
     * const sourcesFunction = async () => {
     *     // With super large sitemaps, this operation could take very long
     *     // and big websites typically have multiple sitemaps.
     *     const sitemaps = await downloadHugeSitemaps();
     *     return parseUrlsFromSitemaps(sitemaps);
     * };
     *
     * // Sitemaps can change in real-time, so it's important to persist
     * // the URLs we collected. Otherwise we might lose our scraping
     * // state in case of an crawler migration / failure / time-out.
     * const requestList = await RequestList.open(null, [], {
     *     // The sourcesFunction is called now and the Requests are persisted.
     *     // If something goes wrong and we need to start again, RequestList
     *     // will load the persisted Requests from storage and will NOT
     *     // call the sourcesFunction again, saving time and resources.
     *     sourcesFunction,
     *     persistStateKey: 'state-key',
     *     persistRequestsKey: 'requests-key',
     * })
     * ```
     */
    sourcesFunction?: RequestListSourcesFunction;
    /**
    *   Used to pass the the proxy configuration for the `requestsFromUrls` objects.
    *   Takes advantage of the internal address rotation and authentication process.
    *   If undefined, the `requestsFromUrls` requests will be made without proxy.
    */
    proxyConfiguration?: ProxyConfiguration;
    /**
     * Identifies the key in the default key-value store under which `RequestList` periodically stores its
     * state (i.e. which URLs were crawled and which not).
     * If the crawler is restarted, `RequestList` will read the state
     * and continue where it left off.
     *
     * If `persistStateKey` is not set, `RequestList` will always start from the beginning,
     * and all the source URLs will be crawled again.
     */
    persistStateKey?: string;
    /**
     * Identifies the key in the default key-value store under which the `RequestList` persists its
     * Requests during the {@apilink RequestList.initialize} call.
     * This is necessary if `persistStateKey` is set and the source URLs might potentially change,
     * to ensure consistency of the source URLs and state object. However, it comes with some
     * storage and performance overheads.
     *
     * If `persistRequestsKey` is not set, {@apilink RequestList.initialize} will always fetch the sources
     * from their origin, check that they are consistent with the restored state (if any)
     * and throw an error if they are not.
     */
    persistRequestsKey?: string;
    /**
     * The state object that the `RequestList` will be initialized from.
     * It is in the form as returned by `RequestList.getState()`, such as follows:
     *
     * ```
     * {
     *     nextIndex: 5,
     *     nextUniqueKey: 'unique-key-5'
     *     inProgress: {
     *       'unique-key-1': true,
     *       'unique-key-4': true,
     *     },
     * }
     * ```
     *
     * Note that the preferred (and simpler) way to persist the state of crawling of the `RequestList`
     * is to use the `stateKeyPrefix` parameter instead.
     */
    state?: RequestListState;
    /**
     * By default, `RequestList` will deduplicate the provided URLs. Default deduplication is based
     * on the `uniqueKey` property of passed source {@apilink Request} objects.
     *
     * If the property is not present, it is generated by normalizing the URL. If present, it is kept intact.
     * In any case, only one request per `uniqueKey` is added to the `RequestList` resulting in removal
     * of duplicate URLs / unique keys.
     *
     * Setting `keepDuplicateUrls` to `true` will append an additional identifier to the `uniqueKey`
     * of each request that does not already include a `uniqueKey`. Therefore, duplicate
     * URLs will be kept in the list. It does not protect the user from having duplicates in user set
     * `uniqueKey`s however. It is the user's responsibility to ensure uniqueness of their unique keys
     * if they wish to keep more than just a single copy in the `RequestList`.
     * @default false
     */
    keepDuplicateUrls?: boolean;
    /** @internal */
    config?: Configuration;
}
/**
 * Represents a static list of URLs to crawl.
 * The URLs can be provided either in code or parsed from a text file hosted on the web.
 * `RequestList` is used by {@apilink BasicCrawler}, {@apilink CheerioCrawler}, {@apilink PuppeteerCrawler}
 * and {@apilink PlaywrightCrawler} as a source of URLs to crawl.
 *
 * Each URL is represented using an instance of the {@apilink Request} class.
 * The list can only contain unique URLs. More precisely, it can only contain `Request` instances
 * with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
 * To add a single URL to the list multiple times, corresponding {@apilink Request} objects will need to have different
 * `uniqueKey` properties. You can use the `keepDuplicateUrls` option to do this for you when initializing the
 * `RequestList` from sources.
 *
 * Once you create an instance of `RequestList`, you need to call the {@apilink RequestList.initialize} function
 * before the instance can be used. After that, no more URLs can be added to the list.
 * Unlike {@apilink RequestQueue}, `RequestList` is static but it can contain even millions of URLs.
 * > Note that `RequestList` can be used together with `RequestQueue` by the same crawler.
 * > In such cases, each request from `RequestList` is enqueued into `RequestQueue` first and then consumed from the latter.
 * > This is necessary to avoid the same URL being processed more than once (from the list first and then possibly from the queue).
 * > In practical terms, such a combination can be useful when there is a large number of initial URLs,
 * > but more URLs would be added dynamically by the crawler.
 *
 * `RequestList` has an internal state where it stores information about which requests were already handled,
 * which are in progress and which were reclaimed. The state may be automatically persisted to the default
 * {@apilink KeyValueStore} by setting the `persistStateKey` option so that if the Node.js process is restarted,
 * the crawling can continue where it left off. The automated persisting is launched upon receiving the `persistState`
 * event that is periodically emitted by {@apilink EventManager}.
 *
 * The internal state is closely tied to the provided sources (URLs). If the sources change on crawler restart, the state will become corrupted and
 * `RequestList` will raise an exception. This typically happens when the sources is a list of URLs downloaded from the web.
 * In such case, use the `persistRequestsKey` option in conjunction with `persistStateKey`,
 * to make the `RequestList` store the initial sources to the default key-value store and load them after restart,
 * which will prevent any issues that a live list of URLs might cause.
 *
 * **Basic usage:**
 * ```javascript
 * // Use a helper function to simplify request list initialization.
 * // State and sources are automatically persisted. This is a preferred usage.
 * const requestList = await RequestList.open('my-request-list', [
 *     'http://www.example.com/page-1',
 *     { url: 'http://www.example.com/page-2', method: 'POST', userData: { foo: 'bar' }},
 *     { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
 * ]);
 * ```
 *
 * **Advanced usage:**
 * ```javascript
 * // Use the constructor to get more control over the initialization.
 * const requestList = await RequestList.open(null, [
 *     // Separate requests
 *     { url: 'http://www.example.com/page-1', method: 'GET', headers: { ... } },
 *     { url: 'http://www.example.com/page-2', userData: { foo: 'bar' }},
 *
 *     // Bulk load of URLs from file `http://www.example.com/my-url-list.txt`
 *     // Note that all URLs must start with http:// or https://
 *     { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
 * ], {
 *     // Persist the state to avoid re-crawling which can lead to data duplications.
 *     // Keep in mind that the sources have to be immutable or this will throw an error.
 *     persistStateKey: 'my-state',
 * });
 * ```
 * @category Sources
 */
export declare class RequestList {
    private log;
    /**
     * Array of all requests from all sources, in the order as they appeared in sources.
     * All requests in the array have distinct uniqueKey!
     * @internal
     */
    requests: Request[];
    /** Index to the next item in requests array to fetch. All previous requests are either handled or in progress. */
    private nextIndex;
    /** Dictionary, key is Request.uniqueKey, value is corresponding index in the requests array. */
    private uniqueKeyToIndex;
    /**
     * Set of `uniqueKey`s of requests that were returned by fetchNextRequest().
     * @internal
     */
    inProgress: Set<string>;
    /**
     * Set of `uniqueKey`s of requests for which reclaimRequest() was called.
     * @internal
     */
    reclaimed: Set<string>;
    /**
     * Starts as true because until we handle the first request, the list is effectively persisted by doing nothing.
     * @internal
     */
    isStatePersisted: boolean;
    /**
     * Starts as false because we don't know yet and sources might change in the meantime (eg. download from live list).
     * @internal
     */
    areRequestsPersisted: boolean;
    private isLoading;
    private isInitialized;
    private persistStateKey?;
    private persistRequestsKey?;
    private initialState?;
    private store?;
    private keepDuplicateUrls;
    private sources;
    private sourcesFunction?;
    private proxyConfiguration?;
    private events;
    /**
     * To create new instance of `RequestList` we need to use `RequestList.open()` factory method.
     * @param options All `RequestList` configuration options
     * @internal
     */
    private constructor();
    /**
     * Loads all remote sources of URLs and potentially starts periodic state persistence.
     * This function must be called before you can start using the instance in a meaningful way.
     */
    private initialize;
    /**
     * Adds previously persisted Requests, as retrieved from the key-value store.
     * This needs to be done in a memory efficient way. We should update the input
     * to a Stream once apify-client supports streams.
     */
    protected _addPersistedRequests(persistedRequests: Buffer): Promise<void>;
    /**
     * Add Requests from both options.sources and options.sourcesFunction.
     * This function is called only when persisted sources were not loaded.
     * We need to avoid keeping both sources and requests in memory
     * to reduce memory footprint with very large sources.
     */
    protected _addRequestsFromSources(): Promise<void>;
    /**
     * Persists the current state of the `RequestList` into the default {@apilink KeyValueStore}.
     * The state is persisted automatically in regular intervals, but calling this method manually
     * is useful in cases where you want to have the most current state available after you pause
     * or stop fetching its requests. For example after you pause or abort a crawl. Or just before
     * a server migration.
     */
    persistState(): Promise<void>;
    /**
     * Unlike persistState(), this is used only internally, since the sources
     * are automatically persisted at RequestList initialization (if the persistRequestsKey is set),
     * but there's no reason to persist it again afterwards, because RequestList is immutable.
     */
    protected _persistRequests(): Promise<void>;
    /**
     * Restores RequestList state from a state object.
     */
    protected _restoreState(state?: RequestListState): void;
    /**
     * Attempts to load state and requests using the `RequestList` configuration
     * and returns a tuple of [state, requests] where each may be null if not loaded.
     */
    protected _loadStateAndPersistedRequests(): Promise<[RequestListState, Buffer]>;
    /**
     * Returns an object representing the internal state of the `RequestList` instance.
     * Note that the object's fields can change in future releases.
     */
    getState(): RequestListState;
    /**
     * Resolves to `true` if the next call to {@apilink RequestList.fetchNextRequest} function
     * would return `null`, otherwise it resolves to `false`.
     * Note that even if the list is empty, there might be some pending requests currently being processed.
     */
    isEmpty(): Promise<boolean>;
    /**
     * Returns `true` if all requests were already handled and there are no more left.
     */
    isFinished(): Promise<boolean>;
    /**
     * Gets the next {@apilink Request} to process. First, the function gets a request previously reclaimed
     * using the {@apilink RequestList.reclaimRequest} function, if there is any.
     * Otherwise it gets the next request from sources.
     *
     * The function's `Promise` resolves to `null` if there are no more
     * requests to process.
     */
    fetchNextRequest(): Promise<Request | null>;
    /**
     * Marks request as handled after successful processing.
     */
    markRequestHandled(request: Request): Promise<void>;
    /**
     * Reclaims request to the list if its processing failed.
     * The request will become available in the next `this.fetchNextRequest()`.
     */
    reclaimRequest(request: Request): Promise<void>;
    /**
     * Adds all fetched requests from a URL from a remote resource.
     */
    protected _addFetchedRequests(source: InternalSource, fetchedRequests: RequestOptions[]): Promise<void>;
    protected _getPersistedState<T>(key: string): Promise<T>;
    /**
     * Fetches URLs from requestsFromUrl and returns them in format of list of requests
     */
    protected _fetchRequestsFromUrl(source: InternalSource): Promise<RequestOptions[]>;
    /**
     * Adds given request.
     * If the `source` parameter is a string or plain object and not an instance
     * of a `Request`, then the function creates a `Request` instance.
     */
    protected _addRequest(source: Source): void;
    /**
     * Helper function that validates unique key.
     * Throws an error if uniqueKey is not a non-empty string.
     */
    protected _ensureUniqueKeyValid(uniqueKey: string): void;
    /**
     * Checks that request is not reclaimed and throws an error if so.
     */
    protected _ensureInProgressAndNotReclaimed(uniqueKey: string): void;
    /**
     * Throws an error if request list wasn't initialized.
     */
    protected _ensureIsInitialized(): void;
    /**
     * Returns the total number of unique requests present in the `RequestList`.
     */
    length(): number;
    /**
     * Returns number of handled requests.
     */
    handledCount(): number;
    /**
     * Opens a request list and returns a promise resolving to an instance
     * of the {@apilink RequestList} class that is already initialized.
     *
     * {@apilink RequestList} represents a list of URLs to crawl, which is always stored in memory.
     * To enable picking up where left off after a process restart, the request list sources
     * are persisted to the key-value store at initialization of the list. Then, while crawling,
     * a small state object is regularly persisted to keep track of the crawling status.
     *
     * For more details and code examples, see the {@apilink RequestList} class.
     *
     * **Example usage:**
     *
     * ```javascript
     * const sources = [
     *     'https://www.example.com',
     *     'https://www.google.com',
     *     'https://www.bing.com'
     * ];
     *
     * const requestList = await RequestList.open('my-name', sources);
     * ```
     *
     * @param listNameOrOptions
     *   Name of the request list to be opened, or the options object. Setting a name enables the `RequestList`'s
     *   state to be persisted in the key-value store. This is useful in case of a restart or migration. Since `RequestList`
     *   is only stored in memory, a restart or migration wipes it clean. Setting a name will enable the `RequestList`'s
     *   state to survive those situations and continue where it left off.
     *
     *   The name will be used as a prefix in key-value store, producing keys such as `NAME-REQUEST_LIST_STATE`
     *   and `NAME-REQUEST_LIST_SOURCES`.
     *
     *   If `null`, the list will not be persisted and will only be stored in memory. Process restart
     *   will then cause the list to be crawled again from the beginning. We suggest always using a name.
     * @param [sources]
     *  An array of sources of URLs for the {@apilink RequestList}. It can be either an array of strings,
     *  plain objects that define at least the `url` property, or an array of {@apilink Request} instances.
     *
     *  **IMPORTANT:** The `sources` array will be consumed (left empty) after {@apilink RequestList} initializes.
     *  This is a measure to prevent memory leaks in situations when millions of sources are
     *  added.
     *
     *  Additionally, the `requestsFromUrl` property may be used instead of `url`,
     *  which will instruct {@apilink RequestList} to download the source URLs from a given remote location.
     *  The URLs will be parsed from the received response. In this case you can limit the URLs
     *  using `regex` parameter containing regular expression pattern for URLs to be included.
     *
     *  For details, see the {@apilink RequestListOptions.sources}
     * @param [options]
     *   The {@apilink RequestList} options. Note that the `listName` parameter supersedes
     *   the {@apilink RequestListOptions.persistStateKey} and {@apilink RequestListOptions.persistRequestsKey}
     *   options and the `sources` parameter supersedes the {@apilink RequestListOptions.sources} option.
     */
    static open(listNameOrOptions: string | null | RequestListOptions, sources?: Source[], options?: RequestListOptions): Promise<RequestList>;
    /**
     * @internal wraps public utility for mocking purposes
     */
    private _downloadListOfUrls;
}
/**
 * Represents state of a {@apilink RequestList}. It can be used to resume a {@apilink RequestList} which has been previously processed.
 * You can obtain the state by calling {@apilink RequestList.getState} and receive an object with
 * the following structure:
 *
 * ```
 * {
 *     nextIndex: 5,
 *     nextUniqueKey: 'unique-key-5'
 *     inProgress: {
 *         'unique-key-1': true,
 *         'unique-key-4': true
 *     },
 * }
 * ```
 */
export interface RequestListState {
    /** Position of the next request to be processed. */
    nextIndex: number;
    /** Key of the next request to be processed. */
    nextUniqueKey: string | null;
    /** Array of request keys representing those that being processed at the moment. */
    inProgress: string[];
}
export type Source = string | (Partial<RequestOptions> & {
    requestsFromUrl?: string;
    regex?: RegExp;
}) | Request;
interface InternalSource {
    requestsFromUrl: string;
    regex?: RegExp;
}
export type RequestListSourcesFunction = () => Promise<Source[]>;
export {};
//# sourceMappingURL=request_list.d.ts.map