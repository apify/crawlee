import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    AutoscaledPoolOptions,
    ConcurrencySystemOptions,
    Configuration,
    CrawleeLogger,
    CrawlingContext,
    DatasetExportOptions,
    EnqueueLinksOptions,
    EventManager,
    EventStatusMessageData,
    FinalStatistics,
    GetUserDataFromRequest,
    IConcurrencySystem,
    IProxyConfiguration,
    IRequestLoader,
    IRequestManager,
    IStatistics,
    Request,
    RequestsLike,
    RequestTransform,
    RouterHandler,
    RouterRoutes,
    SkippedRequestCallback,
    Source,
    StatisticState,
    StorageIdentifier,
    StorageWritePolicy,
    TaskLoopPredicates,
    TypedRequestsLike,
} from '@crawlee/core';
import {
    AutoscaledPool,
    bindMethodsToServiceLocator,
    BLOCKED_STATUS_CODES,
    ConcurrencySystem,
    ContextPipeline,
    ContextPipelineCleanupError,
    ContextPipelineInitializationError,
    ContextPipelineInterruptedError,
    createSkippedRequestArgs,
    createStorageTransaction,
    CriticalError,
    currentStorageTransaction,
    Dataset,
    enqueueLinks,
    EnqueueStrategy,
    EventType,
    getObjectType,
    KeyValueStore,
    log,
    LogLevel,
    mergeCookies,
    MissingSessionError,
    NavigationSkippedError,
    NonRetryableError,
    OwnedOrInjected,
    purgeDefaultStorages,
    RequestHandlerError,
    RequestManagerTandem,
    RequestQueue,
    RequestState,
    RetryRequestError,
    Router,
    ServiceLocator,
    serviceLocator,
    Session,
    SessionError,
    SessionPool,
    Statistics,
    validateUserData,
    validators,
    withDirectStorageAccess,
} from '@crawlee/core';
import { FetchHttpClient } from '@crawlee/http-client';
import type {
    Awaitable,
    BaseHttpClient,
    BatchAddRequestsResult,
    Dictionary,
    ISession,
    ISessionPool,
    ProxyInfo,
    SetStatusMessageOptions,
    StorageBackend,
} from '@crawlee/types';
import { isAsyncIterable, isIterable, RobotsTxtFile, ROTATE_PROXY_ERRORS } from '@crawlee/utils';
import ow, { ArgumentError, type BasePredicate } from 'ow';
import { getDomain } from 'tldts';
import type { ReadonlyDeep, SetRequired } from 'type-fest';

import { LruCache } from '@apify/datastructures';
import { addTimeoutToPromise, extendTimeout, TimeoutError } from '@apify/timeout';
import { cryptoRandomObjectId } from '@apify/utilities';

import {
    extendTimeoutKey,
    navigationDeadlineKey,
    raceWithTimeout,
    type RequestTimeoutContext,
    timeoutExpiredKey,
} from './request-timeout.js';
import { createSendRequest } from './send-request.js';

class LazyDefaultHttpClient implements BaseHttpClient {
    readonly #delegatePromise: Promise<BaseHttpClient>;

    constructor(options?: { logger?: CrawleeLogger }) {
        this.#delegatePromise = import('@crawlee/impit-client')
            .then(({ ImpitHttpClient }) => new ImpitHttpClient(options))
            .catch(() => {
                (options?.logger ?? log).warning(
                    'Optional dependency @crawlee/impit-client is not installed. ' +
                        'Falling back to native fetch — proxy support and browser fingerprinting are unavailable.',
                );
                return new FetchHttpClient(options);
            });
    }

    async sendRequest(...args: Parameters<BaseHttpClient['sendRequest']>): Promise<Response> {
        return (await this.#delegatePromise).sendRequest(...args);
    }
}

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

const deferredCleanupKey = Symbol('deferredCleanup');

// The request timeout plumbing (the window helper, the context symbols, and the race) lives in its own module.
export { navigationDeadlineKey, remainingNavigationWindowMillis } from './request-timeout.js';

/** The in-flight context, carrying the timeout slots ({@apilink raceWithTimeout} hangs its extender on them). */
type PendingCrawlingContext = { request: Request } & Partial<CrawlingContext> & RequestTimeoutContext;

export type RequestHandler<Context extends CrawlingContext = CrawlingContext> = (inputs: Context) => Awaitable<void>;

/**
 * An error handler receives the crawling context and the error that was thrown while processing the request.
 *
 * Unlike the {@apilink RequestHandler}, an error handler may run before the context pipeline has finished
 * building the full context (e.g. when navigation or session setup fails). Therefore only `BaseContext` is
 * guaranteed to be present, while the extra properties added by the pipeline and `extendContext` (the
 * difference between `BaseContext` and `ExtendedContext`) are only available as a `Partial`.
 */
export type ErrorHandler<
    BaseContext extends CrawlingContext = CrawlingContext,
    ExtendedContext extends BaseContext = BaseContext,
> = (inputs: BaseContext & Partial<ExtendedContext>, error: Error) => Awaitable<void>;

export interface StatusMessageCallbackParams<
    Context extends CrawlingContext = BasicCrawlingContext,
    Crawler extends BasicCrawler<any, any, any, any> = BasicCrawler<Context>,
> {
    state: StatisticState;
    crawler: Crawler;
    previousState: StatisticState;
    message: string;
}

export type StatusMessageCallback<
    Context extends CrawlingContext = BasicCrawlingContext,
    Crawler extends BasicCrawler<any, any, any, any> = BasicCrawler<Context>,
> = (params: StatusMessageCallbackParams<Context, Crawler>) => Awaitable<void>;

export type RequireContextPipeline<
    DefaultContextType extends CrawlingContext,
    FinalContextType extends DefaultContextType,
> = DefaultContextType extends FinalContextType
    ? {}
    : { contextPipelineBuilder: () => ContextPipeline<CrawlingContext, FinalContextType> };

export interface BasicCrawlerOptions<
    Context extends CrawlingContext = CrawlingContext,
    ContextExtension = Dictionary<never>,
    ExtendedContext extends Context = Context & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
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
     * Indicates how much time (in seconds) to wait before crawling another same domain request.
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

