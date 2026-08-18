import type { AddRequestsBatchedOptions, AddRequestsBatchedResult, ConcurrencySystemOptions, CrawleeLogger, CrawlingContext, DatasetExportOptions, EnqueueUrlsOptions, FinalStatistics, GetUserDataFromRequest, IConcurrencySystem, IProxyConfiguration, IRequestLoader, IRequestManager, IStatistics, RequestsLike, RouterHandler, RouterRoutes, SkippedRequestCallback, Source, StatisticState, StorageIdentifier, StorageWritePolicy, TaskLoopPredicates, TypedRequestsLike } from '@crawlee/core';
import { ConcurrencySystem, Configuration, ContextPipeline, Request, Dataset, EventManager, RequestQueue } from '@crawlee/core';
import { BaseHttpClient } from '@crawlee/http-client';
import type { Awaitable, Dictionary, ISession, ISessionPool, ProxyInfo, SetStatusMessageOptions, StorageBackend } from '@crawlee/types';
import { RobotsTxtFile } from '@crawlee/utils';
import type { ReadonlyDeep } from 'type-fest';
import { z } from 'zod';
import { TimeoutError } from '@apify/timeout';
export interface BasicCrawlingContext<UserData extends Dictionary = Dictionary> extends CrawlingContext<UserData> {
}
export { navigationDeadlineKey, remainingNavigationWindowMillis } from './request-timeout.js';
export type RequestHandler<Context extends CrawlingContext = CrawlingContext> = (inputs: Context) => Awaitable<void>;
/**
 * An error handler receives the crawling context and the error that was thrown while processing the request.
 *
 * Unlike the {@apilink RequestHandler}, an error handler may run before the context pipeline has finished
 * building the full context (e.g. when navigation or session setup fails). Therefore only `BaseContext` is
 * guaranteed to be present, while the extra properties added by the pipeline and `extendContext` (the
 * difference between `BaseContext` and `ExtendedContext`) are only available as a `Partial`.
 */
