import { checkParamOrThrow } from 'apify-client/build/utils';
import log from 'apify-shared/log';
import _ from 'underscore';
import requestPromise from 'request-promise';
import ListDictionary from 'apify-shared/list_dictionary';
import { sequentializePromises } from 'apify-shared/utilities';
import Request from './request';

export default class RequestList {
    constructor({ sources, state }) {
        checkParamOrThrow(sources, 'options.sources', 'Array');
        checkParamOrThrow(state, 'options.state', 'Maybe Object');

        this.state = state || { handledFromFirst: 0, handledUniqueKeys: [] };
        this.pendingRequests = new ListDictionary();
        this.inProgressRequests = new ListDictionary();
        this.reclaimedUniqueKeys = [];
        this.skippedOnInsert = 0;

        // Load all sources in sequence to ensure that they get loaded in the right order.
        const promiseGenerators = sources.map((source) => {
            if (source.requestsFromUrl) return () => this._insertRequestsFormRUrl(source);

            return () => Promise.resolve(this._insertRequest(source));
        });

        this.initializePromise = sequentializePromises(promiseGenerators);
    }

    loadSources() {
        return this.initializePromise;
    }

    _insertRequestsFormRUrl(source) {
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

                urlsArr.forEach(url => this._insertRequest(_.extend({ url }, sharedOpts)));
            })
            .catch(err => log.exception(err, 'RequestList: Cannot fetch a request list', { requestsFromUrl, regex }));
    }

    _insertRequest(opts) {
        const request = opts instanceof Request
            ? opts
            : new Request(opts);

        if (this.state.handledFromFirst && this.skippedOnInsert < this.state.handledFromFirst) {
            this.skippedOnInsert++;
            return;
        }

        if (this.state.handledUniqueKeys.includes(request.uniqueKey)) {
            this.inProgressRequests.add(request.uniqueKey, request);
            return;
        }

        this.pendingRequests.add(request.uniqueKey, request);
    }

    getState() {
        return this.state;
    }

    fetchNextRequest() {
        if (this.isEmpty()) return null;

        // Get from reclaimed.
        if (this.reclaimedUniqueKeys.length) {
            const uniqueKey = this.reclaimedUniqueKeys.shift();
            return this.inProgressRequests.get(uniqueKey);
        }

        // Get from pending.
        const request = this.pendingRequests.removeFirst();
        this.inProgressRequests.add(request.uniqueKey, request);
        return request;
    }

    markRequestHandled(request) {
        this.state.handledUniqueKeys.push(request.uniqueKey);

        while (this.inProgressRequests.length() && this.state.handledUniqueKeys.includes(this.inProgressRequests.getFirst().uniqueKey)) {
            const removedRequest = this.inProgressRequests.removeFirst();
            this.state.handledUniqueKeys = _.without(this.state.handledUniqueKeys, removedRequest.uniqueKey);
            this.state.handledFromFirst++;
        }
    }

    reclaimRequest(request) {
        this.reclaimedUniqueKeys.push(request.uniqueKey);
    }

    isEmpty() {
        return this.pendingRequests.length() === 0 && this.reclaimedUniqueKeys.length === 0;
    }
}
