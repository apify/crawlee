import { checkParamOrThrow } from 'apify-client/build/utils';
import _ from 'underscore';
import log from 'apify-shared/log';
import { checkParamPrototypeOrThrow } from 'apify-shared/utilities';
import AutoscaledPool from './autoscaled_pool';
import RequestList from './request_list';
import { RequestQueue, RequestQueueLocal } from './request_queue';

const DEFAULT_OPTIONS = {
    maxRequestRetries: 3,
    handleFailedRequestFunction: ({ request }) => {
        const details = _.pick(request, 'id', 'url', 'method', 'uniqueKey');
        log.error('BasicCrawler: Request failed and reached maximum retries', details);
    },
};

/**
 * Provides a simple framework for parallel crawling of web pages,
 * whose URLs are fed either from a static list (using the `RequestList` class)
 * or from a dynamic queue of URLs (using the `RequestQueue` class).
 *
 * `BasicCrawler` invokes `handleRequestFunction` for each `Request` object fetched from `options.requestList` or `options.requestQueue`,
 * as long as any of them is not empty. New requests are only handled if there is enough free CPU and memory available,
 * using the functionality provided by the `AutoscaledPool` class.
 * Note that all `AutoscaledPool` configuration options can be passed to `options` parameter of the `BasicCrawler` constructor.
 *
 * If both `requestList` and `requestQueue` is used, the instance first
 * processes URLs from the `requestList` and automatically enqueues all of them to `requestQueue` before it starts
 * their processing. This guarantees that a single URL is not crawled multiple times.
 *
 * Example usage:
 *
 * ```javascript
 * const rp = require('request-promise');
 *
 * // Prepare a list of URLs to crawl
 * const requestList = new Apify.RequestList({
 *   sources: [
 *       { url: 'http://www.example.com/page-1' },
 *       { url: 'http://www.example.com/page-2' },
 *   ],
 * });
 * await requestList.initialize();
 *
 * // Crawl the URLs
 * const crawler = new Apify.BasicCrawler({
 *     requestList,
 *     handleRequestFunction: async ({ request }) => {
 *         // 'request' contains an instance of the Request class
 *         // Here we simply fetch the HTML of the page and store it to a dataset
 *         await Apify.pushData({
 *             url: request.url,
 *             html: await rp(request.url),
 *         })
 *     },
 * });
 *
 * await crawler.run();
 * ```
 *
 * @param {Object} options
 * @param {RequestList} [options.requestList]
 *   Static list of URLs to be processed.
 * @param {RequestQueue} [options.requestQueue]
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 * @param {Function} [options.handleRequestFunction]
 *   Function that processes a single `Request` object. It must return a promise.
 * @param {Function} [options.handleFailedRequestFunction=({ request }) => {
 *      const details = _.pick(request, 'id', 'url', 'method', 'uniqueKey');
 *      log.error('BasicCrawler: Request failed and reached maximum retries', details);
 *  }]
 *   Function that handles requests that failed more then `option.maxRequestRetries` times.
 * @param {Number} [options.maxRequestRetries=3]
 *   How many times the request is retried if `handleRequestFunction` failed.
 * @param {Number} [options.maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @param {Number} [options.maxMemoryMbytes]
 *   Maximum memory available in the system
 *   See `AutoscaledPool` for details.
 * @param {Number} [options.minConcurrency=1]
 *   Minimum number of request to process in parallel.
 *   See `AutoscaledPool` for details.
 * @param {Number} [options.maxConcurrency=1000]
 *   Maximum number of request to process in parallel.
 *   See `AutoscaledPool` for details.
 * @param {Number} [options.minFreeMemoryRatio=0.2]
 *   Minimum ratio of free memory kept in the system.
 *   See `AutoscaledPool` for details.
 * @param {Function} [opts.isFinishedFunction]
 *   By default BasicCrawler finishes when all the requests have been processed.
 *   You can override this behaviour by providing custom `isFinishedFunction`.
 *   This function that is called every time there are no requests being processed.
 *   If it resolves to `true` then the crawler's run finishes.
 *   See `AutoscaledPool` for details.
 * @param {Boolean} [options.ignoreMainProcess=false]
 *   If set to `true` then the auto-scaling manager does not consider memory consumption
 *   of the main Node.js process when scaling the pool up or down.
 *   This is mainly useful when tasks are running as separate processes (e.g. web browsers).
 *   See `AutoscaledPool` for details.
 */