export type ErrorHandler<BaseContext extends CrawlingContext = CrawlingContext, ExtendedContext extends BaseContext = BaseContext> = (inputs: BaseContext & Partial<ExtendedContext>, error: Error) => Awaitable<void>;
export interface StatusMessageCallbackParams<Context extends CrawlingContext = BasicCrawlingContext, Crawler extends BasicCrawler<any, any, any, any> = BasicCrawler<Context>> {
    state: StatisticState;
    crawler: Crawler;
    previousState: StatisticState;
    message: string;
}
export type StatusMessageCallback<Context extends CrawlingContext = BasicCrawlingContext, Crawler extends BasicCrawler<any, any, any, any> = BasicCrawler<Context>> = (params: StatusMessageCallbackParams<Context, Crawler>) => Awaitable<void>;
export type RequireContextPipeline<DefaultContextType extends CrawlingContext, FinalContextType extends DefaultContextType> = DefaultContextType extends FinalContextType ? {} : {
    contextPipelineBuilder: () => ContextPipeline<CrawlingContext, FinalContextType>;
};
export interface BasicCrawlerOptions<Context extends CrawlingContext = CrawlingContext, ContextExtension = Dictionary<never>, ExtendedContext extends Context = Context & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>, StatisticStateExtension extends object = {}> {
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
    requestHandler?: RouterHandler<ExtendedContext, Routes> | RequestHandler<ExtendedContext>;
    /**
     * Allows the user to extend the crawling context with custom functionality (helpers, references, etc.).
     *
     * `extendContext` runs *before* navigation, so the returned members are visible to the
     * `preNavigationHooks`, `postNavigationHooks`, and the `requestHandler` alike. As a consequence,
     * the `context` passed to `extendContext` is the pre-navigation {@apilink CrawlingContext} and does
     * **not** include navigation-dependent members (e.g. `page`, `response`, `$`, `body`). If you need
     * those, use a `postNavigationHook` or the `requestHandler` instead.
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
    extendContext?: (context: CrawlingContext) => Awaitable<ContextExtension>;
    /**
     * *Intended for BasicCrawler subclasses*. Prepares a context pipeline that transforms the initial crawling context into the shape given by the `Context` type parameter.
     *
     * The option is not required if your crawler subclass does not extend the crawling context with custom information or helpers.
     */
    contextPipelineBuilder?: () => ContextPipeline<CrawlingContext, Context>;
    /**
     * Static list of URLs to be processed.
     *
     * @deprecated Use the `requestManager` option instead. To combine a read-only loader (such as a `RequestList`)
     * with a writable queue, build a tandem with {@apilink IRequestLoader.toTandem|`requestList.toTandem(requestQueue)`}
     * and pass the result as `requestManager`. When both `requestList` and `requestQueue` are provided, they are
     * combined into a tandem automatically.
     */
    requestList?: IRequestLoader;
    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     *
     * @deprecated Use the `requestManager` option instead. A `RequestQueue` is itself a request manager, so you can
     * pass it directly as `requestManager`.
     */
    requestQueue?: RequestQueue;
    /**
     * Manager of requests that should be processed by the crawler. Mutually exclusive with the deprecated
     * `requestQueue` and `requestList` options.
     *
     * If not provided, the crawler will open the default {@apilink RequestQueue} when it is first needed.
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
     * This includes retries due to navigation errors, session/proxy errors, or errors thrown from user-supplied
     * functions (`requestHandler`, `preNavigationHooks`, `postNavigationHooks`).
     * @default 3
     */
    maxRequestRetries?: number;
    /**
     * Indicates how much time (in seconds) to wait before crawling another same domain request. Subdomains are
     * paced together with the site they belong to.
     *
     * Wraps the crawler's request manager in a {@apilink ThrottlingRequestManager}; pass one as `requestManager`
     * yourself to configure it further.
     * @default 0
     */
    sameDomainDelaySecs?: number;
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
     * Lets you override the predicates that steer the crawler's task loop: `isTaskReadyFunction` (may another request
     * start?) and `isFinishedFunction` (is the crawl over?). The task itself — fetching a request and running it
     * through the pipeline — is owned by the crawler and cannot be overridden.
     *
     * Concurrency is configured elsewhere — through the `minConcurrency`/`maxConcurrency`/`maxRequestsPerMinute`
     * shortcuts, or a {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`} for finer control.
     */
    taskLoopOptions?: TaskLoopPredicates;
    /**
     * A pre-configured concurrency governor — the component that decides whether there is free compute for one more
     * task. Typically a {@apilink ConcurrencySystem}, though any {@apilink IConcurrencySystem} is accepted. All
     * scaling configuration (min/max/desired concurrency, scaling ratios, `maxTasksPerMinute`, snapshotter tuning)
     * lives on the instance itself.
     *
     * Inject the *same* instance into several concurrent crawlers to cap their **combined** concurrency against a
     * single budget. Each crawler still builds and drives its own {@apilink AutoscaledPool}; only the load/scaling
     * accounting is shared.
     *
     * Mutually exclusive with the `minConcurrency`/`maxConcurrency`/`maxRequestsPerMinute` shortcuts, which configure
     * the default system this one replaces — combining the two throws.
     *
     * You own a supplied system's lifecycle: `start()` it before `run()` (which throws otherwise) and `stop()` it once
     * every crawler borrowing it has finished. The crawler does neither on your behalf.
     */
    concurrencySystem?: IConcurrencySystem;
    /**
     * Sets the minimum concurrency (parallelism) for the crawl. Shortcut for the
     * {@apilink ConcurrencySystemOptions.minConcurrency|`minConcurrency`} option of the crawler's default
     * {@apilink ConcurrencySystem}.
     * > *WARNING:* If we set this value too high with respect to the available system memory and CPU, our crawler will run extremely slow or crash.
     * If not sure, it's better to keep the default value and the concurrency will scale up automatically.
     */
    minConcurrency?: number;
    /**
     * Sets the maximum concurrency (parallelism) for the crawl. Shortcut for the
     * {@apilink ConcurrencySystemOptions.maxConcurrency|`maxConcurrency`} option of the crawler's default
     * {@apilink ConcurrencySystem}.
     */
    maxConcurrency?: number;
    /**
     * The maximum number of requests per minute the crawler should run.
     * By default, this is set to `Infinity`, but we can pass any positive, non-zero integer.
     * Shortcut for the {@apilink ConcurrencySystemOptions.maxTasksPerMinute|`maxTasksPerMinute`} option of the
     * crawler's default {@apilink ConcurrencySystem}.
     */
    maxRequestsPerMinute?: number;
    /**
     * Allows to keep the crawler alive even if the {@apilink RequestQueue} gets empty.
     * By default, the `crawler.run()` will resolve once the queue is empty. With `keepAlive: true` it will keep running,
     * waiting for more requests to come. Use `crawler.stop()` to exit the crawler gracefully, or `crawler.teardown()` to stop it immediately.
     */
    keepAlive?: boolean;
    /**
     * An existing session pool instance to use. When provided, the crawler will use this pool directly instead of
     * creating a new one, enabling session sharing across multiple crawlers. The crawler will not tear down a shared
     * pool — the caller is responsible for its lifecycle.
     *
     * Accepts the built-in {@apilink SessionPool} or any object implementing the {@apilink ISessionPool} interface,
     * so custom session-management strategies can be plugged in.
     */
    sessionPool?: ISessionPool;
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
     * HTTP status codes that indicate the session should be retired.
     *
     * A 429 from a domain covered by a {@apilink ThrottlingRequestManager} is handled as a rate limit before
     * this is consulted, so removing 429 here only affects domains that manager does not cover.
     *
     * @default [401, 403, 429]
     */
    blockedStatusCodes?: number[];
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
    respectRobotsTxtFile?: boolean | {
        userAgent?: string;
    };
    /**
     * When a request is skipped for some reason, you can use this callback to act on it.
     * This is currently fired for requests skipped
     * 1. based on robots.txt file,
     * 2. because they don't match enqueueLinks filters,
     * 3. because they are redirected to a URL that doesn't match the enqueueLinks strategy,
     * 4. or because the {@apilink BasicCrawlerOptions.maxRequestsPerCrawl|`maxRequestsPerCrawl`} limit has been reached
     */
    onSkippedRequest?: SkippedRequestCallback;
    /**
     * A preconfigured statistics instance. When provided, the crawler records into it instead of building its own and
     * will not `reset()` it between `run()` calls. Accepts the built-in {@apilink Statistics} or any object
     * implementing {@apilink IStatistics}.
     *
     * Custom fields declared via {@apilink StatisticsOptions.stateExtension|`stateExtension`} are carried over to
     * {@apilink BasicCrawler.statistics|`crawler.statistics.state`}:
     *
     * ```ts
     * const statistics = new Statistics({ stateExtension: { defaultState: { productsFound: 0 } } });
     *
     * const crawler = new BasicCrawler({
     *     statistics,
     *     requestHandler: async () => {
     *         statistics.state.productsFound++;
     *     },
     * });
     *
     * await crawler.run();
     * // the custom fields are typed on `crawler.statistics` too
     * console.log(crawler.statistics.state.productsFound);
     * ```
     */
    statistics?: IStatistics<StatisticStateExtension>;
    /**
     * HTTP client implementation for the `sendRequest` context helper and for plain HTTP crawling.
     * Defaults to {@apilink ImpitHttpClient} when `@crawlee/impit-client` is installed, otherwise {@apilink FetchHttpClient}.
     */
    httpClient?: BaseHttpClient;
    /**
     * If set, the crawler will be configured for all connections to use
     * the Proxy URLs provided and rotated according to the configuration.
     */
    proxyConfiguration?: IProxyConfiguration;
    /**
     * Custom configuration to use for this crawler.
     * If provided, the crawler will use its own ServiceLocator instance instead of the global one.
     */
    configuration?: Configuration;
    /**
     * Custom storage backend to use for this crawler.
     * If provided, the crawler will use its own ServiceLocator instance instead of the global one.
     */
    storageBackend?: StorageBackend;
    /**
     * Custom event manager to use for this crawler.
     * If provided, the crawler will use its own ServiceLocator instance instead of the global one.
     */
    eventManager?: EventManager;
    /**
     * Custom logger to use for this crawler.
     * If provided, the crawler will use its own ServiceLocator instance instead of the global one.
     */
    logger?: CrawleeLogger;
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
    /**
     * Makes the storage writes performed while handling a request atomic with respect to the request
     * succeeding: they are recorded in a {@apilink StorageTransaction} spanning the whole request
     * lifecycle and only applied when the request handler succeeds, so a thrown handler leaves no partial
     * writes behind and a retry does not double-write. Reads within the handler see its own writes.
     *
     * `false` disables the mechanism entirely; an object overrides the per-storage-type
     * {@apilink StorageWritePolicy} (e.g. `{ requestQueue: 'deferred' }` for all-or-nothing enqueues).
     * {@apilink withDirectStorageAccess} is the per-call-site escape hatch; `useState()` is deliberately
     * *not* transactional.
     *
     * @default true
     */
    transactionalStorage?: boolean | Partial<StorageWritePolicy>;
    /**
     * An array of HTTP response [Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) to be excluded from error consideration.
     * By default, status codes >= 500 trigger errors.
     */
    ignoreHttpErrorStatusCodes?: number[];
    /**
     * An array of additional HTTP response [Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) to be treated as errors.
     * By default, status codes >= 500 trigger errors.
     */
    additionalHttpErrorStatusCodes?: number[];
}
export declare class BasicCrawler<Context extends CrawlingContext = CrawlingContext, ContextExtension = Dictionary<never>, ExtendedContext extends Context = Context & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>, StatisticStateExtension extends object = {}> {
    #private;
    /** @internal Reset static instance counter for test isolation. */
    static resetInstanceCount(): void;
    /**
     * The statistics instance collecting the crawler's run statistics - either the injected `statistics` option or a
     * crawler-built default. Typed as {@apilink IStatistics} so custom implementations can be plugged in.
     */
    get statistics(): IStatistics<StatisticStateExtension>;
    /**
     * The main request-handling component of the crawler. It manages the requests that the crawler processes,
     * combining any provided request loader and/or queue. It's initialized during the crawler startup or lazily
     * via {@apilink BasicCrawler.getRequestManager|`getRequestManager()`}.
     */
    protected requestManager?: IRequestManager;
    /**
     * A reference to the underlying session pool that manages the crawler's {@apilink Session|sessions}. Typed as
     * {@apilink ISessionPool} so custom implementations can be plugged in via the `sessionPool` constructor option.
     */
    get sessionPool(): ISessionPool;
    /**
     * The concurrency governor this run is booking its requests against — either the
     * {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`} that was injected, or the default the
     * crawler built for itself. Read it for telemetry: `desiredConcurrency`, `currentConcurrency`, `isRunning`.
     *
     * > *NOTE:* `undefined` until {@apilink BasicCrawler.run|`crawler.run()`} has resolved it. A crawler-owned default
     * is also rebuilt for every run, so the instance is not stable across runs.
     *
     * {@apilink IConcurrencySystem} is deliberately read-only. Tuning concurrency *while a crawl is running* means
     * owning the instance: build a {@apilink ConcurrencySystem} yourself and inject it, then set
     * `minConcurrency`/`maxConcurrency`/`desiredConcurrency` on your own reference.
     */
    get concurrencySystem(): IConcurrencySystem | undefined;
    /**
     * A reference to the underlying {@apilink IProxyConfiguration} instance that manages the crawler's proxies.
     * Only available if used by the crawler.
     */
    readonly proxyConfiguration?: IProxyConfiguration;
    /**
     * Default {@apilink Router} instance that will be used if we don't specify any {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`}.
     * See {@apilink Router.addHandler|`router.addHandler()`} and {@apilink Router.addDefaultHandler|`router.addDefaultHandler()`}.
     */
    readonly router: RouterHandler<Context, Routes>;
    /**
     * The basic part of the context pipeline. Unlike the subclass pipeline, this
     * part has no major side effects (e.g. launching a browser). It also makes typing more explicit, as subclass
     * pipelines expect the basic crawler fields to already be present in the context at runtime.
     *
     * Context built with this pipeline can be passed into multiple crawler pipelines at once.
     * This is used e.g. in the {@apilink AdaptivePlaywrightCrawler|`AdaptivePlaywrightCrawler`}.
     */
    get basicContextPipeline(): ContextPipeline<{
        request: Request;
    }, CrawlingContext>;
    get contextPipeline(): ContextPipeline<CrawlingContext, ExtendedContext>;
    running: boolean;
    hasFinishedBefore: boolean;
    get log(): CrawleeLogger;
    protected readonly requestHandler: RequestHandler<ExtendedContext>;
    protected readonly errorHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;
    protected readonly failedRequestHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;
    protected readonly requestHandlerTimeoutMillis: number;
    protected readonly internalTimeoutMillis: number;
    private get handledRequestsCount();
    protected blockedStatusCodes: Set<number>;
    protected readonly additionalHttpErrorStatusCodes: Set<number>;
    protected readonly httpClient: BaseHttpClient;
    protected readonly retryOnBlocked: boolean;
    /**
     * @internal
     */
    protected static optionsShape: {
        contextPipelineBuilder: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        extendContext: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        requestList: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestQueue: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestManager: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        requestHandlerTimeoutSecs: z.ZodOptional<z.ZodCustom<number, number>>;
        errorHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        failedRequestHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        maxRequestRetries: z.ZodDefault<z.ZodCustom<number, number>>;
        sameDomainDelaySecs: z.ZodDefault<z.ZodCustom<number, number>>;
        maxRequestsPerCrawl: z.ZodOptional<z.ZodCustom<number, number>>;
        maxCrawlDepth: z.ZodOptional<z.ZodCustom<number, number>>;
        taskLoopOptions: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        concurrencySystem: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        sessionPool: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        proxyConfiguration: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        statusMessageLoggingInterval: z.ZodDefault<z.ZodCustom<number, number>>;
        statusMessageCallback: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        additionalHttpErrorStatusCodes: z.ZodDefault<z.ZodArray<z.ZodCustom<number, number>>>;
        ignoreHttpErrorStatusCodes: z.ZodDefault<z.ZodArray<z.ZodCustom<number, number>>>;
        blockedStatusCodes: z.ZodOptional<z.ZodArray<z.ZodCustom<number, number>>>;
        retryOnBlocked: z.ZodDefault<z.ZodBoolean>;
        respectRobotsTxtFile: z.ZodDefault<z.ZodUnion<readonly [z.ZodBoolean, z.ZodCustom<Dictionary, Dictionary>]>>;
        transactionalStorage: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodObject<{
            requestQueue: z.ZodOptional<z.ZodEnum<{
                deferred: "deferred";
                writeThrough: "writeThrough";
            }>>;
        }, z.core.$strict>]>>;
        onSkippedRequest: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        httpClient: z.ZodOptional<z.ZodCustom<BaseHttpClient, BaseHttpClient>>;
        configuration: z.ZodOptional<z.ZodCustom<Configuration, Configuration>>;
        storageBackend: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        eventManager: z.ZodOptional<z.ZodCustom<EventManager, EventManager>>;
        logger: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        minConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxRequestsPerMinute: z.ZodOptional<z.ZodCustom<number, number>>;
        keepAlive: z.ZodOptional<z.ZodBoolean>;
        statistics: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        id: z.ZodOptional<z.ZodString>;
    };
    /**
     * All `BasicCrawler` parameters are passed via an options object.
     */
    constructor(options?: BasicCrawlerOptions<Context, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> & RequireContextPipeline<CrawlingContext, Context>);
    /**
     * Builds the crawler-owned default {@apilink ConcurrencySystem} from the resolved
     * `minConcurrency`/`maxConcurrency`/`maxRequestsPerMinute` shortcuts. Not called when a
     * {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`} was injected.
     *
     * Subclasses may override this to tune the default system (e.g. {@apilink HttpCrawler} raises the starting
     * concurrency and relaxes the event loop signal) while still honouring the user's shortcuts.
     */
    protected createDefaultConcurrencySystem(options: ConcurrencySystemOptions): ConcurrencySystem;
    /**
     * Determines if the given HTTP status code is an error status code given
     * the default behaviour and user-set preferences.
     * @param status
     * @returns `true` if the status code is considered an error, `false` otherwise
     */
    protected isErrorStatusCode(status: number): boolean;
    /**
     * Builds the basic context pipeline that transforms `{ request }` into a full `CrawlingContext`.
     * This handles base context creation, session resolution, and context helpers.
     */
    private buildBasicContextPipeline;
    private checkRobotsTxt;
    /**
     * Builds the subclass-specific context pipeline that transforms a `CrawlingContext` into the crawler's target context type.
     * Subclasses should override this to add their own pipeline stages.
     */
    protected buildContextPipeline(): ContextPipeline<CrawlingContext, CrawlingContext>;
    private createBaseContext;
    private resolveRequest;
    private resolveSession;
    private createContextHelpers;
    private buildFinalContextPipeline;
    /**
     * Checks if the given error is a proxy error by comparing its message to a list of known proxy error messages.
     * Used for retrying requests that failed due to proxy errors.
     *
     * @param error The error to check.
     */
    protected isProxyError(error: Error): boolean;
    /**
     * Sets the status message for the current crawler run.
     *
     * This method is periodically called by the crawler, every `statusMessageLoggingInterval` seconds.
     *
     * The message is logged and broadcast via the {@apilink EventType.STATUS_MESSAGE|`statusMessage`}
     * event. Integrations such as the Apify SDK subscribe to that event and forward the message to
     * their status-reporting backend (e.g. the Apify platform).
     */
    setStatusMessage(message: string, options?: SetStatusMessageOptions): void;
    private getPeriodicLogger;
    /**
     * Runs the crawler. Returns a promise that resolves once every request has been processed and the crawler's
     * finished-check ({@apilink BasicCrawlerOptions.taskLoopOptions|`taskLoopOptions.isFinishedFunction`}, or the
     * default "the request manager is empty") reports that the crawl is over.
     *
     * We can use the `requests` parameter to enqueue the initial requests — it is a shortcut for
     * running {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} before {@apilink BasicCrawler.run|`crawler.run()`}.
     *
     * @param [requests] The requests to add.
     * @param [options] Options for the request queue.
     */
    run(requests?: TypedRequestsLike<Routes>, options?: CrawlerRunOptions): Promise<FinalStatistics>;
    /**
     * Gracefully stops the current run of the crawler.
     *
     * All the tasks active at the time of calling this method will be allowed to finish.
     *
     * To stop the crawler immediately, use {@apilink BasicCrawler.teardown|`crawler.teardown()`} instead.
     */
    stop(reason?: string): void;
    /**
     * Stops dispatching new requests, letting the in-progress ones finish. Resolves once they have settled, or rejects
     * after `timeoutSecs` if they take too long. Unlike {@apilink BasicCrawler.stop|`stop()`}, this does not end the
     * run — {@apilink BasicCrawler.run|`run()`} stays pending until {@apilink BasicCrawler.resume|`resume()`}.
     *
     * > *NOTE:* The {@apilink BasicCrawler.concurrencySystem|concurrency system} keeps monitoring and autoscaling
     * throughout, since a shared one may still be serving other crawlers.
     */
    pause(timeoutSecs?: number): Promise<void>;
    /**
     * Resumes a run suspended with {@apilink BasicCrawler.pause|`pause()`}, letting the crawler dispatch requests
     * again. A no-op on a crawler that is not paused.
     */
    resume(): void;
    /**
     * Returns the crawler's {@apilink IRequestManager|request manager}, opening the default {@apilink RequestQueue}
     * if none has been configured or opened yet.
     */
    getRequestManager(): Promise<IRequestManager>;
    /**
     * @deprecated Use {@apilink BasicCrawler.getRequestManager|`getRequestManager()`} instead. This returns the
     * crawler's request manager, which is no longer guaranteed to be a {@apilink RequestQueue}.
     */
    getRequestQueue(): Promise<IRequestManager>;
    /**
     * Opens the default {@apilink RequestQueue}, applies the crawler's timeouts to it and records it as the
     * crawler-owned queue (so it gets purged between repeated `run()` calls).
     * @private
     */
    private openOwnedRequestQueue;
    /**
     * Tells a request manager how long we expect to hold a fetched request, so that one backed by a
     * locking storage backend keeps it reserved for slightly longer than the request handler timeout
     * (with some padding for overhead), but never for less than a minute. This prevents a long-running
     * request from being handed out a second time while it is still being processed — and it works
     * regardless of whether the manager is a plain {@apilink RequestQueue} or a `RequestManagerTandem`.
     */
    private applyRequestManagerTimeouts;
    /**
     * Validates a request source's `userData` against the {@apilink RouteSchemas|Standard Schema} registered
     * for its label on the crawler's schema-router (if any), throwing a {@apilink RequestValidationError} on
     * mismatch. A no-op when the user's request handler is not a schema-router, or no schema is registered for
     * the request's label. Applied by the crawler on the add paths it owns — `crawler.addRequests`,
     * `crawler.run`, `context.addRequests` and `context.enqueueLinks`.
     */
    private validateRequestUserData;
    useState<State extends Dictionary = Dictionary>(defaultValue?: State): Promise<State>;
    private logOncePerRun;
    /**
     * Adds requests to the queue in batches. By default, it will resolve after the initial batch is added, and continue
     * adding the rest in background. You can configure the batch size via `batchSize` option and the sleep time in between
     * the batches via `waitBetweenBatchesMillis`. If you want to wait for all batches to be added to the queue, you can use
     * the `waitForAllRequestsToBeAdded` promise you get in the response object.
     *
     * Optionally, the requests can be filtered using `include`/`exclude` glob or regexp patterns and an
     * enqueue `strategy` (both AND-ed together, same as {@apilink CrawlingContext.enqueueLinks|`enqueueLinks`}),
     * relative to `baseUrl`. Unlike `enqueueLinks`, there is no implicit "current page" to anchor the strategy
     * to, so `strategy` defaults to {@apilink EnqueueStrategy.All|`all`} here.
     *
     * This is an alias for calling `addRequestsBatched()` on the implicit `RequestQueue` for this crawler instance.
     *
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    addRequests(requests: ReadonlyDeep<TypedRequestsLike<Routes>>, options?: CrawlerAddRequestsOptions): Promise<CrawlerAddRequestsResult>;
    /**
     * Pushes data to the specified {@apilink Dataset}, or the default crawler {@apilink Dataset} by calling {@apilink Dataset.pushData}.
     */
    pushData(data: Parameters<Dataset['pushData']>[0], datasetIdentifier?: string | StorageIdentifier): Promise<void>;
    /**
     * Retrieves the specified {@apilink Dataset}, or the default crawler {@apilink Dataset}.
     */
    getDataset(identifier?: string | StorageIdentifier): Promise<Dataset>;
    /**
     * Retrieves data from the default crawler {@apilink Dataset} by calling {@apilink Dataset.getData}.
     */
    getData(...args: Parameters<Dataset['getData']>): ReturnType<Dataset['getData']>;
    /**
     * Retrieves all the data from the default crawler {@apilink Dataset} and exports them to the specified format.
     * Supported formats are currently 'json' and 'csv', and will be inferred from the `path` automatically.
     */
    exportData<Data>(path: string, format?: 'json' | 'csv', options?: DatasetExportOptions): Promise<Data[]>;
    /**
     * Initializes the crawler.
     */
    protected init(): Promise<void>;
    /**
     * The navigation timeout (pre-navigation hooks, navigation, and post-navigation hooks) in milliseconds, used
     * to size the internal request timeout. `BasicCrawler` has no navigation phase, so this is 0; the HTTP and
     * browser crawlers override it with their `navigationTimeoutSecs`.
     */
    protected getNavigationTimeoutMillis(): number;
    /**
     * Races the request against the internal timeout (see {@apilink raceWithTimeout}), sized to outlast the phases
     * that have their own timeout - the navigation, its hooks, and the request handler - so a legitimately slow
     * request, a per-route override, or a low `CRAWLEE_INTERNAL_TIMEOUT` is not cut short mid-phase. It takes
     * whichever is larger: the configured internal timeout, or this request's combined phase budget.
     */
    private withRequestTimeout;
    /**
     * The request handler timeout for a request with the given route label. A router route may override the
     * crawler's own `requestHandlerTimeoutSecs`; anything else falls back to `fallbackMillis`.
     *
     * @param label The request's route label, or `undefined` for the default route / no specific request.
     * @param fallbackMillis Timeout to use when no route overrides it.
     */
    private resolveRequestHandlerTimeoutMillis;
    /**
     * The timeout the router route with the given label asked for, or `undefined` when it did not override one
     * (or the request handler is not a router at all).
     */
    private getRouteTimeoutMillis;
    protected runRequestHandler(crawlingContext: ExtendedContext): Promise<void>;
    /**
     * Runs `callback` inside a {@apilink StorageTransaction}, unless transactional storage is disabled.
     * Deliberately does **not** commit on return - `handleRequest` swallows request handler failures, so
     * a normal return says nothing about success. `handleRequest` owns the outcome.
     */
    private runInStorageTransaction;
    /**
     * Handles blocked request
     */
    protected throwOnBlockedRequest(statusCode: number): void;
    private isAllowedBasedOnRobotsTxtFile;
    /**
     * Records an HTTP 429 against the URL's domain so the request manager can pace the retry.
     *
     * @param retryAfterHeader The raw `Retry-After` response header, if the server sent one.
     * @returns `true` if a manager took responsibility for the delay, in which case the caller should throw
     *  {@apilink RequestThrottledError} rather than treating the response as a blocked session.
     */
    protected recordDomainRateLimit(url: string, retryAfterHeader?: string | null): boolean;
    /**
     * Hands a robots.txt `Crawl-delay` to the request manager, warning if nothing is able to honour it.
     *
     * The warning is driven by whether the delay was actually accepted rather than by the type of the manager,
     * because a manager that does throttle still drops the delay for a domain missing from its `domains` list.
     */
    private applyCrawlDelay;
    protected getRobotsTxtFileForUrl(url: string): Promise<RobotsTxtFile | undefined>;
    private pauseOnMigration;
    /**
     * Fetches the next request to process from the underlying request provider.
     */
    private fetchNextRequest;
    /** Handles a single request - runs the request handler with retries, error handling, and lifecycle management. */
    private handleRequest;
    /**
     * Generator function that yields requests injected with the given crawl depth.
     * @internal
     */
    protected addCrawlDepthRequestGenerator(requests: RequestsLike, newRequestDepth: number): AsyncGenerator<Source, void, undefined>;
    /**
     * Run async callback with given timeout and retry. Returns the result of the callback.
     * @ignore
     */
    private timeoutAndRetry;
    /**
     * Returns true if either RequestList or RequestQueue have a request ready for processing.
     */
    private isTaskReadyFunction;
    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     */
    private defaultIsFinishedFunction;
    /**
     * Unwraps errors thrown by the context pipeline to get the actual user error.
     * RequestHandlerError and ContextPipelineInitializationError wrap the actual error.
     */
    private unwrapError;
    /**
     * Handles errors thrown by user provided requestHandler()
     *
     * @param request The request object, passed separately to circumvent potential dynamic logic in crawlingContext.request
     */
    private requestFunctionErrorHandler;
    private handleFailedRequestHandler;
    /**
     * Resolves the most verbose error message from a thrown error
     * @param error The error received
     * @returns The message to be logged
     */
    protected getMessageFromError(error: Error, forceStack?: boolean): string | TimeoutError | undefined;
    /**
     * Whether the session should be spared for this error - either because it was already retired, or because the
     * failure says nothing about the session (a rate limit is a property of the domain).
     */
    private errorAbsolvesSession;
    private canRequestBeRetried;
    /**
     * Stops the crawler immediately.
     *
     * This method doesn't wait for currently active requests to finish.
     *
     * To stop the crawler gracefully (waiting for all running requests to finish), use {@apilink BasicCrawler.stop|`crawler.stop()`} instead.
     */
    teardown(): Promise<void>;
    protected getCookieHeaderFromRequest(request: Request): string;
    private requestMatchesEnqueueStrategy;
}
export interface CreateContextOptions {
    request: Request;
    session: ISession;
    proxyInfo?: ProxyInfo;
}
export interface CrawlerAddRequestsOptions extends AddRequestsBatchedOptions, EnqueueUrlsOptions {
}
export interface CrawlerAddRequestsResult extends AddRequestsBatchedResult {
}
export interface CrawlerRunOptions extends CrawlerAddRequestsOptions {
    /**
     * Controls whether the request queue is purged between repeated `run()` calls on the same crawler instance.
     * Purging clears all requests and resets internal counters, allowing the same URLs to be processed again.
     *
     * - **`undefined`** (default) — only the crawler's own (auto-created) queue is purged.
     *   A user-supplied `requestQueue` is left untouched.
     * - **`true`** — the queue is always purged, even if it was supplied by the user.
     * - **`false`** — nothing is purged. Only genuinely new requests will be processed;
     *   note that even a failed request is considered handled.
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
export declare function createBasicRouter<Context extends BasicCrawlingContext = BasicCrawlingContext, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export declare function createBasicRouter<Context extends BasicCrawlingContext = BasicCrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
