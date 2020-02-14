import { checkParamOrThrow } from 'apify-client/build/utils';
import { ACTOR_EVENT_NAMES } from 'apify-shared/consts';
import log from 'apify-shared/log';
import { checkParamPrototypeOrThrow } from 'apify-shared/utilities';
import _ from 'underscore';
import AutoscaledPool from '../autoscaling/autoscaled_pool'; // eslint-disable-line import/no-duplicates
import { RequestList } from '../request_list';
import { RequestQueue, RequestQueueLocal } from '../request_queue';
import events from '../events';
import { openSessionPool } from '../session_pool/session_pool'; // eslint-disable-line import/no-duplicates
import Statistics from './statistics';
import { addTimeoutToPromise } from '../utils';

// TYPE IMPORTS
/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { AutoscaledPoolOptions } from '../autoscaling/autoscaled_pool';
import Request from '../request';
import { Session } from '../session_pool/session';
import { SessionPoolOptions } from '../session_pool/session_pool';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

/**
 * Since there's no set number of seconds before the container is terminated after
 * a migration event, we need some reasonable number to use for RequestList persistence.
 * Once a migration event is received, the Crawler will be paused and it will wait for
 * this long before persisting the RequestList state. This should allow most healthy
 * requests to finish and be marked as handled, thus lowering the amount of duplicate
 * results after migration.
 *
 * @type {number}
 * @ignore
 */
const SAFE_MIGRATION_WAIT_MILLIS = 20000;

const DEFAULT_OPTIONS = {
    maxRequestRetries: 3,
    handleRequestTimeoutSecs: 60,
    handleFailedRequestFunction: ({ request }) => {
        const details = _.pick(request, 'id', 'url', 'method', 'uniqueKey');
        log.error('BasicCrawler: Request failed and reached maximum retries', details);
    },
    autoscaledPoolOptions: {},
    sessionPoolOptions: {}, // We could add sessionPool true/false config to use/not use SessionPool.
    useSessionPool: false,
};

/**
 * @typedef {Object} BasicCrawlerOptions
 * @property {HandleRequest} handleRequestFunction
 *   User-provided function that performs the logic of the crawler. It is called for each URL to crawl.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request,
 *   autoscaledPool: AutoscaledPool
 * }
 * ```
 *   where the {@link Request} instance represents the URL to crawl.
 *
 *   The function must return a promise, which is then awaited by the crawler.
 *
 *   If the function throws an exception, the crawler will try to re-crawl the
 *   request later, up to `option.maxRequestRetries` times.
 *   If all the retries fail, the crawler calls the function
 *   provided to the `handleFailedRequestFunction` parameter.
 *   To make this work, you should **always**
 *   let your function throw exceptions rather than catch them.
 *   The exceptions are logged to the request using the
 *   [`request.pushErrorMessage`](request#Request+pushErrorMessage) function.
 * @property {RequestList} [requestList]
 *   Static list of URLs to be processed.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {RequestQueue} [requestQueue]
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {number} [handleRequestTimeoutSecs=60]
 *   Timeout in which the function passed as `handleRequestFunction` needs to finish, in seconds.
 * @property {HandleFailedRequest} [handleFailedRequestFunction]
 *   A function to handle requests that failed more than `option.maxRequestRetries` times.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request,
 *   error: Error,
 * }
 * ```
 *   where the {@link Request} instance corresponds to the failed request, and the `Error` instance
 *   represents the last error thrown during processing of the request.
 *
 *   See
 *   <a href="https://github.com/apifytech/apify-js/blob/master/src/crawlers/basic_crawler.js#L11" target="_blank">source code</a>
 *   for the default implementation of this function.
 * @property {Number} [maxRequestRetries=3]
 *   Indicates how many times the request is retried if [`handleRequestFunction()`](#new_BasicCrawler_new) fails.
 * @property {Number} [maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @property {AutoscaledPoolOptions} [autoscaledPoolOptions]
 *   Custom options passed to the underlying {@link AutoscaledPool} constructor.
 *   Note that the `runTaskFunction` and `isTaskReadyFunction` options
 *   are provided by `BasicCrawler` and cannot be overridden.
 *   However, you can provide a custom implementation of `isFinishedFunction`.
 * @property {Number} [minConcurrency=1]
 *   Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 *
 *   *WARNING:* If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
 *   If you're not sure, just keep the default value and the concurrency will scale up automatically.
 * @property {Number} [maxConcurrency=1000]
 *   Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 * @property {Boolean} [useSessionPool=false]
 *   If set to true. Basic crawler will initialize the  {@link SessionPool} with the corresponding `sessionPoolOptions`.
 *   The session instance will be than available in the `handleRequestFunction`.
 * @property {SessionPoolOptions} [sessionPoolOptions] The configuration options for {SessionPool} to use.
 */

