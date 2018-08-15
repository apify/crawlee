import Promise from 'bluebird';
import { checkParamOrThrow } from 'apify-client/build/utils';
import _ from 'underscore';
import log from 'apify-shared/log';
import { checkParamPrototypeOrThrow } from 'apify-shared/utilities';
import AutoscaledPool from './autoscaled_pool';
import RequestList from './request_list';
import { RequestQueue, RequestQueueLocal } from './request_queue';
import { isPromise } from './utils';

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
 * @param {Function} [options.handleFailedRequestFunction=({ request, error }) => log.error('Request failed', _.pick(request, 'url', 'uniqueKey'))`]
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
            runTaskFunction: () => {
                if (this.isStopped) return null;

                return this._runTaskFunction();
            },
            isTaskReadyFunction: () => {
                if (isMaxPagesExceeded() || this.isStopped) return Promise.resolve(false);

                return this._isTaskReadyFunction();
            },
            isFinishedFunction: () => {
                if (isMaxPagesExceeded() || this.isStopped) return Promise.resolve(true);

                return isFinishedFunction
                    ? isFinishedFunction()
                    : this._defaultIsFinishedFunction();
            },
            ignoreMainProcess,
        };
        this.autoscaledPool = new AutoscaledPool(this.autoscaledPoolOptions);
    }

    /**
     * Runs the crawler. Returns a promise that gets resolved once all the requests are processed.
     *
     * @return {Promise}
     */
    run() {
        if (this.isStopped) this.autoscaledPool = new AutoscaledPool(this.autoscaledPoolOptions);
        this.isStopped = false;
        return this.autoscaledPool.run();
    }

    /**
     * Stops the crawler by preventing crawls of additional pages. Pages already running are NOT terminated.
     */
    stop() {
        this.isStopped = true;
        this.autoscaledPool.stop();
    }

    /**
     * Fetches request from either RequestList or RequestQueue. If request comes from a RequestList
     * and RequestQueue is present then enqueues it to the queue first.
     *
     * @ignore
     */
    _fetchNextRequest() {
        if (!this.requestList) return this.requestQueue.fetchNextRequest();

        return this.requestList
            .fetchNextRequest()
            .then((request) => {
                if (!this.requestQueue) return request;
                if (!request) return this.requestQueue.fetchNextRequest();

                return this.requestQueue
                    .addRequest(request, { forefront: true })
                    .then(() => {
                        return Promise
                            .all([
                                this.requestQueue.fetchNextRequest(),
                                this.requestList.markRequestHandled(request),
                            ])
                            .then(results => results[0]);
                    }, (err) => {
                        // If requestQueue.addRequest() fails here then we must reclaim it back to
                        // the RequestList because probably it's not yet in the queue!
                        log.exception(err, 'RequestQueue.addRequest() failed, reclaiming request back to queue', { request });

                        // Return null so that we finish immediately.
                        return this.requestList
                            .reclaimRequest(request)
                            .then(() => null);
                    });
            });
    }

    /**
     * Wrapper around handleRequestFunction that fetches requests from RequestList/RequestQueue
     * then retries them in a case of an error etc.
     *
     * @ignore
     */
    _runTaskFunction() {
        const source = this.requestQueue || this.requestList;

        return this._fetchNextRequest()
            .then((request) => {
                if (!request) return;

                let willBeRetried = false;
                const handlePromise = this.handleRequestFunction({ request });
                if (!isPromise(handlePromise)) throw new Error('User provided handleRequestFunction must return a Promise.');

                // NOTE: handlePromise might not be bluebird promise
                return Promise.resolve()
                    .then(() => handlePromise)
                    .then(() => source.markRequestHandled(request))
                    .catch((error) => {
                        if (request.ignoreErrors) {
                            if (!this.isStopped) {
                                log.exception(error, 'BasicCrawler: handleRequestFunction failed, request.ignoreErrors=true so marking the request as handled', { // eslint-disable-line max-len
                                    url: request.url,
                                    retryCount: request.retryCount,
                                });
                            }
                            return source.markRequestHandled(request);
                        }

                        if (!this.isStopped) request.pushErrorMessage(error);

                        // Retry request.
                        if (request.retryCount < this.maxRequestRetries) {
                            if (!this.isStopped) {
                                request.retryCount++;
                                log.exception(error, 'BasicCrawler: handleRequestFunction failed, reclaiming failed request back to the list or queue', { // eslint-disable-line max-len
                                    url: request.url,
                                    retryCount: request.retryCount,
                                });
                            }
                            willBeRetried = true;
                            return source.reclaimRequest(request);
                        }

                        if (!this.isStopped) {
                            log.exception(error, 'BasicCrawler: handleRequestFunction failed, marking failed request as handled', {
                                url: request.url,
                                retryCount: request.retryCount,
                            });
                        }

                        // Mark as failed.
                        return source
                            .markRequestHandled(request)
                            .then(() => this.handleFailedRequestFunction({ request, error }));
                    })
                    .finally(() => {
                        if (!willBeRetried) this.handledRequestsCount++;
                    });
            });
    }

    /**
     * Returns true if some RequestList and RequestQueue have request ready for processing.
     *
     * @ignore
     */
    _isTaskReadyFunction() {
        return Promise
            .resolve()
            .then(() => {
                if (!this.requestList) return true;

                return this.requestList.isEmpty();
            })
            .then((isRequestListEmpty) => {
                if (!isRequestListEmpty || !this.requestQueue) return isRequestListEmpty;

                return this.requestQueue.isEmpty();
            })
            .then(areBothEmpty => !areBothEmpty);
    }

    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     *
     * @ignore
     */
    _defaultIsFinishedFunction() {
        const promises = [];

        if (this.requestList) promises.push(this.requestList.isFinished());
        if (this.requestQueue) promises.push(this.requestQueue.isFinished());

        return Promise
            .all(promises)
            .then((results) => {
                return _.all(results);
            });
    }
}
