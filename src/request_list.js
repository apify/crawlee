import { checkParamOrThrow } from 'apify-client/build/utils';
import log from 'apify-shared/log';
import _ from 'underscore';
import { ACTOR_EVENT_NAMES_EX } from './constants';
import Request from './request';
import events from './events';
import { getFirstKey, publicUtils } from './utils';
import { getValue, setValue } from './key_value_store';

export const STATE_PERSISTENCE_KEY = 'REQUEST_LIST_STATE';
export const SOURCES_PERSISTENCE_KEY = 'REQUEST_LIST_SOURCES';

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
 * key-value store by setting the `persistStateKey` option so that if the Node.js process is restarted,
 * the crawling can continue where it left off. For more details, see {@link KeyValueStore}.
 *
 * The internal state is closely tied to the provided sources (URLs) to validate it's position in the list
 * after a migration or restart. Therefore, if the sources change, the state will become corrupted and
 * `RequestList` will raise an exception. This typically happens when using a live list of URLs downloaded
 * from the internet as sources. Either from some service's API, or using the `requestsFromUrl` option.
 * If that's your case, please use the `persistSourcesKey` option in conjunction with `persistStateKey`,
 * it will persist the initial sources to the default key-value store and load them after restart,
 * which will prevent any issues that a live list of URLs might cause.
 *
 * **Example usage:**
 *
 * ```javascript
 * const requestList = new Apify.RequestList({
 *     sources: [
 *         // Separate requests
 *         { url: 'http://www.example.com/page-1', method: 'GET', headers: {} },
 *         { url: 'http://www.example.com/page-2', userData: { foo: 'bar' }},
 *
 *         // Bulk load of URLs from file `http://www.example.com/my-url-list.txt`
 *         // Note that all URLs must start with http:// or https://
 *         { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
 *     ],
 *     persistStateKey: 'my-state',
 *     persistSourcesKey: 'my-sources'
 * });
 *
 * // This call loads and parses the URLs from the remote file.
 * await requestList.initialize();
 *
 * // Get requests from list
 * const request1 = await requestList.fetchNextRequest();
 * const request2 = await requestList.fetchNextRequest();
 * const request3 = await requestList.fetchNextRequest();
 *
 * // Mark some of them as handled
 * await requestList.markRequestHandled(request1);
 *
 * // If processing fails then reclaim it back to the list
 * await requestList.reclaimRequest(request2);
 * ```
 *
 * @param {Object} options All `RequestList` parameters are passed
 *   via an options object with the following keys:
 * @param {Array} options.sources
 *  An array of sources for the `RequestList`. Its contents can either be just plain objects,
 *  defining at least the 'url' property or instances of the {@link Request} class.
 *  Additionally a `requestsFromUrl` property may be used instead of `url`,
 *  which will instruct the `RequestList` to download the sources from the given remote location.
 *  The URLs will be parsed from the received response.
 *
 * ```
 * [
 *     // One URL
 *     { method: 'GET', url: 'http://example.com/a/b' },
 *     // Batch import of URLs from a file hosted on the web
 *     { method: 'POST', requestsFromUrl: 'http://example.com/urls.txt' },
 * ]
 * ```
 * @param {String} [options.persistStateKey]
 *   Identifies the keys in the default key-value store under which the `RequestList` persists its
 *   initial sources and current state. State represents a position of the last scraped request in the list.
 *   If this is set then `RequestList`persists all of its sources and the state in regular intervals
 *   to key value store and loads the state from there in case it is restarted due to an error or system reboot.
 * @param {Object} [options.state]
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
 * @param {Boolean} [options.keepDuplicateUrls=false]
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
export class RequestList {
    constructor(options = {}) {
        checkParamOrThrow(options, 'options', 'Object');

        const { sources, persistStateKey, persistSourcesKey, state, keepDuplicateUrls = false } = options;

        checkParamOrThrow(sources, 'options.sources', 'Array');
        checkParamOrThrow(state, 'options.state', 'Maybe Object');
        checkParamOrThrow(persistStateKey, 'options.persistStateKey', 'Maybe String');
        checkParamOrThrow(persistSourcesKey, 'options.persistSourcesKey', 'Maybe String');
        checkParamOrThrow(keepDuplicateUrls, 'options.keepDuplicateUrls', 'Maybe Boolean');

        // Array of all requests from all sources, in the order as they appeared in sources.
        // All requests in the array have distinct uniqueKey!
        this.requests = [];

        // Index to the next item in requests array to fetch. All previous requests are either handled or in progress.
        this.nextIndex = 0;

        // Dictionary, key is Request.uniqueKey, value is corresponding index in the requests array.
        this.uniqueKeyToIndex = {};

        // Dictionary of requests that were returned by fetchNextRequest().
        // The key is uniqueKey, value is true.
        this.inProgress = {};

        // Dictionary of requests for which reclaimRequest() was called.
        // The key is uniqueKey, value is true.
        // Note that reclaimedRequests is always a subset of inProgressRequests!
        this.reclaimed = {};

        this.persistStateKey = persistStateKey;
        this.persistSourcesKey = persistSourcesKey;

        this.initialState = state;

        // If this option is set then all requests will get a pre-generated unique ID and duplicate URLs will be kept in the list.
        this.keepDuplicateUrls = keepDuplicateUrls;

        // Starts as true because until we handle the first request, the list is effectively persisted by doing nothing.
        this.isStatePersisted = true;
        // Starts as false because we don't know yet and sources might change in the meantime (eg. download from live list).
        this.areSourcesPersisted = false;
        this.isLoading = false;
        this.isInitialized = false;
        this.sources = sources;
    }

    /**
     * Loads all remote sources of URLs and potentially starts periodic state persistence.
     * This function must be called before you can start using the instance in a meaningful way.
     *
     * @returns {Promise}
     */
    async initialize() {
        if (this.isLoading) {
            throw new Error('RequestList sources are already loading or were loaded.');
        }
        this.isLoading = true;

        const [state, sources] = await this._loadStateAndSources();

        // If there are no sources, it just means that we've not persisted any (yet).
        if (sources) this.areSourcesPersisted = true;
        const actualSources = sources || this.sources;

        // We'll load all sources in sequence to ensure that they get loaded in the right order.
        for (const source of actualSources) {
            if (source.requestsFromUrl) await this._addRequestsFromUrl(source);
            else this._addRequest(source);
        }

        this._restoreState(state);
        this.isInitialized = true;
        if (this.persistSourcesKey && !this.areSourcesPersisted) await this._persistSources();
        if (this.persistStateKey) {
            events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, this.persistState.bind(this));
        }
    }

    /**
     * Persists the current state of the `RequestList` into the default {@link KeyValueStore}.
     * The state is persisted automatically in regular intervals, but calling this method manually
     * is useful in cases where you want to have the most current state available after you pause
     * or stop fetching its requests. For example after you pause or abort a crawl. Or just before
     * a server migration.
     *
     * @return {Promise}
     */
    async persistState() {
        if (!this.persistStateKey) {
            throw new Error('RequestList: Cannot persist state. options.persistStateKey is not set.');
        }
        if (this.isStatePersisted) return;
        try {
            await setValue(this.persistStateKey, this.getState());
            this.isStatePersisted = true;
        } catch (err) {
            log.exception(err, 'RequestList attempted to persist state, but failed.');
        }
    }

    /**
     * Unlike persistState(), this is used only internally, since the sources
     * are automatically persisted at RequestList initialization (if the persistSourcesKey is set),
     * but there's no reason to persist it again afterwards, because RequestList is immutable.
     *
     * @return {Promise}
     * @ignore
     */
    async _persistSources() {
        await setValue(this.persistSourcesKey, this.sources);
        this.areSourcesPersisted = true;
    }

    /**
     * Restores RequestList state from a state object.
     *
     * @param {Object} state
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
            throw new Error('The state object is not consistent with RequestList: too few requests loaded.');
        }
        if (state.nextIndex < this.requests.length
            && this.requests[state.nextIndex].uniqueKey !== state.nextUniqueKey) {
            throw new Error('The state object is not consistent with RequestList: the order of URLs seems to have changed.');
        }

        const deleteFromInProgress = [];
        _.keys(state.inProgress).forEach((uniqueKey) => {
            const index = this.uniqueKeyToIndex[uniqueKey];
            if (typeof index !== 'number') {
                throw new Error('The state object is not consistent with RequestList: unknown uniqueKey is present in the state.');
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
            log.warning('RequestList\'s in-progress field is not consistent, skipping invalid in-progress entries', { deleteFromInProgress });
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
     * Attempts to load state and sources using the `RequestList` configuration
     * and returns a tuple of [state, sources] where each may be null if not loaded.
     *
     * @return {Promise<Array>}
     * @ignore
     */
    async _loadStateAndSources() {
        let state;
        if (this.initialState) {
            log.debug('RequestList: Loading previous state from options.state argument.');
            state = this.initialState;
        } else if (this.persistStateKey) {
            log.debug('RequestList: Loading previous state from key value store using the persistStateKey.');
            state = getValue(this.persistStateKey);
        }
        if (this.persistSourcesKey) {
            log.debug('RequestList: Loading sources from key value store using the persistSourcesKey.');
            return Promise.all([state, getValue(this.persistSourcesKey)]);
        }
        return [await state, null];
    }

    /**
     * Returns an object representing the internal state of the `RequestList` instance.
     * Note that the object's fields can change in future releases.
     *
     * @returns {Object}
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
     * @returns {Promise<Request>}
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
     *
     * @returns {Promise}
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
     *
     * @returns {Promise}
     */
    async reclaimRequest(request) {
        const { uniqueKey } = request;

        this._ensureUniqueKeyValid(uniqueKey);
        this._ensureInProgressAndNotReclaimed(uniqueKey);
        this._ensureIsInitialized();

        this.reclaimed[uniqueKey] = true;
    }

    /**
     * Adds all requests from a URL fetched from a remote resource.
     *
     * @ignore
     */
    async _addRequestsFromUrl(source) {
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
            return log.warning('RequestList: list fetched, but it is empty.', { requestsFromUrl, regex });
        }

        // Process downloaded URLs.
        const originalLength = this.requests.length;
        urlsArr.forEach(url => this._addRequest(_.extend({ url }, sharedOpts)));

        const fetchedCount = urlsArr.length;
        const importedCount = this.requests.length - originalLength;

        log.info('RequestList: list fetched.', {
            requestsFromUrl,
            regex,
            fetchedCount,
            importedCount,
            duplicateCount: fetchedCount - importedCount,
            sample: JSON.stringify(urlsArr.slice(0, 5)),
        });
    }

    /**
     * Adds given request.
     * If the `opts` parameter is a plain object and not an instance of a `Request`, then the function
     * creates a `Request` instance.
     *
     * @ignore
     */
    _addRequest(opts) {
        const hasUniqueKey = !!opts.uniqueKey;

        const request = opts instanceof Request
            ? opts
            : new Request(opts);

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
            log.warning(`RequestList: Duplicate uniqueKey: ${uniqueKey} found while the keepDuplicateUrls option was set. Check your sources' unique keys.`); // eslint-disable-line max-len
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
            throw new Error('RequestList is not initialized. You must call "await requestList.initialize();" before using it!');
        }
    }

    /**
     * Returns the total number of unique requests present in the `RequestList`.
     *
     * @returns {Number}
     */
    length() {
        this._ensureIsInitialized();

        return this.requests.length;
    }

    /**
     * Returns number of handled requests.
     *
     * @returns {Number}
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
 * are persisted to the key value store at initialization of the list. Then, while crawling,
 * a small state object is regularly persisted to keep track of the crawling status.
 *
 * For more details and code examples, see the {@link RequestList} class.
 *
 * **Example Usage:**
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
 *   in the key value store. This is useful in case of a restart or migration. Since `RequestList` is only
 *   stored in memory, a restart or migration wipes it clean. Setting a name will enable the `RequestList`'s
 *   state to survive those situations and continue where it left off.
 *
 *   The name will be used as a prefix in key value store, producing keys such as `NAME-REQUEST_LIST_STATE`
 *   and `NAME-REQUEST_LIST_SOURCES`.
 *
 *   If `null`, the list will not be persisted and will only be stored in memory. Process restart
 *   will then cause the list to be crawled again from the beginning. We suggest always using a name.
 * @param {Object[]|string[]} sources
 *   Sources represent the URLs to crawl. It can either be a `string[]` with plain URLs or an `Object[]`.
 *   The objects' contents can either be just plain objects, defining at least the 'url' property
 *   or instances of the {@link Request} class. See the (`new RequestList`)(RequestList#new_RequestList_new)
 *   options for details.
 * @param {Object} [options]
 *   The (`new RequestList`)(RequestList#new_RequestList_new) options. Note that the listName parameter supersedes
 *   the `persistStateKey` and `persistSourcesKey` options and the sources parameter supersedes the `sources` option.
 * @returns {Promise<RequestList>}
 * @memberof module:Apify
 * @name openRequestList
 */
export const openRequestList = async (listName, sources, options = {}) => {
    checkParamOrThrow(listName, 'listName', 'String | Null');
    checkParamOrThrow(sources, 'sources', '[Object | String]');
    if (!sources.length) throw new Error('Parameter sources must not be an empty array.');
    checkParamOrThrow(options, 'options', 'Object');

    // Support both an array of strings and array of objects.
    if (typeof sources[0] === 'string') sources = sources.map(url => ({ url }));

    const rl = new RequestList({
        ...options,
        persistStateKey: listName ? `${listName}-${STATE_PERSISTENCE_KEY}` : null,
        persistSourcesKey: listName ? `${listName}-${SOURCES_PERSISTENCE_KEY}` : null,
        sources,
    });
    await rl.initialize();
    return rl;
};