/**
 * Provides a simple framework for parallel crawling of web pages.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * `BasicCrawler` is a low-level tool that requires the user to implement the page
 * download and data extraction functionality themselves.
 * If you want a crawler that already facilitates this functionality,
 * please consider using {@link PuppeteerCrawler} or {@link CheerioCrawler}.
 *
 * `BasicCrawler` invokes the user-provided [`handleRequestFunction()`](#new_BasicCrawler_new)
 * for each {@link Request} object, which represents a single URL to crawl.
 * The {@link Request} objects are fed from the {@link RequestList} or the {@link RequestQueue}
 * instances provided by the [`requestList`](#new_BasicCrawler_new) or [`requestQueue`](#new_BasicCrawler_new)
 * constructor options, respectively.
 *
 * If both [`requestList`](#new_BasicCrawler_new) and [`requestQueue`](#new_BasicCrawler_new) options are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes if there are no more {@link Request} objects to crawl.
 *
 * New requests are only dispatched when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the `autoscaledPoolOptions`
 * parameter of the `BasicCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPool} options are available directly in the `BasicCrawler` constructor.
 *
 * **Example usage:**
 *
 * ```javascript
 * const rp = require('request-promise-native');
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
 * @property {AutoscaledPool} autoscaledPool
 *  A reference to the underlying {@link AutoscaledPool} class that manages the concurrency of the crawler.
 *  Note that this property is only initialized after calling the {@link BasicCrawler#run} function.
 *  You can use it to change the concurrency settings on the fly,
 *  to pause the crawler by calling {@link AutoscaledPool#pause}
 *  or to abort it by calling {@link AutoscaledPool#abort}.
 */
class BasicCrawler {
    /**
     * @param {BasicCrawlerOptions} options
     */
    constructor(options) {
        const {
            requestList,
            requestQueue,
            handleRequestFunction,
            handleRequestTimeoutSecs,
            handleFailedRequestFunction,
            maxRequestRetries,
            maxRequestsPerCrawl,
            autoscaledPoolOptions,
            sessionPoolOptions,
            useSessionPool,

            // AutoscaledPool shorthands
            minConcurrency,
            maxConcurrency,
        } = _.defaults({}, options, DEFAULT_OPTIONS);

        checkParamPrototypeOrThrow(requestList, 'options.requestList', RequestList, 'Apify.RequestList', true);
        checkParamPrototypeOrThrow(requestQueue, 'options.requestQueue', [RequestQueue, RequestQueueLocal], 'Apify.RequestQueue', true);
        checkParamOrThrow(handleRequestFunction, 'options.handleRequestFunction', 'Function');
        checkParamOrThrow(handleRequestTimeoutSecs, 'options.handleRequestTimeoutSecs', 'Number');
        checkParamOrThrow(handleFailedRequestFunction, 'options.handleFailedRequestFunction', 'Function');
        checkParamOrThrow(maxRequestRetries, 'options.maxRequestRetries', 'Number');
        checkParamOrThrow(maxRequestsPerCrawl, 'options.maxRequestsPerCrawl', 'Maybe Number');
        checkParamOrThrow(autoscaledPoolOptions, 'options.autoscaledPoolOptions', 'Object');
        checkParamOrThrow(sessionPoolOptions, 'options.sessionPoolOptions', 'Object');
        checkParamOrThrow(useSessionPool, 'options.useSessionPool', 'Boolean');

        if (!requestList && !requestQueue) {
            throw new Error('At least one of the parameters "options.requestList" and "options.requestQueue" must be provided!');
        }

        this.requestList = requestList;
        this.requestQueue = requestQueue;
        this.handleRequestFunction = handleRequestFunction;
        this.handleRequestTimeoutMillis = handleRequestTimeoutSecs * 1000;
        this.handleFailedRequestFunction = handleFailedRequestFunction;
        this.maxRequestRetries = maxRequestRetries;
        this.handledRequestsCount = 0;
        this.stats = new Statistics({ logMessage: 'Crawler request statistics:' });
        this.sessionPoolOptions = sessionPoolOptions;
        this.useSessionPool = useSessionPool;

        let shouldLogMaxPagesExceeded = true;
        const isMaxPagesExceeded = () => maxRequestsPerCrawl && maxRequestsPerCrawl <= this.handledRequestsCount;

        const { isFinishedFunction } = autoscaledPoolOptions;

        const basicCrawlerAutoscaledPoolConfiguration = {
            minConcurrency,
            maxConcurrency,
            runTaskFunction: this._runTaskFunction.bind(this),
            isTaskReadyFunction: async () => {
                if (isMaxPagesExceeded()) {
                    if (shouldLogMaxPagesExceeded) {
                        log.info('BasicCrawler: Crawler reached the maxRequestsPerCrawl limit of '
                            + `${maxRequestsPerCrawl} requests and will shut down soon. Requests that are in progress will be allowed to finish.`);
                        shouldLogMaxPagesExceeded = false;
                    }
                    return false;
                }

                return this._isTaskReadyFunction();
            },
            isFinishedFunction: async () => {
                if (isMaxPagesExceeded()) {
                    log.info(`BasicCrawler: Earlier, the crawler reached the maxRequestsPerCrawl limit of ${maxRequestsPerCrawl} requests `
                        + 'and all requests that were in progress at that time have now finished. '
                        + `In total, the crawler processed ${this.handledRequestsCount} requests and will shut down.`);
                    return true;
                }

                const isFinished = isFinishedFunction
                    ? await isFinishedFunction()
                    : await this._defaultIsFinishedFunction();

                if (isFinished) {
                    const reason = isFinishedFunction
                        ? 'BasicCrawler: Crawler\'s custom isFinishedFunction() returned true, the crawler will shut down.'
                        : 'BasicCrawler: All the requests from request list and/or request queue have been processed, the crawler will shut down.';
                    log.info(reason);
                }

                return isFinished;
            },
        };

        this.autoscaledPoolOptions = _.defaults({}, basicCrawlerAutoscaledPoolConfiguration, autoscaledPoolOptions);

        this.isRunningPromise = null;

        // Attach a listener to handle migration events gracefully.
        events.on(ACTOR_EVENT_NAMES.MIGRATING, this._pauseOnMigration.bind(this));
    }

