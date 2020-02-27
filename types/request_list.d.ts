export const STATE_PERSISTENCE_KEY: "REQUEST_LIST_STATE";
export const REQUESTS_PERSISTENCE_KEY: "REQUEST_LIST_REQUESTS";
/**
 * @typedef RequestListOptions
 * @property {Array<RequestOptions|Request|string>} [sources]
 *  An array of sources of URLs for the {@link RequestList}. It can be either an array of strings,
 *  plain objects that define at least the `url` property, or an array of {@link Request} instances.
 *
 *  **IMPORTANT:** The `sources` array will be consumed (left empty) after `RequestList` initializes.
 *  This is a measure to prevent memory leaks in situations when millions of sources are
 *  added.
 *
 *  Additionally, the `requestsFromUrl` property may be used instead of `url`,
 *  which will instruct `RequestList` to download the source URLs from a given remote location.
 *  The URLs will be parsed from the received response.
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
 * @property {Function} [sourcesFunction]
 *   A function that will be called to get the sources for the `RequestList`, but only if `RequestList`
 *   was not able to fetch their persisted version (see {@link RequestListOptions.persistRequestsKey}).
 *   It must return an `Array` of {@link Request} or {@link RequestOptions}.
 *
 *   This is very useful in a scenario when getting the sources is a resource intensive or time consuming
 *   task, such as fetching URLs from multiple sitemaps or parsing URLs from large datasets. Using the
 *   `sourcesFunction` in combination with `persistStateKey` and `persistRequestsKey` will allow you to
 *   fetch and parse those URLs only once, saving valuable time when your actor migrates or restarts.
 *
 *   If both {@link RequestListOptions.sources} and {@link RequestListOptions.sourcesFunction} are provided,
 *   the sources returned by the function will be added after the `sources`.
 *
 *   **Example:**
 *   ```javascript
 *   // Let's say we want to scrape URLs extracted from sitemaps.
 *
 *   const sourcesFunction = async () => {
 *       // With super large sitemaps, this operation could take very long
 *       // and big websites typically have multiple sitemaps.
 *       const sitemaps = await downloadHugeSitemaps();
 *       return parseUrlsFromSitemaps(sitemaps);
 *   }
 *
 *   // Sitemaps can change in real-time, so it's important to persist
 *   // the URLs we collected. Otherwise we might lose our scraping
 *   // state in case of an actor migration / failure / time-out.
 *   const requestList = new RequestList({
 *       sourcesFunction,
 *       persistStateKey: 'state-key',
 *       persistRequestsKey: 'requests-key',
 *   })
 *
 *   // The sourcesFunction is called now and the Requests are persisted.
 *   // If something goes wrong and we need to start again, RequestList
 *   // will load the persisted Requests from storage and will NOT
 *   // call the sourcesFunction again, saving time and resources.
 *   await requestList.initialize();
 *   ```
 * @property {string} [persistStateKey]
 *   Identifies the key in the default key-value store under which `RequestList` periodically stores its
 *   state (i.e. which URLs were crawled and which not).
 *   If the actor is restarted, `RequestList` will read the state
 *   and continue where it left off.
 *
 *   If `persistStateKey` is not set, `RequestList` will always start from the beginning,
 *   and all the source URLs will be crawled again.
 * @property {string} [persistRequestsKey]
 *   Identifies the key in the default key-value store under which the `RequestList` persists its
 *   Requests during the {@link RequestList#initialize} call.
 *   This is necessary if `persistStateKey` is set and the source URLs might potentially change,
 *   to ensure consistency of the source URLs and state object. However, it comes with some
 *   storage and performance overheads.
 *
 *   If `persistRequestsKey` is not set, {@link RequestList#initialize} will always fetch the sources
 *   from their origin, check that they are consistent with the restored state (if any)
 *   and throw an error if they are not.
 * @property {RequestListState} [state]
 *   The state object that the `RequestList` will be initialized from.
 *   It is in the form as returned by `RequestList.getState()`, such as follows:
 *
 * ```
 * {
 *     nextIndex: 5,
 *     nextUniqueKey: 'unique-key-5'
 *     inProgress: {
 *         'unique-key-1': true,
 *         'unique-key-4': true,
 *     },
 * }
 * ```
 *
 *   Note that the preferred (and simpler) way to persist the state of crawling of the `RequestList`
 *   is to use the `stateKeyPrefix` parameter instead.
 * @property {boolean} [keepDuplicateUrls=false]
 *   By default, `RequestList` will deduplicate the provided URLs. Default deduplication is based
 *   on the `uniqueKey` property of passed source {@link Request} objects.
 *
 *   If the property is not present, it is generated by normalizing the URL. If present, it is kept intact.
 *   In any case, only one request per `uniqueKey` is added to the `RequestList` resulting in removal
 *   of duplicate URLs / unique keys.
 *
 *   Setting `keepDuplicateUrls` to `true` will append an additional identifier to the `uniqueKey`
 *   of each request that does not already include a `uniqueKey`. Therefore, duplicate
 *   URLs will be kept in the list. It does not protect the user from having duplicates in user set
 *   `uniqueKey`s however. It is the user's responsibility to ensure uniqueness of their unique keys
 *   if they wish to keep more than just a single copy in the `RequestList`.
 */
