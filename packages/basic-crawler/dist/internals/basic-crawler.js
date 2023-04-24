"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBasicRouter = exports.BasicCrawler = void 0;
const tslib_1 = require("tslib");
const log_1 = tslib_1.__importStar(require("@apify/log"));
const timeout_1 = require("@apify/timeout");
const utilities_1 = require("@apify/utilities");
const core_1 = require("@crawlee/core");
const got_scraping_1 = require("got-scraping");
const utils_1 = require("@crawlee/utils");
const ow_1 = tslib_1.__importStar(require("ow"));
/**
 * Since there's no set number of seconds before the container is terminated after
 * a migration event, we need some reasonable number to use for RequestList persistence.
 * Once a migration event is received, the crawler will be paused, and it will wait for
 * this long before persisting the RequestList state. This should allow most healthy
 * requests to finish and be marked as handled, thus lowering the amount of duplicate
 * results after migration.
 * @ignore
 */
const SAFE_MIGRATION_WAIT_MILLIS = 20000;
/**
 * Provides a simple framework for parallel crawling of web pages.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * `BasicCrawler` is a low-level tool that requires the user to implement the page
 * download and data extraction functionality themselves.
 * If we want a crawler that already facilitates this functionality,
 * we should consider using {@apilink CheerioCrawler}, {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler}.
 *
 * `BasicCrawler` invokes the user-provided {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`}
 * for each {@apilink Request} object, which represents a single URL to crawl.
 * The {@apilink Request} objects are fed from the {@apilink RequestList} or {@apilink RequestQueue}
 * instances provided by the {@apilink BasicCrawlerOptions.requestList|`requestList`} or {@apilink BasicCrawlerOptions.requestQueue|`requestQueue`}
 * constructor options, respectively. If neither `requestList` nor `requestQueue` options are provided,
 * the crawler will open the default request queue either when the {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} function is called,
 * or if `requests` parameter (representing the initial requests) of the {@apilink BasicCrawler.run|`crawler.run()`} function is provided.
 *
 * If both {@apilink BasicCrawlerOptions.requestList|`requestList`} and {@apilink BasicCrawlerOptions.requestQueue|`requestQueue`} options are used,
 * the instance first processes URLs from the {@apilink RequestList} and automatically enqueues all of them
 * to the {@apilink RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes if there are no more {@apilink Request} objects to crawl.
 *
 * New requests are only dispatched when there is enough free CPU and memory available,
 * using the functionality provided by the {@apilink AutoscaledPool} class.
 * All {@apilink AutoscaledPool} configuration options can be passed to the {@apilink BasicCrawlerOptions.autoscaledPoolOptions|`autoscaledPoolOptions`}
 * parameter of the `BasicCrawler` constructor.
 * For user convenience, the {@apilink AutoscaledPoolOptions.minConcurrency|`minConcurrency`} and
 * {@apilink AutoscaledPoolOptions.maxConcurrency|`maxConcurrency`} options of the
 * underlying {@apilink AutoscaledPool} constructor are available directly in the `BasicCrawler` constructor.
 *
 * **Example usage:**
 *
 * ```javascript
 * import { BasicCrawler, Dataset } from 'crawlee';
 *
 * // Create a crawler instance
 * const crawler = new BasicCrawler({
 *     async requestHandler({ request, sendRequest }) {
 *         // 'request' contains an instance of the Request class
 *         // Here we simply fetch the HTML of the page and store it to a dataset
 *         const { body } = await sendRequest({
 *             url: request.url,
 *             method: request.method,
 *             body: request.payload,
 *             headers: request.headers,
 *         });
 *
 *         await Dataset.pushData({
 *             url: request.url,
 *             html: body,
 *         })
 *     },
 * });
 *
 * // Enqueue the initial requests and run the crawler
 * await crawler.run([
 *     'http://www.example.com/page-1',
 *     'http://www.example.com/page-2',
 * ]);
 * ```
 * @category Crawlers
 */