export default class BasicCrawler {
    constructor(opts) {
        const {
            requestList,
            requestQueue,
            handleRequestFunction,
            handleFailedRequestFunction,
            maxRequestRetries,
            maxRequestsPerCrawl,

            // AutoscaledPool options
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
            minFreeMemoryRatio,
            isFinishedFunction,
            ignoreMainProcess,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamPrototypeOrThrow(requestList, 'opts.requestList', RequestList, 'Apify.RequestList', true);
        checkParamPrototypeOrThrow(requestQueue, 'opts.requestQueue', [RequestQueue, RequestQueueLocal], 'Apify.RequestQueue', true);
        checkParamOrThrow(handleRequestFunction, 'opts.handleRequestFunction', 'Function');
        checkParamOrThrow(handleFailedRequestFunction, 'opts.handleFailedRequestFunction', 'Function');
        checkParamOrThrow(maxRequestRetries, 'opts.maxRequestRetries', 'Number');
        checkParamOrThrow(maxRequestsPerCrawl, 'opts.maxRequestsPerCrawl', 'Maybe Number');

        if (!requestList && !requestQueue) {
            throw new Error('At least one of the parameters "opts.requestList" and "opts.requestQueue" must be provided!');
        }

        this.requestList = requestList;
        this.requestQueue = requestQueue;
        this.handleRequestFunction = handleRequestFunction;
        this.handleFailedRequestFunction = handleFailedRequestFunction;
        this.maxRequestRetries = maxRequestRetries;
        this.handledRequestsCount = 0;

        const isMaxPagesExceeded = () => maxRequestsPerCrawl && maxRequestsPerCrawl <= this.handledRequestsCount;

        this.autoscaledPoolOptions = {
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
            minFreeMemoryRatio,
            runTaskFunction: async () => {
                if (!this.isRunning) return null;

                return this._runTaskFunction();
            },
            isTaskReadyFunction: async () => {
                if (isMaxPagesExceeded() || !this.isRunning) return false;

                return this._isTaskReadyFunction();
            },
            isFinishedFunction: async () => {
                if (isMaxPagesExceeded() || !this.isRunning) return true;

                return isFinishedFunction
                    ? isFinishedFunction()
                    : this._defaultIsFinishedFunction();
            },
            ignoreMainProcess,
        };
    }

    /**
     * Runs the crawler. Returns a promise that gets resolved once all the requests are processed.
     *
     * @return {Promise}
     */
    async run() {
        if (this.isRunning) return this.isRunningPromise;

        this.autoscaledPool = new AutoscaledPool(this.autoscaledPoolOptions);
        this.isRunning = true;
        this.rejectOnStopPromise = new Promise((r, reject) => { this.rejectOnStop = reject; });
        this.isRunningPromise = this.autoscaledPool.run();
        try {
            await this.isRunningPromise;
            this.isRunning = false;
        } catch (err) {
            this.isRunning = false; // Doing this before rejecting to make sure it's set when error handlers fire.
            this.rejectOnStop(err);
        }
    }

    /**
     * Stops the crawler by preventing crawls of additional pages. Pages already running are NOT terminated.
     *
     * @return {Promise}
     */
    async stop() {
        this.isRunning = false;
        await this.autoscaledPool.stop();
        this.rejectOnStop(new Error('BasicCrawler: .stop() function has been called. Stopping the crawler.'));
    }

    /**
     * Fetches request from either RequestList or RequestQueue. If request comes from a RequestList
     * and RequestQueue is present then enqueues it to the queue first.
     *
     * @ignore
     */
    async _fetchNextRequest() {
        if (!this.requestList) return this.requestQueue.fetchNextRequest();
        const request = await this.requestList.fetchNextRequest();
        if (!this.requestQueue) return request;
        if (!request) return this.requestQueue.fetchNextRequest();

        try {
            await this.requestQueue.addRequest(request, { forefront: true });
        } catch (err) {
            // If requestQueue.addRequest() fails here then we must reclaim it back to
            // the RequestList because probably it's not yet in the queue!
            log.exception(err, 'RequestQueue.addRequest() failed, reclaiming request back to the list', { request });
            await this.requestList.reclaimRequest(request);
            return null;
        }
        const [nextRequest] = await Promise.all([
            this.requestQueue.fetchNextRequest(),
            this.requestList.markRequestHandled(request),
        ]);
        return nextRequest;
    }

    /**
     * Wrapper around handleRequestFunction that fetches requests from RequestList/RequestQueue
     * then retries them in a case of an error etc.
     *
     * @ignore
     */
    async _runTaskFunction() {
        const source = this.requestQueue || this.requestList;

        const request = await this._fetchNextRequest();
        if (!request) return;

        try {
            // rejectOnStopPromise rejects when .stop() is called or AutoscaledPool throws.
            // All running tasks are therefore terminated with an error to be reclaimed and retried.
            await Promise.race([this.handleRequestFunction({ request }), this.rejectOnStopPromise]);
            source.markRequestHandled(request);
            this.handledRequestsCount++;
        } catch (err) {
            await this._requestFunctionErrorHandler(err, request, source);
        }
    }

    /**
     * Returns true if some RequestList and RequestQueue have request ready for processing.
     *
     * @ignore
     */
    async _isTaskReadyFunction() {
        const [
            isRequestListEmpty,
            isRequestQueueEmpty,
        ] = await Promise.all([
            this.requestList ? this.requestList.isEmpty() : true,
            this.requestQueue ? this.requestQueue.isEmpty() : true,
        ]);
        // If both are empty, return false, otherwise return true.
        return !(isRequestListEmpty && isRequestQueueEmpty);
    }

    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     *
     * @ignore
     */
    async _defaultIsFinishedFunction() {
        const [
            isRequestListFinished,
            isRequestQueueFinished,
        ] = await Promise.all([
            this.requestList ? this.requestList.isFinished() : true,
            this.requestQueue ? this.requestQueue.isFinished() : true,
        ]);
        // If both are finished, return true, otherwise return false.
        return isRequestListFinished && isRequestQueueFinished;
    }

    /**
     * Handles errors thrown by user provided handleRequestFunction()
     * @param {Error} error
     * @param {Request} request
     * @param {RequestList|RequestQueue} source
     * @return {Boolean} willBeRetried
     * @ingore
     */
    async _requestFunctionErrorHandler(error, request, source) {
        // Handles case where the crawler was deliberately stopped.
        // All running requests are reclaimed and will be retried.
        if (!this.isRunning) return source.reclaimRequest(request);

        // If we use the ignore errors option, we mark request as handled and do not retry.
        if (request.ignoreErrors) {
            log.exception(error, 'BasicCrawler: handleRequestFunction failed, request.ignoreErrors=true so marking the request as handled', { // eslint-disable-line max-len
                url: request.url,
                retryCount: request.retryCount,
            });
            this.handledRequestsCount++;
            return source.markRequestHandled(request);
        }

        // If we got here, it means we actually want to handle the error.
        request.pushErrorMessage(error);

        // Reclaim and retry request if retryCount is not exceeded.
        if (request.retryCount < this.maxRequestRetries) {
            request.retryCount++;
            log.exception(error, 'BasicCrawler: handleRequestFunction failed, reclaiming failed request back to the list or queue', { // eslint-disable-line max-len
                url: request.url,
                retryCount: request.retryCount,
            });
            return source.reclaimRequest(request);
        }

        // This is the final fallback. If we get here, the request failed more than retryCount times and will not be retried anymore.
        log.exception(error, 'BasicCrawler: handleRequestFunction failed, marking failed request as handled', {
            url: request.url,
            retryCount: request.retryCount,
        });

        // Mark the request as failed and do not retry.
        this.handledRequestsCount++;
        await source.markRequestHandled(request);
        return this.handleFailedRequestFunction({ request, error });
    }
}
