import { dirname } from 'node:path';

import type { Log } from '@apify/log';
import defaultLog, { LogLevel } from '@apify/log';
import { addTimeoutToPromise, TimeoutError, tryCancel } from '@apify/timeout';
import { cryptoRandomObjectId } from '@apify/utilities';
import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    AutoscaledPoolOptions,
    CrawlingContext,
    EnqueueLinksOptions,
    EventManager,
    DatasetExportOptions,
    FinalStatistics,
    GetUserDataFromRequest,
    IRequestList,
    ProxyInfo,
    Request,
    RequestOptions,
    RouterHandler,
    RouterRoutes,
    Session,
    SessionPoolOptions,
    Source,
    StatisticState,
    StatisticsOptions,
    LoadedContext,
    BaseHttpClient,
    RestrictedCrawlingContext,
} from '@crawlee/core';
import {
    AutoscaledPool,
    Configuration,
    CriticalError,
    Dataset,
    enqueueLinks,
    EnqueueStrategy,
    EventType,
    KeyValueStore,
    mergeCookies,
    NonRetryableError,
    purgeDefaultStorages,
    RequestProvider,
    RequestQueueV1,
    RequestQueue,
    RequestState,
    RetryRequestError,
    Router,
    SessionError,
    SessionPool,
    Statistics,
    validators,
    GotScrapingHttpClient,
} from '@crawlee/core';
import type { Awaitable, BatchAddRequestsResult, Dictionary, SetStatusMessageOptions } from '@crawlee/types';
import { ROTATE_PROXY_ERRORS } from '@crawlee/utils';
import { stringify } from 'csv-stringify/sync';
import { ensureDir, writeFile, writeJSON } from 'fs-extra';
// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { OptionsInit, Method, GotResponse } from 'got-scraping';
import ow, { ArgumentError } from 'ow';
import { getDomain } from 'tldts';
import type { SetRequired } from 'type-fest';

import { createSendRequest } from './send-request';

export interface BasicCrawlingContext<UserData extends Dictionary = Dictionary>
    extends CrawlingContext<BasicCrawler, UserData> {
    /**
     * This function automatically finds and enqueues links from the current page, adding them to the {@apilink RequestQueue}
     * currently used by the crawler.
     *
     * Optionally, the function allows you to filter the target links' URLs using an array of globs or regular expressions
     * and override settings of the enqueued {@apilink Request} objects.
     *
     * Check out the [Crawl a website with relative links](https://crawlee.dev/docs/examples/crawl-relative-links) example
     * for more details regarding its usage.
     *
     * **Example usage**
     *
     * ```ts
     * async requestHandler({ enqueueLinks }) {
     *     await enqueueLinks({
     *       urls: [...],
     *     });
     * },
     * ```
     *
     * @param [options] All `enqueueLinks()` parameters are passed via an options object.
     * @returns Promise that resolves to {@apilink BatchAddRequestsResult} object.
     */
    enqueueLinks(options?: SetRequired<EnqueueLinksOptions, 'urls'>): Promise<BatchAddRequestsResult>;
}

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

export type RequestHandler<
    Context extends CrawlingContext = LoadedContext<BasicCrawlingContext & RestrictedCrawlingContext>,
> = (inputs: LoadedContext<Context>) => Awaitable<void>;

export type ErrorHandler<
    Context extends CrawlingContext = LoadedContext<BasicCrawlingContext & RestrictedCrawlingContext>,
> = (inputs: LoadedContext<Context>, error: Error) => Awaitable<void>;

export interface StatusMessageCallbackParams<
    Context extends CrawlingContext = BasicCrawlingContext,
    Crawler extends BasicCrawler<any> = BasicCrawler<Context>,
> {
    state: StatisticState;
    crawler: Crawler;
    previousState: StatisticState;
    message: string;
}

export type StatusMessageCallback<
    Context extends CrawlingContext = BasicCrawlingContext,
    Crawler extends BasicCrawler<any> = BasicCrawler<Context>,
> = (params: StatusMessageCallbackParams<Context, Crawler>) => Awaitable<void>;

export interface BasicCrawlerOptions<Context extends CrawlingContext = BasicCrawlingContext> {
    /**
     * User-provided function that performs the logic of the crawler. It is called for each URL to crawl.
     *
     * The function receives the {@apilink BasicCrawlingContext} as an argument,
     * where the {@apilink BasicCrawlingContext.request|`request`} represents the URL to crawl.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to the {@apilink BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     * If all the retries fail, the crawler calls the function
     * provided to the {@apilink BasicCrawlerOptions.failedRequestHandler|`failedRequestHandler`} parameter.
     * To make this work, we should **always**
     * let our function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@apilink Request.pushErrorMessage|`Request.pushErrorMessage()`} function.
     */
    requestHandler?: RequestHandler<LoadedContext<Context>>;

    /**
     * User-provided function that performs the logic of the crawler. It is called for each URL to crawl.
     *
     * The function receives the {@apilink BasicCrawlingContext} as an argument,
     * where the {@apilink BasicCrawlingContext.request|`request`} represents the URL to crawl.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to the {@apilink BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     * If all the retries fail, the crawler calls the function
     * provided to the {@apilink BasicCrawlerOptions.failedRequestHandler|`failedRequestHandler`} parameter.
     * To make this work, we should **always**
     * let our function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@apilink Request.pushErrorMessage|`Request.pushErrorMessage()`} function.
     *
     * @deprecated `handleRequestFunction` has been renamed to `requestHandler` and will be removed in a future version.
     * @ignore
     */
    handleRequestFunction?: RequestHandler<Context>;

    /**
     * Static list of URLs to be processed.
     * If not provided, the crawler will open the default request queue when the {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} function is called.
     * > Alternatively, `requests` parameter of {@apilink BasicCrawler.run|`crawler.run()`} could be used to enqueue the initial requests -
     * it is a shortcut for running `crawler.addRequests()` before the `crawler.run()`.
     */
    requestList?: IRequestList;

    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     * If not provided, the crawler will open the default request queue when the {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} function is called.
     * > Alternatively, `requests` parameter of {@apilink BasicCrawler.run|`crawler.run()`} could be used to enqueue the initial requests -
     * it is a shortcut for running `crawler.addRequests()` before the `crawler.run()`.
     */
    requestQueue?: RequestProvider;

    /**
     * Timeout in which the function passed as {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`} needs to finish, in seconds.
     * @default 60
     */
    requestHandlerTimeoutSecs?: number;

