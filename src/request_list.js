import { checkParamOrThrow } from 'apify-client/build/utils';
import log from 'apify-shared/log';
import _ from 'underscore';
import requestPromise from 'request-promise';
import ListDictionary from 'apify-shared/list_dictionary';
import { sequentializePromises } from 'apify-shared/utilities';
import Request from './request';

// @TODO make default regex to be url matching one

// @TODO: write unit tests, check all invariants after every step:
// - reclaimedRequests is subset of inProgressRequests
// - nextIndex is in range [0, this.requests]
// - all requests have a distinct uniqueKey at all times


const getFirstKey = (dict) => {
    for (const key in dict) { // eslint-disable-line guard-for-in, no-restricted-syntax
        return key;
    }
};

const _ensureUniqueKeyValid = (uniqueKey) => {
    if (typeof uniqueKey !== 'string' || !uniqueKey) {
        throw new Error('Request object\'s uniqueKey must be a non-empty string');
    }
};

/**
 * This class represents a list of web pages (requests) to be crawled.
 */
export default class RequestList {
    constructor({ sources }) {
        checkParamOrThrow(sources, 'options.sources', 'Array');

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

        // We'll load all sources in sequence to ensure that they get loaded in the right order.
        this.loadSourcesPromiseGenerators = sources.map((source) => {
            if (source.requestsFromUrl) return () => this._addRequestsFromUrl(source);

            // @TODO: One promise per each item is too much overheads, we could cluster items into single Promise.
            return () => Promise.resolve(this._addRequest(source));
        });
    }

    /**
     * Loads all sources specified and optionally restores the state of the instance from a persisted state object.
     * @param state State object
     * @returns Promise
     */
    load(state) {
        // @TODO: check that state contains correct fields
        checkParamOrThrow(state, 'options.state', 'Maybe Object');

        if (this.isLoading) {
            throw new Error('RequestList sources are already loading or were loaded.');
        }
        this.isLoading = true;

        return this.sequentializePromises(this.loadSourcesPromiseGenerators)
            .then(() => {
                // Restore state
                if (typeof state.nextIndex !== 'number' || state.nextIndex < 0) {
                    throw new Error('The state object is invalid: nextIndex must be a non-negative number.');
                }
                if (state.nextIndex > this.requests.length) {
                    throw new Error('The state object is not consistent with RequestList: too few requests loaded.');
                }
                if (state.nextIndex < this.requests.length
                    && this.requests[state.nextIndex] !== state.nextUniqueKey) {
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
            });
    }

    /**
     * Returns an object representing the state of the RequestList instance. Do not alter the resulting object!
     * @returns Object
     */
    getState() {
        return {
            nextIndex: this.nextIndex,
            nextUniqueKey: this.nextIndex < this.requests.length
                ? this.requests[this.nextIndex].uniqueKey
                : null,
            inProgress: this.inProgress,
        };
    }

    _addRequestsFromUrl(source) {
        const sharedOpts = _.omit(source, 'requestsFromUrl', 'regex');
        const { requestsFromUrl, regex } = source;

        return requestPromise.get(requestsFromUrl)
            .then((urlsStr) => {
                if (regex) return urlsStr.match(new RegExp(regex, 'g'));

                return urlsStr
                    .trim()
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line);
            })
            .then((urlsArr) => {
                log.info('RequestList: list fetched', {
                    requestsFromUrl,
                    regex,
                    count: urlsArr.length,
                    sample: JSON.stringify(urlsArr.slice(0, 5)),
                });

                urlsArr.forEach(url => this._addRequest(_.extend({ url }, sharedOpts)));
            })
            .catch((err) => {
                log.exception(err, 'RequestList: Cannot fetch a request list', { requestsFromUrl, regex });
                throw new Error(`Cannot fetch a request list from ${requestsFromUrl}: ${err}`);
            });
    }

    _addRequest(opts) {
        const request = opts instanceof Request
            ? opts
            : new Request(opts);

        const { uniqueKey } = request;
        _ensureUniqueKeyValid(uniqueKey);

        // Skip requests with duplicate uniqueKey
        if (this.uniqueKeyToIndex[uniqueKey] === undefined) {
            this.uniqueKeyToIndex[uniqueKey] = this.requests.length;
            this.requests.push(request);
        }
    }

    /**
     * Returns `true` if the next call to fetchNextRequest() will return null, otherwise it returns `false`.
     * Note that even if the list is empty, there might be some pending requests currently being processed.
     * @returns {boolean}
     */
    isEmpty() {
        return !!getFirstKey(this.reclaimed)
            && this.nextIndex >= this.requests.length;
    }

    // Returns `true` if all requests were already handled and there are no more left.
    isFinished() {
        return !!getFirstKey(this.inProgress)
            && this.nextIndex >= this.requests.length;
    }

    fetchNextRequest() {
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

    _ensureInProgressAndNotReclaimed(uniqueKey) {
        if (!this.inProgress[uniqueKey]) {
            throw new Error(`The request is not being processed (uniqueKey: ${uniqueKey})`);
        }
        if (this.reclaimed[uniqueKey]) {
            throw new Error(`The request was already reclaimed (uniqueKey: ${uniqueKey})`);
        }
    }

    markRequestHandled(request) {
        const { uniqueKey } = request;

        _ensureUniqueKeyValid(uniqueKey);
        _ensureInProgressAndNotReclaimed(uniqueKey);

        delete this.inProgress[uniqueKey];
    }

    reclaimRequest(request) {
        const { uniqueKey } = request;

        _ensureUniqueKeyValid(uniqueKey);
        _ensureInProgressAndNotReclaimed(uniqueKey);

        this.reclaimed[uniqueKey] = true;
    }
}
