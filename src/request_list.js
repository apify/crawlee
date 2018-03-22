import { checkParamOrThrow } from 'apify-client/build/utils';
import log from 'apify-shared/log';
import _ from 'underscore';
import requestPromise from 'request-promise';
import { sequentializePromises } from 'apify-shared/utilities';
import Request from './request';

// TODO: better tests
const URL_REGEX = '(http|https)://[\\w-]+(\\.[\\w-]+)+([\\w-.,@?^=%&:/~+#-]*[\\w@?^=%&;/~+#-])?';

/**
 * Helper function that returns the first key from plan object.
 *
 * @ignore
 */
const getFirstKey = (dict) => {
    for (const key in dict) { // eslint-disable-line guard-for-in, no-restricted-syntax
        return key;
    }
};

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
 * `RequestList` provides way to handle a list of URLs (i.e. requests) to be crawled.
 *
 * `RequestList` has internal state where it remembers handled requests, requests in progress and also reclaimed requests.
 * State might be persisted in key-value store as shown in the example below so if an act get restarted (due to internal
 * error or restart of the host machine) then it may be initialized from previous state.
 *
 * Basic usage of `RequestList`:
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
 *     // Initialize from previous state if act was restarted due to some error
 *     state: await Apify.getValue('my-request-list-state'),
 * });
 *
 * await requestList.initialize(); // Load requests.
 *
 * // Save state of the RequestList instance every 5 seconds.
 * setInterval(() => {
 *      Apify.setValue('my-request-list-state', requestList.getState());
 * }, 5000);
 *
 * // Get requests from list
 * const request1 = requestList.fetchNextRequest();
 * const request2 = requestList.fetchNextRequest();
 * const request3 = requestList.fetchNextRequest();
 *
 * // Mark some of them as handled
 * requestList.markRequestHandled(request1);
 *
 * // If processing fails then reclaim it back to the list
 * requestList.reclaimRequest(request2);
 * ```
 *
 * @param {Array} options.sources Function that processes a request. It must return a promise.
 * ```javascript
 * [
 *     // One URL
 *     { method: 'GET', url: 'http://example.com/a/b' },
 *     // Batch import of URLa from a file hosted on the web
 *     { method: 'POST', requestsFromUrl: 'http://example.com/urls.txt' },
 * ]
 * ```
 * @param {Object} [options.state] State of the `RequestList` to be initialized from. It is in the form returned by `requestList.getState()`:
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
 */
export default class RequestList {
    constructor({ sources, state }) {
        checkParamOrThrow(sources, 'options.sources', 'Array');
        checkParamOrThrow(state, 'options.state', 'Maybe Object');

        // We will initialize everything from this state in this.initialize();
        this.initialState = state;

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

        this.isLoading = false;
        this.isInitialized = false;

        // We'll load all sources in sequence to ensure that they get loaded in the right order.
        this.loadSourcesPromiseGenerators = sources.map((source) => {
            if (source.requestsFromUrl) return () => this._addRequestsFromUrl(source);

            // TODO: One promise per each item is too much overheads, we could cluster items into single Promise.
            return () => Promise.resolve(this._addRequest(source));
        });
    }

    /**
     * Loads all sources specified.
     *
     * @returns {Promise}
     */
    initialize() {
        if (this.isLoading) {
            throw new Error('RequestList sources are already loading or were loaded.');
        }
        this.isLoading = true;

        return sequentializePromises(this.loadSourcesPromiseGenerators)
            .then(() => {
                const state = this.initialState;

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

                _.keys(state.inProgress).forEach((uniqueKey) => {
                    if (typeof this.uniqueKeyToIndex[uniqueKey] !== 'number') {
                        throw new Error('The state object is not consistent with RequestList: unknown uniqueKey is present in the state.');
                    }
                });

                this.nextIndex = state.nextIndex;
                this.inProgress = state.inProgress;

                // All in-progress requests need to be recrawled
                this.reclaimed = _.clone(this.inProgress);
            })
            .then(() => {
                this.isInitialized = true;
            });
    }

    /**
     * Returns an object representing the state of the RequestList instance. Do not alter the resulting object!
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
     * Returns `true` if the next call to fetchNextRequest() will return null, otherwise it returns `false`.
     * Note that even if the list is empty, there might be some pending requests currently being processed.
     *
     * @returns {boolean}
     */
    isEmpty() {
        this._ensureIsInitialized();

        return !getFirstKey(this.reclaimed) && this.nextIndex >= this.requests.length;
    }

    /**
     * Returns `true` if all requests were already handled and there are no more left.
     *
     * @returns {boolean}
     */
    isFinished() {
        this._ensureIsInitialized();

        return !getFirstKey(this.inProgress) && this.nextIndex >= this.requests.length;
    }

    /**
     * Returns next request which is the reclaimed one if available or next upcoming request otherwise.
     *
     * @returns {Request}
     */
    fetchNextRequest() {
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
            return request;
        }

        return null;
    }

    /**
     * Adds all requests from a file string.
     *
     * @ignore
     */
    _addRequestsFromUrl(source) {
        const sharedOpts = _.omit(source, 'requestsFromUrl', 'regex');
        const {
            requestsFromUrl,
            regex = URL_REGEX,
        } = source;

        return requestPromise.get(requestsFromUrl)
            .then((urlsStr) => {
                const urlsArr = urlsStr.match(new RegExp(regex, 'gi'));
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
                        dupliciteCount: fetchedCount - importedCount,
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
     * If opts partameter is plain object not instance of an Requests then creates it.
     *
     * @ignore
     */
    _addRequest(opts) {
        const request = opts instanceof Request
            ? opts
            : new Request(opts);

        const { uniqueKey } = request;
        ensureUniqueKeyValid(uniqueKey);

        // Skip requests with duplicate uniqueKey
        if (this.uniqueKeyToIndex[uniqueKey] === undefined) {
            this.uniqueKeyToIndex[uniqueKey] = this.requests.length;
            this.requests.push(request);
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
     * Marks request handled after successfull processing.
     *
     * @param {Request} request
     */
    markRequestHandled(request) {
        const { uniqueKey } = request;

        ensureUniqueKeyValid(uniqueKey);
        this._ensureInProgressAndNotReclaimed(uniqueKey);
        this._ensureIsInitialized();

        delete this.inProgress[uniqueKey];
    }

    /**
     * Reclaims request after unsuccessfull operation. Request will become available for next `this.fetchNextRequest()`.
     *
     * @param {Request} request
     */
    reclaimRequest(request) {
        const { uniqueKey } = request;

        ensureUniqueKeyValid(uniqueKey);
        this._ensureInProgressAndNotReclaimed(uniqueKey);
        this._ensureIsInitialized();

        this.reclaimed[uniqueKey] = true;
    }
}
