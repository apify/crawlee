import type { BrowserCrawlerOptions, BrowserCrawlingContext, BrowserHook, ContextPipeline, CrawlingContext, GetUserDataFromRequest, RouterHandler, RouterRoutes, RouteSchemas, RoutesFromSchemas } from '@crawlee/browser';
import { BrowserCrawler } from '@crawlee/browser';
import type { Dictionary } from '@crawlee/types';
import type { HTTPResponse, LaunchOptions, Page } from 'puppeteer';
import { z } from 'zod';
import type { PuppeteerLaunchContext } from './puppeteer-launcher.js';
import type { DirectNavigationOptions, PuppeteerContextUtils } from './utils/puppeteer_utils.js';
export type PuppeteerGoToOptions = NonNullable<Parameters<Page['goto']>[1]>;
export interface PuppeteerCrawlingContext<UserData extends Dictionary = any> extends BrowserCrawlingContext<Page, HTTPResponse, UserData, PuppeteerGoToOptions>, PuppeteerContextUtils {
}
export type PuppeteerHook<UserData extends Dictionary = any> = BrowserHook<PuppeteerCrawlingContext<UserData>>;
export interface PuppeteerCrawlerOptions<ContextExtension = Dictionary<never>, ExtendedContext extends PuppeteerCrawlingContext = PuppeteerCrawlingContext & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<PuppeteerCrawlingContext['request']>>, StatisticStateExtension extends object = {}> extends BrowserCrawlerOptions<Page, HTTPResponse, PuppeteerCrawlingContext, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    /**
     * Options used by {@apilink launchPuppeteer} to start new Puppeteer instances.
     */
    launchContext?: PuppeteerLaunchContext;
    /**
     * Whether to run browser in headless mode. Defaults to `true`.
     * Can be also set via {@apilink Configuration}.
     */
    headless?: boolean | 'new' | 'old';
    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function receives the `crawlingContext`; the options object
     * forwarded to `page.goto()` is available as `crawlingContext.gotoOptions` and can be mutated in place.
     * A hook may optionally return a partial object whose properties are merged into the crawling context
     * (e.g. to override context members for subsequent hooks and pipeline stages).
     * Example:
     * ```
     * preNavigationHooks: [
     *     async ({ page, gotoOptions }) => {
     *         await page.evaluate((attr) => { window.foo = attr; }, 'bar');
     *         gotoOptions.timeout = 60_000;
     *     },
     * ]
     * ```
     */
    preNavigationHooks?: BrowserHook<PuppeteerCrawlingContext<GetUserDataFromRequest<ExtendedContext['request']>>, ContextExtension>[];
    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts `crawlingContext` as the only parameter. A hook may optionally return a partial object
     * whose properties are merged into the crawling context (e.g. to override `response` after solving a challenge).
     * Example:
     * ```
     * postNavigationHooks: [
     *     async (crawlingContext) => {
     *         const { page } = crawlingContext;
     *         if (hasCaptcha(page)) {
     *             await solveCaptcha (page);
     *         }
     *     },
     * ]
     * ```
     */
    postNavigationHooks?: BrowserHook<PuppeteerCrawlingContext<GetUserDataFromRequest<ExtendedContext['request']>>, ContextExtension>[];
}
/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chrome with [Puppeteer](https://github.com/puppeteer/puppeteer).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `PuppeteerCrawler` uses headless Chrome to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, consider using {@apilink CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from the
 * {@apilink IRequestManager|request manager} provided via the {@apilink PuppeteerCrawlerOptions.requestManager|`requestManager`}
 * constructor option (a {@apilink RequestQueue} is itself a request manager). To read from a read-only source such
 * as a {@apilink RequestList} while still being able to enqueue new requests, combine it with a queue into a
 * {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`} and pass the
 * result as `requestManager`.
 *
 * > The {@apilink PuppeteerCrawlerOptions.requestList|`requestList`} and {@apilink PuppeteerCrawlerOptions.requestQueue|`requestQueue`}
 * > options are deprecated; they are still accepted and folded into a single `requestManager` for back-compat.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * `PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each {@apilink Request} object to crawl
 * and then calls the function provided by user as the {@apilink PuppeteerCrawlerOptions.requestHandler} option.
 *
 * New pages are only opened when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the
 * `PuppeteerCrawler` constructor, or, for finer control, by injecting a pre-configured
 * {@apilink ConcurrencySystem|`concurrencySystem`}.
 *
 * Note that the pool of Puppeteer instances is internally managed by the [BrowserPool](https://github.com/apify/browser-pool) class.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new PuppeteerCrawler({
 *     async requestHandler({ page, request }) {
 *         // This function is called to extract data from a single web page
 *         // 'page' is an instance of Puppeteer.Page with page.goto(request.url) already called
 *         // 'request' is an instance of Request class with information about the page to load
 *         await Dataset.pushData({
 *             title: await page.title(),
 *             url: request.url,
 *             succeeded: true,
 *         })
 *     },
 *     async failedRequestHandler({ request }) {
 *         // This function is called when the crawling of a request failed too many times
 *         await Dataset.pushData({
 *             url: request.url,
 *             succeeded: false,
 *             errors: request.errorMessages,
 *         })
 *     },
 * });
 *
 * await crawler.run([
 *     'http://www.example.com/page-1',
 *     'http://www.example.com/page-2',
 * ]);
 * ```
 * @category Crawlers
 */
export declare class PuppeteerCrawler<ContextExtension = Dictionary<never>, ExtendedContext extends PuppeteerCrawlingContext = PuppeteerCrawlingContext & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<PuppeteerCrawlingContext['request']>>, StatisticStateExtension extends object = {}> extends BrowserCrawler<Page, HTTPResponse, LaunchOptions, PuppeteerCrawlingContext, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    /**
     * @internal
     */
    protected static optionsShape: {
        headless: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
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
        configuration: z.ZodOptional<z.ZodCustom<import("@crawlee/browser").Configuration, import("@crawlee/browser").Configuration>>;
        storageBackend: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        eventManager: z.ZodOptional<z.ZodCustom<import("@crawlee/browser").EventManager, import("@crawlee/browser").EventManager>>;
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
        headless: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
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
        configuration: z.ZodOptional<z.ZodCustom<import("@crawlee/browser").Configuration, import("@crawlee/browser").Configuration>>;
        storageBackend: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        eventManager: z.ZodOptional<z.ZodCustom<import("@crawlee/browser").EventManager, import("@crawlee/browser").EventManager>>;
        logger: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        minConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxRequestsPerMinute: z.ZodOptional<z.ZodCustom<number, number>>;
        keepAlive: z.ZodOptional<z.ZodBoolean>;
        statistics: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        id: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    /**
     * All `PuppeteerCrawler` parameters are passed via an options object.
     */
    constructor(options?: PuppeteerCrawlerOptions<ContextExtension, ExtendedContext, Routes, StatisticStateExtension>);
    protected buildContextPipeline(): ContextPipeline<CrawlingContext, PuppeteerCrawlingContext>;
    private enhanceContext;
    protected navigationHandler(crawlingContext: PuppeteerCrawlingContext, gotoOptions: DirectNavigationOptions): Promise<HTTPResponse | null>;
}
/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@apilink PuppeteerCrawler}.
 * Defaults to the {@apilink PuppeteerCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<PuppeteerCrawlingContext>()`.
 *
 * ```ts
 * import { PuppeteerCrawler, createPuppeteerRouter } from 'crawlee';
 *
 * const router = createPuppeteerRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new PuppeteerCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
export declare function createPuppeteerRouter<Context extends PuppeteerCrawlingContext = PuppeteerCrawlingContext, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export declare function createPuppeteerRouter<Context extends PuppeteerCrawlingContext = PuppeteerCrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
export declare function createPuppeteerRouter<Context extends PuppeteerCrawlingContext = PuppeteerCrawlingContext, const Schemas extends RouteSchemas = RouteSchemas>(schemas: Schemas): RouterHandler<Context, RoutesFromSchemas<Schemas>>;
