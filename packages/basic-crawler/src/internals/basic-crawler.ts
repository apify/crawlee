import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    AutoscaledPoolOptions,
    CrawlingContext,
    DatasetExportOptions,
    EnqueueLinksOptions,
    EventManager,
    FinalStatistics,
    GetUserDataFromRequest,
    IRequestList,
    IRequestManager,
    ProxyConfiguration,
    Request,
    RequestsLike,
    RequestTransform,
    RouterHandler,
    RouterRoutes,
    Session,
    SessionPoolOptions,
    SkippedRequestCallback,
    Source,
    StatisticsOptions,
    StatisticState,
} from '@crawlee/core';
import {
    AutoscaledPool,
    Configuration,
    ContextPipeline,
    ContextPipelineCleanupError,
    ContextPipelineInitializationError,
    ContextPipelineInterruptedError,
    CriticalError,
    Dataset,
    enqueueLinks,
    EnqueueStrategy,
    EventType,
    KeyValueStore,
    mergeCookies,
    NonRetryableError,
    purgeDefaultStorages,
    RequestHandlerError,
    RequestListAdapter,
    RequestManagerTandem,
    RequestProvider,
    RequestQueue,
    RequestQueueV1,
    RequestState,
    RetryRequestError,
    Router,
    SessionError,
    SessionPool,
    Statistics,
    validators,
} from '@crawlee/core';
import { GotScrapingHttpClient } from '@crawlee/got-scraping-client';
import type {
    Awaitable,
    BaseHttpClient,
    BatchAddRequestsResult,
    Dictionary,
    ProxyInfo,
    SetStatusMessageOptions,
} from '@crawlee/types';
import { getObjectType, isAsyncIterable, isIterable, RobotsTxtFile, ROTATE_PROXY_ERRORS } from '@crawlee/utils';
import { stringify } from 'csv-stringify/sync';
import { ensureDir, writeJSON } from 'fs-extra/esm';
import ow from 'ow';
import { getDomain } from 'tldts';
import type { ReadonlyDeep, SetRequired } from 'type-fest';

import { LruCache } from '@apify/datastructures';
import type { Log } from '@apify/log';
import defaultLog, { LogLevel } from '@apify/log';
import { addTimeoutToPromise, TimeoutError } from '@apify/timeout';
import { cryptoRandomObjectId } from '@apify/utilities';

import { createSendRequest } from './send-request.js';

export interface BasicCrawlingContext<UserData extends Dictionary = Dictionary> extends CrawlingContext<UserData> {}

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

export type RequestHandler<Context extends CrawlingContext = CrawlingContext> = (inputs: Context) => Awaitable<void>;

export type ErrorHandler<
    Context extends CrawlingContext = CrawlingContext,
    ExtendedContext extends Context = Context,
> = (inputs: Context & Partial<ExtendedContext>, error: Error) => Awaitable<void>;

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

export type RequireContextPipeline<
    DefaultContextType extends CrawlingContext,
    FinalContextType extends DefaultContextType,
> = DefaultContextType extends FinalContextType
    ? {}
    : { contextPipelineBuilder: () => ContextPipeline<{ request: Request }, FinalContextType> };

export interface BasicCrawlerOptions<
    Context extends CrawlingContext = CrawlingContext,
    ContextExtension = Dictionary<never>,
    ExtendedContext extends Context = Context & ContextExtension,