    /**
     * Timeout in which the function passed as {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`} needs to finish, in seconds.
     * @default 60
     * @deprecated `handleRequestTimeoutSecs` has been renamed to `requestHandlerTimeoutSecs` and will be removed in a future version.
     * @ignore
     */
    handleRequestTimeoutSecs?: number;

    /**
     * User-provided function that allows modifying the request object before it gets retried by the crawler.
     * It's executed before each retry for the requests that failed less than {@apilink BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@apilink BasicCrawlingContext} as the first argument,
     * where the {@apilink BasicCrawlingContext.request|`request`} corresponds to the request to be retried.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    errorHandler?: ErrorHandler<Context>;

    /**
     * A function to handle requests that failed more than {@apilink BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@apilink BasicCrawlingContext} as the first argument,
     * where the {@apilink BasicCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    failedRequestHandler?: ErrorHandler<Context>;

    /**
     * A function to handle requests that failed more than {@apilink BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@apilink BasicCrawlingContext} as the first argument,
     * where the {@apilink BasicCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     *
     * @deprecated `handleFailedRequestFunction` has been renamed to `failedRequestHandler` and will be removed in a future version.
     * @ignore
     */
    handleFailedRequestFunction?: ErrorHandler<Context>;

    /**
     * Indicates how many times the request is retried if {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`} fails.
     * @default 3
     */
    maxRequestRetries?: number;

    /**
     * Indicates how much time (in seconds) to wait before crawling another same domain request.
     * @default 0
     */
    sameDomainDelaySecs?: number;

    /**
     * Maximum number of session rotations per request.
     * The crawler will automatically rotate the session in case of a proxy error or if it gets blocked by the website.
     *
     * The session rotations are not counted towards the {@apilink BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} limit.
     * @default 10
     */
    maxSessionRotations?: number;

    /**
     * Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
     * This value should always be set in order to prevent infinite loops in misconfigured crawlers.
     * > *NOTE:* In cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
     */
    maxRequestsPerCrawl?: number;

    /**
     * Custom options passed to the underlying {@apilink AutoscaledPool} constructor.
     * > *NOTE:* The {@apilink AutoscaledPoolOptions.runTaskFunction|`runTaskFunction`}
     * and {@apilink AutoscaledPoolOptions.isTaskReadyFunction|`isTaskReadyFunction`} options
     * are provided by the crawler and cannot be overridden.
     * However, we can provide a custom implementation of {@apilink AutoscaledPoolOptions.isFinishedFunction|`isFinishedFunction`}.
     */
    autoscaledPoolOptions?: AutoscaledPoolOptions;

    /**
     * Sets the minimum concurrency (parallelism) for the crawl. Shortcut for the
     * AutoscaledPool {@apilink AutoscaledPoolOptions.minConcurrency|`minConcurrency`} option.
     * > *WARNING:* If we set this value too high with respect to the available system memory and CPU, our crawler will run extremely slow or crash.
     * If not sure, it's better to keep the default value and the concurrency will scale up automatically.
     */
    minConcurrency?: number;

    /**
     * Sets the maximum concurrency (parallelism) for the crawl. Shortcut for the
     * AutoscaledPool {@apilink AutoscaledPoolOptions.maxConcurrency|`maxConcurrency`} option.
     */
    maxConcurrency?: number;

    /**
     * The maximum number of requests per minute the crawler should run.
     * By default, this is set to `Infinity`, but we can pass any positive, non-zero integer.
     * Shortcut for the AutoscaledPool {@apilink AutoscaledPoolOptions.maxTasksPerMinute|`maxTasksPerMinute`} option.
     */
    maxRequestsPerMinute?: number;

    /**
     * Allows to keep the crawler alive even if the {@apilink RequestQueue} gets empty.
     * By default, the `crawler.run()` will resolve once the queue is empty. With `keepAlive: true` it will keep running,
     * waiting for more requests to come. Use `crawler.stop()` to exit the crawler gracefully, or `crawler.teardown()` to stop it immediately.
     */
    keepAlive?: boolean;

    /**
     * Basic crawler will initialize the {@apilink SessionPool} with the corresponding {@apilink SessionPoolOptions|`sessionPoolOptions`}.
     * The session instance will be than available in the {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`}.
     */
    useSessionPool?: boolean;

    /**
     * The configuration options for {@apilink SessionPool} to use.
     */
    sessionPoolOptions?: SessionPoolOptions;

    /**
     * Defines the length of the interval for calling the `setStatusMessage` in seconds.
     */
    statusMessageLoggingInterval?: number;

    /**
     * Allows overriding the default status message. The callback needs to call `crawler.setStatusMessage()` explicitly.
     * The default status message is provided in the parameters.
     *
     * ```ts
     * const crawler = new CheerioCrawler({
     *     statusMessageCallback: async (ctx) => {
     *         return ctx.crawler.setStatusMessage(`this is status message from ${new Date().toISOString()}`, { level: 'INFO' }); // log level defaults to 'DEBUG'
     *     },
     *     statusMessageLoggingInterval: 1, // defaults to 10s
     *     async requestHandler({ $, enqueueLinks, request, log }) {
     *         // ...
     *     },
     * });
     * ```
     */
    statusMessageCallback?: StatusMessageCallback;

    /**
     * If set to `true`, the crawler will automatically try to bypass any detected bot protection.
     *
     * Currently supports:
     * - [**Cloudflare** Bot Management](https://www.cloudflare.com/products/bot-management/)
     * - [**Google Search** Rate Limiting](https://www.google.com/sorry/)
     */
    retryOnBlocked?: boolean;

    /** @internal */
    log?: Log;

    /**
     * Enables experimental features of Crawlee, which can alter the behavior of the crawler.
     * WARNING: these options are not guaranteed to be stable and may change or be removed at any time.
     */
    experiments?: CrawlerExperiments;

    /**
     * Customize the way statistics collecting works, such as logging interval or
     * whether to output them to the Key-Value store.
     */
    statisticsOptions?: StatisticsOptions;

    /**
     * HTTP client implementation for the `sendRequest` context helper and for plain HTTP crawling.
     * Defaults to a new instance of {@apilink GotScrapingHttpClient}
     */
    httpClient?: BaseHttpClient;
}

/**
 * A set of options that you can toggle to enable experimental features in Crawlee.
 *
 * NOTE: These options will not respect semantic versioning and may be removed or changed at any time. Use at your own risk.
 * If you do use these and encounter issues, please report them to us.
 */
export interface CrawlerExperiments {
    /**
     * @deprecated This experiment is now enabled by default, and this flag will be removed in a future release.
     * If you encounter issues due to this change, please:
     * - report it to us: https://github.com/apify/crawlee
     * - set `requestLocking` to `false` in the `experiments` option of the crawler
     */
    requestLocking?: boolean;
}

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
export class BasicCrawler<Context extends CrawlingContext = BasicCrawlingContext> {
    protected static readonly CRAWLEE_STATE_KEY = 'CRAWLEE_STATE';

