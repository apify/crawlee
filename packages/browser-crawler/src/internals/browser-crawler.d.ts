import type { AddRequestsBatchedResult, BasicCrawlerOptions, CrawlingContext, EnqueueLinksOptions, ErrorHandler, ExtractLinksOptions, GetUserDataFromRequest, LoadedRequest, Request, RequestHandler, RouterHandler } from '@crawlee/basic';
import { BasicCrawler, ContextPipeline } from '@crawlee/basic';
import type { CommonPage, CrawlerRemoteBrowserOptions } from '@crawlee/browser-pool';
import type { Awaitable, Dictionary, IBrowserPool } from '@crawlee/types';
import { z } from 'zod';
import type { BrowserLaunchContext } from './browser-launcher.js';
interface BaseResponse {
    status(): number;
    /** Optional because only Playwright and Puppeteer responses are guaranteed to carry it. */
    headers?(): Record<string, string>;
}
/**
 * The type of a browser pool the crawler builds (and therefore owns) for itself. It's an {@apilink IBrowserPool} that
 * additionally exposes `destroy()` — the crawler only ever tears down pools it created, which is why {@apilink IBrowserPool}
 * itself intentionally omits `destroy`.
 */
export type OwnedBrowserPool<Page> = IBrowserPool<Page> & {
    destroy: () => Promise<void>;
};
/**
 * Rejects options that exist only to configure the browser pool the crawler would have built for itself.
 * Accepting them alongside a pre-built `browserPool` and quietly ignoring them is how `browserPoolOptions` grew
 * into a second, half-working way of configuring the same pool.
 */