/**
 * Represents a static list of URLs to crawl.
 * The URLs can be provided either in code or parsed from a text file hosted on the web.
 *
 * Each URL is represented using an instance of the {@link Request} class.
 * The list can only contain unique URLs. More precisely, it can only contain `Request` instances
 * with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
 * To add a single URL to the list multiple times, corresponding {@link Request} objects will need to have different
 * `uniqueKey` properties. You can use the `keepDuplicateUrls` option to do this for you when initializing the
 * `RequestList` from sources.
 *
 * Once you create an instance of `RequestList`, you need to call the {@link RequestList#initialize} function
 * before the instance can be used. After that, no more URLs can be added to the list.
 *
 * `RequestList` is used by {@link BasicCrawler}, {@link CheerioCrawler}
 * and {@link PuppeteerCrawler} as a source of URLs to crawl.
 * Unlike {@link RequestQueue}, `RequestList` is static but it can contain even millions of URLs.
 *
 * `RequestList` has an internal state where it stores information about which requests were already handled,
 * which are in progress and which were reclaimed. The state may be automatically persisted to the default
 * {@link KeyValueStore} by setting the `persistStateKey` option so that if the Node.js process is restarted,
 * the crawling can continue where it left off. The automated persisting is launched upon receiving the `persistState`
 * event that is periodically emitted by {@link events|Apify.events}.
 *
 * The internal state is closely tied to the provided sources (URLs). If the sources change on actor restart, the state will become corrupted and
 * `RequestList` will raise an exception. This typically happens when the sources is a list of URLs downloaded from the web.
 * In such case, use the `persistRequestsKey` option in conjunction with `persistStateKey`,
 * to make the `RequestList` store the initial sources to the default key-value store and load them after restart,
 * which will prevent any issues that a live list of URLs might cause.
 *
 * **Basic usage:**
 * ```javascript
 * // Use a helper function to simplify request list initialization.
 * // State and sources are automatically persisted.
 * const requestList = await Apify.openRequestList('my-request-list', [
 *     'http://www.example.com/page-1',
 *     { url: 'http://www.example.com/page-2', method: 'POST', userData: { foo: 'bar' }},
 *     { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
 * ]);
 * ```
 *
 * **Advanced usage:**
 * ```javascript
 * // Use the constructor to get more control over the initialization.
 * const requestList = new Apify.RequestList({
 *     sources: [
 *         // Separate requests
 *         { url: 'http://www.example.com/page-1', method: 'GET', headers: { ... } },
 *         { url: 'http://www.example.com/page-2', userData: { foo: 'bar' }},
 *
 *         // Bulk load of URLs from file `http://www.example.com/my-url-list.txt`
 *         // Note that all URLs must start with http:// or https://
 *         { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
 *     ],
 *
 *     // Persist only state in cases where the original sources are immutable to improve performance.
 *     persistStateKey: 'my-state',
 * });
 *
 * await requestList.initialize();
 * ```
 */