    /**
     * A reference to the underlying {@apilink Statistics} class that collects and logs run statistics for requests.
     */
    readonly stats: Statistics;

    /**
     * A reference to the underlying {@apilink RequestList} class that manages the crawler's {@apilink Request|requests}.
     * Only available if used by the crawler.
     */
    requestList?: IRequestList;

    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     * A reference to the underlying {@apilink RequestQueue} class that manages the crawler's {@apilink Request|requests}.
     * Only available if used by the crawler.
     */
    requestQueue?: RequestProvider;

    /**
     * A reference to the underlying {@apilink SessionPool} class that manages the crawler's {@apilink Session|sessions}.
     * Only available if used by the crawler.
     */
    sessionPool?: SessionPool;

    /**
     * A reference to the underlying {@apilink AutoscaledPool} class that manages the concurrency of the crawler.
     * > *NOTE:* This property is only initialized after calling the {@apilink BasicCrawler.run|`crawler.run()`} function.
     * We can use it to change the concurrency settings on the fly,
     * to pause the crawler by calling {@apilink AutoscaledPool.pause|`autoscaledPool.pause()`}
     * or to abort it by calling {@apilink AutoscaledPool.abort|`autoscaledPool.abort()`}.
     */
    autoscaledPool?: AutoscaledPool;

    /**
     * Default {@apilink Router} instance that will be used if we don't specify any {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`}.
     * See {@apilink Router.addHandler|`router.addHandler()`} and {@apilink Router.addDefaultHandler|`router.addDefaultHandler()`}.
     */
    readonly router: RouterHandler<LoadedContext<Context>> = Router.create<LoadedContext<Context>>();

    running = false;
    hasFinishedBefore = false;

    readonly log: Log;
    protected requestHandler!: RequestHandler<Context>;
    protected errorHandler?: ErrorHandler<Context>;
    protected failedRequestHandler?: ErrorHandler<Context>;
    protected requestHandlerTimeoutMillis!: number;
    protected internalTimeoutMillis: number;
    protected maxRequestRetries: number;
    protected sameDomainDelayMillis: number;
    protected domainAccessedTime: Map<string, number>;
    protected maxSessionRotations: number;
    protected handledRequestsCount: number;
    protected statusMessageLoggingInterval: number;
    protected statusMessageCallback?: StatusMessageCallback;
    protected sessionPoolOptions: SessionPoolOptions;
    protected useSessionPool: boolean;
    protected crawlingContexts = new Map<string, Context>();
    protected autoscaledPoolOptions: AutoscaledPoolOptions;
    protected events: EventManager;
    protected httpClient: BaseHttpClient;
    protected retryOnBlocked: boolean;
    private _closeEvents?: boolean;

    private experiments: CrawlerExperiments;
    private _experimentWarnings: Partial<Record<keyof CrawlerExperiments, boolean>> = {};

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
        sameDomainDelaySecs: ow.optional.number,
        maxSessionRotations: ow.optional.number,
        maxRequestsPerCrawl: ow.optional.number,
        autoscaledPoolOptions: ow.optional.object,
        sessionPoolOptions: ow.optional.object,
        useSessionPool: ow.optional.boolean,

        statusMessageLoggingInterval: ow.optional.number,
        statusMessageCallback: ow.optional.function,

        retryOnBlocked: ow.optional.boolean,
        httpClient: ow.optional.object,

        // AutoscaledPool shorthands
        minConcurrency: ow.optional.number,
        maxConcurrency: ow.optional.number,
        maxRequestsPerMinute: ow.optional.number.integerOrInfinite.positive.greaterThanOrEqual(1),
        keepAlive: ow.optional.boolean,

        // internal
        log: ow.optional.object,
        experiments: ow.optional.object,