export declare function assertBrowserPoolNotConfigured(crawlerName: string, ignoredOptions: Dictionary): void;
export interface BrowserCrawlingContext<Page extends CommonPage = CommonPage, Response extends BaseResponse = BaseResponse, UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
GoToOptions extends Dictionary = Dictionary> extends CrawlingContext<UserData> {
    /**
     * The browser page object where the web page is loaded and rendered.
     */
    page: Page;
    /**
     * The request object that was successfully loaded and navigated to, including the {@apilink Request.loadedUrl|`loadedUrl`} property.
     */
    request: LoadedRequest<Request<UserData>>;
    /**
     * The HTTP response object returned by the browser's navigation.
     */
    response: Response;
    /**
     * Options object passed to the underlying `page.goto()` call. `preNavigationHooks` can mutate this
     * object (or return `{ gotoOptions: ... }`) to influence the navigation.
     */
    gotoOptions: GoToOptions;
    /**
     * Extracts URLs from the current page, without adding them to the request queue.
     */
    extractLinks: (options?: ExtractLinksOptions) => Promise<string[]>;
    /**
     * Helper function for extracting URLs from the current page and adding them to the request queue.
     */
    enqueueLinks: (options?: EnqueueLinksOptions) => Promise<AddRequestsBatchedResult>;
}
export type BrowserHook<Context = BrowserCrawlingContext, ContextExtension = {}> = (crawlingContext: Context & ContextExtension) => Awaitable<void | Partial<Context>>;
export interface BrowserCrawlerOptions<Page extends CommonPage = CommonPage, Response extends BaseResponse = BaseResponse, Context extends BrowserCrawlingContext<Page, Response> = BrowserCrawlingContext<Page, Response>, ContextExtension = Dictionary<never>, ExtendedContext extends Context = Context & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>, StatisticStateExtension extends object = {}> extends Omit<BasicCrawlerOptions<Context, ContextExtension, ExtendedContext, Routes, StatisticStateExtension>, 'requestHandler' | 'failedRequestHandler' | 'errorHandler'> {
    launchContext?: BrowserLaunchContext<any, any>;
    /**
     * The browser pool the crawler should serve its pages from. This is the single way to run a pool with
     * non-default options: build one with the factory that matches your crawler
     * ({@apilink playwrightBrowserPool}, {@apilink puppeteerBrowserPool}, {@apilink stagehandBrowserPool}) - it
     * accepts every {@apilink BrowserPoolOptions|`BrowserPool` option} and supplies the correct browser plugin
     * itself, so the pool can never mismatch the crawler.
     *
     * A pool passed in this way is borrowed, not owned: the crawler will not tear it down, which is what makes it
     * shareable across crawlers. Since the crawler then builds nothing itself, the options that configure its own
     * pool (`launchContext`, `headless`, `remoteBrowser`) are rejected rather than silently ignored.
     *
     * When omitted, the crawler builds - and tears down - a default pool for its own browser.
     */
    browserPool?: IBrowserPool<Page>;
    /**
     * Connect to a remote browser service (Browserbase, Browserless, Steel, …) instead of launching locally.
     *
     * The crawler builds a {@apilink RemoteBrowserPool} around its own browser plugin, so the connection is
     * always for the right browser — there is no plugin to construct and no way to mismatch the pool with the
     * crawler. Supply the connection details only: a static `endpoint` URL, a function returning one per launch,
     * or a {@apilink RemoteBrowserProvider}.
     *
     * Cannot be combined with `browserPool`. To tune the pool wrapping the remote connection, or to share it
     * across crawlers, build it with the remote factory for your crawler ({@apilink remotePlaywrightBrowserPool},
     * {@apilink remotePuppeteerBrowserPool}, {@apilink remoteStagehandBrowserPool}) and pass it as `browserPool`.
     */
    remoteBrowser?: CrawlerRemoteBrowserOptions;
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
    requestHandler?: RouterHandler<ExtendedContext, Routes> | RequestHandler<ExtendedContext>;
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
    errorHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;
    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as the first argument,
     * where the {@apilink BrowserCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    failedRequestHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;
    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function receives the `crawlingContext`; the options object
     * forwarded to `page.goto()` is available as `crawlingContext.gotoOptions` and can be mutated in place.
     *
     * **Example:**
     *
     * ```js
     * preNavigationHooks: [
     *     async ({ page, gotoOptions }) => {
     *         await page.evaluate((attr) => { window.foo = attr; }, 'bar');
     *         gotoOptions.timeout = 60_000;
     *         gotoOptions.waitUntil = 'domcontentloaded';
     *     },
     * ]
     * ```
     *
     * A hook may optionally return a partial object whose properties are merged into the crawling context,
     * allowing the hook to override context members for subsequent hooks and pipeline stages.
     *
     * The context is built up in the following order: base context (`request`, `session`, helpers, ...) ->
     * `extendContext` -> `preNavigationHooks` -> navigation -> `postNavigationHooks` -> `requestHandler`.
     * This means the members added by `extendContext` are already available here, but navigation-dependent
     * members (e.g. `page`, `response`) are not.
     */
    preNavigationHooks?: BrowserHook<Context, ContextExtension>[];
    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts `crawlingContext` as the only parameter.
     *
     * A hook may optionally return a partial object whose properties are merged into the crawling context.
     * This is useful for overriding context members (e.g. `response`) after solving a challenge.
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
     *     async (crawlingContext) => {
     *         if (await needsRevalidation(crawlingContext)) {
     *             return { response: await crawlingContext.page.reload() };
     *         }
     *     },
     * ]
     * ```
     */
    postNavigationHooks?: BrowserHook<Context, ContextExtension>[];
    /**
     * Timeout for the whole navigation phase, in seconds. A single window shared by the `preNavigationHooks`,
     * the page navigation, and the `postNavigationHooks` - so a slow hook eats into the same budget the
     * navigation uses. Separate from the
     * {@apilink BasicCrawlerOptions.requestHandlerTimeoutSecs|`requestHandlerTimeoutSecs`}, which times only the
     * request handler.
     */
    navigationTimeoutSecs?: number;
    /**
     * Defines whether the cookies should be persisted for sessions. Enabled by default.
     */
    saveResponseCookies?: boolean;
    /**
     * Whether to ignore custom elements (and their #shadow-roots) when processing the page content via `parseWithCheerio` helper.
     * By default, they are expanded automatically. Use this option to disable this behavior.
     */
    ignoreShadowRoots?: boolean;
    /**
     * Whether to ignore `iframes` when processing the page content via `parseWithCheerio` helper.
     * By default, `iframes` are expanded automatically. Use this option to disable this behavior.
     */
    ignoreIframes?: boolean;
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
 * The source URLs are represented by the {@apilink Request} objects that are fed from the
 * {@apilink IRequestManager|request manager} provided via the {@apilink BrowserCrawlerOptions.requestManager|`requestManager`}
 * constructor option (a {@apilink RequestQueue} is itself a request manager). If no `requestManager` is provided,
 * the crawler will open the default request queue either when the {@apilink BrowserCrawler.addRequests|`crawler.addRequests()`} function is called,
 * or if `requests` parameter (representing the initial requests) of the {@apilink BrowserCrawler.run|`crawler.run()`} function is provided.
 *
 * To read from a read-only source such as a {@apilink RequestList} while still being able to enqueue new requests,
 * combine it with a queue into a {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`}
 * and pass the result as `requestManager`.
 *
 * > The {@apilink BrowserCrawlerOptions.requestList|`requestList`} and {@apilink BrowserCrawlerOptions.requestQueue|`requestQueue`}
 * > options are deprecated; they are still accepted and folded into a single `requestManager` for back-compat.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * `BrowserCrawler` opens a new browser page (i.e. tab or window) for each {@apilink Request} object to crawl
 * and then calls the function provided by user as the {@apilink BrowserCrawlerOptions.requestHandler|`requestHandler`} option.
 *
 * New pages are only opened when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the
 * `BrowserCrawler` constructor, or, for finer control, by injecting a pre-configured
 * {@apilink ConcurrencySystem|`concurrencySystem`}.
 *
 * > *NOTE:* the pool of browser instances is internally managed by the {@apilink BrowserPool} class.
 *
 * @category Crawlers
 */
