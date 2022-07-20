import type { Log } from '@apify/log';
import defaultLog from '@apify/log';
import { addTimeoutToPromise, TimeoutError, tryCancel } from '@apify/timeout';
import { cryptoRandomObjectId } from '@apify/utilities';
import type {
    AutoscaledPoolOptions,
    EnqueueLinksOptions,
    EventManager,
    FinalStatistics,
    ProxyInfo,
    Request,
    RequestList,
    RequestOptions,
    RequestQueueOperationOptions,
    RouterHandler,
    Session,
    SessionPoolOptions,
} from '@crawlee/core';
import {
    AutoscaledPool,
    Configuration,
    type CrawlingContext,
    createRequests,
    enqueueLinks,
    EventType,
    KeyValueStore,
    CriticalError,
    NonRetryableError,
    RequestQueue,
    Router,
    SessionPool,
    Statistics,
    purgeDefaultStorages,
    validators,
} from '@crawlee/core';
import type { GotOptionsInit, OptionsOfTextResponseBody, Response as GotResponse } from 'got-scraping';
import { gotScraping } from 'got-scraping';
import type { ProcessedRequest, Dictionary, Awaitable, BatchAddRequestsResult } from '@crawlee/types';
import { chunk, sleep } from '@crawlee/utils';
import ow, { ArgumentError } from 'ow';

export interface BasicCrawlingContext<UserData extends Dictionary = Dictionary> extends CrawlingContext<UserData> {
    crawler: BasicCrawler;
    enqueueLinks: (options: BasicCrawlerEnqueueLinksOptions) => Promise<BatchAddRequestsResult>;
    sendRequest: (overrideOptions?: Partial<GotOptionsInit>) => Promise<GotResponse<string>>;
}

/** @internal */
export type BasicCrawlerEnqueueLinksOptions = Omit<EnqueueLinksOptions, 'requestQueue'>

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

export type RequestHandler<Context extends CrawlingContext = BasicCrawlingContext> = (inputs: Context) => Awaitable<void>;

export type ErrorHandler<Context extends CrawlingContext = BasicCrawlingContext> = (inputs: Context, error: Error) => Awaitable<void>;

export interface BasicCrawlerOptions<Context extends CrawlingContext = BasicCrawlingContext> {
    /**
     * User-provided function that performs the logic of the crawler. It is called for each URL to crawl.
     *
     * The function receives the {@link BasicCrawlingContext} as an argument,
     * where the {@link BasicCrawlingContext.request|`request`} represents the URL to crawl.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to the {@link BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     * If all the retries fail, the crawler calls the function
     * provided to the {@link BasicCrawlerOptions.failedRequestHandler|`failedRequestHandler`} parameter.
     * To make this work, we should **always**
     * let our function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@link Request.pushErrorMessage|`Request.pushErrorMessage()`} function.
     */
    requestHandler?: RequestHandler<Context>;

    /**
     * User-provided function that performs the logic of the crawler. It is called for each URL to crawl.
     *
     * The function receives the {@link BasicCrawlingContext} as an argument,
     * where the {@link BasicCrawlingContext.request|`request`} represents the URL to crawl.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to the {@link BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     * If all the retries fail, the crawler calls the function
     * provided to the {@link BasicCrawlerOptions.failedRequestHandler|`failedRequestHandler`} parameter.
     * To make this work, we should **always**
     * let our function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@link Request.pushErrorMessage|`Request.pushErrorMessage()`} function.
     *
     * @deprecated `handleRequestFunction` has been renamed to `requestHandler` and will be removed in a future version.
     * @ignore
     */
    handleRequestFunction?: RequestHandler<Context>;

    /**
     * Static list of URLs to be processed.
     * If not provided, the crawler will open the default request queue when the {@link BasicCrawler.addRequests|`crawler.addRequests()`} function is called.
     * > Alternatively, `requests` parameter of {@link BasicCrawler.run|`crawler.run()`} could be used to enqueue the initial requests -
     * it is a shortcut for running `crawler.addRequests()` before the `crawler.run()`.
     */
    requestList?: RequestList;

    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     * If not provided, the crawler will open the default request queue when the {@link BasicCrawler.addRequests|`crawler.addRequests()`} function is called.
     * > Alternatively, `requests` parameter of {@link BasicCrawler.run|`crawler.run()`} could be used to enqueue the initial requests -
     * it is a shortcut for running `crawler.addRequests()` before the `crawler.run()`.
     */
    requestQueue?: RequestQueue;