> {
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
    requestHandler?: RequestHandler<ExtendedContext>;

    /**
     * Allows the user to extend the crawling context passed to the request handler with custom functionality.
     *
     * **Example usage:**
     *
     * ```javascript
     * import { BasicCrawler } from 'crawlee';
     *
     * // Create a crawler instance
     * const crawler = new BasicCrawler({
     *     extendContext(context) => ({
     *         async customHelper() {
     *             await context.pushData({ url: context.request.url })
     *         }
     *     }),
     *     async requestHandler(context) {
     *         await context.customHelper();
     *     },
     * });
     * ```
     */
    extendContext?: (context: Context) => Awaitable<ContextExtension>;

    /**
     * *Intended for BasicCrawler subclasses*. Prepares a context pipeline that transforms the initial crawling context into the shape given by the `Context` type parameter.
     *
     * The option is not required if your crawler subclass does not extend the crawling context with custom information or helpers.
     */
    contextPipelineBuilder?: () => ContextPipeline<{ request: Request }, Context>;

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
     * Allows explicitly configuring a request manager. Mutually exclusive with the `requestQueue` and `requestList` options.
     *
     * This enables explicitly configuring the crawler to use `RequestManagerTandem`, for instance.
     * If using this, the type of `BasicCrawler.requestQueue` may not be fully compatible with the `RequestProvider` class.
     */
    requestManager?: IRequestManager;

    /**
     * Timeout in which the function passed as {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`} needs to finish, in seconds.
     * @default 60
     */
    requestHandlerTimeoutSecs?: number;

    /**
     * User-provided function that allows modifying the request object before it gets retried by the crawler.
     * It's executed before each retry for the requests that failed less than {@apilink BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@apilink BasicCrawlingContext} as the first argument,
     * where the {@apilink BasicCrawlingContext.request|`request`} corresponds to the request to be retried.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    errorHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;

    /**
     * A function to handle requests that failed more than {@apilink BasicCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@apilink BasicCrawlingContext} as the first argument,
     * where the {@apilink BasicCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    failedRequestHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;

    /**
     * Specifies the maximum number of retries allowed for a request if its processing fails.
     * This includes retries due to navigation errors or errors thrown from user-supplied functions
     * (`requestHandler`, `preNavigationHooks`, `postNavigationHooks`).
     *
     * This limit does not apply to retries triggered by session rotation
     * (see {@apilink BasicCrawlerOptions.maxSessionRotations|`maxSessionRotations`}).
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
     * Maximum depth of the crawl. If not set, the crawl will continue until all requests are processed.
     * Setting this to `0` will only process the initial requests, skipping all links enqueued by `crawlingContext.enqueueLinks` and `crawlingContext.addRequests`.
     * Passing `1` will process the initial requests and all links enqueued by `crawlingContext.enqueueLinks` and `crawlingContext.addRequests` in the handler for initial requests.
     */
    maxCrawlDepth?: number;

    /**
     * Custom options passed to the underlying {@apilink AutoscaledPool} constructor.
     * > *NOTE:* The {@apilink AutoscaledPoolOptions.runTaskFunction|`runTaskFunction`}
     * option is provided by the crawler and cannot be overridden.
     * However, we can provide custom implementations of {@apilink AutoscaledPoolOptions.isFinishedFunction|`isFinishedFunction`}
     * and {@apilink AutoscaledPoolOptions.isTaskReadyFunction|`isTaskReadyFunction`}.
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

    /**
     * If set to `true`, the crawler will automatically try to fetch the robots.txt file for each domain,
     * and skip those that are not allowed. This also prevents disallowed URLs to be added via `enqueueLinks`.
     *
     * If an object is provided, it may contain a `userAgent` property to specify which user-agent
     * should be used when checking the robots.txt file. If not provided, the default user-agent `*` will be used.
     */
    respectRobotsTxtFile?: boolean | { userAgent?: string };

    /**
     * When a request is skipped for some reason, you can use this callback to act on it.
     * This is currently fired for requests skipped
     * 1. based on robots.txt file,
     * 2. because they don't match enqueueLinks filters,
     * 3. because they are redirected to a URL that doesn't match the enqueueLinks strategy,
     * 4. or because the {@apilink BasicCrawlerOptions.maxRequestsPerCrawl|`maxRequestsPerCrawl`} limit has been reached
     */
    onSkippedRequest?: SkippedRequestCallback;

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

    /**
     * If set, the crawler will be configured for all connections to use
     * the Proxy URLs provided and rotated according to the configuration.
     */
    proxyConfiguration?: ProxyConfiguration;

    /**
     * A unique identifier for the crawler instance. This ID is used to isolate the state returned by
     * {@apilink BasicCrawler.useState|`crawler.useState()`} from other crawler instances.
     *
     * When multiple crawler instances use `useState()` without an explicit `id`, they will share the same
     * state object for backward compatibility. A warning will be logged in this case.
     *
     * To ensure each crawler has its own isolated state that also persists across script restarts
     * (e.g., during Apify migrations), provide a stable, unique ID for each crawler instance.
     *
     */
    id?: string;
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
export class BasicCrawler<
    Context extends CrawlingContext = CrawlingContext,
    ContextExtension = Dictionary<never>,
    ExtendedContext extends Context = Context & ContextExtension,
> {
    protected static readonly CRAWLEE_STATE_KEY = 'CRAWLEE_STATE';

    /**
     * Tracks crawler instances that accessed shared state without having an explicit id.
     * Used to detect and warn about multiple crawlers sharing the same state.
     */
    private static useStateCrawlerIds = new Set<string>();

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
     * The main request-handling component of the crawler. It's initialized during the crawler startup.
     */
    protected requestManager?: IRequestManager;

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
     * A reference to the underlying {@apilink ProxyConfiguration} class that manages the crawler's proxies.
     * Only available if used by the crawler.
     */
    proxyConfiguration?: ProxyConfiguration;

    /**
     * Default {@apilink Router} instance that will be used if we don't specify any {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`}.
     * See {@apilink Router.addHandler|`router.addHandler()`} and {@apilink Router.addDefaultHandler|`router.addDefaultHandler()`}.
     */
    readonly router: RouterHandler<Context> = Router.create<Context>();

    private _contextPipeline?: ContextPipeline<{ request: Request }, ExtendedContext>;

    get contextPipeline(): ContextPipeline<{ request: Request }, ExtendedContext> {
        if (this._contextPipeline === undefined) {
            this._contextPipeline = this.buildFinalContextPipeline();
        }

        return this._contextPipeline;
    }

    running = false;
    hasFinishedBefore = false;

    readonly log: Log;
    protected requestHandler!: RequestHandler<ExtendedContext>;
    protected errorHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;
    protected failedRequestHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;
    protected requestHandlerTimeoutMillis!: number;
    protected internalTimeoutMillis: number;
    protected maxRequestRetries: number;
    protected maxCrawlDepth?: number;
    protected sameDomainDelayMillis: number;
    protected domainAccessedTime: Map<string, number>;
    protected maxSessionRotations: number;
    protected maxRequestsPerCrawl?: number;
    protected handledRequestsCount = 0;
    protected statusMessageLoggingInterval: number;
    protected statusMessageCallback?: StatusMessageCallback;
    protected sessionPoolOptions: SessionPoolOptions;
    protected contextPipelineOptions: {
        contextPipelineBuilder: () => ContextPipeline<any, any>;
        extendContext: (context: Context) => Awaitable<ContextExtension>;
    };

    protected useSessionPool: boolean;
    protected autoscaledPoolOptions: AutoscaledPoolOptions;
    protected events: EventManager;
    protected httpClient: BaseHttpClient;
    protected retryOnBlocked: boolean;
    protected respectRobotsTxtFile: boolean | { userAgent?: string };
    protected onSkippedRequest?: SkippedRequestCallback;
    private _closeEvents?: boolean;
    private shouldLogMaxProcessedRequestsExceeded = true;
    private shouldLogMaxEnqueuedRequestsExceeded = true;
    private experiments: CrawlerExperiments;
    private readonly robotsTxtFileCache: LruCache<RobotsTxtFile>;
    private _experimentWarnings: Partial<Record<keyof CrawlerExperiments, boolean>> = {};
    private readonly crawlerId: string;
    private readonly hasExplicitId: boolean;

    protected static optionsShape = {
        contextPipelineBuilder: ow.optional.object,
        extendContext: ow.optional.function,

        requestList: ow.optional.object.validate(validators.requestList),
        requestQueue: ow.optional.object.validate(validators.requestQueue),
        // Subclasses override this function instead of passing it
        // in constructor, so this validation needs to apply only
        // if the user creates an instance of BasicCrawler directly.
        requestHandler: ow.optional.function,
        requestHandlerTimeoutSecs: ow.optional.number,
        errorHandler: ow.optional.function,
        failedRequestHandler: ow.optional.function,
        maxRequestRetries: ow.optional.number,
        sameDomainDelaySecs: ow.optional.number,
        maxSessionRotations: ow.optional.number,
        maxRequestsPerCrawl: ow.optional.number,
        maxCrawlDepth: ow.optional.number,
        autoscaledPoolOptions: ow.optional.object,
        sessionPoolOptions: ow.optional.object,
        useSessionPool: ow.optional.boolean,
        proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),

        statusMessageLoggingInterval: ow.optional.number,
        statusMessageCallback: ow.optional.function,

        retryOnBlocked: ow.optional.boolean,
        respectRobotsTxtFile: ow.optional.any(ow.boolean, ow.object),
        onSkippedRequest: ow.optional.function,
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

        id: ow.optional.string,
    };

    /**
     * All `BasicCrawler` parameters are passed via an options object.
     */
    constructor(
        options: BasicCrawlerOptions<Context, ContextExtension, ExtendedContext> &
            RequireContextPipeline<CrawlingContext, Context> = {} as any, // cast because the constructor logic handles missing `contextPipelineBuilder` - the type is just for DX
        readonly config = Configuration.getGlobalConfig(),
    ) {
        ow(options, 'BasicCrawlerOptions', ow.object.exactShape(BasicCrawler.optionsShape));

        const {
            requestList,
            requestQueue,
            requestManager,
            maxRequestRetries = 3,
            sameDomainDelaySecs = 0,
            maxSessionRotations = 10,
            maxRequestsPerCrawl,
            maxCrawlDepth,
            autoscaledPoolOptions = {},
            keepAlive,
            sessionPoolOptions = {},
            useSessionPool = true,
            proxyConfiguration,

            // AutoscaledPool shorthands
            minConcurrency,
            maxConcurrency,
            maxRequestsPerMinute,

            retryOnBlocked = false,
            respectRobotsTxtFile = false,
            onSkippedRequest,
            requestHandler,
            requestHandlerTimeoutSecs,
            errorHandler,
            failedRequestHandler,
            statusMessageLoggingInterval = 10,
            statusMessageCallback,
            statisticsOptions,
            httpClient,

            // internal
            log = defaultLog.child({ prefix: this.constructor.name }),
            experiments = {},

            id,
        } = options;

        // Store whether the user explicitly provided an ID
        this.hasExplicitId = id !== undefined;
        // Store the user-provided ID, or generate a unique one for tracking purposes (not for state key)
        this.crawlerId = id ?? cryptoRandomObjectId();

        this.contextPipelineOptions = {
            contextPipelineBuilder: options.contextPipelineBuilder,
            extendContext: options.extendContext,
        };

        if (requestManager !== undefined) {
            if (requestList !== undefined || requestQueue !== undefined) {
                throw new Error(
                    'The `requestManager` option cannot be used in conjunction with `requestList` and/or `requestQueue`',
                );
            }
            this.requestManager = requestManager;
            this.requestQueue = requestManager as RequestProvider; // TODO(v4) - the cast is not fully legitimate here, but it's fine for internal usage by the BasicCrawler
        } else {
            this.requestList = requestList;
            this.requestQueue = requestQueue;
        }

        this.httpClient = httpClient ?? new GotScrapingHttpClient();
        this.proxyConfiguration = proxyConfiguration;
        this.log = log;
        this.statusMessageLoggingInterval = statusMessageLoggingInterval;
        this.statusMessageCallback = statusMessageCallback as StatusMessageCallback;
        this.events = config.getEventManager();
        this.domainAccessedTime = new Map();
        this.experiments = experiments;
        this.robotsTxtFileCache = new LruCache({ maxLength: 1000 });
        this.handleSkippedRequest = this.handleSkippedRequest.bind(this);

        this.requestHandler = requestHandler ?? this.router;
        this.failedRequestHandler = failedRequestHandler;
        this.errorHandler = errorHandler;

        if (requestHandlerTimeoutSecs) {
            this.requestHandlerTimeoutMillis = requestHandlerTimeoutSecs * 1000;
        } else {
            this.requestHandlerTimeoutMillis = 60_000;
        }

        this.retryOnBlocked = retryOnBlocked;
        this.respectRobotsTxtFile = respectRobotsTxtFile;
        this.onSkippedRequest = onSkippedRequest;

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
        this.maxCrawlDepth = maxCrawlDepth;
        this.sameDomainDelayMillis = sameDomainDelaySecs * 1000;
        this.maxSessionRotations = maxSessionRotations;
        this.stats = new Statistics({
            logMessage: `${log.getOptions().prefix} request statistics:`,
            log,
            config,
            ...(this.hasExplicitId ? { id: this.crawlerId } : {}),
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

        const maxSignedInteger = 2 ** 31 - 1;
        if (this.requestHandlerTimeoutMillis > maxSignedInteger) {
            log.warning(
                `requestHandlerTimeoutMillis ${this.requestHandlerTimeoutMillis}` +
                    ` does not fit a signed 32-bit integer. Limiting the value to ${maxSignedInteger}`,
            );

            this.requestHandlerTimeoutMillis = maxSignedInteger;
        }

        this.internalTimeoutMillis = Math.min(this.internalTimeoutMillis, maxSignedInteger);

        this.maxRequestsPerCrawl = maxRequestsPerCrawl;

        const isMaxPagesExceeded = () =>
            this.maxRequestsPerCrawl && this.maxRequestsPerCrawl <= this.handledRequestsCount;

        // eslint-disable-next-line prefer-const
        let { isFinishedFunction, isTaskReadyFunction } = autoscaledPoolOptions;

        // override even if `isFinishedFunction` provided by user - `keepAlive` has higher priority
        if (keepAlive) {
            isFinishedFunction = async () => false;
        }

        const basicCrawlerAutoscaledPoolConfiguration: Partial<AutoscaledPoolOptions> = {
            minConcurrency: minConcurrency ?? autoscaledPoolOptions?.minConcurrency,
            maxConcurrency: maxConcurrency ?? autoscaledPoolOptions?.maxConcurrency,
            maxTasksPerMinute: maxRequestsPerMinute ?? autoscaledPoolOptions?.maxTasksPerMinute,
            runTaskFunction: async () => {
                const request = await this.resolveRequest();
                const crawlingContext = { request } as { request: Request } & Partial<CrawlingContext>;
                try {
                    await this.contextPipeline.call(crawlingContext, this._runTaskFunction.bind(this));
                } catch (error) {
                    // ContextPipelineInterruptedError means the request was intentionally skipped
                    // (e.g., doesn't match enqueue strategy after redirect). Just return gracefully.
                    if (crawlingContext.request && error instanceof ContextPipelineInterruptedError) {
                        await this._timeoutAndRetry(
                            async () => this.requestManager?.markRequestHandled(crawlingContext.request!),
                            this.internalTimeoutMillis,
                            `Marking request ${crawlingContext.request.url} (${crawlingContext.request.id}) as handled timed out after ${
                                this.internalTimeoutMillis / 1e3
                            } seconds.`,
                        );
                        return;
                    }

                    // If the error happened during pipeline initialization (e.g., navigation timeout, session/proxy error)
                    // and we have a request in the context, handle it through the normal error flow
                    const isPipelineError =
                        error instanceof ContextPipelineInitializationError || error instanceof SessionError;
                    if (isPipelineError && crawlingContext.request) {
                        const unwrappedError = this.unwrapError(error);

                        await this._requestFunctionErrorHandler(
                            unwrappedError,
                            crawlingContext as CrawlingContext,
                            this.requestManager!,
                        );
                        crawlingContext.session?.markBad();
                        return;
                    }
                    throw this.unwrapError(error);
                }
            },
            isTaskReadyFunction: async () => {
                if (isMaxPagesExceeded()) {
                    if (this.shouldLogMaxProcessedRequestsExceeded) {
                        log.info(
                            'Crawler reached the maxRequestsPerCrawl limit of ' +
                                `${this.maxRequestsPerCrawl} requests and will shut down soon. Requests that are in progress will be allowed to finish.`,
                        );
                        this.shouldLogMaxProcessedRequestsExceeded = false;
                    }
                    return false;
                }

                return isTaskReadyFunction ? await isTaskReadyFunction() : await this._isTaskReadyFunction();
            },
            isFinishedFunction: async () => {
                if (isMaxPagesExceeded()) {
                    log.info(
                        `Earlier, the crawler reached the maxRequestsPerCrawl limit of ${this.maxRequestsPerCrawl} requests ` +
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
     * Builds the base context pipeline with core crawling functionality.
     * Subclasses should override this method to extend the pipeline, calling `super.buildContextPipeline()` first.
     *
     * Note that the built pipeline needs to be propagated all the way back to the `BasicCrawler` via the `contextPipelineBuilder` constructor option.
     * This enforces the type contract of `BasicCrawler<SomeContext>` having access to a `ContextPipeline<{ request: Request }, SomeContext>`,
     * which cannot be achieved using regular abstract methods.
     */
    protected buildContextPipeline(): ContextPipeline<{ request: Request }, CrawlingContext> {
        const deferredCleanup: (() => Promise<unknown>)[] = [];

        return ContextPipeline.create<{ request: Request }>()
            .compose({
                action: () => this.createBaseContext(deferredCleanup),
                cleanup: async () => {
                    await Promise.all(deferredCleanup.map((fn) => fn()));
                },
            })
            .compose({ action: this.resolveSession.bind(this) })
            .compose({ action: this.createContextHelpers.bind(this) });
    }

    private createBaseContext(deferredCleanup: (() => Promise<unknown>)[]) {
        return {
            id: cryptoRandomObjectId(10),
            log: this.log,
            pushData: this.pushData.bind(this),
            useState: this.useState.bind(this),
            getKeyValueStore: async (idOrName?: string) => KeyValueStore.open(idOrName, { config: this.config }),
            registerDeferredCleanup: (cleanup: () => Promise<unknown>) => {
                deferredCleanup.push(cleanup);
            },
        };
    }

    private async resolveRequest(): Promise<Request> {
        const request = await this._timeoutAndRetry(
            this._fetchNextRequest.bind(this),
            this.internalTimeoutMillis,
            `Fetching next request timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
        );

        // Reset loadedUrl so an old one is not carried over to retries.
        if (request) {
            request.loadedUrl = undefined;
        }

        return request!;
    }

    private async resolveSession({ request }: { request: Request }) {
        const session = this.useSessionPool
            ? await this._timeoutAndRetry(
                  async () => {
                      return await this.sessionPool!.newSession({
                          proxyInfo: await this.proxyConfiguration?.newProxyInfo({
                              request: request ?? undefined,
                          }),
                          maxUsageCount: 1,
                      });
                  },
                  this.internalTimeoutMillis,
                  `Fetching session timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
              )
            : undefined;

        return { session, proxyInfo: session?.proxyInfo };
    }

    private async createContextHelpers({ request, session }: { request: Request; session?: Session }) {
        const enqueueLinksWrapper: CrawlingContext['enqueueLinks'] = async (options) => {
            const requestQueue = await this.getRequestQueue();

            return await this.enqueueLinksWithCrawlDepth(options, request!, requestQueue);
        };
        const addRequests: CrawlingContext['addRequests'] = async (requests, options = {}) => {
            const newCrawlDepth = request!.crawlDepth + 1;
            const requestsGenerator = this.addCrawlDepthRequestGenerator(requests, newCrawlDepth);

            await this.addRequests(requestsGenerator, options);
        };

        const sendRequest = createSendRequest(this.httpClient, request!, session);

        return { enqueueLinks: enqueueLinksWrapper, addRequests, sendRequest };
    }

    private buildFinalContextPipeline(): ContextPipeline<{ request: Request }, ExtendedContext> {
        let contextPipeline = (this.contextPipelineOptions.contextPipelineBuilder?.() ??
            this.buildContextPipeline()) as ContextPipeline<{ request: Request }, Context>; // Thanks to the RequireContextPipeline, contextPipeline will only be undefined if InitialContextType is CrawlingContext

        if (this.contextPipelineOptions.extendContext !== undefined) {
            contextPipeline = contextPipeline.compose({
                action: async (context) => await this.contextPipelineOptions.extendContext(context),
            });
        }

        contextPipeline = contextPipeline.compose({
            action: async (context) => {
                const { request } = context;
                if (request && !this.requestMatchesEnqueueStrategy(request)) {
                    // eslint-disable-next-line dot-notation
                    const message = `Skipping request ${request.id} (starting url: ${request.url} -> loaded url: ${request.loadedUrl}) because it does not match the enqueue strategy (${request['enqueueStrategy']}).`;
                    this.log.debug(message);

                    request.noRetry = true;
                    request.state = RequestState.SKIPPED;

                    await this.handleSkippedRequest({ url: request.url, reason: 'redirect' });

                    throw new ContextPipelineInterruptedError(message);
                }
                return context;
            },
        });

        return contextPipeline as ContextPipeline<{ request: Request }, ExtendedContext>;
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
                const total = this.requestManager?.getTotalCount();
                message = `Crawled ${this.stats.state.requestsFinished}${total ? `/${total}` : ''} pages, ${
                    this.stats.state.requestsFailed
                } failed requests, desired concurrency ${this.autoscaledPool?.desiredConcurrency ?? 0}.`;
            }

            if (this.statusMessageCallback) {
                await this.statusMessageCallback({
                    crawler: this as any,
                    state: this.stats.state,
                    previousState,
                    message,
                });
                return;
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
    async run(requests?: RequestsLike, options?: CrawlerRunOptions): Promise<FinalStatistics> {
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
                this.requestManager = undefined;
                await this.initializeRequestManager();
                this.handledRequestsCount = 0; // This would've been reset by this._init() further down below, but at that point `handledRequestsCount` could prevent `addRequests` from adding the initial requests
            }

            this.stats.reset();
            await this.stats.resetStore();
            await this.sessionPool?.resetStore();
        }

        this.running = true;
        this.shouldLogMaxProcessedRequestsExceeded = true;
        this.shouldLogMaxEnqueuedRequestsExceeded = true;

        await purgeDefaultStorages({
            onlyPurgeOnce: true,
            client: this.config.getStorageClient(),
            config: this.config,
        });

        if (requests) {
            await this.addRequests(requests, addRequestsOptions);
        }

        await this._init();
        await this.stats.startCapturing();
        const periodicLogger = this.getPeriodicLogger();
        // Don't await, we don't want to block the execution
        void this.setStatusMessage('Starting the crawler.', { level: 'INFO' });

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
            // Don't await, we don't want to block the execution
            void this.setStatusMessage(
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
     *
     * To stop the crawler immediately, use {@apilink BasicCrawler.teardown|`crawler.teardown()`} instead.
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

    async getRequestQueue(): Promise<RequestProvider> {
        if (!this.requestQueue && this.requestList) {
            this.log.warningOnce(
                'When using RequestList and RequestQueue at the same time, you should instantiate both explicitly and provide them in the crawler options, to ensure correctly handled restarts of the crawler.',
            );
        }

        if (!this.requestQueue) {
            this.requestQueue = await this._getRequestQueue();
            this.requestManager = undefined;
        }

        if (!this.requestManager) {
            this.requestManager =
                this.requestList === undefined
                    ? this.requestQueue
                    : new RequestManagerTandem(this.requestList, this.requestQueue);
        }

        return this.requestQueue;
    }

    async useState<State extends Dictionary = Dictionary>(defaultValue = {} as State): Promise<State> {
        const kvs = await KeyValueStore.open(null, { config: this.config });

        if (this.hasExplicitId) {
            const stateKey = `${BasicCrawler.CRAWLEE_STATE_KEY}_${this.crawlerId}`;
            return kvs.getAutoSavedValue<State>(stateKey, defaultValue);
        }

        BasicCrawler.useStateCrawlerIds.add(this.crawlerId);

        if (BasicCrawler.useStateCrawlerIds.size > 1) {
            defaultLog.warningOnce(
                'Multiple crawler instances are calling useState() without an explicit `id` option. \n' +
                    'This means they will share the same state object, which is likely unintended. \n' +
                    'To fix this, provide a unique `id` option to each crawler instance. \n' +
                    'Example: new BasicCrawler({ id: "my-crawler-1", ... })',
            );
        }

        return kvs.getAutoSavedValue<State>(BasicCrawler.CRAWLEE_STATE_KEY, defaultValue);
    }

    protected get pendingRequestCountApproximation(): number {
        return this.requestManager?.getPendingCount() ?? 0;
    }

    protected calculateEnqueuedRequestLimit(explicitLimit?: number): number | undefined {
        if (this.maxRequestsPerCrawl === undefined) {
            return explicitLimit;
        }

        const limit = Math.max(
            0,
            this.maxRequestsPerCrawl - this.handledRequestsCount - this.pendingRequestCountApproximation,
        );

        return Math.min(limit, explicitLimit ?? Infinity);
    }

    protected async handleSkippedRequest(options: Parameters<SkippedRequestCallback>[0]): Promise<void> {
        if (options.reason === 'limit' && this.shouldLogMaxEnqueuedRequestsExceeded) {
            this.log.info(
                'The number of requests enqueued by the crawler reached the maxRequestsPerCrawl limit of ' +
                    `${this.maxRequestsPerCrawl} requests and no further requests will be added.`,
            );
            this.shouldLogMaxEnqueuedRequestsExceeded = false;
        }

        if (options.reason === 'enqueueLimit') {
            const enqueuedRequestLimit = this.calculateEnqueuedRequestLimit();
            if (enqueuedRequestLimit === undefined || enqueuedRequestLimit !== 0) {
                this.log.info('The number of requests enqueued by the crawler reached the enqueueLinks limit.');
            }
        }

        await this.onSkippedRequest?.(options);
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
        requests: ReadonlyDeep<RequestsLike>,
        options: CrawlerAddRequestsOptions = {},
    ): Promise<CrawlerAddRequestsResult> {
        await this.getRequestQueue();

        const requestLimit = this.calculateEnqueuedRequestLimit();

        const skippedBecauseOfRobots = new Set<string>();
        const skippedBecauseOfLimit = new Set<string>();
        const skippedBecauseOfMaxCrawlDepth = new Set<string>();

        const isAllowedBasedOnRobotsTxtFile = this.isAllowedBasedOnRobotsTxtFile.bind(this);
        const maxCrawlDepth = this.maxCrawlDepth;

        ow(
            requests,
            ow.object
                .is((value: unknown) => isIterable(value) || isAsyncIterable(value))
                .message((value) => `Expected an iterable or async iterable, got ${getObjectType(value)}`),
        );

        async function* filteredRequests() {
            let yieldedRequestCount = 0;

            for await (const request of requests) {
                const url = typeof request === 'string' ? request : request.url!;

                if (requestLimit !== undefined && yieldedRequestCount >= requestLimit) {
                    skippedBecauseOfLimit.add(url);
                    continue;
                }

                if (maxCrawlDepth !== undefined && (request as any).crawlDepth > maxCrawlDepth) {
                    skippedBecauseOfMaxCrawlDepth.add(url);
                    continue;
                }

                if (await isAllowedBasedOnRobotsTxtFile(url)) {
                    yield request;
                    yieldedRequestCount += 1;
                } else {
                    skippedBecauseOfRobots.add(url);
                }
            }
        }

        const result = await this.requestManager!.addRequestsBatched(filteredRequests(), options);

        if (skippedBecauseOfRobots.size > 0) {
            this.log.warning(`Some requests were skipped because they were disallowed based on the robots.txt file`, {
                skipped: [...skippedBecauseOfRobots],
            });
        }

        if (
            skippedBecauseOfRobots.size > 0 ||
            skippedBecauseOfLimit.size > 0 ||
            skippedBecauseOfMaxCrawlDepth.size > 0
        ) {
            await Promise.all(
                [...skippedBecauseOfRobots]
                    .map((url) => {
                        return this.handleSkippedRequest({ url, reason: 'robotsTxt' });
                    })
                    .concat(
                        [...skippedBecauseOfLimit].map((url) => {
                            return this.handleSkippedRequest({ url, reason: 'limit' });
                        }),
                        [...skippedBecauseOfMaxCrawlDepth].map((url) => {
                            return this.handleSkippedRequest({ url, reason: 'depth' });
                        }),
                    ),
            );
        }

        return result;
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
            let value: string;
            if (items.length === 0) {
                value = '';
            } else {
                const keys = options?.collectAllKeys
                    ? Array.from(new Set(items.flatMap(Object.keys)))
                    : Object.keys(items[0]);

                value = stringify([
                    keys,
                    ...items.map((item) => {
                        return keys.map((k) => item[k]);
                    }),
                ]);
            }

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

    /**
     * Initializes the crawler.
     */
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

        await this.initializeRequestManager();
        await this._loadHandledRequestCount();
    }

    protected async runRequestHandler(crawlingContext: ExtendedContext): Promise<void> {
        await addTimeoutToPromise(
            async () => this.requestHandler(crawlingContext),
            this.requestHandlerTimeoutMillis,
            `requestHandler timed out after ${this.requestHandlerTimeoutMillis / 1000} seconds (${crawlingContext.request.id}).`,
        );
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

    private async isAllowedBasedOnRobotsTxtFile(url: string): Promise<boolean> {
        if (!this.respectRobotsTxtFile) {
            return true;
        }

        const robotsTxtFile = await this.getRobotsTxtFileForUrl(url);
        const userAgent = typeof this.respectRobotsTxtFile === 'object' ? this.respectRobotsTxtFile?.userAgent : '*';

        return !robotsTxtFile || robotsTxtFile.isAllowed(url, userAgent);
    }

    protected async getRobotsTxtFileForUrl(url: string): Promise<RobotsTxtFile | undefined> {
        if (!this.respectRobotsTxtFile) {
            return undefined;
        }

        try {
            const origin = new URL(url).origin;
            const cachedRobotsTxtFile = this.robotsTxtFileCache.get(origin);

            if (cachedRobotsTxtFile) {
                return cachedRobotsTxtFile;
            }

            const robotsTxtFile = await RobotsTxtFile.find(url);
            this.robotsTxtFileCache.add(origin, robotsTxtFile);

            return robotsTxtFile;
        } catch (e: any) {
            this.log.warning(`Failed to fetch robots.txt for request ${url}`);
            return undefined;
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
     * Initializes the RequestManager based on the configured requestList and requestQueue.
     */
    private async initializeRequestManager() {
        if (this.requestManager !== undefined) {
            return;
        }

        if (this.requestList && this.requestQueue) {
            // Create a RequestManagerTandem if both RequestList and RequestQueue are provided
            this.requestManager = new RequestManagerTandem(this.requestList, this.requestQueue);
        } else if (this.requestQueue) {
            // Use RequestQueue directly if only it is provided
            this.requestManager = this.requestQueue;
        } else if (this.requestList) {
            // Use RequestList directly if only it is provided
            // Make it compatible with the IRequestManager interface
            this.requestManager = new RequestListAdapter(this.requestList);
        }

        // If neither RequestList nor RequestQueue is provided, leave the requestManager uninitialized until `getRequestQueue` is called
    }

    /**
     * Fetches the next request to process from the underlying request provider.
     */
    protected async _fetchNextRequest() {
        if (this.requestManager === undefined) {
            throw new Error(`_fetchNextRequest called on an uninitialized crawler`);
        }

        return this.requestManager.fetchNextRequest();
    }

    /**
     * Delays processing of the request based on the `sameDomainDelaySecs` option,
     * adding it back to the queue after the timeout passes. Returns `true` if the request
     * should be ignored and will be reclaimed to the queue once ready.
     */
    protected delayRequest(request: Request, source: IRequestList | RequestProvider | IRequestManager) {
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
    protected async _runTaskFunction(crawlingContext: ExtendedContext) {
        const source = this.requestManager;
        if (!source) throw new Error('Request provider is not initialized!');

        const { request } = crawlingContext;

        if (!request || this.delayRequest(request, source)) {
            return;
        }

        if (!(await this.isAllowedBasedOnRobotsTxtFile(request.url))) {
            this.log.warning(
                `Skipping request ${request.url} (${request.id}) because it is disallowed based on robots.txt`,
            );
            request.state = RequestState.SKIPPED;
            request.noRetry = true;
            await source.markRequestHandled(request);
            await this.handleSkippedRequest({
                url: request.url,
                reason: 'robotsTxt',
            });
            return;
        }

        const statisticsId = request.id || request.uniqueKey;
        this.stats.startJob(statisticsId);

        let isRequestLocked = true;

        try {
            request.state = RequestState.REQUEST_HANDLER;
            await this.runRequestHandler(crawlingContext);

            await this._timeoutAndRetry(
                async () => source.markRequestHandled(request!),
                this.internalTimeoutMillis,
                `Marking request ${request.url} (${request.id}) as handled timed out after ${
                    this.internalTimeoutMillis / 1e3
                } seconds.`,
            );
            isRequestLocked = false; // markRequestHandled succeeded and unlocked the request

            this.stats.finishJob(statisticsId, request.retryCount);
            this.handledRequestsCount++;

            // reclaim session if request finishes successfully
            request.state = RequestState.DONE;
            crawlingContext.session?.markGood();
        } catch (rawError) {
            const err = this.unwrapError(rawError);

            try {
                request.state = RequestState.ERROR_HANDLER;
                await addTimeoutToPromise(
                    async () => this._requestFunctionErrorHandler(err, crawlingContext, source),
                    this.internalTimeoutMillis,
                    `Handling request failure of ${request.url} (${request.id}) timed out after ${
                        this.internalTimeoutMillis / 1e3
                    } seconds.`,
                );
                if (!(err instanceof CriticalError)) {
                    isRequestLocked = false; // _requestFunctionErrorHandler calls either markRequestHandled or reclaimRequest
                }
                request.state = RequestState.DONE;
            } catch (secondaryError: any) {
                const unwrappedSecondaryError = this.unwrapError(secondaryError) as any;

                if (
                    !unwrappedSecondaryError.triggeredFromUserHandler &&
                    // avoid reprinting the same critical error multiple times, as it will be printed by Nodejs at the end anyway
                    !(unwrappedSecondaryError instanceof CriticalError)
                ) {
                    const apifySpecific = process.env.APIFY_IS_AT_HOME
                        ? `This may have happened due to an internal error of Apify's API or due to a misconfigured crawler.`
                        : '';
                    this.log.exception(
                        unwrappedSecondaryError as Error,
                        'An exception occurred during handling of failed request. ' +
                            `This places the crawler and its underlying storages into an unknown state and crawling will be terminated. ${apifySpecific}`,
                    );
                }
                request.state = RequestState.ERROR;
                throw unwrappedSecondaryError;
            }
            // decrease the session score if the request fails (but the error handler did not throw)
            crawlingContext.session?.markBad();
        } finally {
            // Safety net - release the lock if nobody managed to do it before
            if (isRequestLocked && source instanceof RequestProvider) {
                try {
                    await source.client.deleteRequestLock(request.id!);
                } catch {
                    // We don't have the lock, or the request was never locked. Either way it's fine
                }
            }
        }
    }

    /**
     * Wrapper around the crawling context's `enqueueLinks` method:
     * - Injects `crawlDepth` to each request being added based on the crawling context request.
     * - Provides defaults for the `enqueueLinks` options based on the crawler configuration.
     *      - These options can be overridden by the user.
     * @internal
     */
    protected async enqueueLinksWithCrawlDepth(
        options: SetRequired<EnqueueLinksOptions, 'urls'>,
        request: Request<Dictionary>,
        requestQueue: RequestProvider,
    ): Promise<BatchAddRequestsResult> {
        const transformRequestFunctionWrapper: RequestTransform = (newRequest) => {
            newRequest.crawlDepth = request.crawlDepth + 1;

            if (this.maxCrawlDepth !== undefined && newRequest.crawlDepth > this.maxCrawlDepth) {
                newRequest.skippedReason = 'depth';
                return false;
            }

            // After injecting the crawlDepth, we call the user-provided transform function, if there is one.
            return options.transformRequestFunction?.(newRequest) ?? newRequest;
        };

        return await enqueueLinks({
            requestQueue,
            robotsTxtFile: await this.getRobotsTxtFileForUrl(request!.url),
            onSkippedRequest: this.handleSkippedRequest,
            limit: this.calculateEnqueuedRequestLimit(options.limit),

            // Allow user options to override defaults set above ⤴
            ...options,

            transformRequestFunction: transformRequestFunctionWrapper,
        });
    }

    /**
     * Generator function that yields requests injected with the given crawl depth.
     * @internal
     */
    protected async *addCrawlDepthRequestGenerator(
        requests: RequestsLike,
        newRequestDepth: number,
    ): AsyncGenerator<Source, void, undefined> {
        for await (const request of requests) {
            if (typeof request === 'string') {
                yield { url: request, crawlDepth: newRequestDepth };
            } else {
                request.crawlDepth ??= newRequestDepth;
                yield request;
            }
        }
    }

    /**
     * Run async callback with given timeout and retry. Returns the result of the callback.
     * @ignore
     */
    protected async _timeoutAndRetry<T>(
        handler: () => Promise<T>,
        timeout: number,
        error: Error | string,
        maxRetries = 3,
        retried = 1,
    ): Promise<T> {
        try {
            return await addTimeoutToPromise(handler, timeout, error);
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
        return this.requestManager !== undefined && !(await this.requestManager.isEmpty());
    }

    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     */
    protected async _defaultIsFinishedFunction() {
        return !this.requestManager || (await this.requestManager.isFinished());
    }

    private async _rotateSession(crawlingContext: CrawlingContext) {
        const { request } = crawlingContext;

        request.sessionRotationCount ??= 0;
        request.sessionRotationCount++;
        crawlingContext.session?.retire();
    }

    /**
     * Unwraps errors thrown by the context pipeline to get the actual user error.
     * RequestHandlerError and ContextPipelineInitializationError wrap the actual error.
     */
    private unwrapError(error: unknown): Error {
        if (
            error instanceof RequestHandlerError ||
            error instanceof ContextPipelineInitializationError ||
            error instanceof ContextPipelineCleanupError
        ) {
            return this.unwrapError(error.cause);
        }
        return error as Error;
    }

    /**
     * Handles errors thrown by user provided requestHandler()
     */
    protected async _requestFunctionErrorHandler(
        error: Error,
        crawlingContext: CrawlingContext,
        source: IRequestList | IRequestManager,
    ): Promise<void> {
        const { request } = crawlingContext;
        request.pushErrorMessage(error);

        if (error instanceof CriticalError) {
            throw error;
        }

        const shouldRetryRequest = this._canRequestBeRetried(request, error);

        if (shouldRetryRequest) {
            await this.stats.errorTrackerRetry.addAsync(error, crawlingContext);
            await this.errorHandler?.(
                crawlingContext as CrawlingContext & Partial<ExtendedContext>, // valid cast - ExtendedContext transitively extends CrawlingContext
                error,
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
        this.stats.failJob(request.id || request.uniqueKey, request.retryCount);

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

    protected async _handleFailedRequestHandler(crawlingContext: CrawlingContext, error: Error): Promise<void> {
        // Always log the last error regardless if the user provided a failedRequestHandler
        const { id, url, method, uniqueKey } = crawlingContext.request;
        const message = this._getMessageFromError(error, true);

        this.log.error(`Request failed and reached maximum retries. ${message}`, { id, url, method, uniqueKey });

        if (this.failedRequestHandler) {
            await this.failedRequestHandler?.(
                crawlingContext as CrawlingContext & Partial<ExtendedContext>, // valid cast - ExtendedContext transitively extends CrawlingContext
                error,
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

    /**
     * Updates handledRequestsCount from possibly stored counts, usually after worker migration.
     */
    protected async _loadHandledRequestCount(): Promise<void> {
        if (this.requestManager) {
            this.handledRequestsCount = await this.requestManager.handledCount();
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
     * Stops the crawler immediately.
     *
     * This method doesn't wait for currently active requests to finish.
     *
     * To stop the crawler gracefully (waiting for all running requests to finish), use {@apilink BasicCrawler.stop|`crawler.stop()`} instead.
     */
    async teardown(): Promise<void> {
        this.events.emit(EventType.PERSIST_STATE, { isMigrating: false });

        await this.sessionPool?.teardown();

        if (this._closeEvents) {
            await this.events.close();
        }

        await this.autoscaledPool?.abort();
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

    private requestMatchesEnqueueStrategy(request: Request) {
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
