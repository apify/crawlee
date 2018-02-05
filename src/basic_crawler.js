import { checkParamOrThrow } from 'apify-client/build/utils';
import _ from 'underscore';
import { isPromise, checkParamPrototypeOrThrow } from './utils';
import AutoscaledPool from './autoscaled_pool';
import RequestList from './request_list';

const DEFAULT_OPTIONS = {
    maxRequestRetries: 3,
};

/**
 * @class BasicCrawler
 * @memberof Apify
 * @param {RequestList} options.requestList - List of the requests to be processed.
 * @param {Function} options.handleRequestFunction - Function that processes a request. It must return a promise.
 * @param {Number} [options.maxRequestRetries=3] - How many times request is retried if handleRequestFunction failed.
 * @param {Number} [options.maxMemoryMbytes] - Maximal memory available in the system (see maxMemoryMbytes parameter of Apify.AutoscaledPool).
 * @param {Number} [options.maxConcurrency=1] - Minimal concurrency of requests processing (see maxConcurrency parameter of Apify.AutoscaledPool).
 * @param {Number} [options.minConcurrency=1000] - Maximal concurrency of request processing (see minConcurrency parameter of Apify.AutoscaledPool).
 *
 * @description
 * <p>BasicCrawler provides a simple framework for parallel crawling of a url list provided by Apify.RequestList
 * or a dynamically enqueued requests provided by Apify.RequestQueue (TODO).</p>
 * <p>It's simply calling handleRequestFunction for each request from requestList or requestQueue as long as
 * both are not empty. The concurrency is scaled based on available memory using Apify.AutoscaledPool.</p>
 * <p>Basic usage of BasicCrawler:</p>
 * ```javascript
 * const request = require('request-promise');
 *
 * const crawler = new Apify.BasicCrawler({
 *     urlList,
 *     handleRequestFunction: async ({ request }) => {
 *         await Apify.pushData({
 *             html: await request(request.url),
 *             url: request.url,
 *         })
 *     },
 * });
 *
 * await crawler.run();
 * ```
 */
export default class BasicCrawler {
    constructor(opts) {
        const {
            requestList,
            handleRequestFunction,
            maxRequestRetries,

            // Autoscaled pool options
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(handleRequestFunction, 'opts.handleRequestFunction', 'Function');
        checkParamOrThrow(maxRequestRetries, 'opts.maxRequestRetries', 'Number');
        // TODO: make this optional once we have the request queue ready.
        checkParamPrototypeOrThrow(requestList, 'opts.requestList', RequestList, 'Apify.RequestList');

        this.requestList = requestList;
        this.handleRequestFunction = handleRequestFunction;
        this.maxRequestRetries = maxRequestRetries;

        this.autoscaledPool = new AutoscaledPool({
            workerFunction: () => this._workerFunction(),
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
        });
    }

    /**
     * Runs the crawler. Returns promise that gets resolved or rejected once
     * all the requests got processed or some of the handleRequestFunction calls fails.
     * @memberof Apify.BasicCrawler
     * @method run
     * @return {Promise}
     */
    run() {
        return this.autoscaledPool.run();
    }

    /**
     * Wrapper around handleRequestFunction that catches errors and retries requests.
     * @ignore
     */
    _workerFunction() {
        const request = this.requestList.fetchNextRequest();

        if (!request) return;

        const promise = this.handleRequestFunction({ request });
        if (!isPromise(promise)) throw new Error('User provided handleRequestFunction must return a Promise.');

        return promise.catch((err) => {
            request.errorInfo.push(err);

            if (request.retryCount < this.maxRequestRetries) {
                request.retryCount++;
                this.requestList.reclaimRequest(request);
            } else {
                this.requestList.markRequestHandled(request);
            }
        });
    }
}
