import { checkParamOrThrow } from 'apify-client/build/utils';
import log from 'apify-shared/log';
import _ from 'underscore';
import Promise from 'bluebird';
import { ACTOR_EVENT_NAMES_EX } from './constants';
import Request from './request';
import events from './events';
import { getFirstKey, publicUtils } from './utils';
import { getValue, setValue } from './key_value_store';

/**
 * Helper function that validates unique.
 * Throws an error if uniqueKey is not nonempty string.
 *
 * @ignore
 */
const ensureUniqueKeyValid = (uniqueKey) => {
    if (typeof uniqueKey !== 'string' || !uniqueKey) {
        throw new Error('Request object\'s uniqueKey must be a non-empty string');
    }
};

/**
 * Represents a static list of URLs to crawl.
 * The URLs can be provided either in code or parsed from a text file hosted on the web.
 *
 * Each URL is represented using an instance of the {@link Request|`Request`} class.
 * The list can only contain unique URLs. More precisely, it can only contain `Request` instances
 * with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
 * To add a single URL multiple times to the list,
 * corresponding `Request` objects will need to have different `uniqueKey` properties.
 * You can use the `keepDuplicateUrls` option to do this for you.
 *
 * Once you create an instance of `RequestList`, you need to call {@link RequestList#initialize|`initialize()`}
 * before the instance can be used. After that, no more URLs can be added to the list.
 *
 * `RequestList` is used by {@link BasicCrawler|`BasicCrawler`}, {@link CheerioCrawler|`CheerioCrawler`}
 * and {@link PuppeteerCrawler|`PuppeteerCrawler`} as a source of URLs to crawl.
 * Unlike {@link RequestQueue|`RequestQueue`}, `RequestList` is static but it can contain even millions of URLs.
 *
 * `RequestList` has an internal state where it stores information which requests were handled,
 * which are in progress or which were reclaimed.
 * The state might be automatically persisted to the default key-value store by setting the `persistStateKey` option
 * so that if the Node.js process is restarted,
 * the crawling can continue where it left off. For more details, see {@link KeyValueStore|`KeyValueStore`}.
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
 *     persistStateKey: 'my-crawling-state'
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
 * @param {Object} options
 * @param {Array} options.sources
 *  An array of sources for the `RequestList`. Its contents can either be just plain objects,
 *  defining at least the 'url' property or instances of the {@link Request|`Request`} class.
 *  Additionally a `requestsFromUrl` property may be used instead of `url`,
 *  which will instruct the `RequestList` to download the sources from the given remote location.
 *  The URLs will be parsed from the received response.
 *
 * ```javascript
 * [
 *     // One URL
 *     { method: 'GET', url: 'http://example.com/a/b' },
 *     // Batch import of URLs from a file hosted on the web
 *     { method: 'POST', requestsFromUrl: 'http://example.com/urls.txt' },
 * ]
 * ```
 * @param {String} [options.persistStateKey]
 *   Identifies the key in the default key-value store under which the `RequestList` persists its state.
 *   If this is set then `RequestList`
 *   persists its state in regular intervals and loads the state from there in case it is restarted
 *   due to an error or system reboot.
 * @param {Object} [options.state]
 *   The state object that the `RequestList` will be initialized from.
 *   It is in the form as returned by `RequestList.getState()`, such as follows:
 *
 * ```javascript
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
 *   is to use the `persistStateKey` parameter instead.
 *
 * @param {Boolean} [options.keepDuplicateUrls=false]
 *   By default, `RequestList` will deduplicate the provided URLs. Default deduplication is based
 *   on the `uniqueKey` property of passed source {@link Request} objects. If the property is not present,
 *   it is generated by normalizing the URL. If present, it is kept intact. In any case, only one request per `uniqueKey` is added
 *   to the `RequestList` resulting in removing of duplicate URLs / unique keys.
 *   Setting `keepDuplicateUrls` to `true` will append an additional identifier to the `uniqueKey`
 *   of each request that does not already include a `uniqueKey`. Therefore, duplicate
 *   URLs will be kept in the list. It does not protect the user from having duplicates in user set
 *   `uniqueKey`s however. It is the user's responsibility to ensure uniqueness of their unique keys,
 *   if they wish to keep more than just a single copy in the `RequestList`.
 */
export default class RequestList {
    constructor(opts = {}) {
        checkParamOrThrow(opts, 'options', 'Object');

        const { sources, persistStateKey, state, keepDuplicateUrls = false } = opts;

        checkParamOrThrow(sources, 'options.sources', 'Array');
        checkParamOrThrow(state, 'options.state', 'Maybe Object');
        checkParamOrThrow(persistStateKey, 'options.persistStateKey', 'Maybe String');
        checkParamOrThrow(keepDuplicateUrls, 'options.keepDuplicateUrls', 'Maybe Boolean');

        // We will initialize everything from this state in this.initialize();
        this.initialStatePromise = persistStateKey && !state
            ? getValue(persistStateKey)
            : Promise.resolve(state);

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

        // If this key is set then we persist url list into default key-value store under this key.
        this.persistStateKey = persistStateKey;
        this.isStatePersisted = true;

        // If this option is set then all requests will get a pre-generated unique ID and duplicate URLs will be kept in the list.
        this.keepDuplicateUrls = keepDuplicateUrls;

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
    initialize() {
        if (this.isLoading) {
            throw new Error('RequestList sources are already loading or were loaded.');
        }
        this.isLoading = true;

        // We'll load all sources in sequence to ensure that they get loaded in the right order.
        return Promise
            .mapSeries(this.sources, (source) => {
                // TODO: One promise per each item is too much overheads, we could cluster items into single Promise.
                return source.requestsFromUrl
                    ? this._addRequestsFromUrl(source)
                    : Promise.resolve(this._addRequest(source));
            })
            .then(() => this.initialStatePromise)
            .then((state) => {
                if (!state) return;

                // Restore state
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
            })
            .then(() => {
                this.isInitialized = true;

                if (!this.persistStateKey) return;

                events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, () => {
                    if (this.isStatePersisted) return;

                    return setValue(this.persistStateKey, this.getState())
                        .then(() => {
                            this.isStatePersisted = true;
                        })
                        .catch((err) => {
                            log.exception(err, 'RequestList: Cannot persist state', { persistStateKey: this.persistStateKey });
                        });
                });
            });
    }