    /**
     * Timeout in which the function passed as {@link BasicCrawlerOptions.requestHandler|`requestHandler`} needs to finish, in seconds.
     * @default 60
     */
    requestHandlerTimeoutSecs?: number;

    /**
     * Timeout in which the function passed as {@link BasicCrawlerOptions.requestHandler|`requestHandler`} needs to finish, in seconds.
     * @default 60
     * @deprecated `handleRequestTimeoutSecs` has been renamed to `requestHandlerTimeoutSecs` and will be removed in a future version.
     * @ignore
     */
    handleRequestTimeoutSecs?: number;

    /**
     * User-provided function that allows modifying the request object before it gets retried by the crawler.
     * It's executed before each retry for the requests that failed less than {@link BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@link BasicCrawlingContext} as the first argument,
     * where the {@link BasicCrawlingContext.request|`request`} corresponds to the request to be retried.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    errorHandler?: ErrorHandler<Context>;

    /**
     * A function to handle requests that failed more than {@link BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@link BasicCrawlingContext} as the first argument,
     * where the {@link BasicCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    failedRequestHandler?: ErrorHandler<Context>;

    /**
     * A function to handle requests that failed more than {@link BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@link BasicCrawlingContext} as the first argument,
     * where the {@link BasicCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     *
     * @deprecated `handleFailedRequestFunction` has been renamed to `failedRequestHandler` and will be removed in a future version.
     * @ignore
     */
    handleFailedRequestFunction?: ErrorHandler<Context>;

    /**
     * Indicates how many times the request is retried if {@link BasicCrawlerOptions.requestHandler|`requestHandler`} fails.
     * @default 3
     */
    maxRequestRetries?: number;

    /**
     * Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
     * This value should always be set in order to prevent infinite loops in misconfigured crawlers.
     * > *NOTE:* In cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
     */
    maxRequestsPerCrawl?: number;

    /**
     * Custom options passed to the underlying {@link AutoscaledPool} constructor.
     * > *NOTE:* The {@link AutoscaledPoolOptions.runTaskFunction|`runTaskFunction`}
     * and {@link AutoscaledPoolOptions.isTaskReadyFunction|`isTaskReadyFunction`} options
     * are provided by the crawler and cannot be overridden.
     * However, we can provide a custom implementation of {@link AutoscaledPoolOptions.isFinishedFunction|`isFinishedFunction`}.
     */
    autoscaledPoolOptions?: AutoscaledPoolOptions;

    /**
     * Sets the minimum concurrency (parallelism) for the crawl. Shortcut for the
     * AutoscaledPool {@link AutoscaledPoolOptions.minConcurrency|`minConcurrency`} option.
     * > *WARNING:* If we set this value too high with respect to the available system memory and CPU, our crawler will run extremely slow or crash.
     * If not sure, it's better to keep the default value and the concurrency will scale up automatically.
     */
    minConcurrency?: number;

    /**
     * Sets the maximum concurrency (parallelism) for the crawl. Shortcut for the
     * AutoscaledPool {@link AutoscaledPoolOptions.maxConcurrency|`maxConcurrency`} option.
     */
    maxConcurrency?: number;

    /**
     * The maximum number of requests per minute the crawler should run.
     * By default, this is set to `Infinity`, but we can pass any positive, non-zero integer.
     * Shortcut for the AutoscaledPool {@link AutoscaledPoolOptions.maxTasksPerMinute|`maxTasksPerMinute`} option.
     */
    maxRequestsPerMinute?: number;

    /**
     * Basic crawler will initialize the {@link SessionPool} with the corresponding {@link SessionPoolOptions|`sessionPoolOptions`}.
     * The session instance will be than available in the {@link BasicCrawlerOptions.requestHandler|`requestHandler`}.
     */
    useSessionPool?: boolean;

    /**
     * The configuration options for {@link SessionPool} to use.
     */
    sessionPoolOptions?: SessionPoolOptions;

    /** @internal */
    log?: Log;
}