    /**
     * A preconfigured statistics instance. When provided, the crawler records into it instead of building its own and
     * will not `reset()` it between `run()` calls. Accepts the built-in {@apilink Statistics} (subclass it to track
     * extra fields) or any object implementing {@apilink IStatistics}.
     */
    statistics?: IStatistics;

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
 * The {@apilink Request} objects are fed from the {@apilink IRequestManager|request manager} provided via the
 * {@apilink BasicCrawlerOptions.requestManager|`requestManager`} constructor option (a {@apilink RequestQueue} is
 * itself a request manager). If no `requestManager` is provided, the crawler opens the default {@apilink RequestQueue}
 * either when the {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} function is called, or if the `requests`
 * parameter (representing the initial requests) of the {@apilink BasicCrawler.run|`crawler.run()`} function is provided.
 *
 * To read requests from a read-only source such as a {@apilink RequestList} or {@apilink SitemapRequestLoader} while
 * still being able to enqueue new ones, combine the loader with a queue into a {@apilink RequestManagerTandem} using
 * {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`} and pass the result as `requestManager`. The tandem
 * first processes URLs from the loader and automatically enqueues them into the queue, ensuring a single URL is not
 * crawled multiple times.
 *
 * > The legacy {@apilink BasicCrawlerOptions.requestList|`requestList`} and
 * > {@apilink BasicCrawlerOptions.requestQueue|`requestQueue`} options are deprecated. They are still accepted and
 * > folded into a single `requestManager` (combined into a tandem when both are given), but new code should use
 * > `requestManager` directly.
 *
 * The crawler finishes if there are no more {@apilink Request} objects to crawl.
 *
 * New requests are only dispatched when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the {@apilink BasicCrawlerOptions.minConcurrency|`minConcurrency`},
 * {@apilink BasicCrawlerOptions.maxConcurrency|`maxConcurrency`} and
 * {@apilink BasicCrawlerOptions.maxRequestsPerMinute|`maxRequestsPerMinute`} shortcuts, or, for finer control, by
 * injecting a pre-configured {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`}.
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

/**
 * Identifies a crawler instance for storage aliasing, `useState()` and status-message events.
 */
interface CrawlerIdentity {
    /**
     * 0-based instantiation order across all crawlers in the process.
     * Note that the value can be subject to race conditions between different script invocations.
     */
    readonly instanceIndex: number;
    /** The user-supplied `id` option, or a fallback derived from `instanceIndex`. */
    readonly id: string;
    /** Whether `id` came from the user (as opposed to being derived from `instanceIndex`). */
    readonly hasExplicitId: boolean;
}

export class BasicCrawler<
    Context extends CrawlingContext = CrawlingContext,
    ContextExtension = Dictionary<never>,
    ExtendedContext extends Context = Context & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
> {
    protected static readonly CRAWLEE_STATE_KEY = 'CRAWLEE_STATE';

    /**
     * Tracks the number of crawler instances created. The first crawler uses the default
     * request queue; subsequent ones get their own queue via a unique alias so they don't
     * collide.
     */
    // kept as TS-private: tests reset the counter at runtime
    private static instanceCount = 0;

    /**
     * Tracks crawler instances that accessed shared state without having an explicit id.
     * Used to detect and warn about multiple crawlers sharing the same state.
     */
    static #useStateAnonymousIndices = new Set<number>();

    /** Backs the {@apilink BasicCrawler.stats|`stats`} getter. */
    #statsDep: OwnedOrInjected<IStatistics, Statistics>;

    /**
     * The statistics instance collecting the crawler's run statistics - either the injected `statistics` option or a
     * crawler-built default. Typed as {@apilink IStatistics} so custom implementations can be plugged in.
     */
    get stats(): IStatistics {
        return this.#statsDep.value;
    }

    /**
     * The main request-handling component of the crawler. It manages the requests that the crawler processes,
     * combining any provided request loader and/or queue. It's initialized during the crawler startup or lazily
     * via {@apilink BasicCrawler.getRequestManager|`getRequestManager()`}.
     */
    protected requestManager?: IRequestManager;

    /** Backs the {@apilink BasicCrawler.sessionPool|`sessionPool`} getter. */
    #sessionPoolDep: OwnedOrInjected<ISessionPool, SessionPool>;

    /**
     * A reference to the underlying session pool that manages the crawler's {@apilink Session|sessions}. Typed as
     * {@apilink ISessionPool} so custom implementations can be plugged in via the `sessionPool` constructor option.
     */
    get sessionPool(): ISessionPool {
        return this.#sessionPoolDep.value;
    }

    /**
     * Tracks **only** the queue the crawler opens for itself — not the {@apilink RequestManagerTandem} that may wrap it
     * around a user-supplied `requestList` — so the owned-only purge between repeated `run()` calls never reaches
     * through to a borrowed loader. Filled lazily in {@apilink BasicCrawler.openOwnedRequestQueue|`openOwnedRequestQueue()`}.
     */
    #ownedRequestQueue = OwnedOrInjected.resolve<RequestQueue>();

    /**
     * Whether the request-processing-time hint has already been forwarded to the request manager. The hint
     * derives only from `requestHandlerTimeoutMillis` (constant for the crawler's lifetime) and is raise-only,
     * so it only needs to be applied once, at the first async access of the manager.
     */
    #requestManagerTimeoutsApplied = false;

    /**
     * Resolves the governor for one run: either the injected
     * {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`} (borrowed) or a freshly built default with
     * the concurrency shortcuts folded in (owned, so the crawler starts and stops it).
     */
    readonly #resolveConcurrencySystem: () => OwnedOrInjected<IConcurrencySystem, ConcurrencySystem>;

    /** As resolved by `init()`. Absent until the first run, so a `teardown()` before it is a no-op. */
    #concurrencySystemDep?: OwnedOrInjected<IConcurrencySystem, ConcurrencySystem>;

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
    get concurrencySystem(): IConcurrencySystem | undefined {
        return this.#concurrencySystemDep?.maybeValue;
    }

    /**
     * The task loop that dispatches this run's requests. Private on purpose — it is a bare parallel task runner with
     * no configuration left of its own (see {@apilink ConcurrencySystem}), and everything a caller legitimately did
     * with it now has a crawler-level counterpart: {@apilink BasicCrawler.pause|`pause()`},
     * {@apilink BasicCrawler.resume|`resume()`}, {@apilink BasicCrawler.teardown|`teardown()`} and
     * {@apilink BasicCrawler.concurrencySystem|`concurrencySystem`}.
     */
    #autoscaledPool?: AutoscaledPool;

    /**
     * A reference to the underlying {@apilink IProxyConfiguration} instance that manages the crawler's proxies.
     * Only available if used by the crawler.
     */
    readonly proxyConfiguration?: IProxyConfiguration;

    /**
     * Default {@apilink Router} instance that will be used if we don't specify any {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`}.
     * See {@apilink Router.addHandler|`router.addHandler()`} and {@apilink Router.addDefaultHandler|`router.addDefaultHandler()`}.
     */
    readonly router: RouterHandler<Context, Routes> = Router.create<Context>() as unknown as RouterHandler<
        Context,
        Routes
    >;

    #basicContextPipeline?: ContextPipeline<{ request: Request }, CrawlingContext>;

    /**
     * The basic part of the context pipeline. Unlike the subclass pipeline, this
     * part has no major side effects (e.g. launching a browser). It also makes typing more explicit, as subclass
     * pipelines expect the basic crawler fields to already be present in the context at runtime.
     *
     * Context built with this pipeline can be passed into multiple crawler pipelines at once.
     * This is used e.g. in the {@apilink AdaptivePlaywrightCrawler|`AdaptivePlaywrightCrawler`}.
     */
    get basicContextPipeline(): ContextPipeline<{ request: Request }, CrawlingContext> {
        if (this.#basicContextPipeline === undefined) {
            this.#basicContextPipeline = this.buildBasicContextPipeline();
        }

        return this.#basicContextPipeline;
    }

    #contextPipeline?: ContextPipeline<CrawlingContext, ExtendedContext>;

    get contextPipeline(): ContextPipeline<CrawlingContext, ExtendedContext> {
        if (this.#contextPipeline === undefined) {
            this.#contextPipeline = this.buildFinalContextPipeline();
        }

        return this.#contextPipeline;
    }

    running = false;
    hasFinishedBefore = false;
    #unexpectedStop = false;

    #log!: CrawleeLogger;

    get log(): CrawleeLogger {
        return this.#log;
    }

    protected readonly requestHandler!: RequestHandler<ExtendedContext>;
    protected readonly errorHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;
    protected readonly failedRequestHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;
    // kept as TS-private: tests read it at runtime
    private requestHandlerTimeoutMillis!: number;
    protected readonly internalTimeoutMillis: number;
    protected readonly maxRequestRetries: number;
    protected readonly maxCrawlDepth?: number;
    #sameDomainDelayMillis: number;
    #domainAccessedTime: Map<string, number>;
    protected readonly maxRequestsPerCrawl?: number;

    private get handledRequestsCount(): number {
        return this.stats.state.requestsFinished + this.stats.state.requestsFailed;
    }

    #statusMessageLoggingInterval: number;
    #statusMessageCallback?: StatusMessageCallback;
    protected blockedStatusCodes = new Set<number>();
    protected readonly additionalHttpErrorStatusCodes: Set<number>;
    #ignoreHttpErrorStatusCodes: Set<number>;
    /**
     * The resolved options for the crawler's own task loop — the crawler-owned `runTaskFunction`, the (possibly
     * user-overridden) ready/finished predicates and cadence/logging. Concurrency configuration lives on the
     * {@apilink ConcurrencySystem} instead, and the loop's `consumer` identity is the crawler's own, so neither is
     * settable here.
     */
    // kept as TS-private: tests mutate it at runtime
    private taskLoopOptions: Omit<AutoscaledPoolOptions, 'concurrencySystem' | 'consumer'>;
    protected readonly httpClient: BaseHttpClient;
    protected readonly retryOnBlocked: boolean;
    #respectRobotsTxtFile: boolean | { userAgent?: string };
    /** Whether `runInStorageTransaction()` opens a transaction at all. */
    readonly #transactionalStorageEnabled: boolean;
    /** The resolved per-storage-type write policy overrides forwarded to each request's transaction. */
    readonly #storageWritePolicy: Partial<StorageWritePolicy>;
    protected readonly onSkippedRequest?: SkippedRequestCallback;
    #closeEvents?: boolean;
    #loggedPerRun = new Set<string>();
    readonly #robotsTxtFileCache: LruCache<RobotsTxtFile>;
    protected readonly identity: CrawlerIdentity;
    readonly #contextPipelineOptions: {
        contextPipelineBuilder?: () => ContextPipeline<CrawlingContext, Context>;
        extendContext?: (context: CrawlingContext) => Awaitable<ContextExtension>;
    };

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
        maxRequestsPerCrawl: ow.optional.number,
        maxCrawlDepth: ow.optional.number,
        taskLoopOptions: ow.optional.object,
        concurrencySystem: ow.optional.object,
        sessionPool: ow.optional.object.validate(validators.sessionPool),
        proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),

        statusMessageLoggingInterval: ow.optional.number,
        statusMessageCallback: ow.optional.function,

        additionalHttpErrorStatusCodes: ow.optional.array.ofType(ow.number),
        ignoreHttpErrorStatusCodes: ow.optional.array.ofType(ow.number),

        blockedStatusCodes: ow.optional.array.ofType(ow.number),
        retryOnBlocked: ow.optional.boolean,
        respectRobotsTxtFile: ow.optional.any(ow.boolean, ow.object),
        transactionalStorage: ow.optional.any(
            ow.boolean,
            ow.object.exactShape({
                requestQueue: ow.optional.string.oneOf(['deferred', 'writeThrough']),
            }),
        ) as BasePredicate<boolean | Partial<StorageWritePolicy> | undefined>,
        onSkippedRequest: ow.optional.function,
        httpClient: ow.optional.object,

        configuration: ow.optional.object,
        storageBackend: ow.optional.object,
        eventManager: ow.optional.object,
        logger: ow.optional.object,

        // AutoscaledPool shorthands
        minConcurrency: ow.optional.number,
        maxConcurrency: ow.optional.number,
        maxRequestsPerMinute: ow.optional.number.integerOrInfinite.positive.greaterThanOrEqual(1),
        keepAlive: ow.optional.boolean,

        statistics: ow.optional.object,

        id: ow.optional.string,
    };

    /**
     * All `BasicCrawler` parameters are passed via an options object.
     */
    constructor(
        options: BasicCrawlerOptions<Context, ContextExtension, ExtendedContext, Routes> &
            RequireContextPipeline<CrawlingContext, Context> = {} as any, // cast because the constructor logic handles missing `contextPipelineBuilder` - the type is just for DX
    ) {
        ow(options, 'BasicCrawlerOptions', ow.object.exactShape(BasicCrawler.optionsShape));

        const {
            // oxlint-disable-next-line typescript/no-deprecated -- still accepted and folded into `requestManager` for back-compat
            requestList,
            // oxlint-disable-next-line typescript/no-deprecated -- still accepted and folded into `requestManager` for back-compat
            requestQueue,
            requestManager,
            maxRequestRetries = 3,
            sameDomainDelaySecs = 0,
            maxRequestsPerCrawl,
            maxCrawlDepth,
            taskLoopOptions = {},
            concurrencySystem,
            keepAlive,
            sessionPool,
            proxyConfiguration,

            additionalHttpErrorStatusCodes = [],
            ignoreHttpErrorStatusCodes = [],

            // Service locator options
            configuration,
            storageBackend,
            eventManager,
            logger,

            // AutoscaledPool shorthands
            minConcurrency,
            maxConcurrency,
            maxRequestsPerMinute,

            blockedStatusCodes: blockedStatusCodesInput,
            retryOnBlocked = false,
            respectRobotsTxtFile = false,
            transactionalStorage,
            onSkippedRequest,
            requestHandler,
            requestHandlerTimeoutSecs,
            errorHandler,
            failedRequestHandler,
            statusMessageLoggingInterval = 10,
            statusMessageCallback,
            statistics,
            httpClient,

            id,
        } = options;

        // All concurrency configuration lives on the `ConcurrencySystem`, so the shortcuts have nowhere to go once
        // one is supplied - and silently dropping a `maxConcurrency` the user asked for is how crawls end up
        // hammering a site.
        if (
            concurrencySystem !== undefined &&
            (minConcurrency !== undefined || maxConcurrency !== undefined || maxRequestsPerMinute !== undefined)
        ) {
            throw new ArgumentError(
                'The `minConcurrency`/`maxConcurrency`/`maxRequestsPerMinute` shortcuts cannot be combined with ' +
                    '`concurrencySystem` - they configure the default `ConcurrencySystem` that a supplied one ' +
                    'replaces. Pass them to the `ConcurrencySystem` constructor instead.',
                this.constructor,
            );
        }

        // Create per-crawler service locator if custom services were provided.
        // This wraps every method on the crawler instance so that calls to the global `serviceLocator`
        // (via AsyncLocalStorage) resolve to this scoped instance instead.
        // We also enter the scope for the rest of the constructor body, so that any code below
        // that accesses `serviceLocator` will see the correct (scoped) instance.
        let serviceLocatorScope = { enterScope: () => {}, exitScope: () => {} };

        if (
            storageBackend ||
            eventManager ||
            logger ||
            (configuration !== undefined && configuration !== serviceLocator.getConfiguration())
        ) {
            const scopedServiceLocator = new ServiceLocator(configuration, eventManager, storageBackend, logger);
            serviceLocatorScope = bindMethodsToServiceLocator(scopedServiceLocator, this);
        }

        try {
            serviceLocatorScope.enterScope();
            this.#contextPipelineOptions = {
                contextPipelineBuilder: options.contextPipelineBuilder,
                extendContext: options.extendContext,
            };

            this.#log = serviceLocator.getLogger().child({ prefix: this.constructor.name });

            // Initialize the Configuration instance to avoid lazy loading in the components
            serviceLocator.getConfiguration();

            const instanceIndex = BasicCrawler.instanceCount++;
            this.identity = { instanceIndex, hasExplicitId: id !== undefined, id: id ?? String(instanceIndex) };

            if (requestManager !== undefined) {
                if (requestList !== undefined || requestQueue !== undefined) {
                    throw new Error(
                        'The `requestManager` option cannot be used in conjunction with `requestList` and/or `requestQueue`',
                    );
                }
                this.requestManager = requestManager;
            } else if (requestList !== undefined && requestQueue !== undefined) {
                // Combine the read-only list with the writable queue into a tandem.
                this.requestManager = new RequestManagerTandem(requestList, requestQueue);
            } else if (requestQueue !== undefined) {
                // A RequestQueue is itself a request manager.
                this.requestManager = requestQueue;
            } else if (requestList !== undefined) {
                // A lone read-only `requestList` (deprecated option) is combined with a lazily-opened default queue
                // into a tandem, so that its requests are read first and new ones can still be enqueued during the
                // crawl. The queue is opened on first use; the tandem also forwards `persistState()` to the loader.
                this.requestManager = new RequestManagerTandem(requestList, () => this.openOwnedRequestQueue());
            }

            this.httpClient = httpClient ?? new LazyDefaultHttpClient({ logger: this.log });
            this.proxyConfiguration = proxyConfiguration;
            this.#statusMessageLoggingInterval = statusMessageLoggingInterval;
            this.#statusMessageCallback = statusMessageCallback as StatusMessageCallback;
            this.#domainAccessedTime = new Map();
            this.#robotsTxtFileCache = new LruCache({ maxLength: 1000 });
            this.handleSkippedRequest = this.handleSkippedRequest.bind(this);

            this.additionalHttpErrorStatusCodes = new Set([...additionalHttpErrorStatusCodes]);
            this.#ignoreHttpErrorStatusCodes = new Set([...ignoreHttpErrorStatusCodes]);

            this.requestHandler = requestHandler ?? this.router;
            this.failedRequestHandler = failedRequestHandler;
            this.errorHandler = errorHandler;

            if (requestHandlerTimeoutSecs) {
                this.requestHandlerTimeoutMillis = requestHandlerTimeoutSecs * 1000;
            } else {
                this.requestHandlerTimeoutMillis = 60_000;
            }

            this.retryOnBlocked = retryOnBlocked;
            this.#respectRobotsTxtFile = respectRobotsTxtFile;
            // The cast undoes ow's assertion signature, which mangles `boolean | object` unions.
            const transactionalStorageOption = transactionalStorage as
                | boolean
                | Partial<StorageWritePolicy>
                | undefined;
            this.#transactionalStorageEnabled = transactionalStorageOption !== false;
            this.#storageWritePolicy = typeof transactionalStorageOption === 'object' ? transactionalStorageOption : {};
            this.onSkippedRequest = onSkippedRequest;

            // allow at least 5min for internal timeouts
            this.internalTimeoutMillis =
                serviceLocator.getConfiguration().internalTimeoutMillis ??
                Math.max(this.requestHandlerTimeoutMillis * 2, 300e3);

            this.maxRequestRetries = maxRequestRetries;
            this.maxCrawlDepth = maxCrawlDepth;
            this.#sameDomainDelayMillis = sameDomainDelaySecs * 1000;
            this.#statsDep = OwnedOrInjected.resolve<IStatistics, Statistics>(
                statistics,
                () =>
                    new Statistics({
                        logMessage: `${this.constructor.name} request statistics:`,
                        log: this.log,
                        id: this.identity.id,
                    }),
            );

            if (sessionPool && proxyConfiguration) {
                this.log.warning(
                    'Both `sessionPool` and `proxyConfiguration` were provided to the crawler. ' +
                        'The `proxyConfiguration` is ignored - sessions from the supplied pool keep whatever ' +
                        '`proxyInfo` they were created with. Configure proxies on the pool instead, ' +
                        'e.g. via `addSession({ proxyInfo })` or a custom `createSessionFunction`.',
                );
            }

            this.#sessionPoolDep = OwnedOrInjected.resolve(
                sessionPool,
                () =>
                    new SessionPool({
                        createSessionFunction: async (opts) =>
                            new Session({
                                ...opts?.sessionOptions,
                                proxyInfo:
                                    opts?.sessionOptions?.proxyInfo ?? (await this.proxyConfiguration?.newProxyInfo()),
                            }),
                    }),
            );

            this.blockedStatusCodes = new Set(blockedStatusCodesInput ?? BLOCKED_STATUS_CODES);

            const maxSignedInteger = 2 ** 31 - 1;
            if (this.requestHandlerTimeoutMillis > maxSignedInteger) {
                this.log.warning(
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
            let { isFinishedFunction, isTaskReadyFunction } = taskLoopOptions;

            // override even if `isFinishedFunction` provided by user - `keepAlive` has higher priority
            if (keepAlive) {
                isFinishedFunction = async () => false;
            }

            const crawlerOwnedTaskLoopConfiguration: Partial<typeof this.taskLoopOptions> = {
                runTaskFunction: async () => {
                    const source = this.requestManager;
                    if (!source) throw new Error('Request provider is not initialized!');

                    const request = await this.resolveRequest();
                    if (!request || this.delayRequest(request, source)) {
                        return;
                    }

                    // Started here, rather than in `handleRequest`, so that a failure during context pipeline
                    // initialization (e.g. a browser page timing out before the request handler ever runs) is
                    // still accounted for by `failJob` below - which is a no-op without a matching `startJob`.
                    this.stats.startJob(request.id || request.uniqueKey);

                    const crawlingContext = { request } as { request: Request } & Partial<CrawlingContext>;
                    try {
                        // The transaction spans the whole pipeline call, covering the navigation hooks
                        // and `extendContext` too; `handleRequest` drives its outcome explicitly.
                        await this.runInStorageTransaction(
                            async () =>
                                // Navigation, the navigation hooks and the request handler are timed individually, but the
                                // phases between them are not, so a request could still get stuck indefinitely. This is the
                                // catch-all for that - see `raceWithTimeout` for why it is a bare timer, not a timeout frame.
                                await this.withRequestTimeout(
                                    crawlingContext,
                                    this.basicContextPipeline
                                        .chain(this.contextPipeline)
                                        .call(crawlingContext, (ctx) => this.handleRequest(ctx, source, request)),
                                ),
                        );
                    } catch (error) {
                        // ContextPipelineInterruptedError means the request was intentionally skipped
                        // (e.g., doesn't match enqueue strategy after redirect). Just return gracefully.
                        if (error instanceof ContextPipelineInterruptedError) {
                            this.stats.discardJob(request.id || request.uniqueKey);
                            await this.timeoutAndRetry(
                                async () => this.requestManager?.markRequestAsHandled(request),
                                this.internalTimeoutMillis,
                                `Marking request ${crawlingContext.request.url} (${crawlingContext.request.id}) as handled timed out after ${
                                    this.internalTimeoutMillis / 1e3
                                } seconds.`,
                            );
                            return;
                        }

                        // If the error happened during pipeline initialization (e.g., navigation timeout, session/proxy error,
                        // i.e. not in user's requestHandler), handle it through the normal error flow. A bare `TimeoutError`
                        // here is the internal timeout above firing - anything else thrown inside the pipeline arrives wrapped.
                        const isPipelineError =
                            error instanceof ContextPipelineInitializationError ||
                            error instanceof SessionError ||
                            error instanceof TimeoutError;
                        if (isPipelineError) {
                            const unwrappedError = this.unwrapError(error);

                            await this.requestFunctionErrorHandler(
                                unwrappedError,
                                crawlingContext as CrawlingContext,
                                request,
                                this.requestManager!,
                            );
                            // SessionError already retired the session in `requestFunctionErrorHandler`;
                            // skip `markBad` to avoid double-counting usage/error score.
                            if (!(unwrappedError instanceof SessionError)) {
                                crawlingContext.session?.markBad();
                            }
                            return;
                        }
                        throw this.unwrapError(error);
                    } finally {
                        // Run request-scoped deferred cleanups only after the whole request lifecycle - including the user's error handler - has finished.
                        const deferredCleanup =
                            (crawlingContext as Partial<Record<typeof deferredCleanupKey, (() => Promise<unknown>)[]>>)[
                                deferredCleanupKey
                            ] ?? [];
                        await Promise.all(
                            deferredCleanup.map((fn) =>
                                fn().catch((cleanupError) =>
                                    this.log.debug('Error in deferred cleanup', { error: cleanupError }),
                                ),
                            ),
                        );
                    }
                },
                isTaskReadyFunction: async () => {
                    if (isMaxPagesExceeded()) {
                        this.logOncePerRun(
                            'shuttingDown',
                            'Crawler reached the maxRequestsPerCrawl limit of ' +
                                `${this.maxRequestsPerCrawl} requests and will shut down soon. Requests that are in progress will be allowed to finish.`,
                        );
                        return false;
                    }

                    if (this.#unexpectedStop) {
                        this.logOncePerRun(
                            'shuttingDown',
                            'No new requests are allowed because the `stop()` method has been called. ' +
                                'Ongoing requests will be allowed to complete.',
                        );
                        return false;
                    }

                    return isTaskReadyFunction ? await isTaskReadyFunction() : await this.isTaskReadyFunction();
                },
                isFinishedFunction: async () => {
                    if (isMaxPagesExceeded()) {
                        this.log.info(
                            `Earlier, the crawler reached the maxRequestsPerCrawl limit of ${this.maxRequestsPerCrawl} requests ` +
                                'and all requests that were in progress at that time have now finished. ' +
                                `In total, the crawler processed ${this.handledRequestsCount} requests and will shut down.`,
                        );
                        return true;
                    }

                    if (this.#unexpectedStop) {
                        this.log.info(
                            'The crawler has finished all the remaining ongoing requests and will shut down now.',
                        );
                        return true;
                    }

                    const isFinished = isFinishedFunction
                        ? await isFinishedFunction()
                        : await this.defaultIsFinishedFunction();

                    if (isFinished) {
                        const reason = isFinishedFunction
                            ? "Crawler's custom isFinishedFunction() returned true, the crawler will shut down."
                            : 'All requests from the queue have been processed, the crawler will shut down.';
                        this.log.info(reason);
                    }

                    return isFinished;
                },
                log: this.log,
            };

            this.taskLoopOptions = { ...taskLoopOptions, ...crawlerOwnedTaskLoopConfiguration };

            this.#resolveConcurrencySystem = () =>
                OwnedOrInjected.resolve<IConcurrencySystem, ConcurrencySystem>(concurrencySystem, () =>
                    this.createDefaultConcurrencySystem({
                        minConcurrency,
                        maxConcurrency,
                        maxTasksPerMinute: maxRequestsPerMinute,
                        log: this.log,
                    }),
                );
        } finally {
            serviceLocatorScope.exitScope();
        }
    }

    /**
     * Builds the crawler-owned default {@apilink ConcurrencySystem} from the resolved
     * `minConcurrency`/`maxConcurrency`/`maxRequestsPerMinute` shortcuts. Not called when a
     * {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`} was injected.
     *
     * Subclasses may override this to tune the default system (e.g. {@apilink HttpCrawler} raises the starting
     * concurrency and relaxes the event loop signal) while still honouring the user's shortcuts.
     */
    protected createDefaultConcurrencySystem(options: ConcurrencySystemOptions): ConcurrencySystem {
        return new ConcurrencySystem(options);
    }

    /**
     * Determines if the given HTTP status code is an error status code given
     * the default behaviour and user-set preferences.
     * @param status
     * @returns `true` if the status code is considered an error, `false` otherwise
     */
    protected isErrorStatusCode(status: number): boolean {
        const excludeError = this.#ignoreHttpErrorStatusCodes.has(status);
        const includeError = this.additionalHttpErrorStatusCodes.has(status);

        return (status >= 500 && !excludeError) || includeError;
    }

    /**
     * Builds the basic context pipeline that transforms `{ request }` into a full `CrawlingContext`.
     * This handles base context creation, session resolution, and context helpers.
     */
    private buildBasicContextPipeline(): ContextPipeline<{ request: Request }, CrawlingContext> {
        return ContextPipeline.create<{ request: Request }>()
            .compose({ action: this.checkRobotsTxt.bind(this) })
            .compose({ action: (context) => this.createBaseContext(context) })
            .compose({ action: this.resolveSession.bind(this) })
            .compose({ action: this.createContextHelpers.bind(this) });
    }

    private async checkRobotsTxt({ request }: { request: Request }) {
        if (!(await this.isAllowedBasedOnRobotsTxtFile(request.url))) {
            this.log.warning(
                `Skipping request ${request.url} (${request.id}) because it is disallowed based on robots.txt`,
            );
            request.state = RequestState.SKIPPED;
            request.noRetry = true;
            await this.handleSkippedRequest({
                request,
                reason: 'robotsTxt',
            });

            throw new ContextPipelineInterruptedError(`Skipping request ${request.url} as disallowed by robots.txt`);
        }

        return {};
    }

    /**
     * Builds the subclass-specific context pipeline that transforms a `CrawlingContext` into the crawler's target context type.
     * Subclasses should override this to add their own pipeline stages.
     */
    protected buildContextPipeline(): ContextPipeline<CrawlingContext, CrawlingContext> {
        return ContextPipeline.create<CrawlingContext>();
    }

    private createBaseContext(context: PendingCrawlingContext) {
        const deferredCleanup: (() => Promise<unknown>)[] = [];

        return {
            id: cryptoRandomObjectId(10),
            log: this.log,
            pushData: this.pushData.bind(this),
            useState: this.useState.bind(this),
            getKeyValueStore: async (identifier?: string | StorageIdentifier) => KeyValueStore.open(identifier),
            registerDeferredCleanup: (cleanup: () => Promise<unknown>) => {
                deferredCleanup.push(cleanup);
            },
            extendTimeout: (secs: number) => {
                const extraMillis = secs * 1000;

                // the current `addTimeoutToPromise` window (the request handler, or a navigation hook)...
                extendTimeout(extraMillis);
                // ...the internal timeout around the whole request, which is not an `addTimeoutToPromise` frame...
                context[extendTimeoutKey]?.(extraMillis);
                // ...and, when called from within the navigation phase, its shared window, so extending a hook
                // extends the whole navigation budget rather than just that hook's step.
                if (context[navigationDeadlineKey] !== undefined) {
                    context[navigationDeadlineKey] += extraMillis;
                }
            },
            [deferredCleanupKey]: deferredCleanup,
        };
    }

    private async resolveRequest(): Promise<Request | null> {
        const request = await this.timeoutAndRetry(
            this.fetchNextRequest.bind(this),
            this.internalTimeoutMillis,
            `Fetching next request timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
        );

        // Reset loadedUrl so an old one is not carried over to retries.
        if (request) {
            request.loadedUrl = undefined;
        }

        return request;
    }

    private async resolveSession({ request }: { request: Request }) {
        const session = await this.timeoutAndRetry(
            async () => {
                const existingSession = await this.sessionPool.getSession(request.sessionId);

                if (!existingSession) {
                    throw new ContextPipelineInitializationError(new MissingSessionError(request.sessionId));
                }

                return existingSession;
            },
            this.internalTimeoutMillis,
            `Fetching session timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
        );

        return { session, proxyInfo: session?.proxyInfo };
    }

    private async createContextHelpers({ request, session }: { request: Request; session: ISession }) {
        const enqueueLinksWrapper: CrawlingContext['enqueueLinks'] = async (options) => {
            const requestManager = await this.getRequestManager();

            return await this.enqueueLinksWithCrawlDepth(options, request!, requestManager);
        };
        const addRequests: CrawlingContext['addRequests'] = async (requests, options = {}) => {
            const newCrawlDepth = request!.crawlDepth + 1;
            const requestsGenerator = this.addCrawlDepthRequestGenerator(requests, newCrawlDepth);

            await this.addRequests(requestsGenerator, options);
        };

        const sendRequest = createSendRequest(this.httpClient, request!, session);

        return { enqueueLinks: enqueueLinksWrapper, addRequests, sendRequest };
    }

    private buildFinalContextPipeline(): ContextPipeline<CrawlingContext, ExtendedContext> {
        const subclassPipeline = (this.#contextPipelineOptions.contextPipelineBuilder?.() ??
            this.buildContextPipeline()) as ContextPipeline<CrawlingContext, Context>;

        // `extendContext` runs *before* the subclass navigation pipeline (which includes the
        // pre/post-navigation hooks). This makes the extension visible to those hooks and to the
        // request handler alike. The trade-off is that `extendContext` cannot access
        // navigation-dependent context members (e.g. `page`, `response`, `$`, `body`), as those
        // don't exist yet at this point in the pipeline.
        // The `extendContext` output (`ContextExtension`) is carried through the subclass pipeline at
        // runtime (the pipeline copies each middleware's returned members onto the shared context), but
        // TypeScript cannot express that `Context` transitively includes `ContextExtension` here. The
        // casts below are sound because `buildFinalContextPipeline` is declared to return the fully
        // resolved `ExtendedContext` (= `Context & ContextExtension`).
        const { extendContext } = this.#contextPipelineOptions;
        let contextPipeline: ContextPipeline<CrawlingContext, Context>;
        if (extendContext !== undefined) {
            contextPipeline = ContextPipeline.create<CrawlingContext>()
                .compose({ action: async (context) => await extendContext(context) })
                .chain(
                    subclassPipeline as unknown as ContextPipeline<
                        CrawlingContext & ContextExtension,
                        CrawlingContext & ContextExtension
                    >,
                ) as unknown as ContextPipeline<CrawlingContext, Context>;
        } else {
            contextPipeline = subclassPipeline;
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

                    await this.handleSkippedRequest({ request, reason: 'redirect' });

                    throw new ContextPipelineInterruptedError(message);
                }
                return context;
            },
        });

        return contextPipeline as ContextPipeline<CrawlingContext, ExtendedContext>;
    }

    /**
     * Checks if the given error is a proxy error by comparing its message to a list of known proxy error messages.
     * Used for retrying requests that failed due to proxy errors.
     *
     * @param error The error to check.
     */
    protected isProxyError(error: Error): boolean {
        return ROTATE_PROXY_ERRORS.some((x: string) => (this.getMessageFromError(error) as any)?.includes(x));
    }

    /**
     * Sets the status message for the current crawler run.
     *
     * This method is periodically called by the crawler, every `statusMessageLoggingInterval` seconds.
     *
     * The message is logged and broadcast via the {@apilink EventType.STATUS_MESSAGE|`statusMessage`}
     * event. Integrations such as the Apify SDK subscribe to that event and forward the message to
     * their status-reporting backend (e.g. the Apify platform).
     */
    setStatusMessage(message: string, options: SetStatusMessageOptions = {}) {
        const data =
            options.isStatusMessageTerminal != null ? { terminal: options.isStatusMessageTerminal } : undefined;
        this.log.logWithLevel(LogLevel[(options.level as 'DEBUG') ?? 'DEBUG'], message, data);

        // Broadcast the status message through the event system. Consumers (e.g. the Apify SDK) can
        // subscribe to `EventType.STATUS_MESSAGE` and propagate it to their status-reporting backend.
        // Setting the status message is not a storage concern, so we intentionally don't route it
        // through the storage client anymore.
        serviceLocator.getEventManager().emit(EventType.STATUS_MESSAGE, {
            crawlerId: this.identity.id,
            message,
            isStatusMessageTerminal: options.isStatusMessageTerminal,
            level: options.level,
        } satisfies EventStatusMessageData);
    }

    private getPeriodicLogger() {
        let previousState = { ...this.stats.state };

        const getOperationMode = (): { mode: 'ERROR' | 'REGULAR'; failedDelta: number } => {
            const { requestsFailed } = this.stats.state;
            const { requestsFailed: previousRequestsFailed } = previousState;

            previousState = { ...this.stats.state };

            const failedDelta = requestsFailed - previousRequestsFailed;

            if (failedDelta > 0) {
                return { mode: 'ERROR', failedDelta };
            }

            return { mode: 'REGULAR', failedDelta: 0 };
        };

        const log = async () => {
            const { mode: operationMode, failedDelta } = getOperationMode();
            let message: string;

            if (operationMode === 'ERROR') {
                message = `Experiencing problems, ${failedDelta} failed requests in the past ${this.#statusMessageLoggingInterval} seconds.`;
            } else {
                const total = await this.requestManager?.getTotalCount();
                message = `Crawled ${this.stats.state.requestsFinished}${total ? `/${total}` : ''} pages, ${
                    this.stats.state.requestsFailed
                } failed requests, desired concurrency ${this.concurrencySystem?.desiredConcurrency ?? 0}.`;
            }

            if (this.#statusMessageCallback) {
                await this.#statusMessageCallback({
                    crawler: this as any,
                    state: this.stats.state,
                    previousState,
                    message,
                });
                return;
            }

            this.setStatusMessage(message);
        };

        const interval = setInterval(log, this.#statusMessageLoggingInterval * 1e3);
        return { log, stop: () => clearInterval(interval) };
    }

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
    async run(requests?: TypedRequestsLike<Routes>, options?: CrawlerRunOptions): Promise<FinalStatistics> {
        if (this.running) {
            throw new Error(
                'This crawler instance is already running, you can add more requests to it via `crawler.addRequests()`.',
            );
        }

        const { purgeRequestQueue, ...addRequestsOptions } = options ?? {};

        if (this.hasFinishedBefore) {
            // When executing the run method for the second time explicitly,
            // we need to purge the RQ to allow processing the same requests again — this is important so users can
            // pass in failed requests back to the `crawler.run()`, otherwise they would be considered as handled and
            // ignored — as a failed request is still handled.
            // By default (`purgeRequestQueue` unset), only the queue we opened ourselves is purged.
            // When `purgeRequestQueue` is explicitly `true`, we also purge a user-supplied manager.
            // When `purgeRequestQueue` is explicitly `false`, nothing is purged.
            const shouldPurge = purgeRequestQueue !== false;
            const managerToPurge =
                this.#ownedRequestQueue.maybeValue ?? (purgeRequestQueue === true ? this.requestManager : undefined);

            if (managerToPurge?.purge && shouldPurge) {
                await managerToPurge.purge();
            }

            // A supplied statistics instance keeps whatever state it was handed - only wipe a default we built.
            await this.#statsDep.ifOwned(async (stats) => {
                stats.reset();
                await stats.resetStore();
            });
            await this.#sessionPoolDep.ifOwned((pool) => pool.resetStore());
        }

        this.#unexpectedStop = false;
        this.running = true;
        this.#loggedPerRun.clear();

        await purgeDefaultStorages({
            onlyPurgeOnce: true,
            storageBackend: serviceLocator.getStorageBackend(),
            configuration: serviceLocator.getConfiguration(),
        });

        if (requests) {
            await this.addRequests(requests, addRequestsOptions);
        }

        try {
            await this.init();
            await this.stats.startCapturing();
        } catch (error) {
            // Clean up here before propagating, otherwise a failed startup would leave the process hanging.
            await this.teardown().catch((teardownError) => {
                this.log.exception(teardownError as Error, 'Cleaning up after a failed crawler startup failed.');
            });

            // The run never began, so let the instance be run again instead of leaving it wedged as `running`.
            this.running = false;
            throw error;
        }

        const periodicLogger = this.getPeriodicLogger();
        this.setStatusMessage('Starting the crawler.', { level: 'INFO' });

        const sigintHandler = async () => {
            this.log.warning(
                'Pausing... Press CTRL+C again to force exit. To resume, do: CRAWLEE_PURGE_ON_START=0 npm start',
            );
            await this.pauseOnMigration();
            await this.#autoscaledPool!.abort();
        };

        // Attach a listener to handle migration and aborting events gracefully.
        const boundPauseOnMigration = this.pauseOnMigration.bind(this);
        process.once('SIGINT', sigintHandler);
        const eventManager = serviceLocator.getEventManager();
        eventManager.on(EventType.MIGRATING, boundPauseOnMigration);
        eventManager.on(EventType.ABORTING, boundPauseOnMigration);

        let stats = {} as FinalStatistics;

        try {
            await this.#autoscaledPool!.run();
        } finally {
            await this.teardown();
            await this.stats.stopCapturing();

            process.off('SIGINT', sigintHandler);
            eventManager.off(EventType.MIGRATING, boundPauseOnMigration);
            eventManager.off(EventType.ABORTING, boundPauseOnMigration);

            const finalStats = this.stats.calculate();
            stats = {
                requestsFinished: this.stats.state.requestsFinished,
                requestsFailed: this.stats.state.requestsFailed,
                retryHistogram: this.stats.requestRetryHistogram,
                ...finalStats,
            };
            this.log.info('Final request statistics:', stats as unknown as Record<string, unknown>);

            if (this.stats.errorTracker.total !== 0) {
                const prettify = ([count, info]: [number, string[]]) =>
                    `${count}x: ${info.at(-1)!.trim()} (${info[0]})`;

                this.log.info(`Error analysis:`, {
                    totalErrors: this.stats.errorTracker.total,
                    uniqueErrors: this.stats.errorTracker.getUniqueErrorCount(),
                    mostCommonErrors: this.stats.errorTracker.getMostPopularErrors(3).map(prettify),
                });
            }

            const client = serviceLocator.getStorageBackend();

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
            this.setStatusMessage(
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
    stop(reason = 'The crawler has been gracefully stopped.'): void {
        if (this.#unexpectedStop) {
            return;
        }
        this.log.info(reason);
        this.#unexpectedStop = true;
    }

    /**
     * Stops dispatching new requests, letting the in-progress ones finish. Resolves once they have settled, or rejects
     * after `timeoutSecs` if they take too long. Unlike {@apilink BasicCrawler.stop|`stop()`}, this does not end the
     * run — {@apilink BasicCrawler.run|`run()`} stays pending until {@apilink BasicCrawler.resume|`resume()`}.
     *
     * > *NOTE:* The {@apilink BasicCrawler.concurrencySystem|concurrency system} keeps monitoring and autoscaling
     * throughout, since a shared one may still be serving other crawlers.
     */
    async pause(timeoutSecs?: number): Promise<void> {
        if (!this.#autoscaledPool) {
            this.log.warning('Cannot pause a crawler that is not running.');
            return;
        }

        await this.#autoscaledPool.pause(timeoutSecs);
    }

    /**
     * Resumes a run suspended with {@apilink BasicCrawler.pause|`pause()`}, letting the crawler dispatch requests
     * again. A no-op on a crawler that is not paused.
     */
    resume(): void {
        if (!this.#autoscaledPool) {
            this.log.warning('Cannot resume a crawler that is not running.');
            return;
        }

        this.#autoscaledPool.resume();
    }

    /**
     * Returns the crawler's {@apilink IRequestManager|request manager}, opening the default {@apilink RequestQueue}
     * if none has been configured or opened yet.
     */
    async getRequestManager(): Promise<IRequestManager> {
        if (!this.requestManager) {
            this.requestManager = await this.openOwnedRequestQueue();
        }

        // Apply the processing-time hint here (an async lifecycle point) rather than in the constructor,
        // now that `setExpectedRequestProcessingTimeSecs` is async. The hint is raise-only and idempotent,
        // but guard so we do not re-issue it on every call.
        if (!this.#requestManagerTimeoutsApplied) {
            this.#requestManagerTimeoutsApplied = true;
            await this.applyRequestManagerTimeouts(this.requestManager);
        }

        return this.requestManager;
    }

    /**
     * @deprecated Use {@apilink BasicCrawler.getRequestManager|`getRequestManager()`} instead. This returns the
     * crawler's request manager, which is no longer guaranteed to be a {@apilink RequestQueue}.
     */
    async getRequestQueue(): Promise<IRequestManager> {
        return this.getRequestManager();
    }

    /**
     * Opens the default {@apilink RequestQueue}, applies the crawler's timeouts to it and records it as the
     * crawler-owned queue (so it gets purged between repeated `run()` calls).
     * @private
     */
    private async openOwnedRequestQueue(): Promise<RequestQueue> {
        // The first crawler instance uses the default queue (null identifier);
        // subsequent instances get their own queue via a unique alias so they don't collide.
        const identifier = this.identity.instanceIndex === 0 ? null : { alias: `__default_${this.identity.id}__` };

        const requestQueue = await RequestQueue.open(identifier, { configuration: serviceLocator.getConfiguration() });
        return this.#ownedRequestQueue.set(requestQueue);
    }

    /**
     * Tells a request manager how long we expect to hold a fetched request, so that one backed by a
     * locking storage backend keeps it reserved for slightly longer than the request handler timeout
     * (with some padding for overhead), but never for less than a minute. This prevents a long-running
     * request from being handed out a second time while it is still being processed — and it works
     * regardless of whether the manager is a plain {@apilink RequestQueue} or a `RequestManagerTandem`.
     */
    private async applyRequestManagerTimeouts(requestManager: IRequestManager): Promise<void> {
        // A router route may hold a request for longer than the crawler's own timeout, and we cannot know
        // which routes a run will hit, so reserve for the longest one any route asked for. The hint is
        // raise-only, so erring high here is safe.
        const maxRouteTimeoutSecs = (this.requestHandler as Partial<RouterHandler>).getMaxTimeoutSecs?.() ?? 0;
        const handlerTimeoutSecs = Math.max(this.requestHandlerTimeoutMillis / 1000, maxRouteTimeoutSecs);

        await requestManager.setExpectedRequestProcessingTimeSecs?.(Math.max(handlerTimeoutSecs + 5, 60));
    }

    /**
     * Validates a request source's `userData` against the {@apilink RouteSchemas|Standard Schema} registered
     * for its label on the crawler's schema-router (if any), throwing a {@apilink RequestValidationError} on
     * mismatch. A no-op when the user's request handler is not a schema-router, or no schema is registered for
     * the request's label. Applied by the crawler on the add paths it owns — `crawler.addRequests`,
     * `crawler.run`, `context.addRequests` and `context.enqueueLinks`.
     */
    private async validateRequestUserData(source: Source | string): Promise<void> {
        if (typeof source === 'string') {
            return;
        }

        const getSchema = (this.requestHandler as Partial<RouterHandler>).getSchema;

        if (typeof getSchema !== 'function') {
            return;
        }

        // Resolve the label via its public accessors only — the top-level `label` of a `RequestOptions` or the
        // `Request.label` getter — rather than reaching into `userData`, where the request happens to store it.
        const target = source as { label?: string; userData?: Dictionary };
        const schema = getSchema(target.label);

        if (!schema) {
            return;
        }

        // Store the parsed value rather than the raw input, so the queue holds the same coerced `userData` the
        // handler will see. Assigning through a `Request` instance's setter keeps its internal `__crawlee` meta.
        target.userData = await validateUserData(target.label!, schema, target.userData ?? {});
    }

    async useState<State extends Dictionary = Dictionary>(defaultValue = {} as State): Promise<State> {
        const kvs = await KeyValueStore.open(null, { configuration: serviceLocator.getConfiguration() });

        if (this.identity.hasExplicitId) {
            const stateKey = `${BasicCrawler.CRAWLEE_STATE_KEY}_${this.identity.id}`;
            return kvs.getAutoSavedValue<State>(stateKey, defaultValue);
        }

        BasicCrawler.#useStateAnonymousIndices.add(this.identity.instanceIndex);

        if (BasicCrawler.#useStateAnonymousIndices.size > 1) {
            serviceLocator
                .getLogger()
                .warningOnce(
                    'Multiple crawler instances are calling useState() without an explicit `id` option. \n' +
                        'This means they will share the same state object, which is likely unintended. \n' +
                        'To fix this, provide a unique `id` option to each crawler instance. \n' +
                        'Example: new BasicCrawler({ id: "my-crawler-1", ... })',
                );
        }

        return kvs.getAutoSavedValue<State>(BasicCrawler.CRAWLEE_STATE_KEY, defaultValue);
    }

    protected async getPendingRequestCountApproximation(): Promise<number> {
        return (await this.requestManager?.getPendingCount()) ?? 0;
    }

    protected async calculateEnqueuedRequestLimit(explicitLimit?: number): Promise<number | undefined> {
        if (this.maxRequestsPerCrawl === undefined) {
            return explicitLimit;
        }

        const limit = Math.max(
            0,
            this.maxRequestsPerCrawl - this.handledRequestsCount - (await this.getPendingRequestCountApproximation()),
        );

        return Math.min(limit, explicitLimit ?? Infinity);
    }

    protected async handleSkippedRequest(options: Parameters<SkippedRequestCallback>[0]): Promise<void> {
        // A skipped request is a *successful* outcome, but the interrupt still unwinds through the
        // transaction scope, which rolls back - so the skip bookkeeping must write directly.
        await withDirectStorageAccess(async () => {
            if (options.reason === 'limit') {
                this.logOncePerRun(
                    'maxRequestsPerCrawl',
                    'The number of requests enqueued by the crawler reached the maxRequestsPerCrawl limit of ' +
                        `${this.maxRequestsPerCrawl} requests and no further requests will be added.`,
                );
            }

            if (options.reason === 'depth') {
                this.logOncePerRun(
                    'maxCrawlDepth',
                    `The crawler reached the maxCrawlDepth limit of ${this.maxCrawlDepth} and no further requests will be enqueued.`,
                );
            }

            await this.onSkippedRequest?.(options);
        });
    }

    private logOncePerRun(key: string, message: string): void {
        if (!this.#loggedPerRun.has(key)) {
            this.log.info(message);
            this.#loggedPerRun.add(key);
        }
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
        requests: ReadonlyDeep<TypedRequestsLike<Routes>>,
        options: CrawlerAddRequestsOptions = {},
    ): Promise<CrawlerAddRequestsResult> {
        await this.getRequestManager();

        const requestLimit = await this.calculateEnqueuedRequestLimit();

        const skippedBecauseOfRobots = new Map<string, Source | string>();
        const skippedBecauseOfMaxCrawlDepth = new Map<string, Source | string>();

        const isAllowedBasedOnRobotsTxtFile = this.isAllowedBasedOnRobotsTxtFile.bind(this);
        const maxCrawlDepth = this.maxCrawlDepth;
        const validateRequestUserData = this.validateRequestUserData.bind(this);
        // Keep the full request/source (can carry arbitrary userData) only if something reads it.
        const onSkippedRequest = this.onSkippedRequest;

        ow(
            requests,
            ow.object
                .is((value: unknown) => isIterable(value) || isAsyncIterable(value))
                .message((value) => `Expected an iterable or async iterable, got ${getObjectType(value)}`),
        );

        async function* filteredRequests() {
            for await (const request of requests) {
                const url = typeof request === 'string' ? request : request.url!;

                if (maxCrawlDepth !== undefined && (request as any).crawlDepth > maxCrawlDepth) {
                    skippedBecauseOfMaxCrawlDepth.set(url, onSkippedRequest ? request : url);
                    continue;
                }

                if (await isAllowedBasedOnRobotsTxtFile(url)) {
                    await validateRequestUserData(request);
                    yield request;
                } else {
                    skippedBecauseOfRobots.set(url, onSkippedRequest ? request : url);
                }
            }
        }

        const result = await this.requestManager!.addRequestsBatched(filteredRequests(), {
            ...options,
            maxNewRequests: requestLimit,
        });

        // Report requests skipped due to the maxNewRequests budget (i.e. maxRequestsPerCrawl limit)
        const skippedBecauseOfLimit = result.requestsOverLimit ?? [];

        if (skippedBecauseOfRobots.size > 0) {
            this.log.warning(`Some requests were skipped because they were disallowed based on the robots.txt file`, {
                skipped: [...skippedBecauseOfRobots.keys()],
            });
        }

        if (
            skippedBecauseOfRobots.size > 0 ||
            skippedBecauseOfLimit.length > 0 ||
            skippedBecauseOfMaxCrawlDepth.size > 0
        ) {
            await Promise.all(
                [...skippedBecauseOfRobots.values()]
                    .map((source) => {
                        return this.handleSkippedRequest(createSkippedRequestArgs(source, 'robotsTxt'));
                    })
                    .concat(
                        skippedBecauseOfLimit.map((source) => {
                            return this.handleSkippedRequest(createSkippedRequestArgs(source, 'limit'));
                        }),
                        [...skippedBecauseOfMaxCrawlDepth.values()].map((source) => {
                            return this.handleSkippedRequest(createSkippedRequestArgs(source, 'depth'));
                        }),
                    ),
            );
        }

        return result;
    }

    /**
     * Pushes data to the specified {@apilink Dataset}, or the default crawler {@apilink Dataset} by calling {@apilink Dataset.pushData}.
     */
    async pushData(
        data: Parameters<Dataset['pushData']>[0],
        datasetIdentifier?: string | StorageIdentifier,
    ): Promise<void> {
        const dataset = await this.getDataset(datasetIdentifier);
        return dataset.pushData(data);
    }

    /**
     * Retrieves the specified {@apilink Dataset}, or the default crawler {@apilink Dataset}.
     */
    async getDataset(identifier?: string | StorageIdentifier): Promise<Dataset> {
        return Dataset.open(identifier, {
            configuration: serviceLocator.getConfiguration(),
        });
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

        const formatMatch = /\.(json|csv)$/i.exec(path);
        if (!format && formatMatch) {
            format = formatMatch[1].toLowerCase() as 'json' | 'csv';
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

                const { stringify } = await import('csv-stringify/sync');

                value = stringify([
                    keys,
                    ...items.map((item) => {
                        return keys.map((k) => item[k]);
                    }),
                ]);
            }

            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, value);
            this.log.info(`Export to ${path} finished!`);
        }

        if (format === 'json') {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, `${JSON.stringify(items, null, 4)}\n`);
            this.log.info(`Export to ${path} finished!`);
        }

        return items;
    }

    /**
     * Initializes the crawler.
     */
    protected async init(): Promise<void> {
        const eventManager = serviceLocator.getEventManager();

        if (!eventManager.isInitialized()) {
            await eventManager.init();
            this.#closeEvents = true;
        }

        // Warn once at startup if the internal timeout is shorter than the phases it is meant to outlast. It is
        // floored per request so it will not actually cut them short, but the configured value is then effectively
        // ignored, which is worth flagging. Checked here (not in the constructor) because a subclass sets its
        // navigation timeout only after `super()`.
        const phasesMillis = this.getNavigationTimeoutMillis() + this.resolveRequestHandlerTimeoutMillis(undefined);
        if (this.internalTimeoutMillis < phasesMillis) {
            this.log.warning(
                `CRAWLEE_INTERNAL_TIMEOUT (${this.internalTimeoutMillis / 1000}s) is shorter than the navigation ` +
                    `and request handler timeouts combined (${phasesMillis / 1000}s); it will be raised per request ` +
                    `so it does not cut them short.`,
            );
        }

        // An owned governor is rebuilt (and started) for every run, so it always starts from a clean slate — stale
        // resource snapshots or a previous run's scaled desired concurrency would otherwise distort this run's
        // scaling. An injected one is long-lived and its lifecycle belongs to the caller.
        this.#concurrencySystemDep = this.#resolveConcurrencySystem();
        await this.#concurrencySystemDep.ifOwned((system) => system.start());

        this.#autoscaledPool = new AutoscaledPool({
            ...this.taskLoopOptions,
            concurrencySystem: this.#concurrencySystemDep.value,
            consumer: this.identity,
        });

        await this.getRequestManager();
    }

    /**
     * The navigation timeout (pre-navigation hooks, navigation, and post-navigation hooks) in milliseconds, used
     * to size the internal request timeout. `BasicCrawler` has no navigation phase, so this is 0; the HTTP and
     * browser crawlers override it with their `navigationTimeoutSecs`.
     */
    protected getNavigationTimeoutMillis(): number {
        return 0;
    }

    /**
     * Races the request against the internal timeout (see {@apilink raceWithTimeout}), sized to outlast the phases
     * that have their own timeout - the navigation, its hooks, and the request handler - so a legitimately slow
     * request, a per-route override, or a low `CRAWLEE_INTERNAL_TIMEOUT` is not cut short mid-phase. It takes
     * whichever is larger: the configured internal timeout, or this request's combined phase budget.
     */
    private async withRequestTimeout(crawlingContext: PendingCrawlingContext, work: Promise<void>): Promise<void> {
        const { request } = crawlingContext;
        const phasesMillis = this.getNavigationTimeoutMillis() + this.resolveRequestHandlerTimeoutMillis(request.label);
        const timeoutMillis = Math.max(this.internalTimeoutMillis, phasesMillis);

        await raceWithTimeout(crawlingContext, work, { timeoutMillis, requestId: request.id });
    }

    /**
     * The request handler timeout for a request with the given route label. A router route may override the
     * crawler's own `requestHandlerTimeoutSecs`; anything else falls back to `fallbackMillis`.
     *
     * @param label The request's route label, or `undefined` for the default route / no specific request.
     * @param fallbackMillis Timeout to use when no route overrides it.
     */
    private resolveRequestHandlerTimeoutMillis(
        label: string | undefined,
        fallbackMillis = this.requestHandlerTimeoutMillis,
    ): number {
        return this.getRouteTimeoutMillis(label) ?? fallbackMillis;
    }

    /**
     * The timeout the router route with the given label asked for, or `undefined` when it did not override one
     * (or the request handler is not a router at all).
     */
    private getRouteTimeoutMillis(label: string | undefined): number | undefined {
        const getTimeoutSecs = (this.requestHandler as Partial<RouterHandler>).getTimeoutSecs;

        if (typeof getTimeoutSecs !== 'function') {
            return undefined;
        }

        const timeoutSecs = getTimeoutSecs(label);

        return timeoutSecs === undefined ? undefined : timeoutSecs * 1000;
    }

    protected async runRequestHandler(crawlingContext: ExtendedContext): Promise<void> {
        const timeoutMillis = this.resolveRequestHandlerTimeoutMillis(crawlingContext.request.label);

        await addTimeoutToPromise(
            async () => this.requestHandler(crawlingContext),
            timeoutMillis,
            `requestHandler timed out after ${timeoutMillis / 1000} seconds (${crawlingContext.request.id}).`,
        );
    }

    /**
     * Runs `callback` inside a {@apilink StorageTransaction}, unless transactional storage is disabled.
     * Deliberately does **not** commit on return - `handleRequest` swallows request handler failures, so
     * a normal return says nothing about success. `handleRequest` owns the outcome.
     */
    private async runInStorageTransaction<T>(callback: () => Promise<T>): Promise<T> {
        if (!this.#transactionalStorageEnabled) {
            return callback();
        }

        const transaction = createStorageTransaction({
            policy: this.#storageWritePolicy,
            commitTimeoutMillis: this.internalTimeoutMillis,
        });

        let threw = true;
        try {
            const result = await transaction.run(callback);
            threw = false;
            return result;
        } finally {
            if (transaction.state === 'open') {
                // `handleRequest` commits or rolls back on every normal path, so an open transaction on
                // a normal return is a wiring bug; on a propagating throw (a pipeline-level failure) it is
                // expected. Either way, discard the unvalidated writes; only the former is worth flagging.
                if (!threw) {
                    this.log.error(
                        'Internal error: a storage transaction was still open after the request pipeline ' +
                            'returned normally. Its writes are being discarded. Please report this.',
                    );
                }

                transaction.rollback();
            }

            // Unconditional: `failed` is a terminal state that the branch above never reaches.
            transaction.dispose();
        }
    }

    /**
     * Handles blocked request
     */
    protected throwOnBlockedRequest(statusCode: number) {
        if (this.retryOnBlocked) return;

        if (this.blockedStatusCodes.has(statusCode)) {
            throw new SessionError(`Request blocked - received ${statusCode} status code.`);
        }
    }

    private async isAllowedBasedOnRobotsTxtFile(url: string): Promise<boolean> {
        if (!this.#respectRobotsTxtFile) {
            return true;
        }

        const robotsTxtFile = await this.getRobotsTxtFileForUrl(url);
        const userAgent = typeof this.#respectRobotsTxtFile === 'object' ? this.#respectRobotsTxtFile?.userAgent : '*';

        return !robotsTxtFile || robotsTxtFile.isAllowed(url, userAgent);
    }

    protected async getRobotsTxtFileForUrl(url: string): Promise<RobotsTxtFile | undefined> {
        if (!this.#respectRobotsTxtFile) {
            return undefined;
        }

        try {
            const origin = new URL(url).origin;
            const cachedRobotsTxtFile = this.#robotsTxtFileCache.get(origin);

            if (cachedRobotsTxtFile) {
                return cachedRobotsTxtFile;
            }

            const robotsTxtFile = await RobotsTxtFile.find(url, { logger: this.log });
            this.#robotsTxtFileCache.add(origin, robotsTxtFile);

            return robotsTxtFile;
        } catch (e: any) {
            this.log.warning(`Failed to fetch robots.txt for request ${url}`);
            return undefined;
        }
    }

    private async pauseOnMigration() {
        if (this.#autoscaledPool) {
            // if run wasn't called, this is going to crash
            await this.#autoscaledPool.pause(SAFE_MIGRATION_WAIT_MILLIS).catch((err) => {
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

        const requestManagerPersistPromise = (async () => {
            // The request manager persists its read-only loader's state, if it has one that supports persistence
            // (e.g. a tandem wrapping a `RequestList`). For a plain `RequestQueue`, this is a no-op.
            if (this.requestManager?.persistState) {
                if (await this.requestManager.isFinished()) return;
                await this.requestManager.persistState().catch((err) => {
                    if (err.message.includes('Cannot persist state.')) {
                        this.log.error(
                            "The crawler attempted to persist its request list's state and failed due to missing or " +
                                'invalid configuration. Make sure to use either RequestList.open() or the "stateKeyPrefix" option of RequestList ' +
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

        await Promise.all([requestManagerPersistPromise, this.stats.persistState?.()]);
    }

    /**
     * Fetches the next request to process from the underlying request provider.
     */
    private async fetchNextRequest() {
        if (this.requestManager === undefined) {
            throw new Error(`fetchNextRequest called on an uninitialized crawler`);
        }

        return this.requestManager.fetchNextRequest();
    }

    /**
     * Delays processing of the request based on the `sameDomainDelaySecs` option,
     * adding it back to the queue after the timeout passes. Returns `true` if the request
     * should be ignored and will be reclaimed to the queue once ready.
     */
    private delayRequest(request: Request, source: IRequestManager) {
        const domain = getDomain(request.url);

        if (!domain || !request) {
            return false;
        }

        const now = Date.now();
        const lastAccessTime = this.#domainAccessedTime.get(domain);

        if (!lastAccessTime || now - lastAccessTime >= this.#sameDomainDelayMillis) {
            this.#domainAccessedTime.set(domain, now);
            return false;
        }

        const delay = lastAccessTime + this.#sameDomainDelayMillis - now;
        this.log.debug(
            `Request ${request.url} (${request.id}) will be reclaimed after ${delay} milliseconds due to same domain delay`,
        );
        setTimeout(async () => {
            this.log.debug(`Adding request ${request.url} (${request.id}) back to the queue`);

            await source.reclaimRequest(request, { forefront: request.userData?.__crawlee?.forefront });
        }, delay);

        return true;
    }

    /** Handles a single request - runs the request handler with retries, error handling, and lifecycle management. */
    private async handleRequest(crawlingContext: ExtendedContext, requestSource: IRequestManager, request: Request) {
        // An earlier phase we cannot cancel (e.g. a slow `extendContext`) may have run past the internal timeout,
        // which already failed the request in `runTaskFunction`. Bail before running the handler so it does not
        // execute (and re-report) on top of a request the crawler has already moved past.
        if ((crawlingContext as PendingCrawlingContext)[timeoutExpiredKey]?.()) {
            return;
        }

        const statisticsId = request.id || request.uniqueKey;

        // Opened by `runInStorageTransaction`; absent when disabled or when the subclass opens its own.
        const transaction = currentStorageTransaction();

        let isRequestLocked = true;

        try {
            request.state = RequestState.REQUEST_HANDLER;
            await this.runRequestHandler(crawlingContext);

            // Commit *before* marking the request as handled, so a commit failure fails the request and
            // it is retried. This also closes the transaction, so everything below passes through.
            await transaction?.commit();

            await this.timeoutAndRetry(
                async () => requestSource.markRequestAsHandled(request!),
                this.internalTimeoutMillis,
                `Marking request ${request.url} (${request.id}) as handled timed out after ${
                    this.internalTimeoutMillis / 1e3
                } seconds.`,
            );
            isRequestLocked = false; // markRequestAsHandled succeeded and unlocked the request

            this.stats.finishJob(statisticsId, request.retryCount);

            // reclaim session if request finishes successfully
            request.state = RequestState.DONE;
            crawlingContext.session.markGood();
        } catch (rawError) {
            // Roll back *before* any error handler runs - error handlers write to real storage precisely
            // because the transaction is already closed. A no-op when the commit above succeeded.
            transaction?.rollback();

            const err = this.unwrapError(rawError);

            try {
                request.state = RequestState.ERROR_HANDLER;
                await addTimeoutToPromise(
                    async () => this.requestFunctionErrorHandler(err, crawlingContext, request, requestSource),
                    this.internalTimeoutMillis,
                    `Handling request failure of ${request.url} (${request.id}) timed out after ${
                        this.internalTimeoutMillis / 1e3
                    } seconds.`,
                );
                if (!(err instanceof CriticalError)) {
                    isRequestLocked = false; // requestFunctionErrorHandler calls either markRequestAsHandled or reclaimRequest
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
            // decrease the session score if the request fails (but the error handler did not throw);
            // skip when the error is a SessionError, which already retired the session
            if (!(err instanceof SessionError)) {
                crawlingContext.session.markBad();
            }
        } finally {
            // Safety net - return the request to the queue if nobody managed to mark it as handled
            // or reclaim it before (e.g. after a CriticalError). Reclaiming a request that is no longer
            // in progress is a harmless no-op on the storage backend.
            if (isRequestLocked && requestSource instanceof RequestQueue) {
                try {
                    await requestSource.reclaimRequest(request);
                } catch {
                    // The request was never in progress, or could not be reclaimed. Either way it's fine.
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
        requestManager: IRequestManager,
    ): Promise<BatchAddRequestsResult> {
        const transformRequestFunctionWrapper: RequestTransform = (requestOptions) => {
            requestOptions.crawlDepth = request.crawlDepth + 1;

            if (this.maxCrawlDepth !== undefined && requestOptions.crawlDepth! > this.maxCrawlDepth) {
                // Setting `skippedReason` before returning `false` ensures that `reportSkippedRequests`
                // reports `'depth'` as the reason (via `request.skippedReason ?? reason` fallback),
                // rather than the generic `'transform'` reason.
                requestOptions.skippedReason = 'depth';
                return false;
            }

            // After injecting the crawlDepth, we call the user-provided transform function, if there is one.
            return options.transformRequestFunction?.(requestOptions) ?? requestOptions;
        };

        // Create a request-scoped callback that logs enqueueLimit once per request handler call
        // Only log if an explicit limit was passed to enqueueLinks (not the internal maxRequestsPerCrawl-derived limit)
        let loggedEnqueueLimitForThisRequest = false;
        const onSkippedRequest: SkippedRequestCallback = async (skippedOptions) => {
            if (skippedOptions.reason === 'enqueueLimit') {
                if (!loggedEnqueueLimitForThisRequest && options.limit !== undefined) {
                    this.log.info(
                        `Skipping URLs in the handler for ${request.url} due to the enqueueLinks limit of ${options.limit}.`,
                    );
                    loggedEnqueueLimitForThisRequest = true;
                }
            }

            await this.handleSkippedRequest(skippedOptions);
        };

        // `enqueueLinks` applies `options.label`/`options.userData` to every newly enqueued request, so a single
        // validation against the label's schema covers them all (a no-op unless the router declares a schema).
        await this.validateRequestUserData({ label: options.label, userData: options.userData });

        return await enqueueLinks({
            requestManager,
            robotsTxtFile: await this.getRobotsTxtFileForUrl(request!.url),
            respectRobotsTxtFile: this.#respectRobotsTxtFile,
            onSkippedRequest,
            limit: await this.calculateEnqueuedRequestLimit(options.limit),

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
    private async timeoutAndRetry<T>(
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
                return this.timeoutAndRetry(handler, timeout, error, maxRetries, retried + 1);
            }

            throw e;
        }
    }

    /**
     * Returns true if either RequestList or RequestQueue have a request ready for processing.
     */
    private async isTaskReadyFunction() {
        return this.requestManager !== undefined && !(await this.requestManager.isEmpty());
    }

    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     */
    private async defaultIsFinishedFunction() {
        return !this.requestManager || (await this.requestManager.isFinished());
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
     *
     * @param request The request object, passed separately to circumvent potential dynamic logic in crawlingContext.request
     */
    private async requestFunctionErrorHandler(
        error: Error,
        crawlingContext: CrawlingContext,
        request: Request,
        source: IRequestManager,
    ): Promise<void> {
        request.pushErrorMessage(error);

        if (error instanceof CriticalError) {
            throw error;
        }

        const shouldRetryRequest = this.canRequestBeRetried(request, error);

        if (shouldRetryRequest) {
            await this.stats.errorTrackerRetry.addAsync(error, crawlingContext);
            await this.errorHandler?.(
                crawlingContext as CrawlingContext & Partial<ExtendedContext>, // valid cast - ExtendedContext transitively extends CrawlingContext
                error,
            );

            if (error instanceof SessionError) {
                crawlingContext.session?.retire();
            }

            if (!request.noRetry) {
                request.retryCount++;

                const { url, retryCount, id } = request;

                // We don't want to see the stack trace in the logs by default, when we are going to retry the request.
                // Thus, we print the full stack trace only when CRAWLEE_VERBOSE_LOG environment variable is set to true.
                const message = this.getMessageFromError(error);
                this.log.warning(`Reclaiming failed request back to the list or queue. ${message}`, {
                    id,
                    url,
                    retryCount,
                });

                await source.reclaimRequest(request, { forefront: request.userData?.__crawlee?.forefront });
                return;
            }
        }

        if (error instanceof SessionError) {
            crawlingContext.session?.retire();
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
        await source.markRequestAsHandled(request);
        this.stats.failJob(request.id || request.uniqueKey, request.retryCount);

        await this.handleFailedRequestHandler(crawlingContext, error); // This function prints an error message.
    }

    private async handleFailedRequestHandler(crawlingContext: CrawlingContext, error: Error): Promise<void> {
        // Always log the last error regardless if the user provided a failedRequestHandler
        const { id, url, method, uniqueKey } = crawlingContext.request;
        const message = this.getMessageFromError(error, true);

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
    protected getMessageFromError(error: Error, forceStack = false) {
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

    private canRequestBeRetried(request: Request, error: Error) {
        // Request should never be retried, or the error encountered makes it not able to be retried.
        if (request.noRetry || error instanceof NonRetryableError) {
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
     * Stops the crawler immediately.
     *
     * This method doesn't wait for currently active requests to finish.
     *
     * To stop the crawler gracefully (waiting for all running requests to finish), use {@apilink BasicCrawler.stop|`crawler.stop()`} instead.
     */
    async teardown(): Promise<void> {
        serviceLocator.getEventManager().emit(EventType.PERSIST_STATE, { isMigrating: false });

        if (this.#closeEvents) {
            await serviceLocator.getEventManager().close();
        }

        await this.#sessionPoolDep.ifOwned((pool) => pool.teardown());

        await this.#autoscaledPool?.abort();
        await this.#concurrencySystemDep?.ifOwned((system) => system.stop());
    }

    protected getCookieHeaderFromRequest(request: Request) {
        if (request.headers?.Cookie && request.headers?.cookie) {
            this.log.warning(
                `Encountered mixed casing for the cookie headers for request ${request.url} (${request.id}). Their values will be merged.`,
            );
            return mergeCookies(request.url, [request.headers.cookie, request.headers.Cookie]);
        }

        return request.headers?.Cookie || request.headers?.cookie || '';
    }

    private requestMatchesEnqueueStrategy(request: Request) {
        // If `skipNavigation` was used, just return `true`
        try {
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            request.loadedUrl;
        } catch (err) {
            if (err instanceof NavigationSkippedError) {
                return true;
            }

            throw err;
        }

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
    session: ISession;
    proxyInfo?: ProxyInfo;
}

export interface CrawlerAddRequestsOptions extends AddRequestsBatchedOptions {}

export interface CrawlerAddRequestsResult extends AddRequestsBatchedResult {}

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
export function createBasicRouter<
    Context extends BasicCrawlingContext = BasicCrawlingContext,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export function createBasicRouter<
    Context extends BasicCrawlingContext = BasicCrawlingContext,
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
export function createBasicRouter(routes?: RouterRoutes<any, any>) {
    return Router.create<any, any>(routes);
}