    /**
     * Returns an object representing the internal state of the `RequestList` instance.
     * Note that the objects fields can change in future releases.
     *
     * @returns Object
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
     * Resolves to `true` if the next call to {@link RequestList#fetchNextRequest|`fetchNextRequest()`}
     * will return `null`, otherwise it resolves to `false`.
     * Note that even if the list is empty, there might be some pending requests currently being processed.
     *
     * @returns {Promise<Boolean>}
     */
    isEmpty() {
        return Promise
            .resolve()
            .then(() => {
                this._ensureIsInitialized();

                return !getFirstKey(this.reclaimed) && this.nextIndex >= this.requests.length;
            });
    }

    /**
     * Returns `true` if all requests were already handled and there are no more left.
     *
     * @returns {Promise<boolean>}
     */
    isFinished() {
        return Promise
            .resolve()
            .then(() => {
                this._ensureIsInitialized();

                return !getFirstKey(this.inProgress) && this.nextIndex >= this.requests.length;
            });
    }

    /**
     * Gets the next `Request` to process. First, the function gets a request previously reclaimed
     * using {@link RequestList#reclaimRequest|`reclaimRequest()`} function, if there is any.
     * Otherwise it gets a next request from the sources.
     *
     * The function gets `null` if there are no more
     * requests to process.
     *
     * @returns {Promise<Request>}
     */
    fetchNextRequest() {
        return Promise
            .resolve()
            .then(() => {
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
            });
    }

    /**
     * Marks request as handled after successful processing.
     *
     * @param {Request} request
     *
     * @returns {Promise}
     */
    markRequestHandled(request) {
        return Promise
            .resolve()
            .then(() => {
                const { uniqueKey } = request;

                ensureUniqueKeyValid(uniqueKey);
                this._ensureInProgressAndNotReclaimed(uniqueKey);
                this._ensureIsInitialized();

                delete this.inProgress[uniqueKey];
                this.isStatePersisted = false;
            });
    }

    /**
     * Reclaims request to the list if its processing failed.
     * The request will become available in the next `this.fetchNextRequest()`.
     *
     * @param {Request} request
     *
     * @returns {Promise}
     */
    reclaimRequest(request) {
        return Promise
            .resolve()
            .then(() => {
                const { uniqueKey } = request;

                ensureUniqueKeyValid(uniqueKey);
                this._ensureInProgressAndNotReclaimed(uniqueKey);
                this._ensureIsInitialized();

                this.reclaimed[uniqueKey] = true;
            });
    }

    /**
     * Adds all requests from a file string.
     *
     * @ignore
     */
    _addRequestsFromUrl(source) {
        const sharedOpts = _.omit(source, 'requestsFromUrl', 'regex');
        const { requestsFromUrl, regex } = source;
        const { downloadListOfUrls } = publicUtils;

        return downloadListOfUrls({
            url: requestsFromUrl,
            urlRegExp: regex,
        })
            .then((urlsArr) => {
                const originalLength = this.requests.length;

                if (urlsArr) {
                    urlsArr.forEach(url => this._addRequest(_.extend({ url }, sharedOpts)));

                    const fetchedCount = urlsArr.length;
                    const importedCount = this.requests.length - originalLength;

                    log.info('RequestList: list fetched', {
                        requestsFromUrl,
                        regex,
                        fetchedCount,
                        importedCount,
                        duplicateCount: fetchedCount - importedCount,
                        sample: JSON.stringify(urlsArr.slice(0, 5)),
                    });
                } else {
                    log.warning('RequestList: list fetched but it is empty', {
                        requestsFromUrl,
                        regex,
                    });
                }
            })
            .catch((err) => {
                log.exception(err, 'RequestList: Cannot fetch a request list', { requestsFromUrl, regex });
                throw new Error(`Cannot fetch a request list from ${requestsFromUrl}: ${err}`);
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
        ensureUniqueKeyValid(uniqueKey);

        // Skip requests with duplicate uniqueKey
        if (!this.uniqueKeyToIndex.hasOwnProperty(uniqueKey)) { // eslint-disable-line no-prototype-builtins
            this.uniqueKeyToIndex[uniqueKey] = this.requests.length;
            this.requests.push(request);
        } else if (this.keepDuplicateUrls) {
            log.warning(`RequestList: Duplicate uniqueKey: ${uniqueKey} found while the keepDuplicateUrls option was set. Check your sources' unique keys.`); // eslint-disable-line max-len
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
     */
    length() {
        return this.requests.length;
    }
}