export class RequestList {
    /**
     * @param {RequestListOptions} options All `RequestList` configuration options
     */
    constructor(options?: RequestListOptions);
    requests: any[];
    nextIndex: number;
    uniqueKeyToIndex: {};
    inProgress: {};
    reclaimed: {};
    persistStateKey: string;
    persistRequestsKey: any;
    initialState: RequestListState;
    keepDuplicateUrls: boolean;
    isStatePersisted: boolean;
    areRequestsPersisted: boolean;
    isLoading: boolean;
    isInitialized: boolean;
    sources: (string | Request | RequestOptions)[];
    sourcesFunction: Function;
    /**
     * Loads all remote sources of URLs and potentially starts periodic state persistence.
     * This function must be called before you can start using the instance in a meaningful way.
     *
     * @returns {Promise<void>}
     */
    initialize(): Promise<void>;
    /**
     * Adds previously persisted Requests, as retrieved from the key-value store.
     * This needs to be done in a memory efficient way. We should update the input
     * to a Stream once apify-client supports streams.
     * @param {Buffer} persistedRequests
     * @ignore
     */
    _addPersistedRequests(persistedRequests: Buffer): Promise<void>;
    /**
     * Add Requests from both options.sources and options.sourcesFunction.
     * This function is called only when persisted sources were not loaded.
     * We need to avoid keeping both sources and requests in memory
     * to reduce memory footprint with very large sources.
     * @returns {Promise<void>}
     * @ignore
     */
    _addRequestsFromSources(): Promise<void>;
    /**
     * Persists the current state of the `RequestList` into the default {@link KeyValueStore}.
     * The state is persisted automatically in regular intervals, but calling this method manually
     * is useful in cases where you want to have the most current state available after you pause
     * or stop fetching its requests. For example after you pause or abort a crawl. Or just before
     * a server migration.
     *
     * @return {Promise<void>}
     */
    persistState(): Promise<void>;
    /**
     * Unlike persistState(), this is used only internally, since the sources
     * are automatically persisted at RequestList initialization (if the persistRequestsKey is set),
     * but there's no reason to persist it again afterwards, because RequestList is immutable.
     *
     * @return {Promise<void>}
     * @ignore
     */
    _persistRequests(): Promise<void>;
    /**
     * Restores RequestList state from a state object.
     *
     * @param {RequestListState} state
     * @ignore
     */
    _restoreState(state: RequestListState): void;
    /**
     * Attempts to load state and requests using the `RequestList` configuration
     * and returns a tuple of [state, requests] where each may be null if not loaded.
     *
     * @return {Promise<Array<(RequestListState|null)>>}
     * @ignore
     */
    _loadStateAndPersistedRequests(): Promise<(RequestListState | null)[]>;
    /**
     * Returns an object representing the internal state of the `RequestList` instance.
     * Note that the object's fields can change in future releases.
     *
     * @returns {RequestListState}
     */
    getState(): RequestListState;
    /**
     * Resolves to `true` if the next call to {@link RequestList#fetchNextRequest} function
     * would return `null`, otherwise it resolves to `false`.
     * Note that even if the list is empty, there might be some pending requests currently being processed.
     *
     * @returns {Promise<Boolean>}
     */
    isEmpty(): Promise<boolean>;
    /**
     * Returns `true` if all requests were already handled and there are no more left.
     *
     * @returns {Promise<Boolean>}
     */
    isFinished(): Promise<boolean>;
    /**
     * Gets the next {@link Request} to process. First, the function gets a request previously reclaimed
     * using the {@link RequestList#reclaimRequest} function, if there is any.
     * Otherwise it gets the next request from sources.
     *
     * The function's `Promise` resolves to `null` if there are no more
     * requests to process.
     *
     * @returns {Promise<(Request|null)>}
     */
    fetchNextRequest(): Promise<Request | null>;
    /**
     * Marks request as handled after successful processing.
     *
     * @param {Request} request
     * @returns {Promise<void>}
     */
    markRequestHandled(request: Request): Promise<void>;
    /**
     * Reclaims request to the list if its processing failed.
     * The request will become available in the next `this.fetchNextRequest()`.
     *
     * @param {Request} request
     * @returns {Promise<void>}
     */
    reclaimRequest(request: Request): Promise<void>;
    /**
     * Adds all fetched requests from a URL from a remote resource.
     *
     * @ignore
     */
    _addFetchedRequests(source: any, fetchedRequests: any): Promise<void>;
    /**
     * Fetches URLs from requestsFromUrl and returns them in format of list of requests
     * @param source
     * @return {Promise<Array<RequestOptions>>}
     * @ignore
     */
    _fetchRequestsFromUrl(source: any): Promise<RequestOptions[]>;
    /**
     * Adds given request.
     * If the `source` parameter is a string or plain object and not an instance
     * of a `Request`, then the function creates a `Request` instance.
     *
     * @param {string|Request|object} source
     * @ignore
     */
    _addRequest(source: any): void;
    /**
     * Helper function that validates unique key.
     * Throws an error if uniqueKey is not a non-empty string.
     *
     * @ignore
     */
    _ensureUniqueKeyValid(uniqueKey: any): void;
    /**
     * Checks that request is not reclaimed and throws an error if so.
     *
     * @ignore
     */
    _ensureInProgressAndNotReclaimed(uniqueKey: any): void;
    /**
     * Throws an error if request list wasn't initialized.
     *
     * @ignore
     */
    _ensureIsInitialized(): void;
    /**
     * Returns the total number of unique requests present in the `RequestList`.
     *
     * @returns {number}
     */
    length(): number;
    /**
     * Returns number of handled requests.
     *
     * @returns {number}
     */
    handledCount(): number;
}
export function openRequestList(listName: string | null, sources: (string | Request | RequestOptions)[], options?: RequestListOptions | undefined): Promise<RequestList>;
export type RequestListOptions = {
    /**
     * An array of sources of URLs for the {@link RequestList}. It can be either an array of strings,
     * plain objects that define at least the `url` property, or an array of {@link Request} instances.
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
     * // A single URL
     * 'http://example.com/a/b',
     *
     * // Modify Request options
     * { method: PUT, 'https://example.com/put, payload: { foo: 'bar' }}
     *
     * // Batch import of URLs from a file hosted on the web,
     * // where the URLs should be requested using the HTTP POST request
     * { method: 'POST', requestsFromUrl: 'http://example.com/urls.txt' },
     *
     * // Batch import from remote file, using a specific regular expression to extract the URLs.
     * { requestsFromUrl: 'http://example.com/urls.txt', regex: /https:\/\/example.com\/.+/ },
     *
     * // Get list of URLs from a Google Sheets document. Just add "/gviz/tq?tqx=out:csv" to the Google Sheet URL.
     * // For details, see https://help.apify.com/en/articles/2906022-scraping-a-list-of-urls-from-a-google-sheets-document
     * { requestsFromUrl: 'https://docs.google.com/spreadsheets/d/1GA5sSQhQjB_REes8I5IKg31S-TuRcznWOPjcpNqtxmU/gviz/tq?tqx=out:csv' }
     * ]
     * ```
     */
    sources?: (string | Request | RequestOptions)[];
    /**
     * A function that will be called to get the sources for the `RequestList`, but only if `RequestList`
     * was not able to fetch their persisted version (see {@link RequestListOptions.persistRequestsKey}).
     * It must return an `Array` of {@link Request} or {@link RequestOptions}.
     *
     * This is very useful in a scenario when getting the sources is a resource intensive or time consuming
     * task, such as fetching URLs from multiple sitemaps or parsing URLs from large datasets. Using the
     * `sourcesFunction` in combination with `persistStateKey` and `persistRequestsKey` will allow you to
     * fetch and parse those URLs only once, saving valuable time when your actor migrates or restarts.
     *
     * If both {@link RequestListOptions.sources} and {@link RequestListOptions.sourcesFunction} are provided,
     * the sources returned by the function will be added after the `sources`.
     *
     * **Example:**
     * ```javascript
     * // Let's say we want to scrape URLs extracted from sitemaps.
     *
     * const sourcesFunction = async () => {
     * // With super large sitemaps, this operation could take very long
     * // and big websites typically have multiple sitemaps.
     * const sitemaps = await downloadHugeSitemaps();
     * return parseUrlsFromSitemaps(sitemaps);
     * }
     *
     * // Sitemaps can change in real-time, so it's important to persist
     * // the URLs we collected. Otherwise we might lose our scraping
     * // state in case of an actor migration / failure / time-out.
     * const requestList = new RequestList({
     * sourcesFunction,
     * persistStateKey: 'state-key',
     * persistRequestsKey: 'requests-key',
     * })
     *
     * // The sourcesFunction is called now and the Requests are persisted.
     * // If something goes wrong and we need to start again, RequestList
     * // will load the persisted Requests from storage and will NOT
     * // call the sourcesFunction again, saving time and resources.
     * await requestList.initialize();
     * ```
     */
    sourcesFunction?: Function;
    /**
     * Identifies the key in the default key-value store under which `RequestList` periodically stores its
     * state (i.e. which URLs were crawled and which not).
     * If the actor is restarted, `RequestList` will read the state
     * and continue where it left off.
     *
     * If `persistStateKey` is not set, `RequestList` will always start from the beginning,
     * and all the source URLs will be crawled again.
     */
    persistStateKey?: string;
    /**
     * Identifies the key in the default key-value store under which the `RequestList` persists its
     * Requests during the {@link RequestList#initialize} call.
     * This is necessary if `persistStateKey` is set and the source URLs might potentially change,
     * to ensure consistency of the source URLs and state object. However, it comes with some
     * storage and performance overheads.
     *
     * If `persistRequestsKey` is not set, {@link RequestList#initialize} will always fetch the sources
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
     * nextIndex: 5,
     * nextUniqueKey: 'unique-key-5'
     * inProgress: {
     * 'unique-key-1': true,
     * 'unique-key-4': true,
     * },
     * }
     * ```
     *
     * Note that the preferred (and simpler) way to persist the state of crawling of the `RequestList`
     * is to use the `stateKeyPrefix` parameter instead.
     */
    state?: RequestListState;
    /**
     * By default, `RequestList` will deduplicate the provided URLs. Default deduplication is based
     * on the `uniqueKey` property of passed source {@link Request} objects.
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
     */
    keepDuplicateUrls?: boolean;
};
/**
 * Represents state of a {@link RequestList}. It can be used to resume a {@link RequestList} which has been previously processed.
 * You can obtain the state by calling {@link RequestList#getState} and receive an object with
 * the following structure:
 *
 * ```
 * {
 *      nextIndex: 5,
 *      nextUniqueKey: 'unique-key-5'
 *      inProgress: {
 *          'unique-key-1': true,
 *          'unique-key-4': true
 *      },
 * }
 * ```
 */
export type RequestListState = {
    /**
     * Position of the next request to be processed.
     */
    nextIndex: number;
    /**
     * Key of the next request to be processed.
     */
    nextUniqueKey: string;
    /**
     * An object mapping request keys to a boolean value respresenting whether they are being processed at the moment.
     */
    inProgress: {
        [x: string]: boolean;
    };
};
import Request from "./request";
import { RequestOptions } from "./request";
