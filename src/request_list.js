import { checkParamOrThrow } from 'apify-client/build/utils';
import * as _ from 'underscore';
import { ACTOR_EVENT_NAMES_EX } from './constants';
import Request from './request'; // eslint-disable-line import/no-duplicates
import events from './events';
import log from './utils_log';
import { getFirstKey, publicUtils } from './utils';
import { getValue, setValue } from './key_value_store';
import { serializeArray, createDeserialize } from './serialization';

// TYPE IMPORTS
/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { RequestOptions } from './request';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

export const STATE_PERSISTENCE_KEY = 'REQUEST_LIST_STATE';
export const REQUESTS_PERSISTENCE_KEY = 'REQUEST_LIST_REQUESTS';

const CONTENT_TYPE_BINARY = 'application/octet-stream';

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
 * // State and sources are automatically persisted. This is a preferred usage.
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
 *     // Persist the state to avoid re-crawling which can lead to data duplications.
 *     // Keep in mind that the sources have to be immutable or this will throw an error.
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
    constructor(options = {}) {
        checkParamOrThrow(options, 'options', 'Object');

        const {
            sources,
            sourcesFunction,
            persistStateKey,
            persistRequestsKey,
            persistSourcesKey,
            state,
            keepDuplicateUrls = false,
        } = options;

        this.log = log.child({ prefix: 'RequestList' });

        // TODO Deprecated 02/2020
        if (persistSourcesKey) {
            this.log.deprecated('options.persistSourcesKey is deprecated. Use options.persistRequestsKey.');
        }

        checkParamOrThrow(sources, 'options.sources', 'Maybe Array');
        checkParamOrThrow(sourcesFunction, 'options.sourcesFunction', 'Maybe Function');
        checkParamOrThrow(state, 'options.state', 'Maybe Object');
        checkParamOrThrow(persistStateKey, 'options.persistStateKey', 'Maybe String');
        checkParamOrThrow(persistRequestsKey, 'options.persistRequestsKey', 'Maybe String');
        checkParamOrThrow(persistSourcesKey, 'options.persistSourcesKey', 'Maybe String');
        checkParamOrThrow(keepDuplicateUrls, 'options.keepDuplicateUrls', 'Maybe Boolean');

        if (!(sources || sourcesFunction)) {
            throw new Error('At least one of "sources" or "sourcesFunction" must be provided.');
        }

        // Array of all requests from all sources, in the order as they appeared in sources.
        // All requests in the array have distinct uniqueKey!
        this.requests = [];

        // Index to the next item in requests array to fetch. All previous requests are either handled or in progress.
        this.nextIndex = 0;

        // Dictionary, key is Request.uniqueKey, value is corresponding index in the requests array.
        this.uniqueKeyToIndex = {};

        // Dictionary of requests that were returned by fetchNextRequest().
        // The key is uniqueKey, value is true.
        // TODO: Change this to Set
        this.inProgress = {};

        // Dictionary of requests for which reclaimRequest() was called.
        // The key is uniqueKey, value is true. TODO: Change this to Set
        // Note that reclaimedRequests is always a subset of inProgress!
        this.reclaimed = {};

        this.persistStateKey = persistStateKey;
        this.persistRequestsKey = persistRequestsKey || persistSourcesKey;

        this.initialState = state;

        // If this option is set then all requests will get a pre-generated unique ID and duplicate URLs will be kept in the list.
        this.keepDuplicateUrls = keepDuplicateUrls;

        // Starts as true because until we handle the first request, the list is effectively persisted by doing nothing.
        this.isStatePersisted = true;
        // Starts as false because we don't know yet and sources might change in the meantime (eg. download from live list).
        this.areRequestsPersisted = false;
        this.isLoading = false;
        this.isInitialized = false;
        // Will be empty after initialization to save memory.
        this.sources = sources || [];
        this.sourcesFunction = sourcesFunction;
    }

    /**
     * Loads all remote sources of URLs and potentially starts periodic state persistence.
     * This function must be called before you can start using the instance in a meaningful way.
     *
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isLoading) {
            throw new Error('RequestList sources are already loading or were loaded.');
        }
        this.isLoading = true;

        const [state, persistedRequests] = await this._loadStateAndPersistedRequests();

        // Add persisted requests / new sources in a memory efficient way because with very
        // large lists, we were running out of memory.
        if (persistedRequests) {
            await this._addPersistedRequests(persistedRequests);
        } else {
            await this._addRequestsFromSources();
        }

        this._restoreState(state);
        this.isInitialized = true;
        if (this.persistRequestsKey && !this.areRequestsPersisted) await this._persistRequests();
        if (this.persistStateKey) {
            events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, this.persistState.bind(this));
        }
    }

    /**
     * Adds previously persisted Requests, as retrieved from the key-value store.
     * This needs to be done in a memory efficient way. We should update the input
     * to a Stream once apify-client supports streams.
     * @param {Buffer} persistedRequests
     * @ignore
     */
    async _addPersistedRequests(persistedRequests) {
        // We don't need the sources so we purge them to
        // prevent them from hanging in memory.
        for (let i = 0; i < this.sources.length; i++) {
            delete this.sources[i];
        }
        this.sources = [];

        this.areRequestsPersisted = true;
        const requestStream = createDeserialize(persistedRequests);
        for await (const request of requestStream) {
            this._addRequest(request);
        }
    }

    /**
     * Add Requests from both options.sources and options.sourcesFunction.
     * This function is called only when persisted sources were not loaded.
     * We need to avoid keeping both sources and requests in memory
     * to reduce memory footprint with very large sources.
     * @returns {Promise<void>}
     * @ignore
     */
    async _addRequestsFromSources() {
        // We'll load all sources in sequence to ensure that they get loaded in the right order.
        const sourcesCount = this.sources.length;
        for (let i = 0; i < sourcesCount; i++) {
            const source = this.sources[i];
            // Using delete here to drop the original object ASAP to free memory
            // .pop would reverse the array and .shift is SLOW.
            delete this.sources[i];

            if (source.requestsFromUrl) {
                const fetchedRequests = await this._fetchRequestsFromUrl(source);
                await this._addFetchedRequests(source, fetchedRequests);
            } else {
                this._addRequest(source);
            }
        }

        // Drop the original array full of empty indexes.
        this.sources = [];

        if (this.sourcesFunction) {
            try {
                const sourcesFromFunction = await this.sourcesFunction();
                const sourcesFromFunctionCount = sourcesFromFunction.length;
                for (let i = 0; i < sourcesFromFunctionCount; i++) {
                    const source = sourcesFromFunction.shift();
                    this._addRequest(source);
                }
            } catch (err) {
                throw new Error(`Loading requests with sourcesFunction failed.\nCause: ${err.message}`);
            }
        }
    }

    /**
     * Persists the current state of the `RequestList` into the default {@link KeyValueStore}.
     * The state is persisted automatically in regular intervals, but calling this method manually
     * is useful in cases where you want to have the most current state available after you pause
     * or stop fetching its requests. For example after you pause or abort a crawl. Or just before
     * a server migration.
     *
     * @return {Promise<void>}
     */
    async persistState() {
        if (!this.persistStateKey) {
            throw new Error('Cannot persist state. options.persistStateKey is not set.');
        }
        if (this.isStatePersisted) return;
        try {
            await setValue(this.persistStateKey, this.getState());
            this.isStatePersisted = true;
        } catch (err) {
            this.log.exception(err, 'Attempted to persist state, but failed.');
        }
    }

    /**
     * Unlike persistState(), this is used only internally, since the sources
     * are automatically persisted at RequestList initialization (if the persistRequestsKey is set),
     * but there's no reason to persist it again afterwards, because RequestList is immutable.
     *
     * @return {Promise<void>}
     * @ignore
     */
    async _persistRequests() {
        const serializedRequests = await serializeArray(this.requests);
        await setValue(this.persistRequestsKey, serializedRequests, { contentType: CONTENT_TYPE_BINARY });
        this.areRequestsPersisted = true;
    }

    /**
     * Restores RequestList state from a state object.
     *
     * @param {RequestListState} state
     * @ignore
     */
    _restoreState(state) {
        // If there's no state it means we've not persisted any (yet).
        if (!state) return;
        // Restore previous state.
        if (typeof state.nextIndex !== 'number' || state.nextIndex < 0) {
            throw new Error('The state object is invalid: nextIndex must be a non-negative number.');
        }
        if (state.nextIndex > this.requests.length) {
            throw new Error('The state object is not consistent with RequestList too few requests loaded.');
        }
        if (state.nextIndex < this.requests.length
            && this.requests[state.nextIndex].uniqueKey !== state.nextUniqueKey) {
            throw new Error('The state object is not consistent with RequestList the order of URLs seems to have changed.');
        }

        const deleteFromInProgress = [];
        _.keys(state.inProgress).forEach((uniqueKey) => {
            const index = this.uniqueKeyToIndex[uniqueKey];
            if (typeof index !== 'number') {
                throw new Error('The state object is not consistent with RequestList. Unknown uniqueKey is present in the state.');
            }
            if (index >= state.nextIndex) {
                deleteFromInProgress.push(uniqueKey);
            }
        });

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
            this.log.warning('RequestList\'s in-progress field is not consistent, skipping invalid in-progress entries', {
                deleteFromInProgress,
            });
            _.each(deleteFromInProgress, (uniqueKey) => {
                delete state.inProgress[uniqueKey];
            });
        }

        this.nextIndex = state.nextIndex;
        this.inProgress = state.inProgress;

        // All in-progress requests need to be recrawled
        this.reclaimed = _.clone(this.inProgress);
    }

    /**
     * Attempts to load state and requests using the `RequestList` configuration
     * and returns a tuple of [state, requests] where each may be null if not loaded.
     *
     * @return {Promise<Array<(RequestListState|null)>>}
     * @ignore
     */
    async _loadStateAndPersistedRequests() {
        let state;
        let persistedRequests;
        if (this.initialState) {
            state = this.initialState;
            this.log.debug('Loaded state from options.state argument.');
        } else if (this.persistStateKey) {
            state = getValue(this.persistStateKey);
            if (state) this.log.debug('Loaded state from key value store using the persistStateKey.');
        }
        if (this.persistRequestsKey) {
            persistedRequests = await getValue(this.persistRequestsKey);
            if (persistedRequests) this.log.debug('Loaded requests from key value store using the persistRequestsKey.');
        }
        // Unwraps "state" promise if needed, otherwise no-op.
        return Promise.all([state, persistedRequests]);
    }

    /**
     * Returns an object representing the internal state of the `RequestList` instance.
     * Note that the object's fields can change in future releases.
     *
     * @returns {RequestListState}
     */
    getState() {
        this._ensureIsInitialized();

        return {
            nextIndex: this.nextIndex,
            nextUniqueKey: this.nextIndex < this.requests.length
                ? this.requests[this.nextIndex].uniqueKey
                : null,
            inProgress: this.inProgress,
        };
    }

    /**
     * Resolves to `true` if the next call to {@link RequestList#fetchNextRequest} function
     * would return `null`, otherwise it resolves to `false`.
     * Note that even if the list is empty, there might be some pending requests currently being processed.
     *
     * @returns {Promise<Boolean>}
     */
    async isEmpty() {
        this._ensureIsInitialized();

        return !getFirstKey(this.reclaimed) && this.nextIndex >= this.requests.length;
    }

    /**
     * Returns `true` if all requests were already handled and there are no more left.
     *
     * @returns {Promise<Boolean>}
     */
    async isFinished() {
        this._ensureIsInitialized();

        return !getFirstKey(this.inProgress) && this.nextIndex >= this.requests.length;
    }

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
    async fetchNextRequest() {
        this._ensureIsInitialized();

        // First return reclaimed requests if any.
        const uniqueKey = getFirstKey(this.reclaimed);
        if (uniqueKey) {
            delete this.reclaimed[uniqueKey];
            const index = this.uniqueKeyToIndex[uniqueKey];
            return this.requests[index];
        }

        // Otherwise return next request.
        if (this.nextIndex < this.requests.length) {
            const request = this.requests[this.nextIndex];
            this.inProgress[request.uniqueKey] = true;
            this.nextIndex++;
            this.isStatePersisted = false;
            return request;
        }

        return null;
    }

    /**
     * Marks request as handled after successful processing.
     *
     * @param {Request} request
     * @returns {Promise<void>}
     */
    async markRequestHandled(request) {
        const { uniqueKey } = request;

        this._ensureUniqueKeyValid(uniqueKey);
        this._ensureInProgressAndNotReclaimed(uniqueKey);
        this._ensureIsInitialized();

        delete this.inProgress[uniqueKey];
        this.isStatePersisted = false;
    }

    /**
     * Reclaims request to the list if its processing failed.
     * The request will become available in the next `this.fetchNextRequest()`.
     *
     * @param {Request} request
     * @returns {Promise<void>}
     */
    async reclaimRequest(request) {
        const { uniqueKey } = request;

        this._ensureUniqueKeyValid(uniqueKey);
        this._ensureInProgressAndNotReclaimed(uniqueKey);
        this._ensureIsInitialized();

        this.reclaimed[uniqueKey] = true;
    }

    /**
     * Adds all fetched requests from a URL from a remote resource.
     *
     * @ignore
     */
    async _addFetchedRequests(source, fetchedRequests) {
        const { requestsFromUrl, regex } = source;
        const originalLength = this.requests.length;

        fetchedRequests.forEach(request => this._addRequest(request));

        const fetchedCount = fetchedRequests.length;
        const importedCount = this.requests.length - originalLength;

        this.log.info('Fetched and loaded Requests from a remote resource.', {
            requestsFromUrl,
            regex,
            fetchedCount,
            importedCount,
            duplicateCount: fetchedCount - importedCount,
            sample: JSON.stringify(fetchedRequests.slice(0, 5)),
        });
    }

    /**
     * Fetches URLs from requestsFromUrl and returns them in format of list of requests
     * @param source
     * @return {Promise<Array<RequestOptions>>}
     * @ignore
     */
    async _fetchRequestsFromUrl(source) {
        const sharedOpts = _.omit(source, 'requestsFromUrl', 'regex');
        const { requestsFromUrl, regex } = source;
        const { downloadListOfUrls } = publicUtils;

        // Download remote resource and parse URLs.
        let urlsArr;
        try {
            urlsArr = await downloadListOfUrls({ url: requestsFromUrl, urlRegExp: regex });
        } catch (err) {
            throw new Error(`Cannot fetch a request list from ${requestsFromUrl}: ${err}`);
        }

        // Skip if resource contained no URLs.
        if (!urlsArr.length) {
            this.log.warning('list fetched, but it is empty.', { requestsFromUrl, regex });
            return [];
        }

        return urlsArr.map(url => _.extend({ url }, sharedOpts));
    }

    /**
     * Adds given request.
     * If the `source` parameter is a string or plain object and not an instance
     * of a `Request`, then the function creates a `Request` instance.
     *
     * @param {string|Request|object} source
     * @ignore
     */
    _addRequest(source) {
        let request;
        const type = typeof source;
        if (type === 'string') {
            request = new Request({ url: source });
        } else if (source instanceof Request) {
            request = source;
        } else if (source && type === 'object') {
            request = new Request(source);
        } else {
            throw new Error(`Cannot create Request from type: ${type}`);
        }

        const hasUniqueKey = !!source.uniqueKey;

        // Add index to uniqueKey if duplicates are to be kept
        if (this.keepDuplicateUrls && !hasUniqueKey) {
            request.uniqueKey += `-${this.requests.length}`;
        }

        const { uniqueKey } = request;
        this._ensureUniqueKeyValid(uniqueKey);

        // Skip requests with duplicate uniqueKey
        if (!this.uniqueKeyToIndex.hasOwnProperty(uniqueKey)) { // eslint-disable-line no-prototype-builtins
            this.uniqueKeyToIndex[uniqueKey] = this.requests.length;
            this.requests.push(request);
        } else if (this.keepDuplicateUrls) {
            this.log.warning(`Duplicate uniqueKey: ${uniqueKey} found while the keepDuplicateUrls option was set. Check your sources' unique keys.`); // eslint-disable-line max-len
        }
    }

    /**
     * Helper function that validates unique key.
     * Throws an error if uniqueKey is not a non-empty string.
     *
     * @ignore
     */
    _ensureUniqueKeyValid(uniqueKey) { // eslint-disable-line class-methods-use-this
        if (typeof uniqueKey !== 'string' || !uniqueKey) {
            throw new Error('Request object\'s uniqueKey must be a non-empty string');
        }
    }

    /**
     * Checks that request is not reclaimed and throws an error if so.
     *
     * @ignore
     */
    _ensureInProgressAndNotReclaimed(uniqueKey) {
        if (!this.inProgress[uniqueKey]) {
            throw new Error(`The request is not being processed (uniqueKey: ${uniqueKey})`);
        }
        if (this.reclaimed[uniqueKey]) {
            throw new Error(`The request was already reclaimed (uniqueKey: ${uniqueKey})`);
        }
    }

    /**
     * Throws an error if request list wasn't initialized.
     *
     * @ignore
     */
    _ensureIsInitialized() {
        if (!this.isInitialized) {
            throw new Error('RequestList is not initialized; you must call "await requestList.initialize()" before using it!');
        }
    }

    /**
     * Returns the total number of unique requests present in the `RequestList`.
     *
     * @returns {number}
     */
    length() {
        this._ensureIsInitialized();

        return this.requests.length;
    }

    /**
     * Returns number of handled requests.
     *
     * @returns {number}
     */
    handledCount() {
        this._ensureIsInitialized();

        return this.nextIndex - _.size(this.inProgress);
    }
}

