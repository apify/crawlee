import { checkParamOrThrow } from 'apify-client/build/utils';
import _ from 'underscore';
import log from 'apify-shared/log';
import { isPromise, checkParamPrototypeOrThrow } from './utils';
import AutoscaledPool from './autoscaled_pool';
import RequestList from './request_list';

const DEFAULT_OPTIONS = {
    maxRequestRetries: 3,
    handleFailedRequestFunction: ({ request }) => log.error('Request failed', _.pick(request, 'url', 'uniqueKey')),
};

/**
 * BasicCrawler provides a simple framework for parallel crawling of a url list provided by `Apify.RequestList`
 * or a dynamically enqueued requests provided by `Apify.RequestQueue` (TODO).
 *
 * It's simply calling handleRequestFunction for each request from requestList or requestQueue as long as
 * both are not empty. The concurrency is scaled based on available memory using `Apify.AutoscaledPool` and all
 * of it's configuration parameters are supported here.
 *
 * Basic usage of BasicCrawler:
 *
 * ```javascript
 * const rp = require('request-promise');
 *
 * const crawler = new Apify.BasicCrawler({
 *     requestList,
 *     handleRequestFunction: async ({ request }) => {
 *         await Apify.pushData({
 *             html: await rp(request.url),
 *             url: request.url,
 *         })
 *     },
 * });
 *
 * await crawler.run();
 * ```
 *
 * @param {Object} options
 * @param {RequestList} options.requestList List of the requests to be processed.
 * @param {Function} options.handleRequestFunction Function that processes a request. It must return a promise.
 * @param {Function} [options.handleFailedRequestFunction=({ request }) => log.error('Request failed', _.pick(request, 'url', 'uniqueKey'))`]
 *                   Function to handle requests that failed more then option.maxRequestRetries times.
 * @param {Number} [options.maxRequestRetries=3] How many times request is retried if handleRequestFunction failed.
 * @param {Number} [options.maxMemoryMbytes] Maximal memory available in the system (see `maxMemoryMbytes` parameter of `Apify.AutoscaledPool`).
 * @param {Number} [options.maxConcurrency=1000] Maximal concurrency of request processing (see `maxConcurrency` parameter of `Apify.AutoscaledPool`).
 * @param {Number} [options.minConcurrency=1] Minimal concurrency of requests processing (see `minConcurrency` parameter of `Apify.AutoscaledPool`).
 * @param {Number} [options.minFreeMemoryRatio=0.2] Minumum ratio of free memory kept in the system.
 */
export default class BasicCrawler {
    constructor(opts) {
        const {
            requestList,
            handleRequestFunction,
            handleFailedRequestFunction,
            maxRequestRetries,

            // Autoscaled pool options
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
            minFreeMemoryRatio,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(handleRequestFunction, 'opts.handleRequestFunction', 'Function');
        checkParamOrThrow(handleFailedRequestFunction, 'opts.handleFailedRequestFunction', 'Function');
        checkParamOrThrow(maxRequestRetries, 'opts.maxRequestRetries', 'Number');
        // TODO: make this optional once we have the request queue ready.
        checkParamPrototypeOrThrow(requestList, 'opts.requestList', RequestList, 'Apify.RequestList');

        this.requestList = requestList;
        this.handleRequestFunction = handleRequestFunction;
        this.handleFailedRequestFunction = handleFailedRequestFunction;
        this.maxRequestRetries = maxRequestRetries;

        this.autoscaledPool = new AutoscaledPool({
            workerFunction: () => this._workerFunction(),
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
            minFreeMemoryRatio,
        });
    }

    /**
     * Runs the crawler. Returns promise that gets resolved once all the requests got processed.
     *
     * @return {Promise}
     */
    run() {
        return this.autoscaledPool.run();
    }

    /**
     * Wrapper around handleRequestFunction that catches errors and retries requests.
     *
     * @ignore
     */
    _workerFunction() {
        const request = this.requestList.fetchNextRequest();

        if (!request) return;

        const handlePromise = this.handleRequestFunction({ request });
        if (!isPromise(handlePromise)) throw new Error('User provided handleRequestFunction must return a Promise.');

        return handlePromise
            .then(() => {
                this.requestList.markRequestHandled(request);
            })
            .catch((err) => {
                request.pushErrorMessage(err);

                // Retry request.
                if (request.retryCount < this.maxRequestRetries) {
                    request.retryCount++;
                    this.requestList.reclaimRequest(request);
                    return;
                }

                // Mark as failed.
                this.requestList.markRequestHandled(request);

                return this.handleFailedRequestFunction({ request });
            });
    }
}
