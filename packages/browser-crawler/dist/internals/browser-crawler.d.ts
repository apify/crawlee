import type { CrawlingContext, ProxyConfiguration, RequestQueue, BasicCrawlerOptions, Awaitable, Dictionary, RequestHandler, ErrorHandler, EnqueueLinksOptions } from '@crawlee/basic';
import { Configuration, BasicCrawler } from '@crawlee/basic';
import type { BrowserController, BrowserPlugin, BrowserPoolHooks, BrowserPoolOptions, CommonPage, InferBrowserPluginArray, LaunchContext } from '@crawlee/browser-pool';
import { BrowserPool } from '@crawlee/browser-pool';
import type { BrowserLaunchContext } from './browser-launcher';
export interface BrowserCrawlingContext<Crawler = unknown, Page extends CommonPage = CommonPage, Response = Dictionary, ProvidedController = BrowserController, UserData extends Dictionary = Dictionary> extends CrawlingContext<Crawler, UserData> {
    browserController: ProvidedController;
    page: Page;
    response?: Response;
}
export type BrowserRequestHandler<Context extends BrowserCrawlingContext = BrowserCrawlingContext> = RequestHandler<Context>;
export type BrowserErrorHandler<Context extends BrowserCrawlingContext = BrowserCrawlingContext> = ErrorHandler<Context>;
export type BrowserHook<Context = BrowserCrawlingContext, GoToOptions extends Dictionary | undefined = Dictionary> = (crawlingContext: Context, gotoOptions: GoToOptions) => Awaitable<void>;
export interface BrowserCrawlerOptions<Context extends BrowserCrawlingContext = BrowserCrawlingContext, InternalBrowserPoolOptions extends BrowserPoolOptions = BrowserPoolOptions, __BrowserPlugins extends BrowserPlugin[] = InferBrowserPluginArray<InternalBrowserPoolOptions['browserPlugins']>, __BrowserControllerReturn extends BrowserController = ReturnType<__BrowserPlugins[number]['createController']>, __LaunchContextReturn extends LaunchContext = ReturnType<__BrowserPlugins[number]['createLaunchContext']>> extends Omit<BasicCrawlerOptions, 'requestHandler' | 'handleRequestFunction' | 'failedRequestHandler' | 'handleFailedRequestFunction' | 'errorHandler'> {
    launchContext?: BrowserLaunchContext<any, any>;
    /**
     * Function that is called to process each request.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as an argument, where:
     * - {@apilink BrowserCrawlingContext.request|`request`} is an instance of the {@apilink Request} object
     * with details about the URL to open, HTTP method etc;
     * - {@apilink BrowserCrawlingContext.page|`page`} is an instance of the
     * Puppeteer [Page](https://pptr.dev/api/puppeteer.page) or
     * Playwright [Page](https://playwright.dev/docs/api/class-page);
     * - {@apilink BrowserCrawlingContext.browserController|`browserController`} is an instance of the {@apilink BrowserController};
     * - {@apilink BrowserCrawlingContext.response|`response`} is an instance of the
     * Puppeteer [Response](https://pptr.dev/api/puppeteer.httpresponse) or
     * Playwright [Response](https://playwright.dev/docs/api/class-response),
     * which is the main resource response as returned by the respective `page.goto()` function.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to the {@apilink BrowserCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     * If all the retries fail, the crawler calls the function
     * provided to the {@apilink BrowserCrawlerOptions.failedRequestHandler|`failedRequestHandler`} parameter.
     * To make this work, we should **always**
     * let our function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@apilink Request.pushErrorMessage|`Request.pushErrorMessage()`} function.
     */
    requestHandler?: BrowserRequestHandler<Context>;
    /**
     * Function that is called to process each request.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as an argument, where:
     * - {@apilink BrowserCrawlingContext.request|`request`} is an instance of the {@apilink Request} object
     * with details about the URL to open, HTTP method etc;
     * - {@apilink BrowserCrawlingContext.page|`page`} is an instance of the
     * Puppeteer [Page](https://pptr.dev/api/puppeteer.page) or
     * Playwright [Page](https://playwright.dev/docs/api/class-page);
     * - {@apilink BrowserCrawlingContext.browserController|`browserController`} is an instance of the {@apilink BrowserController};
     * - {@apilink BrowserCrawlingContext.response|`response`} is an instance of the
     * Puppeteer [Response](https://pptr.dev/api/puppeteer.httpresponse) or
     * Playwright [Response](https://playwright.dev/docs/api/class-response),
     * which is the main resource response as returned by the respective `page.goto()` function.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to the {@apilink BrowserCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     * If all the retries fail, the crawler calls the function
     * provided to the {@apilink BrowserCrawlerOptions.failedRequestHandler|`failedRequestHandler`} parameter.
     * To make this work, we should **always**
     * let our function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@apilink Request.pushErrorMessage|`Request.pushErrorMessage()`} function.
     *
     * @deprecated `handlePageFunction` has been renamed to `requestHandler` and will be removed in a future version.
     * @ignore
     */
    handlePageFunction?: BrowserRequestHandler<Context>;
    /**
     * User-provided function that allows modifying the request object before it gets retried by the crawler.
     * It's executed before each retry for the requests that failed less than {@apilink BrowserCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as the first argument,
     * where the {@apilink BrowserCrawlingContext.request|`request`} corresponds to the request to be retried.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    errorHandler?: BrowserErrorHandler<Context>;
    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as the first argument,
     * where the {@apilink BrowserCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    failedRequestHandler?: BrowserErrorHandler<Context>;
    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as the first argument,
     * where the {@apilink BrowserCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     *
     * @deprecated `handleFailedRequestFunction` has been renamed to `failedRequestHandler` and will be removed in a future version.
     * @ignore
     */
    handleFailedRequestFunction?: BrowserErrorHandler<Context>;
    /**
     * Custom options passed to the underlying {@apilink BrowserPool} constructor.
     * We can tweak those to fine-tune browser management.
     */
    browserPoolOptions?: Partial<BrowserPoolOptions> & Partial<BrowserPoolHooks<__BrowserControllerReturn, __LaunchContextReturn>>;
    /**
     * If set, the crawler will be configured for all connections to use
     * the Proxy URLs provided and rotated according to the configuration.
     */
    proxyConfiguration?: ProxyConfiguration;
    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function accepts two parameters, `crawlingContext` and `gotoOptions`,
     * which are passed to the `page.goto()` function the crawler calls to navigate.
     *
     * **Example:**
     *
     * ```js
     * preNavigationHooks: [
     *     async (crawlingContext, gotoOptions) => {
     *         const { page } = crawlingContext;
     *         await page.evaluate((attr) => { window.foo = attr; }, 'bar');
     *         gotoOptions.timeout = 60_000;
     *         gotoOptions.waitUntil = 'domcontentloaded';
     *     },
     * ]
     * ```
     *
     * Modyfing `pageOptions` is supported only in Playwright incognito.
     * See {@apilink PrePageCreateHook}
     */
    preNavigationHooks?: BrowserHook<Context>[];
    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts `crawlingContext` as the only parameter.
     *
     * **Example:**
     *
     * ```js
     * postNavigationHooks: [
     *     async (crawlingContext) => {
     *         const { page } = crawlingContext;
     *         if (hasCaptcha(page)) {
     *             await solveCaptcha(page);
     *         }
     *     },
     * ]
     * ```
     */
    postNavigationHooks?: BrowserHook<Context>[];
    /**
     * Timeout in which page navigation needs to finish, in seconds.
     */
    navigationTimeoutSecs?: number;
    /**
     * Defines whether the cookies should be persisted for sessions.
     * This can only be used when `useSessionPool` is set to `true`.
     */
    persistCookiesPerSession?: boolean;
    /**
     * Whether to run browser in headless mode. Defaults to `true`.
     * Can be also set via {@apilink Configuration}.
     */
    headless?: boolean;
}
/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless browsers with [Puppeteer](https://github.com/puppeteer/puppeteer)
 * and [Playwright](https://github.com/microsoft/playwright).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `BrowserCrawler` uses headless (or even headful) browsers to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, we should consider using the {@apilink CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented by the {@apilink Request} objects that are fed from the {@apilink RequestList} or {@apilink RequestQueue} instances
 * provided by the {@apilink BrowserCrawlerOptions.requestList|`requestList`} or {@apilink BrowserCrawlerOptions.requestQueue|`requestQueue`}
 * constructor options, respectively. If neither `requestList` nor `requestQueue` options are provided,
 * the crawler will open the default request queue either when the {@apilink BrowserCrawler.addRequests|`crawler.addRequests()`} function is called,
 * or if `requests` parameter (representing the initial requests) of the {@apilink BrowserCrawler.run|`crawler.run()`} function is provided.
 *
 * If both {@apilink BrowserCrawlerOptions.requestList|`requestList`} and {@apilink BrowserCrawlerOptions.requestQueue|`requestQueue`} options are used,
 * the instance first processes URLs from the {@apilink RequestList} and automatically enqueues all of them
 * to the {@apilink RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * `BrowserCrawler` opens a new browser page (i.e. tab or window) for each {@apilink Request} object to crawl
 * and then calls the function provided by user as the {@apilink BrowserCrawlerOptions.requestHandler|`requestHandler`} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@apilink AutoscaledPool} class.
 * All {@apilink AutoscaledPool} configuration options can be passed to the {@apilink BrowserCrawlerOptions.autoscaledPoolOptions|`autoscaledPoolOptions`}
 * parameter of the `BrowserCrawler` constructor.
 * For user convenience, the {@apilink AutoscaledPoolOptions.minConcurrency|`minConcurrency`} and
 * {@apilink AutoscaledPoolOptions.maxConcurrency|`maxConcurrency`} options of the
 * underlying {@apilink AutoscaledPool} constructor are available directly in the `BrowserCrawler` constructor.
 *
 * > *NOTE:* the pool of browser instances is internally managed by the {@apilink BrowserPool} class.
 *
 * @category Crawlers
 */
export declare abstract class BrowserCrawler<InternalBrowserPoolOptions extends BrowserPoolOptions = BrowserPoolOptions, LaunchOptions extends Dictionary | undefined = Dictionary, Context extends BrowserCrawlingContext = BrowserCrawlingContext, GoToOptions extends Dictionary = Dictionary> extends BasicCrawler<Context> {
    readonly config: Configuration;
    /**
     * A reference to the underlying {@apilink ProxyConfiguration} class that manages the crawler's proxies.
     * Only available if used by the crawler.
     */
    proxyConfiguration?: ProxyConfiguration;
    /**
     * A reference to the underlying {@apilink BrowserPool} class that manages the crawler's browsers.
     */
    browserPool: BrowserPool<InternalBrowserPoolOptions>;
    launchContext: BrowserLaunchContext<LaunchOptions, unknown>;
    protected userProvidedRequestHandler: BrowserRequestHandler<Context>;
    protected navigationTimeoutMillis: number;
    protected requestHandlerTimeoutInnerMillis: number;
    protected preNavigationHooks: BrowserHook<Context>[];
    protected postNavigationHooks: BrowserHook<Context>[];
    protected persistCookiesPerSession: boolean;
    protected static optionsShape: {
        handlePageFunction: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        navigationTimeoutSecs: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        preNavigationHooks: import("ow").ArrayPredicate<unknown> & import("ow").BasePredicate<unknown[] | undefined>;
        postNavigationHooks: import("ow").ArrayPredicate<unknown> & import("ow").BasePredicate<unknown[] | undefined>;
        launchContext: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        headless: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        browserPoolOptions: import("ow").ObjectPredicate<object>;
        sessionPoolOptions: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        persistCookiesPerSession: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        useSessionPool: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        proxyConfiguration: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
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
        loggingInterval: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        minConcurrency: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        maxConcurrency: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        maxRequestsPerMinute: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        keepAlive: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        log: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
    };
    /**
     * All `BrowserCrawler` parameters are passed via an options object.
     */
    protected constructor(options?: BrowserCrawlerOptions<Context>, config?: Configuration);
    protected _cleanupContext(crawlingContext: Context): Promise<void>;
    /**
     * Wrapper around requestHandler that opens and closes pages etc.
     */
    protected _runRequestHandler(crawlingContext: Context): Promise<void>;
    protected _enhanceCrawlingContextWithPageInfo(crawlingContext: Context, page: CommonPage, createNewSession?: boolean): void;
    protected _handleNavigation(crawlingContext: Context): Promise<void>;
    protected _applyCookies({ session, request, page, browserController }: Context, preHooksCookies: string, postHooksCookies: string): Promise<void>;
    /**
     * Marks session bad in case of navigation timeout.
     */
    protected _handleNavigationTimeout(crawlingContext: Context, error: Error): Promise<void>;
    protected abstract _navigationHandler(crawlingContext: Context, gotoOptions: GoToOptions): Promise<Context['response'] | null | undefined>;
    /**
     * Should be overridden in case of different automation library that does not support this response API.
     */
    protected _responseHandler(crawlingContext: Context): Promise<void>;
    protected _extendLaunchContext(_pageId: string, launchContext: LaunchContext): Promise<void>;
    protected _maybeAddSessionRetiredListener(_pageId: string, browserController: Context['browserController']): void;
    /**
     * Function for cleaning up after all requests are processed.
     * @ignore
     */
    teardown(): Promise<void>;
}
/** @internal */
interface EnqueueLinksInternalOptions {
    options?: EnqueueLinksOptions;
    page: CommonPage;
    requestQueue: RequestQueue;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}
/** @internal */
export declare function browserCrawlerEnqueueLinks({ options, page, requestQueue, originalRequestUrl, finalRequestUrl, }: EnqueueLinksInternalOptions): Promise<import("@crawlee/types").BatchAddRequestsResult>;
export {};
//# sourceMappingURL=browser-crawler.d.ts.map