/**
 * Opens a request list and returns a promise resolving to an instance
 * of the {@link RequestList} class that is already initialized.
 *
 * {@link RequestList} represents a list of URLs to crawl, which is always stored in memory.
 * To enable picking up where left off after a process restart, the request list sources
 * are persisted to the key-value store at initialization of the list. Then, while crawling,
 * a small state object is regularly persisted to keep track of the crawling status.
 *
 * For more details and code examples, see the {@link RequestList} class.
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
 * const requestList = await Apify.openRequestList('my-name', sources);
 * ```
 *
 * @param {string|null} listName
 *   Name of the request list to be opened. Setting a name enables the `RequestList`'s state to be persisted
 *   in the key-value store. This is useful in case of a restart or migration. Since `RequestList` is only
 *   stored in memory, a restart or migration wipes it clean. Setting a name will enable the `RequestList`'s
 *   state to survive those situations and continue where it left off.
 *
 *   The name will be used as a prefix in key-value store, producing keys such as `NAME-REQUEST_LIST_STATE`
 *   and `NAME-REQUEST_LIST_SOURCES`.
 *
 *   If `null`, the list will not be persisted and will only be stored in memory. Process restart
 *   will then cause the list to be crawled again from the beginning. We suggest always using a name.
 * @param {Array<RequestOptions|Request|string>} sources
 *  An array of sources of URLs for the {@link RequestList}. It can be either an array of strings,
 *  plain objects that define at least the `url` property, or an array of {@link Request} instances.
 *
 *  **IMPORTANT:** The `sources` array will be consumed (left empty) after {@link RequestList} initializes.
 *  This is a measure to prevent memory leaks in situations when millions of sources are
 *  added.
 *
 *  Additionally, the `requestsFromUrl` property may be used instead of `url`,
 *  which will instruct {@link RequestList} to download the source URLs from a given remote location.
 *  The URLs will be parsed from the received response. In this case you can limit the URLs
 *  using `regex` parameter containing regular expression pattern for URLs to be included.
 *
 *  For details, see the {@link RequestListOptions.sources}
 * @param {RequestListOptions} [options]
 *   The {@link RequestList} options. Note that the `listName` parameter supersedes
 *   the {@link RequestListOptions.persistStateKey} and {@link RequestListOptions.persistRequestsKey}
 *   options and the `sources` parameter supersedes the {@link RequestListOptions.sources} option.
 * @returns {Promise<RequestList>}
 * @memberof module:Apify
 * @name openRequestList
 * @function
 */
export const openRequestList = async (listName, sources, options = {}) => {
    checkParamOrThrow(listName, 'listName', 'String | Null');
    checkParamOrThrow(sources, 'sources', 'Array');
    checkParamOrThrow(options, 'options', 'Object');

    const rl = new RequestList({
        ...options,
        persistStateKey: listName ? `${listName}-${STATE_PERSISTENCE_KEY}` : null,
        persistRequestsKey: listName ? `${listName}-${REQUESTS_PERSISTENCE_KEY}` : null,
        sources,
    });
    await rl.initialize();
    return rl;
};

/**
 * Represents state of a {@link RequestList}. It can be used to resume a {@link RequestList} which has been previously processed.
 * You can obtain the state by calling {@link RequestList#getState} and receive an object with
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
 *
 * @typedef RequestListState
 * @property {number} nextIndex
 *   Position of the next request to be processed.
 * @property {string} nextUniqueKey
 *   Key of the next request to be processed.
 * @property {Object<string,boolean>} inProgress
 *   An object mapping request keys to a boolean value respresenting whether they are being processed at the moment.
 */
