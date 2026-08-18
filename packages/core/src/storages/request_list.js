import { downloadListOfUrls } from '@crawlee/utils';
import { z } from 'zod';
import { EventType } from '../events/event_manager.js';
import { Request } from '../request.js';
import { createDeserialize, serializeArray } from '../serialization.js';
import { serviceLocator } from '../service_locator.js';
import { parseArgument, schemas, validators } from '../validators.js';
import { KeyValueStore } from './key_value_store.js';
import { purgeDefaultStorages } from './utils.js';
/** @internal */
export const STATE_PERSISTENCE_KEY = 'REQUEST_LIST_STATE';
/** @internal */
export const REQUESTS_PERSISTENCE_KEY = 'REQUEST_LIST_REQUESTS';
const CONTENT_TYPE_BINARY = 'application/octet-stream';
const requestListOptionsSchema = z.strictObject({
    sources: schemas.anyArray.optional(), // check only for array and not subtypes to avoid iteration over the whole thing
    sourcesFunction: schemas.anyFunction.optional(),
    persistStateKey: z.string().optional(),
    persistRequestsKey: z.string().optional(),
    state: z
        .strictObject({
        nextIndex: schemas.anyNumber,
        nextUniqueKey: z.string(),
        inProgress: schemas.anyObject, // persisted as an array of unique keys
    })
        .optional(),
    keepDuplicateUrls: z.boolean().default(false),
    proxyConfiguration: validators.proxyConfiguration.optional(),
    httpClient: schemas.httpClient.optional(),
});
const listNameSchema = z.string().nullish();
const openOptionsSchema = z.looseObject({});
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
 * `RequestList` doesn't have a public constructor, you need to create it with the asynchronous {@apilink RequestList.open} function. After
 * the request list is created, no more URLs can be added to it.
 * Unlike {@apilink RequestQueue}, `RequestList` is static but it can contain even millions of URLs.
 * > Note that `RequestList` can be used together with `RequestQueue` by the same crawler.
 * > In such cases, each request from `RequestList` is enqueued into `RequestQueue` first and then consumed from the latter.
 * > This is necessary to avoid the same URL being processed more than once (from the list first and then possibly from the queue).
 * > In practical terms, such a combination can be useful when there is a large number of initial URLs,
 * > but more URLs would be added dynamically by the crawler.
 *
 * `RequestList` has an internal state where it stores information about which requests were already handled
 * and which are in progress. The state may be automatically persisted to the default
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
 * const requestList = await RequestList.open('my-request-list', [
 *     'http://www.example.com/page-1',
 *     { url: 'http://www.example.com/page-2', method: 'POST', userData: { foo: 'bar' }},
 *     { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
 * ]);
 * ```
 *
 * **Advanced usage:**
 * ```javascript
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
export class RequestList {
    #log = serviceLocator.getLogger().child({ prefix: 'RequestList' });
    /**
     * Array of all requests from all sources, in the order as they appeared in sources.
     * All requests in the array have distinct uniqueKey!
     * @internal
     */
    requests = [];
    /** Index to the next item in requests array to fetch. All previous requests are either handled or in progress. */
    #nextIndex = 0;
    /** Dictionary, key is Request.uniqueKey, value is corresponding index in the requests array. */
    #uniqueKeyToIndex = {};
    /**
     * Set of `uniqueKey`s of requests that were returned by fetchNextRequest().
     * @internal
     */
    inProgress = new Set();
    /**
     * `uniqueKey`s of requests that were in progress when the state was last persisted and thus need to be
     * re-crawled after a restart. They are served before advancing through the rest of the sources.
     * @internal
     */
    #requestsToRetry = [];
    /**
     * Starts as true because until we handle the first request, the list is effectively persisted by doing nothing.
     * @internal
     */
    isStatePersisted = true;
    /**
     * Starts as false because we don't know yet and sources might change in the meantime (eg. download from live list).
     * @internal
     */
    areRequestsPersisted = false;
    #isLoading = false;
    #isInitialized = false;
    #persistStateKey;
    #persistRequestsKey;
    #initialState;
    #store;
    #keepDuplicateUrls;
    #sources;
    #sourcesFunction;
    #proxyConfiguration;
    #httpClient;
    get sources() {
        return this.#sources;
    }
    /**
     * To create new instance of `RequestList` we need to use `RequestList.open()` factory method.
     * @param options All `RequestList` configuration options
     * @internal
     */
    constructor(options = {}) {
        const { sources, sourcesFunction, persistStateKey, persistRequestsKey, state, proxyConfiguration, keepDuplicateUrls, httpClient, } = parseArgument(options, requestListOptionsSchema);
        if (!(sources || sourcesFunction)) {
            throw new Error('At least one of "sources" or "sourcesFunction" must be provided.');
        }
        this.#persistStateKey = persistStateKey ? `CRAWLEE_${persistStateKey}` : persistStateKey;
        this.#persistRequestsKey = persistRequestsKey ? `CRAWLEE_${persistRequestsKey}` : persistRequestsKey;
        this.#initialState = state;
        this.#httpClient = httpClient;
        // If this option is set then all requests will get a pre-generated unique ID and duplicate URLs will be kept in the list.
        this.#keepDuplicateUrls = keepDuplicateUrls;
        // Will be empty after initialization to save memory.
        this.#sources = sources ? [...sources] : [];
        this.#sourcesFunction = sourcesFunction;
        // The proxy configuration used for `requestsFromUrl` requests.
        this.#proxyConfiguration = proxyConfiguration;
        this.persistState = this.persistState.bind(this);
    }
    /**
     * Loads all remote sources of URLs and potentially starts periodic state persistence.
     * This function must be called before you can start using the instance in a meaningful way.
     */
    async initialize() {
        if (this.#isLoading) {
            throw new Error('RequestList sources are already loading or were loaded.');
        }
        this.#isLoading = true;
        await purgeDefaultStorages({ onlyPurgeOnce: true });
        const [state, persistedRequests] = await this.loadStateAndPersistedRequests();
        // Add persisted requests / new sources in a memory efficient way because with very
        // large lists, we were running out of memory.
        if (persistedRequests) {
            await this.addPersistedRequests(persistedRequests);
        }
        else {
            await this.addRequestsFromSources();
        }
        this.restoreState(state);
        this.#isInitialized = true;
        if (this.#persistRequestsKey && !this.areRequestsPersisted)
            await this.persistRequests();
        if (this.#persistStateKey) {
            serviceLocator.getEventManager().on(EventType.PERSIST_STATE, this.persistState);
        }
        return this;
    }
    /**
     * Adds previously persisted Requests, as retrieved from the key-value store.
     * This needs to be done in a memory efficient way. We should update the input
     * to a Stream once apify-client supports streams.
     */
    async addPersistedRequests(persistedRequests) {
        // We don't need the sources so we purge them to
        // prevent them from hanging in memory.
        for (let i = 0; i < this.#sources.length; i++) {
            // oxlint-disable-next-line typescript/no-array-delete -- intentional, drop the slot so V8 can collect the object
            delete this.#sources[i];
        }
        this.#sources = [];
        this.areRequestsPersisted = true;
        const requestStream = createDeserialize(persistedRequests);
        for await (const request of requestStream) {
            this.addRequest(request);
        }
    }
    /**
     * Add Requests from both options.sources and options.sourcesFunction.
     * This function is called only when persisted sources were not loaded.
     * We need to avoid keeping both sources and requests in memory
     * to reduce memory footprint with very large sources.
     */
    async addRequestsFromSources() {
        // We'll load all sources in sequence to ensure that they get loaded in the right order.
        const sourcesCount = this.#sources.length;
        for (let i = 0; i < sourcesCount; i++) {
            const source = this.#sources[i];
            // Using delete here to drop the original object ASAP to free memory
            // .pop would reverse the array and .shift is SLOW.
            // oxlint-disable-next-line typescript/no-array-delete
            delete this.#sources[i];
            if (typeof source === 'object' && source.requestsFromUrl) {
                const fetchedRequests = await this.fetchRequestsFromUrl(source);
                await this.addFetchedRequests(source, fetchedRequests);
            }
            else {
                this.addRequest(source);
            }
        }
        // Drop the original array full of empty indexes.
        this.#sources = [];
        if (this.#sourcesFunction) {
            try {
                const sourcesFromFunction = await this.#sourcesFunction();
                const sourcesFromFunctionCount = sourcesFromFunction.length;
                for (let i = 0; i < sourcesFromFunctionCount; i++) {
                    const source = sourcesFromFunction[i];
                    // oxlint-disable-next-line typescript/no-array-delete -- intentional, drop the slot so V8 can collect the object
                    delete sourcesFromFunction[i];
                    this.addRequest(source);
                }
                sourcesFromFunction.length = 0;
            }
            catch (e) {
                const err = e;
                throw new Error(`Loading requests with sourcesFunction failed.\nCause: ${err.message}`);
            }
        }
    }
    /**
     * @inheritDoc
     */
    async persistState() {
        if (!this.#persistStateKey) {
            throw new Error('Cannot persist state. options.persistStateKey is not set.');
        }
        if (this.isStatePersisted)
            return;
        try {
            this.#store ??= await KeyValueStore.open();
            await this.#store.setValue(this.#persistStateKey, this.getState());
            this.isStatePersisted = true;
        }
        catch (e) {
            const err = e;
            this.#log.exception(err, 'Attempted to persist state, but failed.');
        }
    }
    /**
     * Removes the `PERSIST_STATE` event listener registered during initialization and persists
     * the current state one last time. Call this when you are done with the `RequestList` to avoid
     * leaking the listener (and the requests it retains) on the shared event manager.
     */
    async teardown() {
        serviceLocator.getEventManager().off(EventType.PERSIST_STATE, this.persistState);
        if (this.#persistStateKey) {
            await this.persistState();
        }
    }
    /**
     * Unlike persistState(), this is used only internally, since the sources
     * are automatically persisted at RequestList initialization (if the persistRequestsKey is set),
     * but there's no reason to persist it again afterwards, because RequestList is immutable.
     */
    async persistRequests() {
        const serializedRequests = await serializeArray(this.requests);
        this.#store ??= await KeyValueStore.open();
        await this.#store.setValue(this.#persistRequestsKey, serializedRequests, { contentType: CONTENT_TYPE_BINARY });
        this.areRequestsPersisted = true;
    }
    /**
     * Restores RequestList state from a state object.
     */
    restoreState(state) {
        // If there's no state it means we've not persisted any (yet).
        if (!state)
            return;
        // Restore previous state.
        if (typeof state.nextIndex !== 'number' || state.nextIndex < 0) {
            throw new Error('The state object is invalid: nextIndex must be a non-negative number.');
        }
        if (state.nextIndex > this.requests.length) {
            throw new Error('The state object is not consistent with RequestList, too few requests loaded.');
        }
        if (state.nextIndex < this.requests.length &&
            this.requests[state.nextIndex].uniqueKey !== state.nextUniqueKey) {
            throw new Error('The state object is not consistent with RequestList the order of URLs seems to have changed.');
        }
        const deleteFromInProgress = [];
        state.inProgress.forEach((uniqueKey) => {
            const index = this.#uniqueKeyToIndex[uniqueKey];
            if (typeof index !== 'number') {
                throw new Error('The state object is not consistent with RequestList. Unknown uniqueKey is present in the state.');
            }
            if (index >= state.nextIndex) {
                deleteFromInProgress.push(uniqueKey);
            }
        });
        this.#nextIndex = state.nextIndex;
        this.inProgress = new Set(state.inProgress);
        // WORKAROUND:
        // It happened to some users that state object contained something like:
        // {
        //   "nextIndex": 11308,
        //   "nextUniqueKey": "https://www.anychart.com",
        //   "inProgress": {
        //      "https://www.ams360.com": true,
        //      ...
        //        "https://www.anychart.com": true,
        // }
        // Which then caused error "The request is not being processed (uniqueKey: https://www.anychart.com)"
        // As a workaround, we just remove all inProgress requests whose index >= nextIndex,
        // since they will be crawled again.
        if (deleteFromInProgress.length) {
            this.#log.warning("RequestList's in-progress field is not consistent, skipping invalid in-progress entries", {
                deleteFromInProgress,
            });
            for (const uniqueKey of deleteFromInProgress) {
                this.inProgress.delete(uniqueKey);
            }
        }
        // All in-progress requests were interrupted and need to be re-crawled.
        this.#requestsToRetry = [...this.inProgress];
    }
    /**
     * Attempts to load state and requests using the `RequestList` configuration
     * and returns a tuple of [state, requests] where each may be null if not loaded.
     */
    async loadStateAndPersistedRequests() {
        let state;
        let persistedRequests;
        if (this.#initialState) {
            state = this.#initialState;
            this.#log.debug('Loaded state from options.state argument.');
        }
        else if (this.#persistStateKey) {
            state = await this.getPersistedState(this.#persistStateKey);
            if (state)
                this.#log.debug('Loaded state from key value store using the persistStateKey.');
        }
        if (this.#persistRequestsKey) {
            persistedRequests = await this.getPersistedState(this.#persistRequestsKey);
            if (persistedRequests)
                this.#log.debug('Loaded requests from key value store using the persistRequestsKey.');
        }
        return [state, persistedRequests];
    }
    /**
     * Returns an object representing the internal state of the `RequestList` instance.
     * Note that the object's fields can change in future releases.
     */
    getState() {
        this.ensureIsInitialized();
        return {
            nextIndex: this.#nextIndex,
            nextUniqueKey: this.#nextIndex < this.requests.length ? this.requests[this.#nextIndex].uniqueKey : null,
            inProgress: [...this.inProgress],
        };
    }
    /**
     * @inheritDoc
     */
    async isEmpty() {
        this.ensureIsInitialized();
        return this.#requestsToRetry.length === 0 && this.#nextIndex >= this.requests.length;
    }
    /**
     * @inheritDoc
     */
    async isFinished() {
        this.ensureIsInitialized();
        return this.inProgress.size === 0 && this.#nextIndex >= this.requests.length;
    }
    /**
     * @inheritDoc
     */
    async fetchNextRequest() {
        this.ensureIsInitialized();
        // First re-serve any requests that were interrupted before the last state persist.
        const uniqueKey = this.#requestsToRetry.shift();
        if (uniqueKey) {
            const index = this.#uniqueKeyToIndex[uniqueKey];
            return this.ensureRequest(this.requests[index], index);
        }
        // Otherwise return next request.
        if (this.#nextIndex < this.requests.length) {
            const index = this.#nextIndex;
            const request = this.requests[index];
            this.inProgress.add(request.uniqueKey);
            this.#nextIndex++;
            this.isStatePersisted = false;
            return this.ensureRequest(request, index);
        }
        return null;
    }
    /**
     * @inheritDoc
     */
    async *[Symbol.asyncIterator]() {
        while (true) {
            const req = await this.fetchNextRequest();
            if (!req)
                break;
            yield req;
        }
    }
    ensureRequest(requestLike, index) {
        if (requestLike instanceof Request) {
            return requestLike;
        }
        this.requests[index] = new Request(requestLike);
        return this.requests[index];
    }
    /**
     * @inheritDoc
     */
    async markRequestAsHandled(request) {
        const { uniqueKey } = request;
        this.ensureUniqueKeyValid(uniqueKey);
        this.ensureInProgress(uniqueKey);
        this.ensureIsInitialized();
        this.inProgress.delete(uniqueKey);
        this.isStatePersisted = false;
    }
    /**
     * Adds all fetched requests from a URL from a remote resource.
     */
    async addFetchedRequests(source, fetchedRequests) {
        const { requestsFromUrl, regex } = source;
        const originalLength = this.requests.length;
        fetchedRequests.forEach((request) => this.addRequest(request));
        const fetchedCount = fetchedRequests.length;
        const importedCount = this.requests.length - originalLength;
        this.#log.info('Fetched and loaded Requests from a remote resource.', {
            requestsFromUrl,
            regex,
            fetchedCount,
            importedCount,
            duplicateCount: fetchedCount - importedCount,
            sample: JSON.stringify(fetchedRequests.slice(0, 5)),
        });
    }
    async getPersistedState(key) {
        this.#store ??= await KeyValueStore.open();
        const state = await this.#store.getValue(key);
        return state;
    }
    /**
     * Fetches URLs from requestsFromUrl and returns them in format of list of requests
     */
    async fetchRequestsFromUrl(source) {
        const { requestsFromUrl, regex, ...sharedOpts } = source;
        // Download remote resource and parse URLs.
        let urlsArr;
        try {
            urlsArr = await this.downloadListOfUrls({
                url: requestsFromUrl,
                urlRegExp: regex,
                proxyUrl: (await this.#proxyConfiguration?.newProxyInfo())?.url,
            });
        }
        catch (err) {
            throw new Error(`Cannot fetch a request list from ${requestsFromUrl}: ${err}`);
        }
        // Skip if resource contained no URLs.
        if (!urlsArr.length) {
            this.#log.warning('The fetched list contains no valid URLs.', { requestsFromUrl, regex });
            return [];
        }
        return urlsArr.map((url) => ({ url, ...sharedOpts }));
    }
    /**
     * Adds given request.
     * If the `source` parameter is a string or plain object and not an instance
     * of a `Request`, then the function creates a `Request` instance.
     */
    addRequest(source) {
        let request;
        const type = typeof source;
        if (type === 'string') {
            request = { url: source };
        }
        else if (source instanceof Request) {
            request = source;
        }
        else if (source && type === 'object') {
            request = source;
        }
        else {
            throw new Error(`Cannot create Request from type: ${type}`);
        }
        const hasUniqueKey = Reflect.has(Object(source), 'uniqueKey');
        request.uniqueKey ??= Request.computeUniqueKey(request);
        // Add index to uniqueKey if duplicates are to be kept
        if (this.#keepDuplicateUrls && !hasUniqueKey) {
            request.uniqueKey += `-${this.requests.length}`;
        }
        const { uniqueKey } = request;
        this.ensureUniqueKeyValid(uniqueKey);
        // Skip requests with duplicate uniqueKey
        if (!Object.hasOwn(this.#uniqueKeyToIndex, uniqueKey)) {
            this.#uniqueKeyToIndex[uniqueKey] = this.requests.length;
            this.requests.push(request);
        }
        else if (this.#keepDuplicateUrls) {
            this.#log.warning(`Duplicate uniqueKey: ${uniqueKey} found while the keepDuplicateUrls option was set. Check your sources' unique keys.`);
        }
    }
    /**
     * Helper function that validates unique key.
     * Throws an error if uniqueKey is not a non-empty string.
     */
    ensureUniqueKeyValid(uniqueKey) {
        if (typeof uniqueKey !== 'string' || !uniqueKey) {
            throw new Error("Request object's uniqueKey must be a non-empty string");
        }
    }
    /**
     * Checks that a request is currently being processed and throws an error if not.
     */
    ensureInProgress(uniqueKey) {
        if (!this.inProgress.has(uniqueKey)) {
            throw new Error(`The request is not being processed (uniqueKey: ${uniqueKey})`);
        }
    }
    /**
     * Throws an error if request list wasn't initialized.
     */
    ensureIsInitialized() {
        if (!this.#isInitialized) {
            throw new Error('RequestList is not initialized; you must call "await requestList.initialize()" before using it!');
        }
    }
    /**
     * Returns the total number of unique requests present in the `RequestList`.
     */
    async getTotalCount() {
        this.ensureIsInitialized();
        return this.requests.length;
    }
    /**
     * Returns the number of pending requests in the `RequestList`.
     */
    async getPendingCount() {
        this.ensureIsInitialized();
        return this.requests.length - (this.#nextIndex - this.inProgress.size);
    }
    /**
     * Combines this list with a request manager (a {@apilink RequestQueue} by default) into a
     * {@apilink RequestManagerTandem}, allowing requests to be added and reclaimed while still
     * being read from this list first.
     */
    async toTandem(requestManager) {
        // Import here to avoid circular imports.
        const { RequestManagerTandem } = await import('./request_manager_tandem.js');
        const { RequestQueue } = await import('./request_queue.js');
        return new RequestManagerTandem(this, requestManager ?? (await RequestQueue.open()));
    }
    /**
     * @inheritDoc
     */
    async getHandledCount() {
        this.ensureIsInitialized();
        return this.#nextIndex - this.inProgress.size;
    }
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
    static async open(listNameOrOptions, sources, options = {}) {
        if (listNameOrOptions != null && typeof listNameOrOptions === 'object') {
            options = { ...listNameOrOptions, ...options };
            const rl = new RequestList(options);
            await rl.initialize();
            return rl;
        }
        const listName = listNameOrOptions;
        parseArgument(listName, listNameSchema);
        parseArgument(sources, schemas.anyArray);
        parseArgument(options, openOptionsSchema);
        const rl = new RequestList({
            ...options,
            persistStateKey: listName ? `${listName}-${STATE_PERSISTENCE_KEY}` : options.persistStateKey,
            persistRequestsKey: listName ? `${listName}-${REQUESTS_PERSISTENCE_KEY}` : options.persistRequestsKey,
            sources: sources ?? options.sources,
        });
        await rl.initialize();
        return rl;
    }
    /**
     * @internal wraps public utility for mocking purposes
     */
    async downloadListOfUrls(options) {
        return downloadListOfUrls({
            ...options,
            httpClient: this.#httpClient,
        });
    }
}