    /**
     * Runs the crawler. Returns a promise that gets resolved once all the requests are processed.
     *
     * @return {Promise<void>}
     */
    async run() {
        if (this.isRunningPromise) return this.isRunningPromise;

        // Initialize AutoscaledPool before awaiting _loadHandledRequestCount(),
        // so that the caller can get a reference to it before awaiting the promise returned from run()
        // (otherwise there would be no way)
        this.autoscaledPool = new AutoscaledPool(this.autoscaledPoolOptions);

        if (this.useSessionPool) {
            this.sessionPool = await openSessionPool(this.sessionPoolOptions);
        }

        await this._loadHandledRequestCount();

        this.isRunningPromise = this.autoscaledPool.run();
        this.stats.startLogging();
        try {
            await this.isRunningPromise;
        } finally {
            if (this.useSessionPool) {
                this.sessionPool.teardown();
            }

            this.stats.stopLogging();
            const finalStats = this.stats.getCurrent();
            log.info('Crawler final request statistics:', finalStats);
        }
    }

    async _pauseOnMigration() {
        await this.autoscaledPool.pause(SAFE_MIGRATION_WAIT_MILLIS)
            .catch((err) => {
                if (err.message.includes('running tasks did not finish')) {
                    log.error('BasicCrawler: The crawler was paused due to migration to another host, '
                        + 'but some requests did not finish in time. Those requests\' results may be duplicated.');
                } else {
                    throw err;
                }
            });
        if (this.requestList) {
            if (await this.requestList.isFinished()) return;
            await this.requestList.persistState()
                .catch((err) => {
                    if (err.message.includes('Cannot persist state.')) {
                        log.error('BasicCrawler: The crawler attempted to persist its request list\'s state and failed due to missing or '
                            + 'invalid config. Make sure to use either Apify.openRequestList() or the "stateKeyPrefix" option of RequestList '
                            + 'constructor to ensure your crawling state is persisted through host migrations and restarts.');
                    } else {
                        log.exception(err, 'BasicCrawler: An unexpected error occured when the crawler '
                            + 'attempted to persist its request list\'s state.');
                    }
                });
        }
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
     * then retries them in a case of an error, etc.
     *
     * @ignore
     */
    async _runTaskFunction() {
        const source = this.requestQueue || this.requestList;

        let request;
        let session;

        if (this.useSessionPool) {
            [request, session] = await Promise.all([this._fetchNextRequest(), this.sessionPool.getSession()]);
        } else {
            request = await this._fetchNextRequest();
        }

        if (!request) return;

        // Reset loadedUrl so an old one is not carried over to retries.
        request.loadedUrl = null;

        const statisticsId = request.id || request.uniqueKey;
        this.stats.startJob(statisticsId);
        try {
            await addTimeoutToPromise(
                this.handleRequestFunction({ request, autoscaledPool: this.autoscaledPool, session }),
                this.handleRequestTimeoutMillis,
                `BasicCrawler: handleRequestFunction timed out after ${this.handleRequestTimeoutMillis / 1000} seconds.`,
            );
            await source.markRequestHandled(request);
            this.stats.finishJob(statisticsId);
            this.handledRequestsCount++;

            // reclaim session if request finishes successfully
            if (session) session.markGood();
        } catch (err) {
            try {
                await this._requestFunctionErrorHandler(err, request, source);
            } catch (secondaryError) {
                log.exception(secondaryError, 'BasicCrawler: runTaskFunction error handler threw an exception. '
                    + 'This places the crawler and its underlying storages into an unknown state and crawling will be terminated. '
                    + 'This may have happened due to an internal error of Apify\'s API or due to a misconfigured crawler. '
                    + 'If you are sure that there is no error in your code, selecting "Restart on error" in the actor\'s settings'
                    + 'will make sure that the run continues where it left off, if programmed to handle restarts correctly.');
                throw secondaryError;
            }
        }
    }

    /**
     * Returns true if either RequestList or RequestQueue have a request ready for processing.
     *
     * @ignore
     */
    async _isTaskReadyFunction() {
        // First check RequestList, since it's only in memory.
        const isRequestListEmpty = this.requestList ? (await this.requestList.isEmpty()) : true;
        // If RequestList is not empty, task is ready, no reason to check RequestQueue.
        if (!isRequestListEmpty) return true;
        // If RequestQueue is not empty, task is ready, return true, otherwise false.
        return this.requestQueue ? !(await this.requestQueue.isEmpty()) : false;
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
     * @return {Promise<Boolean>} willBeRetried
     * @ignore
     */
    async _requestFunctionErrorHandler(error, request, source) {
        request.pushErrorMessage(error);

        // Reclaim and retry request if flagged as retriable and retryCount is not exceeded.
        if (!request.noRetry && request.retryCount < this.maxRequestRetries) {
            request.retryCount++;
            log.exception(
                error,
                'BasicCrawler: handleRequestFunction failed, reclaiming failed request back to the list or queue',
                _.pick(request, 'url', 'retryCount', 'id'),
            );
            return source.reclaimRequest(request);
        }

        // If we get here, the request is either not retriable
        // or failed more than retryCount times and will not be retried anymore.
        // Mark the request as failed and do not retry.
        this.handledRequestsCount++;
        await source.markRequestHandled(request);
        this.stats.failJob(request.id || request.url);
        return this.handleFailedRequestFunction({ request, error }); // This function prints an error message.
    }

    /**
     * Updates handledRequestsCount from possibly stored counts,
     * usually after worker migration. Since one of the stores
     * needs to have priority when both are present,
     * it is the request queue, because generally, the request
     * list will first be dumped into the queue and then left
     * empty.
     *
     * @return {Promise<void>}
     * @ignore
     */
    async _loadHandledRequestCount() {
        if (this.requestQueue) {
            this.handledRequestsCount = await this.requestQueue.handledCount();
        } else if (this.requestList) {
            this.handledRequestsCount = this.requestList.handledCount();
        }
    }
}

export default BasicCrawler;

/**
 * @callback HandleRequest
 * @param {HandleRequestInputs} inputs Arguments passed to this callback.
 * @returns {Promise<void>}
 */
/**
 * @typedef HandleRequestInputs
 * @property {Request} request The original {Request} object.
 * @property {AutoscaledPool} autoscaledPool
 * @property {Session} [session]
 */

/**
 * @callback HandleFailedRequest
 * @param {HandleFailedRequestInput} inputs Arguments passed to this callback.
 * @returns {void|Promise<void>}
 */
/**
 * @typedef HandleFailedRequestInput
 * @property {Request} request The original {Request} object.
 * @property {Error} error The Error thrown by `handleRequestFunction`.
 */