export declare abstract class BrowserCrawler<Page extends CommonPage = CommonPage, Response extends BaseResponse = BaseResponse, LaunchOptions extends Dictionary | undefined = Dictionary, Context extends BrowserCrawlingContext<Page, Response> = BrowserCrawlingContext<Page, Response>, ContextExtension = Dictionary<never>, ExtendedContext extends Context = Context & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>, StatisticStateExtension extends object = {}, GoToOptions extends Dictionary = Dictionary> extends BasicCrawler<Context, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    #private;
    /**
     * A reference to the underlying browser pool that manages the crawler's browsers. Typed as
     * {@apilink IBrowserPool} so custom implementations can be plugged in via the `browserPool` constructor option.
     */
    get browserPool(): IBrowserPool<Page>;
    launchContext: BrowserLaunchContext<LaunchOptions, unknown>;
    protected readonly ignoreShadowRoots: boolean;
    protected readonly ignoreIframes: boolean;
    /**
     * @internal
     */
    protected static optionsShape: {
        navigationTimeoutSecs: z.ZodDefault<z.ZodCustom<number, number>>;
        preNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        postNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        launchContext: z.ZodDefault<z.ZodCustom<Dictionary, Dictionary>>;
        browserPool: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        browserPoolBuilder: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        remoteBrowser: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        saveResponseCookies: z.ZodDefault<z.ZodBoolean>;
        proxyConfiguration: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        ignoreIframes: z.ZodDefault<z.ZodBoolean>;
        ignoreShadowRoots: z.ZodDefault<z.ZodBoolean>;
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
        httpClient: z.ZodOptional<z.ZodCustom<import("@crawlee/http-client").BaseHttpClient, import("@crawlee/http-client").BaseHttpClient>>;
        configuration: z.ZodOptional<z.ZodCustom<import("@crawlee/basic").Configuration, import("@crawlee/basic").Configuration>>;
        storageBackend: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        eventManager: z.ZodOptional<z.ZodCustom<import("@crawlee/basic").EventManager, import("@crawlee/basic").EventManager>>;
        logger: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        minConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxRequestsPerMinute: z.ZodOptional<z.ZodCustom<number, number>>;
        keepAlive: z.ZodOptional<z.ZodBoolean>;
        statistics: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        id: z.ZodOptional<z.ZodString>;
    };
    /** @internal */
    protected static optionsSchema: z.ZodObject<{
        navigationTimeoutSecs: z.ZodDefault<z.ZodCustom<number, number>>;
        preNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        postNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        launchContext: z.ZodDefault<z.ZodCustom<Dictionary, Dictionary>>;
        browserPool: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        browserPoolBuilder: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        remoteBrowser: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        saveResponseCookies: z.ZodDefault<z.ZodBoolean>;
        proxyConfiguration: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        ignoreIframes: z.ZodDefault<z.ZodBoolean>;
        ignoreShadowRoots: z.ZodDefault<z.ZodBoolean>;
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
        httpClient: z.ZodOptional<z.ZodCustom<import("@crawlee/http-client").BaseHttpClient, import("@crawlee/http-client").BaseHttpClient>>;
        configuration: z.ZodOptional<z.ZodCustom<import("@crawlee/basic").Configuration, import("@crawlee/basic").Configuration>>;
        storageBackend: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        eventManager: z.ZodOptional<z.ZodCustom<import("@crawlee/basic").EventManager, import("@crawlee/basic").EventManager>>;
        logger: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        minConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxRequestsPerMinute: z.ZodOptional<z.ZodCustom<number, number>>;
        keepAlive: z.ZodOptional<z.ZodBoolean>;
        statistics: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        id: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    /**
     * All `BrowserCrawler` parameters are passed via an options object.
     */
    protected constructor(options: BrowserCrawlerOptions<Page, Response, Context, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> & {
        contextPipelineBuilder: () => ContextPipeline<CrawlingContext, Context>;
        /**
         * Builds the pool the crawler owns, used only when the user injected no `browserPool`. Supplied by the
         * concrete crawler, which is the only place that knows which browser plugin to run - that is also why
         * `remoteBrowser` is handed to it rather than acted upon here.
         */
        browserPoolBuilder: (remoteBrowser?: CrawlerRemoteBrowserOptions) => OwnedBrowserPool<Page>;
    });
    protected getNavigationTimeoutMillis(): number;
    protected buildContextPipeline(): ContextPipeline<CrawlingContext, BrowserCrawlingContext<Page, Response, Dictionary>>;
    private containsSelectors;
    private isRequestBlocked;
    private preparePage;
    private prepareNavigation;
    private navigate;
    private finalizeNavigation;
    /**
     * Copies cookies from the live browser page into the session cookie jar.
     */
    private persistCookiesFromPage;
    /**
     * Runs the user request handler, then re-reads browser cookies so login flows /
     * `page.setCookie` / XHR `Set-Cookie` updates are stored for later requests.
     */
    protected runRequestHandler(crawlingContext: ExtendedContext): Promise<void>;
    private handleBlockedRequestByContent;
    private restoreRequestState;
    private applyCookies;
    /**
     * Marks session bad on navigation timeout, and stops in-flight page loading on any navigation error.
     */
    private handleNavigationTimeout;
    /**
     * Transforms proxy-related errors to `SessionError`.
     */
    private throwIfProxyError;
    protected abstract navigationHandler(crawlingContext: BrowserCrawlingContext<Page, Response>, gotoOptions: GoToOptions): Promise<Context['response'] | null | undefined>;
    private processResponse;
    /**
     * Function for cleaning up after all requests are processed.
     * @ignore
     */
    teardown(): Promise<void>;
}
/**
 * Extracts URLs from a given page.
 * @ignore
 */
export declare function extractUrlsFromPage(page: {
    $$eval: Function;
}, selector: string, baseUrl: string): Promise<string[]>;
export {};
