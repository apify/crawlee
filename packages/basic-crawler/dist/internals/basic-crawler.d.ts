import type { Log } from '@apify/log';
import { TimeoutError } from '@apify/timeout';
import type { SetRequired } from 'type-fest';
import type { AutoscaledPoolOptions, CrawlingContext, EnqueueLinksOptions, EventManager, FinalStatistics, ProxyInfo, Request, RequestList, RequestOptions, RequestQueueOperationOptions, RouterHandler, Session, SessionPoolOptions } from '@crawlee/core';
import { AutoscaledPool, Configuration, RequestQueue, SessionPool, Statistics } from '@crawlee/core';
import type { ProcessedRequest, Dictionary, Awaitable, BatchAddRequestsResult, GetUserDataFromRequest, RouterRoutes } from '@crawlee/types';
export interface BasicCrawlingContext<UserData extends Dictionary = Dictionary> extends CrawlingContext<BasicCrawler, UserData> {
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
export type RequestHandler<Context extends CrawlingContext = BasicCrawlingContext> = (inputs: Context) => Awaitable<void>;
export type ErrorHandler<Context extends CrawlingContext = BasicCrawlingContext> = (inputs: Context, error: Error) => Awaitable<void>;
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
    requestHandler?: RequestHandler<Context>;
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
    requestList?: RequestList;
    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     * If not provided, the crawler will open the default request queue when the {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} function is called.
     * > Alternatively, `requests` parameter of {@apilink BasicCrawler.run|`crawler.run()`} could be used to enqueue the initial requests -
     * it is a shortcut for running `crawler.addRequests()` before the `crawler.run()`.
     */
    requestQueue?: RequestQueue;
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
     * waiting for more requests to come. Use `crawler.teardown()` to exit the crawler.
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
    loggingInterval?: number;
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
export declare class BasicCrawler<Context extends CrawlingContext = BasicCrawlingContext> {
    readonly config: Configuration;
    private static readonly CRAWLEE_STATE_KEY;
    /**
     * A reference to the underlying {@apilink Statistics} class that collects and logs run statistics for requests.
     */
    readonly stats: Statistics;
    /**
     * A reference to the underlying {@apilink RequestList} class that manages the crawler's {@apilink Request|requests}.
     * Only available if used by the crawler.
     */
    requestList?: RequestList;
    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     * A reference to the underlying {@apilink RequestQueue} class that manages the crawler's {@apilink Request|requests}.
     * Only available if used by the crawler.
     */
    requestQueue?: RequestQueue;
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
    readonly router: RouterHandler<Context>;
    protected log: Log;
    protected requestHandler: RequestHandler<Context>;
    protected errorHandler?: ErrorHandler<Context>;
    protected failedRequestHandler?: ErrorHandler<Context>;
    protected requestHandlerTimeoutMillis: number;
    protected internalTimeoutMillis: number;
    protected maxRequestRetries: number;
    protected handledRequestsCount: number;
    protected loggingInterval: number;
    protected sessionPoolOptions: SessionPoolOptions;
    protected useSessionPool: boolean;
    protected crawlingContexts: Map<string, Context>;
    protected autoscaledPoolOptions: AutoscaledPoolOptions;
    protected events: EventManager;
    private _closeEvents?;
    protected static optionsShape: {
        requestList: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        requestQueue: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        requestHandler: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        handleRequestFunction: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        requestHandlerTimeoutSecs: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        handleRequestTimeoutSecs: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        errorHandler: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        failedRequestHandler: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        handleFailedRequestFunction: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        maxRequestRetries: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        maxRequestsPerCrawl: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        autoscaledPoolOptions: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        sessionPoolOptions: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        useSessionPool: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        loggingInterval: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        minConcurrency: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        maxConcurrency: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        maxRequestsPerMinute: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        keepAlive: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        log: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
    };
    /**
     * All `BasicCrawler` parameters are passed via an options object.
     */
    constructor(options?: BasicCrawlerOptions<Context>, config?: Configuration);
    private setStatusMessage;
    private getPeriodicLogger;
    /**
     * Runs the crawler. Returns a promise that gets resolved once all the requests are processed.
     * We can use the `requests` parameter to enqueue the initial requests - it is a shortcut for
     * running {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} before the {@apilink BasicCrawler.run|`crawler.run()`}.
     *
     * @param [requests] The requests to add
     * @param [options] Options for the request queue
     */
    run(requests?: (string | Request | RequestOptions)[], options?: CrawlerAddRequestsOptions): Promise<FinalStatistics>;
    getRequestQueue(): Promise<RequestQueue>;
    useState<State extends Dictionary = Dictionary>(defaultValue?: State): Promise<State>;
    /**
     * Adds requests to be processed by the crawler
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    addRequests(requests: (string | Request | RequestOptions)[], options?: CrawlerAddRequestsOptions): Promise<CrawlerAddRequestsResult>;
    protected _init(): Promise<void>;
    protected _runRequestHandler(crawlingContext: Context): Promise<void>;
    /**
     * Handles blocked request
     */
    protected _throwOnBlockedRequest(session: Session, statusCode: number): void;
    protected _pauseOnMigration(): Promise<void>;
    /**
     * Fetches request from either RequestList or RequestQueue. If request comes from a RequestList
     * and RequestQueue is present then enqueues it to the queue first.
     */
    protected _fetchNextRequest(): Promise<Request<Dictionary> | null>;
    /**
     * Executed when `errorHandler` finishes or the request is successful.
     * Can be used to clean up orphaned browser pages.
     */
    protected _cleanupContext(_crawlingContext: Context): Promise<void>;
    /**
     * Wrapper around requestHandler that fetches requests from RequestList/RequestQueue
     * then retries them in a case of an error, etc.
     */
    protected _runTaskFunction(): Promise<void>;
    /**
     * Run async callback with given timeout and retry.
     * @ignore
     */
    protected _timeoutAndRetry(handler: () => Promise<unknown>, timeout: number, error: Error | string, maxRetries?: number, retried?: number): Promise<void>;
    /**
     * Returns true if either RequestList or RequestQueue have a request ready for processing.
     */
    protected _isTaskReadyFunction(): Promise<boolean>;
    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     */
    protected _defaultIsFinishedFunction(): Promise<boolean>;
    /**
     * Handles errors thrown by user provided requestHandler()
     */
    protected _requestFunctionErrorHandler(error: Error, crawlingContext: Context, source: RequestList | RequestQueue): Promise<void>;
    protected _tagUserHandlerError<T>(cb: () => unknown): Promise<T>;
    protected _handleFailedRequestHandler(crawlingContext: Context, error: Error): Promise<void>;
    /**
     * Resolves the most verbose error message from a thrown error
     * @param error The error received
     * @returns The message to be logged
     */
    protected _getMessageFromError(error: Error, forceStack?: boolean): string | TimeoutError | undefined;
    protected _canRequestBeRetried(request: Request, error: Error): boolean;
    protected _augmentContextWithDeprecatedError(context: Context, error: Error): Context;
    /**
     * Updates handledRequestsCount from possibly stored counts,
     * usually after worker migration. Since one of the stores
     * needs to have priority when both are present,
     * it is the request queue, because generally, the request
     * list will first be dumped into the queue and then left
     * empty.
     */
    protected _loadHandledRequestCount(): Promise<void>;
    protected _executeHooks<HookLike extends (...args: any[]) => Awaitable<void>>(hooks: HookLike[], ...args: Parameters<HookLike>): Promise<void>;
    /**
     * Function for cleaning up after all request are processed.
     * @ignore
     */
    teardown(): Promise<void>;
    protected _handlePropertyNameChange<New, Old>({ newProperty, newName, oldProperty, oldName, propertyKey, allowUndefined, }: HandlePropertyNameChangeData<New, Old>): void;
    protected _getCookieHeaderFromRequest(request: Request): string;
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
     * Alternatively, we can set {@apilink CrawlerAddRequestsOptions.waitForAllRequestsToBeAdded|`waitForAllRequestsToBeAdded`} to `true`
     * in the {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} options.
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
export declare function createBasicRouter<Context extends BasicCrawlingContext = BasicCrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, UserData>): RouterHandler<Context>;
export {};
//# sourceMappingURL=basic-crawler.d.ts.map