class BasicCrawler {
    /**
     * All `BasicCrawler` parameters are passed via an options object.
     */
    constructor(options = {}, config = core_1.Configuration.getGlobalConfig()) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        /**
         * A reference to the underlying {@apilink Statistics} class that collects and logs run statistics for requests.
         */
        Object.defineProperty(this, "stats", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * A reference to the underlying {@apilink RequestList} class that manages the crawler's {@apilink Request|requests}.
         * Only available if used by the crawler.
         */
        Object.defineProperty(this, "requestList", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
         * A reference to the underlying {@apilink RequestQueue} class that manages the crawler's {@apilink Request|requests}.
         * Only available if used by the crawler.
         */
        Object.defineProperty(this, "requestQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * A reference to the underlying {@apilink SessionPool} class that manages the crawler's {@apilink Session|sessions}.
         * Only available if used by the crawler.
         */
        Object.defineProperty(this, "sessionPool", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * A reference to the underlying {@apilink AutoscaledPool} class that manages the concurrency of the crawler.
         * > *NOTE:* This property is only initialized after calling the {@apilink BasicCrawler.run|`crawler.run()`} function.
         * We can use it to change the concurrency settings on the fly,
         * to pause the crawler by calling {@apilink AutoscaledPool.pause|`autoscaledPool.pause()`}
         * or to abort it by calling {@apilink AutoscaledPool.abort|`autoscaledPool.abort()`}.
         */
        Object.defineProperty(this, "autoscaledPool", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Default {@apilink Router} instance that will be used if we don't specify any {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`}.
         * See {@apilink Router.addHandler|`router.addHandler()`} and {@apilink Router.addDefaultHandler|`router.addDefaultHandler()`}.
         */
        Object.defineProperty(this, "router", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: core_1.Router.create()
        });
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "requestHandler", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "errorHandler", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "failedRequestHandler", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "requestHandlerTimeoutMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "internalTimeoutMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxRequestRetries", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "handledRequestsCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "loggingInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sessionPoolOptions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "useSessionPool", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "crawlingContexts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "autoscaledPoolOptions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "events", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_closeEvents", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        (0, ow_1.default)(options, 'BasicCrawlerOptions', ow_1.default.object.exactShape(BasicCrawler.optionsShape));
        const { requestList, requestQueue, maxRequestRetries = 3, maxRequestsPerCrawl, autoscaledPoolOptions = {}, keepAlive, sessionPoolOptions = {}, useSessionPool = true, 
        // AutoscaledPool shorthands
        minConcurrency, maxConcurrency, maxRequestsPerMinute, 
        // internal
        log = log_1.default.child({ prefix: this.constructor.name }), 
        // Old and new request handler methods
        handleRequestFunction, requestHandler, handleRequestTimeoutSecs, requestHandlerTimeoutSecs, errorHandler, handleFailedRequestFunction, failedRequestHandler, loggingInterval = 60, } = options;
        this.requestList = requestList;
        this.requestQueue = requestQueue;
        this.log = log;
        this.loggingInterval = loggingInterval;
        this.events = config.getEventManager();
        this._handlePropertyNameChange({
            newName: 'requestHandler',
            oldName: 'handleRequestFunction',
            propertyKey: 'requestHandler',
            newProperty: requestHandler,
            oldProperty: handleRequestFunction,
            allowUndefined: true, // fallback to the default router
        });
        if (!this.requestHandler) {
            this.requestHandler = this.router;
        }
        this.errorHandler = errorHandler;
        this._handlePropertyNameChange({
            newName: 'failedRequestHandler',
            oldName: 'handleFailedRequestFunction',
            propertyKey: 'failedRequestHandler',
            newProperty: failedRequestHandler,
            oldProperty: handleFailedRequestFunction,
            allowUndefined: true,
        });
        let newRequestHandlerTimeout;
        if (!handleRequestTimeoutSecs) {
            if (!requestHandlerTimeoutSecs) {
                newRequestHandlerTimeout = 60000;
            }
            else {
                newRequestHandlerTimeout = requestHandlerTimeoutSecs * 1000;
            }
        }
        else if (requestHandlerTimeoutSecs) {
            newRequestHandlerTimeout = requestHandlerTimeoutSecs * 1000;
        }
        this._handlePropertyNameChange({
            newName: 'requestHandlerTimeoutSecs',
            oldName: 'handleRequestTimeoutSecs',
            propertyKey: 'requestHandlerTimeoutMillis',
            newProperty: newRequestHandlerTimeout,
            oldProperty: handleRequestTimeoutSecs ? handleRequestTimeoutSecs * 1000 : undefined,
        });
        const tryEnv = (val) => (val == null ? null : +val);
        // allow at least 5min for internal timeouts
        this.internalTimeoutMillis = tryEnv(process.env.CRAWLEE_INTERNAL_TIMEOUT) ?? Math.max(this.requestHandlerTimeoutMillis * 2, 300e3);
        // override the default internal timeout of request queue to respect `requestHandlerTimeoutMillis`
        if (this.requestQueue) {
            this.requestQueue.internalTimeoutMillis = this.internalTimeoutMillis;
        }
        this.maxRequestRetries = maxRequestRetries;
        this.handledRequestsCount = 0;
        this.stats = new core_1.Statistics({ logMessage: `${log.getOptions().prefix} request statistics:`, config });
        this.sessionPoolOptions = {
            ...sessionPoolOptions,
            log,
        };
        this.useSessionPool = useSessionPool;
        this.crawlingContexts = new Map();
        const maxSignedInteger = 2 ** 31 - 1;
        if (this.requestHandlerTimeoutMillis > maxSignedInteger) {
            log.warning(`requestHandlerTimeoutMillis ${this.requestHandlerTimeoutMillis}`
                + `does not fit a signed 32-bit integer. Limiting the value to ${maxSignedInteger}`);
            this.requestHandlerTimeoutMillis = maxSignedInteger;
        }
        let shouldLogMaxPagesExceeded = true;
        const isMaxPagesExceeded = () => maxRequestsPerCrawl && maxRequestsPerCrawl <= this.handledRequestsCount;
        let { isFinishedFunction } = autoscaledPoolOptions;
        // override even if `isFinishedFunction` provided by user - `keepAlive` has higher priority
        if (keepAlive) {
            isFinishedFunction = async () => false;
        }
        const basicCrawlerAutoscaledPoolConfiguration = {
            minConcurrency: minConcurrency ?? autoscaledPoolOptions?.minConcurrency,
            maxConcurrency: maxConcurrency ?? autoscaledPoolOptions?.maxConcurrency,
            maxTasksPerMinute: maxRequestsPerMinute ?? autoscaledPoolOptions?.maxTasksPerMinute,
            runTaskFunction: this._runTaskFunction.bind(this),
            isTaskReadyFunction: async () => {
                if (isMaxPagesExceeded()) {
                    if (shouldLogMaxPagesExceeded) {
                        log.info('Crawler reached the maxRequestsPerCrawl limit of '
                            + `${maxRequestsPerCrawl} requests and will shut down soon. Requests that are in progress will be allowed to finish.`);
                        shouldLogMaxPagesExceeded = false;
                    }
                    return false;
                }
                return this._isTaskReadyFunction();
            },
            isFinishedFunction: async () => {
                if (isMaxPagesExceeded()) {
                    log.info(`Earlier, the crawler reached the maxRequestsPerCrawl limit of ${maxRequestsPerCrawl} requests `
                        + 'and all requests that were in progress at that time have now finished. '
                        + `In total, the crawler processed ${this.handledRequestsCount} requests and will shut down.`);
                    return true;
                }
                const isFinished = isFinishedFunction
                    ? await isFinishedFunction()
                    : await this._defaultIsFinishedFunction();
                if (isFinished) {
                    const reason = isFinishedFunction
                        ? 'Crawler\'s custom isFinishedFunction() returned true, the crawler will shut down.'
                        : 'All requests from the queue have been processed, the crawler will shut down.';
                    log.info(reason);
                }
                return isFinished;
            },
            log,
        };
        this.autoscaledPoolOptions = { ...autoscaledPoolOptions, ...basicCrawlerAutoscaledPoolConfiguration };
    }
    setStatusMessage(message, options = {}) {
        let { level = log_1.LogLevel.INFO, } = options;
        const levelNames = {
            [log_1.LogLevel.DEBUG]: 'debug',
            [log_1.LogLevel.INFO]: 'info',
            [log_1.LogLevel.WARNING]: 'warning',
            [log_1.LogLevel.ERROR]: 'error',
        };
        if (!(level in levelNames)) {
            level = log_1.LogLevel.INFO;
        }
        this.log[levelNames[level]](`${options.isStatusMessageTerminal ? 'Terminal status message' : 'Status message'}: ${message}`);
        const client = this.config.getStorageClient();
        return client.setStatusMessage?.(message, options);
    }
    getPeriodicLogger() {
        let previousState = { ...this.stats.state };
        const getOperationMode = () => {
            const { requestsFailed } = this.stats.state;
            const { requestsFailed: previousRequestsFailed } = previousState;
            previousState = { ...this.stats.state };
            if (requestsFailed - previousRequestsFailed > 0) {
                return 'ERROR';
            }
            return 'REGULAR';
        };
        const log = async () => {
            const operationMode = getOperationMode();
            if (operationMode === 'ERROR') {
                // eslint-disable-next-line max-len
                await this.setStatusMessage(`Experiencing problems, ${this.stats.state.requestsFailed - previousState.requestsFailed || this.stats.state.requestsFailed} errors in the past ${this.loggingInterval} seconds.`, { level: log_1.LogLevel.WARNING });
            }
            else {
                const total = this.requestQueue?.assumedTotalCount || this.requestList?.length();
                // eslint-disable-next-line max-len
                await this.setStatusMessage(`Crawled ${this.stats.state.requestsFinished}${total ? `/${total}` : ''} pages, ${this.stats.state.requestsFailed} errors.`);
            }
        };
        const interval = setInterval(log, this.loggingInterval * 1e3);
        return { log, stop: () => clearInterval(interval) };
    }
    /**
     * Runs the crawler. Returns a promise that gets resolved once all the requests are processed.
     * We can use the `requests` parameter to enqueue the initial requests - it is a shortcut for
     * running {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} before the {@apilink BasicCrawler.run|`crawler.run()`}.
     *
     * @param [requests] The requests to add
     * @param [options] Options for the request queue
     */
    async run(requests, options) {
        await (0, core_1.purgeDefaultStorages)();
        if (requests) {
            await this.addRequests(requests, options);
        }
        await this._init();
        await this.stats.startCapturing();
        const periodicLogger = this.getPeriodicLogger();
        const sigintHandler = async () => {
            this.log.warning('Pausing... Press CTRL+C again to force exit. To resume, do: CRAWLEE_PURGE_ON_START=0 npm start');
            await this._pauseOnMigration();
            await this.autoscaledPool.abort();
        };
        // Attach a listener to handle migration and aborting events gracefully.
        const boundPauseOnMigration = this._pauseOnMigration.bind(this);
        process.once('SIGINT', sigintHandler);
        this.events.on("migrating" /* EventType.MIGRATING */, boundPauseOnMigration);
        this.events.on("aborting" /* EventType.ABORTING */, boundPauseOnMigration);
        try {
            this.log.info('Starting the crawl');
            await this.autoscaledPool.run();
        }
        finally {
            await this.teardown();
            await this.stats.stopCapturing();
            process.off('SIGINT', sigintHandler);
            this.events.off("migrating" /* EventType.MIGRATING */, boundPauseOnMigration);
            this.events.off("aborting" /* EventType.ABORTING */, boundPauseOnMigration);
        }
        const finalStats = this.stats.calculate();
        const stats = {
            requestsFinished: this.stats.state.requestsFinished,
            requestsFailed: this.stats.state.requestsFailed,
            retryHistogram: this.stats.requestRetryHistogram,
            ...finalStats,
        };
        this.log.info('Crawl finished. Final request statistics:', stats);
        if (this.stats.errorTracker.total !== 0) {
            const prettify = ([count, info]) => `${count}x: ${info.at(-1).trim()} (${info[0]})`;
            this.log.info(`Error analysis:`, {
                totalErrors: this.stats.errorTracker.total,
                uniqueErrors: this.stats.errorTracker.getUniqueErrorCount(),
                mostCommonErrors: this.stats.errorTracker.getMostPopularErrors(3).map(prettify),
            });
        }
        const client = this.config.getStorageClient();
        if (client.teardown) {
            let finished = false;
            setTimeout(() => {
                if (!finished) {
                    this.log.info('Waiting for the storage to write its state to file system.');
                }
            }, 1000);
            await client.teardown();
            finished = true;
        }
        periodicLogger.stop();
        // eslint-disable-next-line max-len
        await this.setStatusMessage(`Finished! Total ${this.stats.state.requestsFinished + this.stats.state.requestsFailed} requests: ${this.stats.state.requestsFinished} succeeded, ${this.stats.state.requestsFailed} failed.`, { isStatusMessageTerminal: true });
        return stats;
    }
    async getRequestQueue() {
        this.requestQueue ?? (this.requestQueue = await core_1.RequestQueue.open());
        return this.requestQueue;
    }
    async useState(defaultValue = {}) {
        const kvs = await core_1.KeyValueStore.open(null, { config: this.config });
        return kvs.getAutoSavedValue(BasicCrawler.CRAWLEE_STATE_KEY, defaultValue);
    }
    /**
     * Adds requests to be processed by the crawler
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    async addRequests(requests, options = {}) {
        (0, ow_1.default)(requests, ow_1.default.array.ofType(ow_1.default.any(ow_1.default.string, ow_1.default.object.partialShape({
            url: ow_1.default.string,
            id: ow_1.default.undefined,
        }))));
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            forefront: ow_1.default.optional.boolean,
            waitForAllRequestsToBeAdded: ow_1.default.optional.boolean,
        }));
        const requestQueue = await this.getRequestQueue();
        const builtRequests = (0, core_1.createRequests)(requests);
        const attemptToAddToQueueAndAddAnyUnprocessed = async (providedRequests) => {
            const resultsToReturn = [];
            const apiResult = await requestQueue.addRequests(providedRequests, { forefront: options.forefront });
            resultsToReturn.push(...apiResult.processedRequests);
            if (apiResult.unprocessedRequests.length) {
                await (0, utils_1.sleep)(1000);
                resultsToReturn.push(...await attemptToAddToQueueAndAddAnyUnprocessed(providedRequests.filter((r) => !apiResult.processedRequests.some((pr) => pr.uniqueKey === r.uniqueKey))));
            }
            return resultsToReturn;
        };
        const initialChunk = builtRequests.splice(0, 1000);
        // Add initial batch of 1000 to process them right away
        const addedRequests = await attemptToAddToQueueAndAddAnyUnprocessed(initialChunk);
        // If we have no more requests to add, return early
        if (!builtRequests.length) {
            return {
                addedRequests,
                waitForAllRequestsToBeAdded: Promise.resolve([]),
            };
        }
        // eslint-disable-next-line no-async-promise-executor
        const promise = new Promise(async (resolve) => {
            const chunks = (0, utils_1.chunk)(builtRequests, 1000);
            const finalAddedRequests = [];
            for (const requestChunk of chunks) {
                finalAddedRequests.push(...await attemptToAddToQueueAndAddAnyUnprocessed(requestChunk));
                await (0, utils_1.sleep)(1000);
            }
            resolve(finalAddedRequests);
        });
        // If the user wants to wait for all the requests to be added, we wait for the promise to resolve for them
        if (options.waitForAllRequestsToBeAdded) {
            addedRequests.push(...await promise);
        }
        return {
            addedRequests,
            waitForAllRequestsToBeAdded: promise,
        };
    }
    async _init() {
        if (!this.events.isInitialized()) {
            await this.events.init();
            this._closeEvents = true;
        }
        // Initialize AutoscaledPool before awaiting _loadHandledRequestCount(),
        // so that the caller can get a reference to it before awaiting the promise returned from run()
        // (otherwise there would be no way)
        this.autoscaledPool = new core_1.AutoscaledPool(this.autoscaledPoolOptions, this.config);
        if (this.useSessionPool) {
            this.sessionPool = await core_1.SessionPool.open(this.sessionPoolOptions);
            // Assuming there are not more than 20 browsers running at once;
            this.sessionPool.setMaxListeners(20);
        }
        await this._loadHandledRequestCount();
    }
    async _runRequestHandler(crawlingContext) {
        await this.requestHandler(crawlingContext);
    }
    /**
     * Handles blocked request
     */
    _throwOnBlockedRequest(session, statusCode) {
        const isBlocked = session.retireOnBlockedStatusCodes(statusCode);
        if (isBlocked) {
            throw new Error(`Request blocked - received ${statusCode} status code.`);
        }
    }
    async _pauseOnMigration() {
        if (this.autoscaledPool) {
            // if run wasn't called, this is going to crash
            await this.autoscaledPool.pause(SAFE_MIGRATION_WAIT_MILLIS)
                .catch((err) => {
                if (err.message.includes('running tasks did not finish')) {
                    this.log.error('The crawler was paused due to migration to another host, '
                        + 'but some requests did not finish in time. Those requests\' results may be duplicated.');
                }
                else {
                    throw err;
                }
            });
        }
        const requestListPersistPromise = (async () => {
            if (this.requestList) {
                if (await this.requestList.isFinished())
                    return;
                await this.requestList.persistState()
                    .catch((err) => {
                    if (err.message.includes('Cannot persist state.')) {
                        this.log.error('The crawler attempted to persist its request list\'s state and failed due to missing or '
                            + 'invalid config. Make sure to use either RequestList.open() or the "stateKeyPrefix" option of RequestList '
                            + 'constructor to ensure your crawling state is persisted through host migrations and restarts.');
                    }
                    else {
                        this.log.exception(err, 'An unexpected error occurred when the crawler '
                            + 'attempted to persist its request list\'s state.');
                    }
                });
            }
        })();
        await Promise.all([
            requestListPersistPromise,
            this.stats.persistState(),
        ]);
    }
    /**
     * Fetches request from either RequestList or RequestQueue. If request comes from a RequestList
     * and RequestQueue is present then enqueues it to the queue first.
     */
    async _fetchNextRequest() {
        if (!this.requestList)
            return this.requestQueue.fetchNextRequest();
        const request = await this.requestList.fetchNextRequest();
        if (!this.requestQueue)
            return request;
        if (!request)
            return this.requestQueue.fetchNextRequest();
        try {
            await this.requestQueue.addRequest(request, { forefront: true });
        }
        catch (err) {
            // If requestQueue.addRequest() fails here then we must reclaim it back to
            // the RequestList because probably it's not yet in the queue!
            this.log.error('Adding of request from the RequestList to the RequestQueue failed, reclaiming request back to the list.', { request });
            await this.requestList.reclaimRequest(request);
            return null;
        }
        await this.requestList.markRequestHandled(request);
        return this.requestQueue.fetchNextRequest();
    }
    /**
     * Executed when `errorHandler` finishes or the request is successful.
     * Can be used to clean up orphaned browser pages.
     */
    async _cleanupContext(_crawlingContext) { }
    /**
     * Wrapper around requestHandler that fetches requests from RequestList/RequestQueue
     * then retries them in a case of an error, etc.
     */
    async _runTaskFunction() {
        const source = this.requestQueue || this.requestList || await this.getRequestQueue();
        let request;
        let session;
        await this._timeoutAndRetry(async () => {
            request = await this._fetchNextRequest();
        }, this.internalTimeoutMillis, `Fetching next request timed out after ${this.internalTimeoutMillis / 1e3} seconds.`);
        (0, timeout_1.tryCancel)();
        if (this.useSessionPool) {
            await this._timeoutAndRetry(async () => {
                session = await this.sessionPool.getSession();
            }, this.internalTimeoutMillis, `Fetching session timed out after ${this.internalTimeoutMillis / 1e3} seconds.`);
        }
        (0, timeout_1.tryCancel)();
        if (!request)
            return;
        // Reset loadedUrl so an old one is not carried over to retries.
        request.loadedUrl = undefined;
        const statisticsId = request.id || request.uniqueKey;
        this.stats.startJob(statisticsId);
        // Shared crawling context
        // @ts-expect-error
        // All missing properties properties (that extend CrawlingContext) are set dynamically,
        // but TS does not know that, so otherwise it would throw when compiling.
        const crawlingContext = {
            id: (0, utilities_1.cryptoRandomObjectId)(10),
            crawler: this,
            log: this.log,
            request,
            session,
            enqueueLinks: async (options) => {
                return (0, core_1.enqueueLinks)({
                    // specify the RQ first to allow overriding it
                    requestQueue: await this.getRequestQueue(),
                    ...options,
                });
            },
            sendRequest: async (overrideOptions) => {
                const cookieJar = session ? {
                    getCookieString: async (url) => session.getCookieString(url),
                    setCookie: async (rawCookie, url) => session.setCookie(rawCookie, url),
                    ...overrideOptions?.cookieJar,
                } : overrideOptions?.cookieJar;
                return (0, got_scraping_1.gotScraping)({
                    url: request.url,
                    method: request.method,
                    body: request.payload,
                    headers: request.headers,
                    proxyUrl: crawlingContext.proxyInfo?.url,
                    sessionToken: session,
                    responseType: 'text',
                    ...overrideOptions,
                    retry: {
                        limit: 0,
                        ...overrideOptions?.retry,
                    },
                    cookieJar,
                });
            },
        };
        this.crawlingContexts.set(crawlingContext.id, crawlingContext);
        try {
            request.state = core_1.RequestState.REQUEST_HANDLER;
            await (0, timeout_1.addTimeoutToPromise)(() => this._runRequestHandler(crawlingContext), this.requestHandlerTimeoutMillis, `requestHandler timed out after ${this.requestHandlerTimeoutMillis / 1000} seconds (${request.id}).`);
            await this._timeoutAndRetry(() => source.markRequestHandled(request), this.internalTimeoutMillis, `Marking request ${request.url} (${request.id}) as handled timed out after ${this.internalTimeoutMillis / 1e3} seconds.`);
            this.stats.finishJob(statisticsId);
            this.handledRequestsCount++;
            // reclaim session if request finishes successfully
            request.state = core_1.RequestState.DONE;
            crawlingContext.session?.markGood();
        }
        catch (err) {
            try {
                request.state = core_1.RequestState.ERROR_HANDLER;
                await (0, timeout_1.addTimeoutToPromise)(() => this._requestFunctionErrorHandler(err, crawlingContext, source), this.internalTimeoutMillis, `Handling request failure of ${request.url} (${request.id}) timed out after ${this.internalTimeoutMillis / 1e3} seconds.`);
                request.state = core_1.RequestState.DONE;
            }
            catch (secondaryError) {
                if (!secondaryError.triggeredFromUserHandler) {
                    const apifySpecific = process.env.APIFY_IS_AT_HOME
                        ? `This may have happened due to an internal error of Apify's API or due to a misconfigured crawler.` : '';
                    this.log.exception(secondaryError, 'An exception occurred during handling of failed request. '
                        + `This places the crawler and its underlying storages into an unknown state and crawling will be terminated. ${apifySpecific}`);
                }
                request.state = core_1.RequestState.ERROR;
                throw secondaryError;
            }
            // decrease the session score if the request fails (but the error handler did not throw)
            crawlingContext.session?.markBad();
        }
        finally {
            await this._cleanupContext(crawlingContext);
            this.crawlingContexts.delete(crawlingContext.id);
        }
    }
    /**
     * Run async callback with given timeout and retry.
     * @ignore
     */
    async _timeoutAndRetry(handler, timeout, error, maxRetries = 3, retried = 1) {
        try {
            await (0, timeout_1.addTimeoutToPromise)(handler, timeout, error);
        }
        catch (e) {
            if (retried <= maxRetries) { // we retry on any error, not just timeout
                this.log.warning(`${e.message} (retrying ${retried}/${maxRetries})`);
                return this._timeoutAndRetry(handler, timeout, error, maxRetries, retried + 1);
            }
            throw e;
        }
    }
    /**
     * Returns true if either RequestList or RequestQueue have a request ready for processing.
     */
    async _isTaskReadyFunction() {
        // First check RequestList, since it's only in memory.
        const isRequestListEmpty = this.requestList ? (await this.requestList.isEmpty()) : true;
        // If RequestList is not empty, task is ready, no reason to check RequestQueue.
        if (!isRequestListEmpty)
            return true;
        // If RequestQueue is not empty, task is ready, return true, otherwise false.
        return this.requestQueue ? !(await this.requestQueue.isEmpty()) : false;
    }
    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     */
    async _defaultIsFinishedFunction() {
        const [isRequestListFinished, isRequestQueueFinished,] = await Promise.all([
            this.requestList ? this.requestList.isFinished() : true,
            this.requestQueue ? this.requestQueue.isFinished() : true,
        ]);
        // If both are finished, return true, otherwise return false.
        return isRequestListFinished && isRequestQueueFinished;
    }
    /**
     * Handles errors thrown by user provided requestHandler()
     */
    async _requestFunctionErrorHandler(error, crawlingContext, source) {
        const { request } = crawlingContext;
        request.pushErrorMessage(error);
        if (error instanceof core_1.CriticalError) {
            throw error;
        }
        const shouldRetryRequest = this._canRequestBeRetried(request, error);
        if (shouldRetryRequest) {
            this.stats.errorTrackerRetry.add(error);
            await this._tagUserHandlerError(() => this.errorHandler?.(this._augmentContextWithDeprecatedError(crawlingContext, error), error));
            if (!request.noRetry) {
                request.retryCount++;
                const { url, retryCount, id } = request;
                // We don't want to see the stack trace in the logs by default, when we are going to retry the request.
                // Thus, we print the full stack trace only when CRAWLEE_VERBOSE_LOG environment variable is set to true.
                const message = this._getMessageFromError(error);
                this.log.warning(`Reclaiming failed request back to the list or queue. ${message}`, { id, url, retryCount });
                await source.reclaimRequest(request);
                return;
            }
        }
        this.stats.errorTracker.add(error);
        // If we get here, the request is either not retryable
        // or failed more than retryCount times and will not be retried anymore.
        // Mark the request as failed and do not retry.
        this.handledRequestsCount++;
        await source.markRequestHandled(request);
        this.stats.failJob(request.id || request.uniqueKey);
        await this._handleFailedRequestHandler(crawlingContext, error); // This function prints an error message.
    }
    async _tagUserHandlerError(cb) {
        try {
            return await cb();
        }
        catch (e) {
            Object.defineProperty(e, 'triggeredFromUserHandler', { value: true });
            throw e;
        }
    }
    async _handleFailedRequestHandler(crawlingContext, error) {
        // Always log the last error regardless if the user provided a failedRequestHandler
        const { id, url, method, uniqueKey } = crawlingContext.request;
        const message = this._getMessageFromError(error, true);
        this.log.error(`Request failed and reached maximum retries. ${message}`, { id, url, method, uniqueKey });
        if (this.failedRequestHandler) {
            await this._tagUserHandlerError(() => this.failedRequestHandler?.(this._augmentContextWithDeprecatedError(crawlingContext, error), error));
        }
    }
    /**
     * Resolves the most verbose error message from a thrown error
     * @param error The error received
     * @returns The message to be logged
     */
    _getMessageFromError(error, forceStack = false) {
        if ([TypeError, SyntaxError, ReferenceError].some((type) => error instanceof type)) {
            forceStack = true;
        }
        const stackLines = error?.stack ? error.stack.split('\n') : new Error().stack.split('\n').slice(2);
        const baseDir = process.cwd();
        const userLine = stackLines.find((line) => line.includes(baseDir) && !line.includes('node_modules'));
        if (error instanceof timeout_1.TimeoutError) {
            return process.env.CRAWLEE_VERBOSE_LOG ? error.stack : error.message || error; // stack in timeout errors does not really help
        }
        return (process.env.CRAWLEE_VERBOSE_LOG || forceStack)
            ? error.stack ?? ([error.message || error, ...stackLines].join('\n'))
            : [error.message || error, userLine].join('\n');
    }
    _canRequestBeRetried(request, error) {
        // User requested retry (we ignore retry count here as its explicitly told by the user to retry)
        if (error instanceof core_1.RetryRequestError) {
            return true;
        }
        // Request should never be retried, or the error encountered makes it not able to be retried
        if (request.noRetry || (error instanceof core_1.NonRetryableError)) {
            return false;
        }
        // Ensure there are more retries available for the request
        return request.retryCount < this.maxRequestRetries;
    }
    _augmentContextWithDeprecatedError(context, error) {
        Object.defineProperty(context, 'error', {
            get: () => {
                // eslint-disable-next-line max-len
                this.log.deprecated("The 'error' property of the crawling context is deprecated, and it is now passed as the second parameter in 'errorHandler' and 'failedRequestHandler'. Please update your code, as this property will be removed in a future version.");
                return error;
            },
        });
        return context;
    }
    /**
     * Updates handledRequestsCount from possibly stored counts,
     * usually after worker migration. Since one of the stores
     * needs to have priority when both are present,
     * it is the request queue, because generally, the request
     * list will first be dumped into the queue and then left
     * empty.
     */
    async _loadHandledRequestCount() {
        if (this.requestQueue) {
            this.handledRequestsCount = await this.requestQueue.handledCount();
        }
        else if (this.requestList) {
            this.handledRequestsCount = this.requestList.handledCount();
        }
    }
    async _executeHooks(hooks, ...args) {
        if (Array.isArray(hooks) && hooks.length) {
            for (const hook of hooks) {
                await hook(...args);
            }
        }
    }
    /**
     * Function for cleaning up after all request are processed.
     * @ignore
     */
    async teardown() {
        this.events.emit("persistState" /* EventType.PERSIST_STATE */, { isMigrating: false });
        if (this.useSessionPool) {
            await this.sessionPool.teardown();
        }
        if (this._closeEvents) {
            await this.events.close();
        }
        await this.autoscaledPool?.abort();
    }
    _handlePropertyNameChange({ newProperty, newName, oldProperty, oldName, propertyKey, allowUndefined = false, }) {
        if (newProperty && oldProperty) {
            this.log.warning([
                `Both "${newName}" and "${oldName}" were provided in the crawler options.`,
                `"${oldName}" has been renamed to "${newName}", and will be removed in a future version.`,
                `As such, "${newName}" will be used instead.`,
            ].join('\n'));
            // @ts-expect-error Assigning to possibly readonly properties
            this[propertyKey] = newProperty;
        }
        else if (oldProperty) {
            this.log.warning([
                `"${oldName}" has been renamed to "${newName}", and will be removed in a future version.`,
                `The provided value will be used, but you should rename "${oldName}" to "${newName}" in your crawler options.`,
            ].join('\n'));
            // @ts-expect-error Assigning to possibly readonly properties
            this[propertyKey] = oldProperty;
        }
        else if (newProperty) {
            // @ts-expect-error Assigning to possibly readonly properties
            this[propertyKey] = newProperty;
        }
        else if (!allowUndefined) {
            throw new ow_1.ArgumentError(`"${newName}" must be provided in the crawler options`, this.constructor);
        }
    }
    _getCookieHeaderFromRequest(request) {
        if (request.headers?.Cookie && request.headers?.cookie) {
            this.log.warning(`Encountered mixed casing for the cookie headers for request ${request.url} (${request.id}). Their values will be merged.`);
            return (0, core_1.mergeCookies)(request.url, [request.headers.cookie, request.headers.Cookie]);
        }
        return request.headers?.Cookie || request.headers?.cookie || '';
    }
}
Object.defineProperty(BasicCrawler, "CRAWLEE_STATE_KEY", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 'CRAWLEE_STATE'
});
Object.defineProperty(BasicCrawler, "optionsShape", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        requestList: ow_1.default.optional.object.validate(core_1.validators.requestList),
        requestQueue: ow_1.default.optional.object.validate(core_1.validators.requestQueue),
        // Subclasses override this function instead of passing it
        // in constructor, so this validation needs to apply only
        // if the user creates an instance of BasicCrawler directly.
        requestHandler: ow_1.default.optional.function,
        // TODO: remove in a future release
        handleRequestFunction: ow_1.default.optional.function,
        requestHandlerTimeoutSecs: ow_1.default.optional.number,
        // TODO: remove in a future release
        handleRequestTimeoutSecs: ow_1.default.optional.number,
        errorHandler: ow_1.default.optional.function,
        failedRequestHandler: ow_1.default.optional.function,
        // TODO: remove in a future release
        handleFailedRequestFunction: ow_1.default.optional.function,
        maxRequestRetries: ow_1.default.optional.number,
        maxRequestsPerCrawl: ow_1.default.optional.number,
        autoscaledPoolOptions: ow_1.default.optional.object,
        sessionPoolOptions: ow_1.default.optional.object,
        useSessionPool: ow_1.default.optional.boolean,
        loggingInterval: ow_1.default.optional.number,
        // AutoscaledPool shorthands
        minConcurrency: ow_1.default.optional.number,
        maxConcurrency: ow_1.default.optional.number,
        maxRequestsPerMinute: ow_1.default.optional.number.integerOrInfinite.positive.greaterThanOrEqual(1),
        keepAlive: ow_1.default.optional.boolean,
        // internal
        log: ow_1.default.optional.object,
    }
});
exports.BasicCrawler = BasicCrawler;
/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`} of our {@apilink BasicCrawler}.
 * Defaults to the {@apilink BasicCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<BasicCrawlingContext>()`.
 *
 * ```ts
 * import { BasicCrawler, createBasicRouter } from 'crawlee';
 *
 * const router = createBasicRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new BasicCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
function createBasicRouter(routes) {
    return core_1.Router.create(routes);
}
exports.createBasicRouter = createBasicRouter;
//# sourceMappingURL=basic-crawler.js.map