/**
 * Provides a simple framework for parallel crawling of web pages.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * `BasicCrawler` is a low-level tool that requires the user to implement the page
 * download and data extraction functionality themselves.
 * If we want a crawler that already facilitates this functionality,
 * we should consider using {@link CheerioCrawler}, {@link PuppeteerCrawler} or {@link PlaywrightCrawler}.
 *
 * `BasicCrawler` invokes the user-provided {@link BasicCrawlerOptions.requestHandler|`requestHandler`}
 * for each {@link Request} object, which represents a single URL to crawl.
 * The {@link Request} objects are fed from the {@link RequestList} or {@link RequestQueue}
 * instances provided by the {@link BasicCrawlerOptions.requestList|`requestList`} or {@link BasicCrawlerOptions.requestQueue|`requestQueue`}
 * constructor options, respectively. If neither `requestList` nor `requestQueue` options are provided,
 * the crawler will open the default request queue either when the {@link BasicCrawler.addRequests|`crawler.addRequests()`} function is called,
 * or if `requests` parameter (representing the initial requests) of the {@link BasicCrawler.run|`crawler.run()`} function is provided.
 *
 * If both {@link BasicCrawlerOptions.requestList|`requestList`} and {@link BasicCrawlerOptions.requestQueue|`requestQueue`} options are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to the {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes if there are no more {@link Request} objects to crawl.
 *
 * New requests are only dispatched when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the {@link BasicCrawlerOptions.autoscaledPoolOptions|`autoscaledPoolOptions`}
 * parameter of the `BasicCrawler` constructor.
 * For user convenience, the {@link AutoscaledPoolOptions.minConcurrency|`minConcurrency`} and
 * {@link AutoscaledPoolOptions.maxConcurrency|`maxConcurrency`} options of the
 * underlying {@link AutoscaledPool} constructor are available directly in the `BasicCrawler` constructor.
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
export class BasicCrawler<Context extends CrawlingContext = BasicCrawlingContext> {
    private static readonly CRAWLEE_STATE_KEY = 'CRAWLEE_STATE';

    /**
     * A reference to the underlying {@link Statistics} class that collects and logs run statistics for requests.
     */
    readonly stats: Statistics;

    /**
     * A reference to the underlying {@link RequestList} class that manages the crawler's {@link Request|requests}.
     * Only available if used by the crawler.
     */
    requestList?: RequestList;

    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     * A reference to the underlying {@link RequestQueue} class that manages the crawler's {@link Request|requests}.
     * Only available if used by the crawler.
     */
    requestQueue?: RequestQueue;

    /**
     * A reference to the underlying {@link SessionPool} class that manages the crawler's {@link Session|sessions}.
     * Only available if used by the crawler.
     */
    sessionPool?: SessionPool;

    /**
     * A reference to the underlying {@link AutoscaledPool} class that manages the concurrency of the crawler.
     * > *NOTE:* This property is only initialized after calling the {@link BasicCrawler.run|`crawler.run()`} function.
     * We can use it to change the concurrency settings on the fly,
     * to pause the crawler by calling {@link AutoscaledPool.pause|`autoscaledPool.pause()`}
     * or to abort it by calling {@link AutoscaledPool.abort|`autoscaledPool.abort()`}.
     */
    autoscaledPool?: AutoscaledPool;

    /**
     * Default {@link Router} instance that will be used if we don't specify any {@link BasicCrawlerOptions.requestHandler|`requestHandler`}.
     * See {@link Router.addHandler|`router.addHandler()`} and {@link Router.addDefaultHandler|`router.addDefaultHandler()`}.
     */
    readonly router: RouterHandler<Context> = Router.create<Context>();

    protected log: Log;
    protected requestHandler!: RequestHandler<Context>;
    protected errorHandler?: ErrorHandler<Context>;
    protected failedRequestHandler?: ErrorHandler<Context>;
    protected requestHandlerTimeoutMillis!: number;
    protected internalTimeoutMillis: number;
    protected maxRequestRetries: number;
    protected handledRequestsCount: number;
    protected sessionPoolOptions: SessionPoolOptions;
    protected useSessionPool: boolean;
    protected crawlingContexts = new Map<string, Context>();
    protected autoscaledPoolOptions: AutoscaledPoolOptions;
    protected events: EventManager;
    private _closeEvents?: boolean;

    protected static optionsShape = {
        requestList: ow.optional.object.validate(validators.requestList),
        requestQueue: ow.optional.object.validate(validators.requestQueue),
        // Subclasses override this function instead of passing it
        // in constructor, so this validation needs to apply only
        // if the user creates an instance of BasicCrawler directly.
        requestHandler: ow.optional.function,
        // TODO: remove in a future release
        handleRequestFunction: ow.optional.function,
        requestHandlerTimeoutSecs: ow.optional.number,
        // TODO: remove in a future release
        handleRequestTimeoutSecs: ow.optional.number,
        errorHandler: ow.optional.function,
        failedRequestHandler: ow.optional.function,
        // TODO: remove in a future release
        handleFailedRequestFunction: ow.optional.function,
        maxRequestRetries: ow.optional.number,
        maxRequestsPerCrawl: ow.optional.number,
        autoscaledPoolOptions: ow.optional.object,
        sessionPoolOptions: ow.optional.object,
        useSessionPool: ow.optional.boolean,

        // AutoscaledPool shorthands
        minConcurrency: ow.optional.number,
        maxConcurrency: ow.optional.number,
        maxRequestsPerMinute: ow.optional.number.integerOrInfinite.positive.greaterThanOrEqual(1),

        // internal
        log: ow.optional.object,
    };

    /**
     * All `BasicCrawler` parameters are passed via an options object.
     */
    constructor(options: BasicCrawlerOptions<Context> = {}, readonly config = Configuration.getGlobalConfig()) {
        ow(options, 'BasicCrawlerOptions', ow.object.exactShape(BasicCrawler.optionsShape));

        const {
            requestList,
            requestQueue,
            maxRequestRetries = 3,
            maxRequestsPerCrawl,
            autoscaledPoolOptions = {},
            sessionPoolOptions = {},
            useSessionPool = true,

            // AutoscaledPool shorthands
            minConcurrency,
            maxConcurrency,
            maxRequestsPerMinute,

            // internal
            log = defaultLog.child({ prefix: this.constructor.name }),

            // Old and new request handler methods
            handleRequestFunction,
            requestHandler,

            handleRequestTimeoutSecs,
            requestHandlerTimeoutSecs,

            errorHandler,

            handleFailedRequestFunction,
            failedRequestHandler,
        } = options;

        this.requestList = requestList;
        this.requestQueue = requestQueue;
        this.log = log;
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

        let newRequestHandlerTimeout: number | undefined;

        if (!handleRequestTimeoutSecs) {
            if (!requestHandlerTimeoutSecs) {
                newRequestHandlerTimeout = 60_000;
            } else {
                newRequestHandlerTimeout = requestHandlerTimeoutSecs * 1000;
            }
        } else if (requestHandlerTimeoutSecs) {
            newRequestHandlerTimeout = requestHandlerTimeoutSecs * 1000;
        }

        this._handlePropertyNameChange({
            newName: 'requestHandlerTimeoutSecs',
            oldName: 'handleRequestTimeoutSecs',
            propertyKey: 'requestHandlerTimeoutMillis',
            newProperty: newRequestHandlerTimeout,
            oldProperty: handleRequestTimeoutSecs ? handleRequestTimeoutSecs * 1000 : undefined,
        });

        const tryEnv = (val?: string) => (val == null ? null : +val);
        // allow at least 5min for internal timeouts
        this.internalTimeoutMillis = tryEnv(process.env.CRAWLEE_INTERNAL_TIMEOUT) ?? Math.max(this.requestHandlerTimeoutMillis * 2, 300e3);
        // override the default internal timeout of request queue to respect `requestHandlerTimeoutMillis`
        if (this.requestQueue) {
            this.requestQueue.internalTimeoutMillis = this.internalTimeoutMillis;
        }

        this.maxRequestRetries = maxRequestRetries;
        this.handledRequestsCount = 0;
        this.stats = new Statistics({ logMessage: `${log.getOptions().prefix} request statistics:`, config });
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

        const { isFinishedFunction } = autoscaledPoolOptions;

        const basicCrawlerAutoscaledPoolConfiguration: Partial<AutoscaledPoolOptions> = {
            minConcurrency,
            maxConcurrency,
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
                        : 'All the requests from request list and/or request queue have been processed, the crawler will shut down.';
                    log.info(reason);
                }

                return isFinished;
            },
            log,
        };

        this.autoscaledPoolOptions = { ...autoscaledPoolOptions, ...basicCrawlerAutoscaledPoolConfiguration };

        // Attach a listener to handle migration and aborting events gracefully.
        this.events.on(EventType.MIGRATING, this._pauseOnMigration.bind(this));
        this.events.on(EventType.ABORTING, this._pauseOnMigration.bind(this));
    }

    /**
     * Runs the crawler. Returns a promise that gets resolved once all the requests are processed.
     * We can use the `requests` parameter to enqueue the initial requests - it is a shortcut for
     * running {@link BasicCrawler.addRequests|`crawler.addRequests()`} before the {@link BasicCrawler.run|`crawler.run()`}.
     *
     * @param [requests] The requests to add
     * @param [options] Options for the request queue
     */
    async run(requests?: (string | Request | RequestOptions)[], options?: CrawlerAddRequestsOptions): Promise<FinalStatistics> {
        await purgeDefaultStorages();

        if (requests) {
            await this.addRequests(requests, options);
        }

        await this._init();
        await this.stats.startCapturing();

        try {
            await this.autoscaledPool!.run();
        } finally {
            await this.teardown();
            await this.stats.stopCapturing();
        }

        const finalStats = this.stats.calculate();
        const stats = {
            requestsFinished: this.stats.state.requestsFinished,
            requestsFailed: this.stats.state.requestsFailed,
            retryHistogram: this.stats.requestRetryHistogram,
            ...finalStats,
        };
        this.log.info('Final request statistics:', stats);

        return stats;
    }

    async getRequestQueue() {
        this.requestQueue ??= await RequestQueue.open();

        return this.requestQueue!;
    }

    async useState<State extends Dictionary = Dictionary>(defaultValue = {} as State): Promise<State> {
        const kvs = await KeyValueStore.open(null, { config: this.config });
        return kvs.getAutoSavedValue<State>(BasicCrawler.CRAWLEE_STATE_KEY, defaultValue);
    }

    /**
     * Adds requests to be processed by the crawler
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    async addRequests(requests: (string | Request | RequestOptions)[], options: CrawlerAddRequestsOptions = {}): Promise<CrawlerAddRequestsResult> {
        ow(requests, ow.array.ofType(ow.any(ow.string, ow.object.partialShape({
            url: ow.string,
            id: ow.undefined,
        }))));
        ow(options, ow.object.exactShape({
            forefront: ow.optional.boolean,
            waitForAllRequestsToBeAdded: ow.optional.boolean,
        }));

        const requestQueue = await this.getRequestQueue();
        const builtRequests = createRequests(requests);

        const attemptToAddToQueueAndAddAnyUnprocessed = async (providedRequests: Request[]) => {
            const resultsToReturn: ProcessedRequest[] = [];
            const apiResult = await requestQueue.addRequests(providedRequests, { forefront: options.forefront });
            resultsToReturn.push(...apiResult.processedRequests);

            if (apiResult.unprocessedRequests.length) {
                await sleep(1000);

                resultsToReturn.push(...await attemptToAddToQueueAndAddAnyUnprocessed(
                    providedRequests.filter((r) => !apiResult.processedRequests.some((pr) => pr.uniqueKey === r.uniqueKey)),
                ));
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
        const promise = new Promise<ProcessedRequest[]>(async (resolve) => {
            const chunks = chunk(builtRequests, 1000);
            const finalAddedRequests: ProcessedRequest[] = [];

            for (const requestChunk of chunks) {
                finalAddedRequests.push(...await attemptToAddToQueueAndAddAnyUnprocessed(requestChunk));

                await sleep(1000);
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

    protected async _init(): Promise<void> {
        if (!this.events.isInitialized()) {
            await this.events.init();
            this._closeEvents = true;
        }

        // Initialize AutoscaledPool before awaiting _loadHandledRequestCount(),
        // so that the caller can get a reference to it before awaiting the promise returned from run()
        // (otherwise there would be no way)
        this.autoscaledPool = new AutoscaledPool(this.autoscaledPoolOptions, this.config);

        if (this.useSessionPool) {
            this.sessionPool = await SessionPool.open(this.sessionPoolOptions);
            // Assuming there are not more than 20 browsers running at once;
            this.sessionPool.setMaxListeners(20);
        }

        await this._loadHandledRequestCount();
    }

    protected async _runRequestHandler(crawlingContext: Context): Promise<void> {
        await this.requestHandler(crawlingContext);
    }

    /**
     * Handles blocked request
     */
    protected _throwOnBlockedRequest(session: Session, statusCode: number) {
        const isBlocked = session.retireOnBlockedStatusCodes(statusCode);

        if (isBlocked) {
            throw new Error(`Request blocked - received ${statusCode} status code.`);
        }
    }

    protected async _pauseOnMigration() {
        if (this.autoscaledPool) {
            // if run wasn't called, this is going to crash
            await this.autoscaledPool.pause(SAFE_MIGRATION_WAIT_MILLIS)
                .catch((err) => {
                    if (err.message.includes('running tasks did not finish')) {
                        this.log.error('The crawler was paused due to migration to another host, '
                            + 'but some requests did not finish in time. Those requests\' results may be duplicated.');
                    } else {
                        throw err;
                    }
                });
        }

        const requestListPersistPromise = (async () => {
            if (this.requestList) {
                if (await this.requestList.isFinished()) return;
                await this.requestList.persistState()
                    .catch((err) => {
                        if (err.message.includes('Cannot persist state.')) {
                            this.log.error('The crawler attempted to persist its request list\'s state and failed due to missing or '
                                + 'invalid config. Make sure to use either RequestList.open() or the "stateKeyPrefix" option of RequestList '
                                + 'constructor to ensure your crawling state is persisted through host migrations and restarts.');
                        } else {
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
    protected async _fetchNextRequest() {
        if (!this.requestList) return this.requestQueue!.fetchNextRequest();
        const request = await this.requestList.fetchNextRequest();
        if (!this.requestQueue) return request;
        if (!request) return this.requestQueue.fetchNextRequest();

        try {
            await this.requestQueue.addRequest(request, { forefront: true });
        } catch (err) {
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
     * Wrapper around requestHandler that fetches requests from RequestList/RequestQueue
     * then retries them in a case of an error, etc.
     */
    protected async _runTaskFunction() {
        const source = this.requestQueue || this.requestList || await this.getRequestQueue();

        let request: Request | null | undefined;
        let session: Session | undefined;

        await this._timeoutAndRetry(
            async () => {
                request = await this._fetchNextRequest();
            },
            this.internalTimeoutMillis,
            `Fetching next request timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
        );

        tryCancel();

        if (this.useSessionPool) {
            await this._timeoutAndRetry(
                async () => {
                    session = await this.sessionPool!.getSession();
                },
                this.internalTimeoutMillis,
                `Fetching session timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
            );
        }

        tryCancel();

        if (!request) return;

        // Reset loadedUrl so an old one is not carried over to retries.
        request.loadedUrl = undefined;

        const statisticsId = request.id || request.uniqueKey;
        this.stats.startJob(statisticsId);

        // Shared crawling context
        // @ts-expect-error
        // All missing properties properties (that extend CrawlingContext) are set dynamically,
        // but TS does not know that, so otherwise it would throw when compiling.
        const crawlingContext: Context = {
            id: cryptoRandomObjectId(10),
            crawler: this,
            log: this.log,
            request,
            session,
            enqueueLinks: async (enqueueOptions: BasicCrawlerEnqueueLinksOptions) => {
                return enqueueLinks({
                    ...enqueueOptions,
                    requestQueue: await this.getRequestQueue(),
                });
            },
            sendRequest: async (overrideOptions?: GotOptionsInit) => {
                return gotScraping({
                    url: request!.url,
                    method: request!.method,
                    body: request!.payload,
                    headers: request!.headers,
                    proxyUrl: crawlingContext.proxyInfo?.url,
                    sessionToken: session,
                    responseType: 'text',
                    ...overrideOptions,
                    retry: {
                        limit: 0,
                        ...overrideOptions?.retry,
                    },
                    cookieJar: {
                        getCookieString: (url: string) => session!.getCookieString(url),
                        setCookie: (rawCookie: string, url: string) => session!.setCookie(rawCookie, url),
                        ...overrideOptions?.cookieJar,
                    },
                } as OptionsOfTextResponseBody);
            },
        };

        this.crawlingContexts.set(crawlingContext.id, crawlingContext);

        try {
            await addTimeoutToPromise(
                () => this._runRequestHandler(crawlingContext),
                this.requestHandlerTimeoutMillis,
                `requestHandler timed out after ${this.requestHandlerTimeoutMillis / 1000} seconds (${request.id}).`,
            );

            await this._timeoutAndRetry(
                () => source.markRequestHandled(request!),
                this.internalTimeoutMillis,
                `Marking request ${request.url} (${request.id}) as handled timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
            );

            this.stats.finishJob(statisticsId);
            this.handledRequestsCount++;

            // reclaim session if request finishes successfully
            session?.markGood();
        } catch (err) {
            try {
                await addTimeoutToPromise(
                    () => this._requestFunctionErrorHandler(err as Error, crawlingContext, source),
                    this.internalTimeoutMillis,
                    `Handling request failure of ${request.url} (${request.id}) timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
                );
            } catch (secondaryError: any) {
                if (!secondaryError.triggeredFromUserHandler) {
                    const apifySpecific = process.env.APIFY_IS_AT_HOME
                        ? `This may have happened due to an internal error of Apify's API or due to a misconfigured crawler.` : '';
                    this.log.exception(secondaryError as Error, 'An exception occurred during handling of failed request. '
                        + `This places the crawler and its underlying storages into an unknown state and crawling will be terminated. ${apifySpecific}`);
                }
                throw secondaryError;
            }
        } finally {
            this.crawlingContexts.delete(crawlingContext.id);
        }
    }

    /**
     * Run async callback with given timeout and retry.
     * @ignore
     */
    protected async _timeoutAndRetry(handler: () => Promise<unknown>, timeout: number, error: Error | string, maxRetries = 3, retried = 1): Promise<void> {
        try {
            await addTimeoutToPromise(handler, timeout, error);
        } catch (e) {
            if (retried <= maxRetries) { // we retry on any error, not just timeout
                this.log.warning(`${(e as Error).message} (retrying ${retried}/${maxRetries})`);
                return this._timeoutAndRetry(handler, timeout, error, maxRetries, retried + 1);
            }

            throw e;
        }
    }

    /**
     * Returns true if either RequestList or RequestQueue have a request ready for processing.
     */
    protected async _isTaskReadyFunction() {
        // First check RequestList, since it's only in memory.
        const isRequestListEmpty = this.requestList ? (await this.requestList.isEmpty()) : true;
        // If RequestList is not empty, task is ready, no reason to check RequestQueue.
        if (!isRequestListEmpty) return true;
        // If RequestQueue is not empty, task is ready, return true, otherwise false.
        return this.requestQueue ? !(await this.requestQueue.isEmpty()) : false;
    }

    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     */
    protected async _defaultIsFinishedFunction() {
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
     * Handles errors thrown by user provided requestHandler()
     */
    protected async _requestFunctionErrorHandler(
        error: Error,
        crawlingContext: Context,
        source: RequestList | RequestQueue,
    ): Promise<void> {
        const { request } = crawlingContext;
        request.pushErrorMessage(error);

        if (error instanceof CriticalError) {
            throw error;
        }

        const shouldRetryRequest = !request.noRetry && request.retryCount < this.maxRequestRetries && !(error instanceof NonRetryableError);
        if (shouldRetryRequest) {
            request.retryCount++;

            await this._tagUserHandlerError(() => this.errorHandler?.(crawlingContext, error));

            const { url, retryCount, id } = request;
            // We don't want to see the stack trace in the logs by default, when we are going to retry the request.
            // Thus, we print the full stack trace only when CRAWLEE_VERBOSE_LOG environment variable is set to true.
            const message = process.env.CRAWLEE_VERBOSE_LOG ? error.stack : error;
            this.log.warning(
                `Reclaiming failed request back to the list or queue. ${message}`,
                { id, url, retryCount },
            );

            await source.reclaimRequest(request);
        } else {
            // If we get here, the request is either not retryable
            // or failed more than retryCount times and will not be retried anymore.
            // Mark the request as failed and do not retry.
            this.handledRequestsCount++;
            await source.markRequestHandled(request);
            this.stats.failJob(request.id || request.uniqueKey);

            await this._handleFailedRequestHandler(crawlingContext, error); // This function prints an error message.
        }
    }

    protected async _tagUserHandlerError<T>(cb: () => unknown): Promise<T> {
        try {
            return await cb() as T;
        } catch (e: any) {
            Object.defineProperty(e, 'triggeredFromUserHandler', { value: true });
            throw e;
        }
    }

    protected async _handleFailedRequestHandler(crawlingContext: Context, error: Error): Promise<void> {
        if (this.failedRequestHandler) {
            await this._tagUserHandlerError(() => this.failedRequestHandler?.(crawlingContext, error));
            return;
        }

        const { id, url, method, uniqueKey } = crawlingContext.request;
        const message = error instanceof TimeoutError && !process.env.CRAWLEE_VERBOSE_LOG ? error.message : error.stack;
        this.log.error(
            `Request failed and reached maximum retries. ${message}`,
            { id, url, method, uniqueKey },
        );
    }

    /**
     * Updates handledRequestsCount from possibly stored counts,
     * usually after worker migration. Since one of the stores
     * needs to have priority when both are present,
     * it is the request queue, because generally, the request
     * list will first be dumped into the queue and then left
     * empty.
     */
    protected async _loadHandledRequestCount(): Promise<void> {
        if (this.requestQueue) {
            this.handledRequestsCount = await this.requestQueue.handledCount();
        } else if (this.requestList) {
            this.handledRequestsCount = this.requestList.handledCount();
        }
    }

    protected async _executeHooks<HookLike extends (...args: any[]) => Awaitable<void>>(hooks: HookLike[], ...args: Parameters<HookLike>) {
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
    async teardown(): Promise<void> {
        this.events.emit(EventType.PERSIST_STATE, { isMigrating: false });

        if (this.useSessionPool) {
            await this.sessionPool!.teardown();
        }

        if (this._closeEvents) {
            await this.events.close();
        }
    }

    protected _handlePropertyNameChange<New, Old>({
        newProperty,
        newName,
        oldProperty,
        oldName,
        propertyKey,
        allowUndefined = false,
    }: HandlePropertyNameChangeData<New, Old>) {
        if (newProperty && oldProperty) {
            this.log.warning([
                `Both "${newName}" and "${oldName}" were provided in the crawler options.`,
                `"${oldName}" has been renamed to "${newName}", and will be removed in a future version.`,
                `As such, "${newName}" will be used instead.`,
            ].join('\n'));

            // @ts-expect-error Assigning to possibly readonly properties
            this[propertyKey] = newProperty;
        } else if (oldProperty) {
            this.log.warning([
                `"${oldName}" has been renamed to "${newName}", and will be removed in a future version.`,
                `The provided value will be used, but you should rename "${oldName}" to "${newName}" in your crawler options.`,
            ].join('\n'));

            // @ts-expect-error Assigning to possibly readonly properties
            this[propertyKey] = oldProperty;
        } else if (newProperty) {
            // @ts-expect-error Assigning to possibly readonly properties
            this[propertyKey] = newProperty;
        } else if (!allowUndefined) {
            throw new ArgumentError(`"${newName}" must be provided in the crawler options`, this.constructor);
        }
    }

    protected _getCookieHeaderFromRequest(request: Request) {
        return request.headers?.Cookie ?? request.headers?.cookie ?? '';
    }
}

export interface CreateContextOptions {
    request: Request;
    session?: Session;
    proxyInfo?: ProxyInfo;
}

export interface CrawlerAddRequestsOptions extends RequestQueueOperationOptions {
    /**
     * Whether to wait for all the provided requests to be added, instead of waiting just for the initial batch of up to 1000.
     @default false
     */
    waitForAllRequestsToBeAdded?: boolean;
}

export interface CrawlerAddRequestsResult {
    addedRequests: ProcessedRequest[];
    /**
     * A promise which will resolve with the rest of the requests that were added to the queue.
     *
     * Alternatively, we can set {@link CrawlerAddRequestsOptions.waitForAllRequestsToBeAdded|`waitForAllRequestsToBeAdded`} to `true`
     * in the {@link BasicCrawler.addRequests|`crawler.addRequests()`} options.
     *
     * **Example:**
     *
     * ```ts
     * // Assuming `requests` is a list of requests.
     * const result = await crawler.addRequests(requests);
     *
     * // If we want to wait for the rest of the requests to be added to the queue:
     * await result.waitForAllRequestsToBeAdded;
     * ```
     */
    waitForAllRequestsToBeAdded: Promise<ProcessedRequest[]>;
}

interface HandlePropertyNameChangeData<New, Old> {
    oldProperty?: Old;
    newProperty?: New;
    oldName: string;
    newName: string;
    propertyKey: string;
    allowUndefined?: boolean;
}

/**
 * Creates new {@link Router} instance that works based on request labels.
 * This instance can then serve as a {@link BasicCrawlerOptions.requestHandler|`requestHandler`} of our {@link BasicCrawler}.
 * Defaults to the {@link BasicCrawlingContext}.
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
export function createBasicRouter<Context extends BasicCrawlingContext = BasicCrawlingContext>() {
    return Router.create<Context>();
}