        statisticsOptions: ow.optional.object,
    };

    /**
     * All `BasicCrawler` parameters are passed via an options object.
     */
    constructor(
        options: BasicCrawlerOptions<Context> = {},
        readonly config = Configuration.getGlobalConfig(),
    ) {
        ow(options, 'BasicCrawlerOptions', ow.object.exactShape(BasicCrawler.optionsShape));

        const {
            requestList,
            requestQueue,
            maxRequestRetries = 3,
            sameDomainDelaySecs = 0,
            maxSessionRotations = 10,
            maxRequestsPerCrawl,
            autoscaledPoolOptions = {},
            keepAlive,
            sessionPoolOptions = {},
            useSessionPool = true,

            // AutoscaledPool shorthands
            minConcurrency,
            maxConcurrency,
            maxRequestsPerMinute,

            retryOnBlocked = false,

            // internal
            log = defaultLog.child({ prefix: this.constructor.name }),
            experiments = {},

            // Old and new request handler methods
            handleRequestFunction,
            requestHandler,

            handleRequestTimeoutSecs,
            requestHandlerTimeoutSecs,

            errorHandler,

            handleFailedRequestFunction,
            failedRequestHandler,

            statusMessageLoggingInterval = 10,
            statusMessageCallback,

            statisticsOptions,
            httpClient,
        } = options;

        this.requestList = requestList;
        this.requestQueue = requestQueue;
        this.httpClient = httpClient ?? new GotScrapingHttpClient();
        this.log = log;
        this.statusMessageLoggingInterval = statusMessageLoggingInterval;
        this.statusMessageCallback = statusMessageCallback as StatusMessageCallback;
        this.events = config.getEventManager();
        this.domainAccessedTime = new Map();
        this.experiments = experiments;

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

        this.retryOnBlocked = retryOnBlocked;

        this._handlePropertyNameChange({
            newName: 'requestHandlerTimeoutSecs',
            oldName: 'handleRequestTimeoutSecs',
            propertyKey: 'requestHandlerTimeoutMillis',
            newProperty: newRequestHandlerTimeout,
            oldProperty: handleRequestTimeoutSecs ? handleRequestTimeoutSecs * 1000 : undefined,
        });

        const tryEnv = (val?: string) => (val == null ? null : +val);
        // allow at least 5min for internal timeouts
        this.internalTimeoutMillis =
            tryEnv(process.env.CRAWLEE_INTERNAL_TIMEOUT) ?? Math.max(this.requestHandlerTimeoutMillis * 2, 300e3);

        // override the default internal timeout of request queue to respect `requestHandlerTimeoutMillis`
        if (this.requestQueue) {
            this.requestQueue.internalTimeoutMillis = this.internalTimeoutMillis;
            // for request queue v2, we want to lock requests for slightly longer than the request handler timeout so that there is some padding for locking-related overhead,
            // but never for less than a minute
            this.requestQueue.requestLockSecs = Math.max(this.requestHandlerTimeoutMillis / 1000 + 5, 60);
        }

        this.maxRequestRetries = maxRequestRetries;
        this.sameDomainDelayMillis = sameDomainDelaySecs * 1000;
        this.maxSessionRotations = maxSessionRotations;
        this.handledRequestsCount = 0;
        this.stats = new Statistics({
            logMessage: `${log.getOptions().prefix} request statistics:`,
            log,
            config,
            ...statisticsOptions,
        });
        this.sessionPoolOptions = {
            ...sessionPoolOptions,
            log,
        };
        if (this.retryOnBlocked) {
            this.sessionPoolOptions.blockedStatusCodes = sessionPoolOptions.blockedStatusCodes ?? [];
            if (this.sessionPoolOptions.blockedStatusCodes.length !== 0) {
                log.warning(
                    `Both 'blockedStatusCodes' and 'retryOnBlocked' are set. Please note that the 'retryOnBlocked' feature might not work as expected.`,
                );
            }
        }
        this.useSessionPool = useSessionPool;
        this.crawlingContexts = new Map();

        const maxSignedInteger = 2 ** 31 - 1;
        if (this.requestHandlerTimeoutMillis > maxSignedInteger) {
            log.warning(
                `requestHandlerTimeoutMillis ${this.requestHandlerTimeoutMillis}` +
                    ` does not fit a signed 32-bit integer. Limiting the value to ${maxSignedInteger}`,
            );

            this.requestHandlerTimeoutMillis = maxSignedInteger;
        }

        this.internalTimeoutMillis = Math.min(this.internalTimeoutMillis, maxSignedInteger);

        let shouldLogMaxPagesExceeded = true;
        const isMaxPagesExceeded = () => maxRequestsPerCrawl && maxRequestsPerCrawl <= this.handledRequestsCount;

        let { isFinishedFunction } = autoscaledPoolOptions;

        // override even if `isFinishedFunction` provided by user - `keepAlive` has higher priority
        if (keepAlive) {
            isFinishedFunction = async () => false;
        }

        const basicCrawlerAutoscaledPoolConfiguration: Partial<AutoscaledPoolOptions> = {
            minConcurrency: minConcurrency ?? autoscaledPoolOptions?.minConcurrency,
            maxConcurrency: maxConcurrency ?? autoscaledPoolOptions?.maxConcurrency,
            maxTasksPerMinute: maxRequestsPerMinute ?? autoscaledPoolOptions?.maxTasksPerMinute,
            runTaskFunction: this._runTaskFunction.bind(this),
            isTaskReadyFunction: async () => {
                if (isMaxPagesExceeded()) {
                    if (shouldLogMaxPagesExceeded) {
                        log.info(
                            'Crawler reached the maxRequestsPerCrawl limit of ' +
                                `${maxRequestsPerCrawl} requests and will shut down soon. Requests that are in progress will be allowed to finish.`,
                        );
                        shouldLogMaxPagesExceeded = false;
                    }
                    return false;
                }

                return this._isTaskReadyFunction();
            },
            isFinishedFunction: async () => {
                if (isMaxPagesExceeded()) {
                    log.info(
                        `Earlier, the crawler reached the maxRequestsPerCrawl limit of ${maxRequestsPerCrawl} requests ` +
                            'and all requests that were in progress at that time have now finished. ' +
                            `In total, the crawler processed ${this.handledRequestsCount} requests and will shut down.`,
                    );
                    return true;
                }

                const isFinished = isFinishedFunction
                    ? await isFinishedFunction()
                    : await this._defaultIsFinishedFunction();

                if (isFinished) {
                    const reason = isFinishedFunction
                        ? "Crawler's custom isFinishedFunction() returned true, the crawler will shut down."
                        : 'All requests from the queue have been processed, the crawler will shut down.';
                    log.info(reason);
                }

                return isFinished;
            },
            log,
        };

        this.autoscaledPoolOptions = { ...autoscaledPoolOptions, ...basicCrawlerAutoscaledPoolConfiguration };
    }

    /**
     * Checks if the given error is a proxy error by comparing its message to a list of known proxy error messages.
     * Used for retrying requests that failed due to proxy errors.
     *
     * @param error The error to check.
     */
    protected isProxyError(error: Error): boolean {
        return ROTATE_PROXY_ERRORS.some((x: string) => (this._getMessageFromError(error) as any)?.includes(x));
    }

    /**
     * Checks whether the given crawling context is getting blocked by anti-bot protection using several heuristics.
     * Returns `false` if the request is not blocked, otherwise returns a string with a description of the block reason.
     * @param _crawlingContext The crawling context to check.
     */
    protected async isRequestBlocked(_crawlingContext: Context): Promise<string | false> {
        throw new Error('the "isRequestBlocked" method is not implemented in this crawler.');
    }

    /**
     * This method is periodically called by the crawler, every `statusMessageLoggingInterval` seconds.
     */
    async setStatusMessage(message: string, options: SetStatusMessageOptions = {}) {
        const data =
            options.isStatusMessageTerminal != null ? { terminal: options.isStatusMessageTerminal } : undefined;
        this.log.internal(LogLevel[(options.level as 'DEBUG') ?? 'DEBUG'], message, data);

        const client = this.config.getStorageClient();

        if (!client.setStatusMessage) {
            return;
        }

        // just to be sure, this should be fast
        await addTimeoutToPromise(
            async () => client.setStatusMessage!(message, options),
            1000,
            'Setting status message timed out after 1s',
        ).catch((e) => this.log.debug(e.message));
    }

    private getPeriodicLogger() {
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
            let message: string;

            if (operationMode === 'ERROR') {
                message = `Experiencing problems, ${
                    this.stats.state.requestsFailed - previousState.requestsFailed || this.stats.state.requestsFailed
                } failed requests in the past ${this.statusMessageLoggingInterval} seconds.`;
            } else {
                const total = this.requestQueue?.getTotalCount() || this.requestList?.length();
                message = `Crawled ${this.stats.state.requestsFinished}${total ? `/${total}` : ''} pages, ${
                    this.stats.state.requestsFailed
                } failed requests, desired concurrency ${this.autoscaledPool?.desiredConcurrency ?? 0}.`;
            }

            if (this.statusMessageCallback) {
                return this.statusMessageCallback({
                    crawler: this as any,
                    state: this.stats.state,
                    previousState,
                    message,
                });
            }

            await this.setStatusMessage(message);
        };

        const interval = setInterval(log, this.statusMessageLoggingInterval * 1e3);
        return { log, stop: () => clearInterval(interval) };
    }

    /**
     * Runs the crawler. Returns a promise that resolves once all the requests are processed
     * and `autoscaledPool.isFinished` returns `true`.
     *
     * We can use the `requests` parameter to enqueue the initial requests — it is a shortcut for
     * running {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} before {@apilink BasicCrawler.run|`crawler.run()`}.
     *
     * @param [requests] The requests to add.
     * @param [options] Options for the request queue.
     */
    async run(requests?: (string | Request | RequestOptions)[], options?: CrawlerRunOptions): Promise<FinalStatistics> {
        if (this.running) {
            throw new Error(
                'This crawler instance is already running, you can add more requests to it via `crawler.addRequests()`.',
            );
        }

        const { purgeRequestQueue = true, ...addRequestsOptions } = options ?? {};

        if (this.hasFinishedBefore) {
            // When executing the run method for the second time explicitly,
            // we need to purge the default RQ to allow processing the same requests again - this is important so users can
            // pass in failed requests back to the `crawler.run()`, otherwise they would be considered as handled and
            // ignored - as a failed requests is still handled.
            if (this.requestQueue?.name === 'default' && purgeRequestQueue) {
                await this.requestQueue.drop();
                this.requestQueue = await this._getRequestQueue();
            }

            this.stats.reset();
            await this.stats.resetStore();
            await this.sessionPool?.resetStore();
        }

        this.running = true;

        await purgeDefaultStorages({ onlyPurgeOnce: true });

        if (requests) {
            await this.addRequests(requests, addRequestsOptions);
        }

        await this._init();
        await this.stats.startCapturing();
        const periodicLogger = this.getPeriodicLogger();
        await this.setStatusMessage('Starting the crawler.', { level: 'INFO' });

        const sigintHandler = async () => {
            this.log.warning(
                'Pausing... Press CTRL+C again to force exit. To resume, do: CRAWLEE_PURGE_ON_START=0 npm start',
            );
            await this._pauseOnMigration();
            await this.autoscaledPool!.abort();
        };

        // Attach a listener to handle migration and aborting events gracefully.
        const boundPauseOnMigration = this._pauseOnMigration.bind(this);
        process.once('SIGINT', sigintHandler);
        this.events.on(EventType.MIGRATING, boundPauseOnMigration);
        this.events.on(EventType.ABORTING, boundPauseOnMigration);

        let stats = {} as FinalStatistics;

        try {
            await this.autoscaledPool!.run();
        } finally {
            await this.teardown();
            await this.stats.stopCapturing();

            process.off('SIGINT', sigintHandler);
            this.events.off(EventType.MIGRATING, boundPauseOnMigration);
            this.events.off(EventType.ABORTING, boundPauseOnMigration);

            const finalStats = this.stats.calculate();
            stats = {
                requestsFinished: this.stats.state.requestsFinished,
                requestsFailed: this.stats.state.requestsFailed,
                retryHistogram: this.stats.requestRetryHistogram,
                ...finalStats,
            };
            this.log.info('Final request statistics:', stats);

            if (this.stats.errorTracker.total !== 0) {
                const prettify = ([count, info]: [number, string[]]) =>
                    `${count}x: ${info.at(-1)!.trim()} (${info[0]})`;

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
            await this.setStatusMessage(
                `Finished! Total ${this.stats.state.requestsFinished + this.stats.state.requestsFailed} requests: ${
                    this.stats.state.requestsFinished
                } succeeded, ${this.stats.state.requestsFailed} failed.`,
                { isStatusMessageTerminal: true, level: 'INFO' },
            );
            this.running = false;
            this.hasFinishedBefore = true;
        }

        return stats;
    }

    /**
     * Gracefully stops the current run of the crawler.
     *
     * All the tasks active at the time of calling this method will be allowed to finish.
     */
    stop(message = 'The crawler has been gracefully stopped.'): void {
        // Gracefully starve the this.autoscaledPool, so it doesn't start new tasks. Resolves once the pool is cleared.
        this.autoscaledPool
            ?.pause()
            // Resolves the `autoscaledPool.run()` promise in the `BasicCrawler.run()` method. Since the pool is already paused, it resolves immediately and doesn't kill any tasks.
            .then(async () => this.autoscaledPool?.abort())
            .then(() => this.log.info(message))
            .catch((err) => {
                this.log.error('An error occurred when stopping the crawler:', err);
            });
    }

    async getRequestQueue() {
        if (!this.requestQueue && this.requestList) {
            this.log.warningOnce(
                'When using RequestList and RequestQueue at the same time, you should instantiate both explicitly and provide them in the crawler options, to ensure correctly handled restarts of the crawler.',
            );
        }

        this.requestQueue ??= await this._getRequestQueue();

        return this.requestQueue!;
    }

    async useState<State extends Dictionary = Dictionary>(defaultValue = {} as State): Promise<State> {
        const kvs = await KeyValueStore.open(null, { config: this.config });
        return kvs.getAutoSavedValue<State>(BasicCrawler.CRAWLEE_STATE_KEY, defaultValue);
    }

    /**
     * Adds requests to the queue in batches. By default, it will resolve after the initial batch is added, and continue
     * adding the rest in background. You can configure the batch size via `batchSize` option and the sleep time in between
     * the batches via `waitBetweenBatchesMillis`. If you want to wait for all batches to be added to the queue, you can use
     * the `waitForAllRequestsToBeAdded` promise you get in the response object.
     *
     * This is an alias for calling `addRequestsBatched()` on the implicit `RequestQueue` for this crawler instance.
     *
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    async addRequests(
        requests: (string | Source)[],
        options: CrawlerAddRequestsOptions = {},
    ): Promise<CrawlerAddRequestsResult> {
        const requestQueue = await this.getRequestQueue();
        return requestQueue.addRequestsBatched(requests, options);
    }

    /**
     * Pushes data to the specified {@apilink Dataset}, or the default crawler {@apilink Dataset} by calling {@apilink Dataset.pushData}.
     */
    async pushData(data: Parameters<Dataset['pushData']>[0], datasetIdOrName?: string): Promise<void> {
        const dataset = await this.getDataset(datasetIdOrName);
        return dataset.pushData(data);
    }

    /**
     * Retrieves the specified {@apilink Dataset}, or the default crawler {@apilink Dataset}.
     */
    async getDataset(idOrName?: string): Promise<Dataset> {
        return Dataset.open(idOrName, { config: this.config });
    }

    /**
     * Retrieves data from the default crawler {@apilink Dataset} by calling {@apilink Dataset.getData}.
     */
    async getData(...args: Parameters<Dataset['getData']>): ReturnType<Dataset['getData']> {
        const dataset = await this.getDataset();
        return dataset.getData(...args);
    }

    /**
     * Retrieves all the data from the default crawler {@apilink Dataset} and exports them to the specified format.
     * Supported formats are currently 'json' and 'csv', and will be inferred from the `path` automatically.
     */
    async exportData<Data>(path: string, format?: 'json' | 'csv', options?: DatasetExportOptions): Promise<Data[]> {
        const supportedFormats = ['json', 'csv'];

        if (!format && path.match(/\.(json|csv)$/i)) {
            format = path.toLowerCase().match(/\.(json|csv)$/)![1] as 'json' | 'csv';
        }

        if (!format) {
            throw new Error(
                `Failed to infer format from the path: '${path}'. Supported formats: ${supportedFormats.join(', ')}`,
            );
        }

        if (!supportedFormats.includes(format)) {
            throw new Error(`Unsupported format: '${format}'. Use one of ${supportedFormats.join(', ')}`);
        }

        const dataset = await this.getDataset();
        const items = await dataset.export(options);

        if (format === 'csv') {
            const value = stringify([Object.keys(items[0]), ...items.map((item) => Object.values(item))]);
            await ensureDir(dirname(path));
            await writeFile(path, value);
            this.log.info(`Export to ${path} finished!`);
        }

        if (format === 'json') {
            await ensureDir(dirname(path));
            await writeJSON(path, items, { spaces: 4 });
            this.log.info(`Export to ${path} finished!`);
        }

        return items;
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
            this.sessionPool = await SessionPool.open(this.sessionPoolOptions, this.config);
            // Assuming there are not more than 20 browsers running at once;
            this.sessionPool.setMaxListeners(20);
        }

        await this._loadHandledRequestCount();
    }

    protected async _runRequestHandler(crawlingContext: Context): Promise<void> {
        await this.requestHandler(crawlingContext as LoadedContext<Context>);
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
            await this.autoscaledPool.pause(SAFE_MIGRATION_WAIT_MILLIS).catch((err) => {
                if (err.message.includes('running tasks did not finish')) {
                    this.log.error(
                        'The crawler was paused due to migration to another host, ' +
                            "but some requests did not finish in time. Those requests' results may be duplicated.",
                    );
                } else {
                    throw err;
                }
            });
        }

        const requestListPersistPromise = (async () => {
            if (this.requestList) {
                if (await this.requestList.isFinished()) return;
                await this.requestList.persistState().catch((err) => {
                    if (err.message.includes('Cannot persist state.')) {
                        this.log.error(
                            "The crawler attempted to persist its request list's state and failed due to missing or " +
                                'invalid config. Make sure to use either RequestList.open() or the "stateKeyPrefix" option of RequestList ' +
                                'constructor to ensure your crawling state is persisted through host migrations and restarts.',
                        );
                    } else {
                        this.log.exception(
                            err,
                            'An unexpected error occurred when the crawler ' +
                                "attempted to persist its request list's state.",
                        );
                    }
                });
            }
        })();

        await Promise.all([requestListPersistPromise, this.stats.persistState()]);
    }

    /**
     * Fetches request from either RequestList or RequestQueue. If request comes from a RequestList
     * and RequestQueue is present then enqueues it to the queue first.
     */
    protected async _fetchNextRequest() {
        if (!this.requestList || (await this.requestList.isFinished())) {
            return this.requestQueue?.fetchNextRequest();
        }

        const request = await this.requestList.fetchNextRequest();
        if (!this.requestQueue) return request;
        if (!request) return this.requestQueue.fetchNextRequest();

        try {
            await this.requestQueue.addRequest(request, { forefront: true });
        } catch (err) {
            // If requestQueue.addRequest() fails here then we must reclaim it back to
            // the RequestList because probably it's not yet in the queue!
            this.log.error(
                'Adding of request from the RequestList to the RequestQueue failed, reclaiming request back to the list.',
                { request },
            );
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
    protected async _cleanupContext(_crawlingContext: Context) {}

    /**
     * Delays processing of the request based on the `sameDomainDelaySecs` option,
     * adding it back to the queue after the timeout passes. Returns `true` if the request
     * should be ignored and will be reclaimed to the queue once ready.
     */
    protected delayRequest(request: Request, source: IRequestList | RequestProvider) {
        const domain = getDomain(request.url);

        if (!domain || !request) {
            return false;
        }

        const now = Date.now();
        const lastAccessTime = this.domainAccessedTime.get(domain);

        if (!lastAccessTime || now - lastAccessTime >= this.sameDomainDelayMillis) {
            this.domainAccessedTime.set(domain, now);
            return false;
        }

        if (source instanceof RequestQueueV1) {
            // eslint-disable-next-line dot-notation
            source['inProgress']?.delete(request.id!);
        }

        const delay = lastAccessTime + this.sameDomainDelayMillis - now;
        this.log.debug(
            `Request ${request.url} (${request.id}) will be reclaimed after ${delay} milliseconds due to same domain delay`,
        );
        setTimeout(async () => {
            this.log.debug(`Adding request ${request.url} (${request.id}) back to the queue`);

            if (source instanceof RequestQueueV1) {
                // eslint-disable-next-line dot-notation
                source['inProgress'].add(request.id!);
            }

            await source.reclaimRequest(request, { forefront: request.userData?.__crawlee?.forefront });
        }, delay);

        return true;
    }

    /**
     * Wrapper around requestHandler that fetches requests from RequestList/RequestQueue
     * then retries them in a case of an error, etc.
     */
    protected async _runTaskFunction() {
        const source = this.requestQueue || this.requestList || (await this.getRequestQueue());

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

        if (!request || this.delayRequest(request, source)) {
            return;
        }

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
            enqueueLinks: async (options: SetRequired<EnqueueLinksOptions, 'urls'>) => {
                return enqueueLinks({
                    // specify the RQ first to allow overriding it
                    requestQueue: await this.getRequestQueue(),
                    ...options,
                });
            },
            addRequests: this.addRequests.bind(this),
            pushData: this.pushData.bind(this),
            useState: this.useState.bind(this),
            sendRequest: createSendRequest(this.httpClient, request!, session, () => crawlingContext.proxyInfo?.url),
            getKeyValueStore: async (idOrName?: string) => KeyValueStore.open(idOrName, { config: this.config }),
        };

        this.crawlingContexts.set(crawlingContext.id, crawlingContext);

        try {
            request.state = RequestState.REQUEST_HANDLER;
            await addTimeoutToPromise(
                async () => this._runRequestHandler(crawlingContext),
                this.requestHandlerTimeoutMillis,
                `requestHandler timed out after ${this.requestHandlerTimeoutMillis / 1000} seconds (${request.id}).`,
            );

            await this._timeoutAndRetry(
                async () => source.markRequestHandled(request!),
                this.internalTimeoutMillis,
                `Marking request ${request.url} (${request.id}) as handled timed out after ${
                    this.internalTimeoutMillis / 1e3
                } seconds.`,
            );

            this.stats.finishJob(statisticsId);
            this.handledRequestsCount++;

            // reclaim session if request finishes successfully
            request.state = RequestState.DONE;
            crawlingContext.session?.markGood();
        } catch (err) {
            try {
                request.state = RequestState.ERROR_HANDLER;
                await addTimeoutToPromise(
                    async () => this._requestFunctionErrorHandler(err as Error, crawlingContext, source),
                    this.internalTimeoutMillis,
                    `Handling request failure of ${request.url} (${request.id}) timed out after ${
                        this.internalTimeoutMillis / 1e3
                    } seconds.`,
                );
                request.state = RequestState.DONE;
            } catch (secondaryError: any) {
                if (
                    !secondaryError.triggeredFromUserHandler &&
                    // avoid reprinting the same critical error multiple times, as it will be printed by Nodejs at the end anyway
                    !(secondaryError instanceof CriticalError)
                ) {
                    const apifySpecific = process.env.APIFY_IS_AT_HOME
                        ? `This may have happened due to an internal error of Apify's API or due to a misconfigured crawler.`
                        : '';
                    this.log.exception(
                        secondaryError as Error,
                        'An exception occurred during handling of failed request. ' +
                            `This places the crawler and its underlying storages into an unknown state and crawling will be terminated. ${apifySpecific}`,
                    );
                }
                request.state = RequestState.ERROR;
                throw secondaryError;
            }
            // decrease the session score if the request fails (but the error handler did not throw)
            crawlingContext.session?.markBad();
        } finally {
            await this._cleanupContext(crawlingContext);

            this.crawlingContexts.delete(crawlingContext.id);

            if (source instanceof RequestProvider) {
                // Always release a lock on a request at the end of the cycle
                try {
                    await source.client.deleteRequestLock(request.id!);
                } catch {
                    // We don't have the lock, or the request was never locked. Either way it's fine
                }
            }
        }
    }

    /**
     * Run async callback with given timeout and retry.
     * @ignore
     */
    protected async _timeoutAndRetry(
        handler: () => Promise<unknown>,
        timeout: number,
        error: Error | string,
        maxRetries = 3,
        retried = 1,
    ): Promise<void> {
        try {
            await addTimeoutToPromise(handler, timeout, error);
        } catch (e) {
            if (retried <= maxRetries) {
                // we retry on any error, not just timeout
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
        const isRequestListEmpty = this.requestList ? await this.requestList.isEmpty() : true;
        // If RequestList is not empty, task is ready, no reason to check RequestQueue.
        if (!isRequestListEmpty) return true;
        // If RequestQueue is not empty, task is ready, return true, otherwise false.
        return this.requestQueue ? !(await this.requestQueue.isEmpty()) : false;
    }

    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     */
    protected async _defaultIsFinishedFunction() {
        const [isRequestListFinished, isRequestQueueFinished] = await Promise.all([
            this.requestList ? this.requestList.isFinished() : true,
            this.requestQueue ? this.requestQueue.isFinished() : true,
        ]);
        // If both are finished, return true, otherwise return false.
        return isRequestListFinished && isRequestQueueFinished;
    }

    private async _rotateSession(crawlingContext: Context) {
        const { request } = crawlingContext;

        request.sessionRotationCount ??= 0;
        request.sessionRotationCount++;
        crawlingContext.session?.retire();
    }

    /**
     * Handles errors thrown by user provided requestHandler()
     */
    protected async _requestFunctionErrorHandler(
        error: Error,
        crawlingContext: Context,
        source: IRequestList | RequestProvider,
    ): Promise<void> {
        const { request } = crawlingContext;
        request.pushErrorMessage(error);

        if (error instanceof CriticalError) {
            throw error;
        }

        const shouldRetryRequest = this._canRequestBeRetried(request, error);

        if (shouldRetryRequest) {
            await this.stats.errorTrackerRetry.addAsync(error, crawlingContext);
            await this._tagUserHandlerError(() =>
                this.errorHandler?.(this._augmentContextWithDeprecatedError(crawlingContext, error), error),
            );

            if (error instanceof SessionError) {
                await this._rotateSession(crawlingContext);
            }

            if (!request.noRetry) {
                request.retryCount++;

                const { url, retryCount, id } = request;

                // We don't want to see the stack trace in the logs by default, when we are going to retry the request.
                // Thus, we print the full stack trace only when CRAWLEE_VERBOSE_LOG environment variable is set to true.
                const message = this._getMessageFromError(error);
                this.log.warning(`Reclaiming failed request back to the list or queue. ${message}`, {
                    id,
                    url,
                    retryCount,
                });

                await source.reclaimRequest(request, { forefront: request.userData?.__crawlee?.forefront });
                return;
            }
        }

        // If the request is non-retryable, the error and snapshot aren't saved in the errorTrackerRetry object.
        // Therefore, we pass the crawlingContext to the errorTracker.add method, enabling snapshot capture.
        // This is to make sure the error snapshot is not duplicated in the errorTrackerRetry and errorTracker objects.
        const { noRetry, maxRetries } = request;
        if (noRetry || !maxRetries) {
            await this.stats.errorTracker.addAsync(error, crawlingContext);
        } else {
            this.stats.errorTracker.add(error);
        }

        // If we get here, the request is either not retryable
        // or failed more than retryCount times and will not be retried anymore.
        // Mark the request as failed and do not retry.
        this.handledRequestsCount++;
        await source.markRequestHandled(request);
        this.stats.failJob(request.id || request.uniqueKey);

        await this._handleFailedRequestHandler(crawlingContext, error); // This function prints an error message.
    }

    protected async _tagUserHandlerError<T>(cb: () => unknown): Promise<T> {
        try {
            return (await cb()) as T;
        } catch (e: any) {
            Object.defineProperty(e, 'triggeredFromUserHandler', { value: true });
            throw e;
        }
    }

    protected async _handleFailedRequestHandler(crawlingContext: Context, error: Error): Promise<void> {
        // Always log the last error regardless if the user provided a failedRequestHandler
        const { id, url, method, uniqueKey } = crawlingContext.request;
        const message = this._getMessageFromError(error, true);

        this.log.error(`Request failed and reached maximum retries. ${message}`, { id, url, method, uniqueKey });

        if (this.failedRequestHandler) {
            await this._tagUserHandlerError(() =>
                this.failedRequestHandler?.(this._augmentContextWithDeprecatedError(crawlingContext, error), error),
            );
        }
    }

    /**
     * Resolves the most verbose error message from a thrown error
     * @param error The error received
     * @returns The message to be logged
     */
    protected _getMessageFromError(error: Error, forceStack = false) {
        if ([TypeError, SyntaxError, ReferenceError].some((type) => error instanceof type)) {
            forceStack = true;
        }

        const stackLines = error?.stack ? error.stack.split('\n') : new Error().stack!.split('\n').slice(2);

        const baseDir = process.cwd();
        const userLine = stackLines.find((line) => line.includes(baseDir) && !line.includes('node_modules'));

        if (error instanceof TimeoutError) {
            return process.env.CRAWLEE_VERBOSE_LOG ? error.stack : error.message || error; // stack in timeout errors does not really help
        }

        return process.env.CRAWLEE_VERBOSE_LOG || forceStack
            ? (error.stack ?? [error.message || error, ...stackLines].join('\n'))
            : [error.message || error, userLine].join('\n');
    }

    protected _canRequestBeRetried(request: Request, error: Error) {
        // Request should never be retried, or the error encountered makes it not able to be retried, or the session rotation limit has been reached
        if (
            request.noRetry ||
            error instanceof NonRetryableError ||
            (error instanceof SessionError && this.maxSessionRotations <= (request.sessionRotationCount ?? 0))
        ) {
            return false;
        }

        // User requested retry (we ignore retry count here as its explicitly told by the user to retry)
        if (error instanceof RetryRequestError) {
            return true;
        }

        // Ensure there are more retries available for the request
        const maxRequestRetries = request.maxRetries ?? this.maxRequestRetries;
        return request.retryCount < maxRequestRetries;
    }

    protected _augmentContextWithDeprecatedError(context: Context, error: Error) {
        Object.defineProperty(context, 'error', {
            get: () => {
                this.log.deprecated(
                    "The 'error' property of the crawling context is deprecated, and it is now passed as the second parameter in 'errorHandler' and 'failedRequestHandler'. Please update your code, as this property will be removed in a future version.",
                );

                return error;
            },
            configurable: true,
        });

        return context as LoadedContext<Context>;
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

    protected async _executeHooks<HookLike extends (...args: any[]) => Awaitable<void>>(
        hooks: HookLike[],
        ...args: Parameters<HookLike>
    ) {
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

        await this.autoscaledPool?.abort();
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
            this.log.warning(
                [
                    `Both "${newName}" and "${oldName}" were provided in the crawler options.`,
                    `"${oldName}" has been renamed to "${newName}", and will be removed in a future version.`,
                    `As such, "${newName}" will be used instead.`,
                ].join('\n'),
            );

            // @ts-expect-error Assigning to possibly readonly properties
            this[propertyKey] = newProperty;
        } else if (oldProperty) {
            this.log.warning(
                [
                    `"${oldName}" has been renamed to "${newName}", and will be removed in a future version.`,
                    `The provided value will be used, but you should rename "${oldName}" to "${newName}" in your crawler options.`,
                ].join('\n'),
            );

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
        if (request.headers?.Cookie && request.headers?.cookie) {
            this.log.warning(
                `Encountered mixed casing for the cookie headers for request ${request.url} (${request.id}). Their values will be merged.`,
            );
            return mergeCookies(request.url, [request.headers.cookie, request.headers.Cookie]);
        }

        return request.headers?.Cookie || request.headers?.cookie || '';
    }

    private async _getRequestQueue() {
        // Check if it's explicitly disabled
        if (this.experiments.requestLocking === false) {
            if (!this._experimentWarnings.requestLocking) {
                this.log.info('Using the old RequestQueue implementation without request locking.');
                this._experimentWarnings.requestLocking = true;
            }

            return RequestQueueV1.open(null, { config: this.config });
        }

        return RequestQueue.open(null, { config: this.config });
    }

    protected requestMatchesEnqueueStrategy(request: Request) {
        const { url, loadedUrl } = request;

        // eslint-disable-next-line dot-notation -- private access
        const strategy = request['enqueueStrategy'];

        // No strategy set, so we assume it matches, or it was added outside of enqueueLinks
        if (!strategy) {
            return true;
        }

        // If we somehow don't have a loadedUrl, we can't check the strategy anyways, assume it matches
        if (!loadedUrl) {
            return true;
        }

        const baseUrl = new URL(url);
        const loadedBaseUrl = new URL(loadedUrl);

        switch (strategy) {
            case EnqueueStrategy.SameHostname: {
                return baseUrl.hostname === loadedBaseUrl.hostname;
            }
            case EnqueueStrategy.SameDomain: {
                const baseUrlHostname = getDomain(baseUrl.hostname, { mixedInputs: false });

                if (baseUrlHostname) {
                    const loadedBaseUrlHostname = getDomain(loadedBaseUrl.hostname, { mixedInputs: false });

                    return baseUrlHostname === loadedBaseUrlHostname;
                }

                // Can happen for IPs, we just check like same origin
                return baseUrl.origin === loadedBaseUrl.origin;
            }
            case EnqueueStrategy.SameOrigin: {
                // Same as hostname, but also checks protocol
                return baseUrl.origin === loadedBaseUrl.origin;
            }
            case EnqueueStrategy.All:
            default: {
                return baseUrl.protocol === 'http:' || baseUrl.protocol === 'https:';
            }
        }
    }
}

export interface CreateContextOptions {
    request: Request;
    session?: Session;
    proxyInfo?: ProxyInfo;
}

export interface CrawlerAddRequestsOptions extends AddRequestsBatchedOptions {}

export interface CrawlerAddRequestsResult extends AddRequestsBatchedResult {}

export interface CrawlerRunOptions extends CrawlerAddRequestsOptions {
    /**
     * Whether to purge the RequestQueue before running the crawler again. Defaults to true, so it is possible to reprocess failed requests.
     * When disabled, only new requests will be considered. Note that even a failed request is considered as handled.
     * @default true
     */
    purgeRequestQueue?: boolean;
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
export function createBasicRouter<
    Context extends BasicCrawlingContext = BasicCrawlingContext,
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, UserData>) {
    return Router.create<Context>(routes);
}
