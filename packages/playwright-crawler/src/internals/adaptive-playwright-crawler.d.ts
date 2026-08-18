import type { BrowserHook, LoadedRequest, Request, RouterHandler, RouteSchemas, RoutesFromSchemas } from '@crawlee/browser';
import type { BasicCrawlerOptions } from '@crawlee/basic';
import { BasicCrawler } from '@crawlee/basic';
import type { ContextPipeline, CrawlingContext, EnqueueLinksOptions, GetUserDataFromRequest, RouterRoutes, StorageTransactionView } from '@crawlee/core';
import type { Dictionary, Awaitable } from '@crawlee/types';
import { type Cheerio, type CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { Page } from 'playwright';
import { z } from 'zod';
import type { PlaywrightCrawlingContext, PlaywrightGotoOptions } from './playwright-crawler.js';
import { type IRenderingTypePredictor } from './utils/rendering-type-prediction.js';
declare const adaptiveStatisticStateSchema: z.ZodObject<{
    httpOnlyRequestHandlerRuns: z.ZodDefault<z.ZodNumber>;
    browserRequestHandlerRuns: z.ZodDefault<z.ZodNumber>;
    renderingTypeMispredictions: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
/**
 * The extra statistics fields {@apilink AdaptivePlaywrightCrawler} tracks on top of the built-in
 * {@apilink StatisticState} ones. They are available on `crawler.statistics.state` and are persisted with the rest of
 * the statistics.
 */
export type AdaptivePlaywrightCrawlerStatisticState = z.infer<typeof adaptiveStatisticStateSchema>;
/**
 * The {@apilink AdaptivePlaywrightCrawlerStatisticState} fields as a {@apilink Statistics} state extension, defaults
 * and all. A {@apilink Statistics} instance to be injected into an {@apilink AdaptivePlaywrightCrawler} has to carry
 * them - `deserialize.extend()` your own fields onto this one and pass the result as `stateExtension`.
 */
export declare const adaptivePlaywrightCrawlerStatisticState: {
    deserialize: z.ZodObject<{
        httpOnlyRequestHandlerRuns: z.ZodDefault<z.ZodNumber>;
        browserRequestHandlerRuns: z.ZodDefault<z.ZodNumber>;
        renderingTypeMispredictions: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
};
export interface AdaptivePlaywrightCrawlerContext<UserData extends Dictionary = any> extends CrawlingContext<UserData> {
    request: LoadedRequest<Request<UserData>>;
    /**
     * The HTTP response, either from the HTTP client or from the initial request from playwright's navigation.
     */
    response: Response;
    /**
     * Playwright Page object. If accessed in HTTP-only rendering, this will throw an error and make the AdaptivePlaywrightCrawlerContext retry the request in a browser.
     */
    page: Page;
    /**
     * Wait for an element matching the selector to appear and return a Cheerio object of the first matched element.
     * Timeout defaults to 5s.
     */
    querySelector(selector: string, timeoutMs?: number): Promise<Cheerio<AnyNode>>;
    /**
     * Wait for an element matching the selector to appear and return a Cheerio object of all matched elements.
     * Timeout defaults to 5s.
     */
    querySelectorAll(selector: string, timeoutMs?: number): Promise<Cheerio<AnyNode>>;
    /**
     * Wait for an element matching the selector to appear.
     * Timeout defaults to 5s.
     *
     * **Example usage:**
     * ```ts
     * async requestHandler({ waitForSelector, parseWithCheerio }) {
     *     await waitForSelector('article h1');
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    waitForSelector(selector: string, timeoutMs?: number): Promise<void>;
    /**
     * Returns Cheerio handle for `page.content()`, allowing to work with the data same way as with {@apilink CheerioCrawler}.
     * When provided with the `selector` argument, it will first look for the selector with a 5s timeout.
     *
     * **Example usage:**
     * ```ts
     * async requestHandler({ parseWithCheerio }) {
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    parseWithCheerio(selector?: string, timeoutMs?: number): Promise<CheerioAPI>;
    enqueueLinks(options?: EnqueueLinksOptions): Promise<unknown>;
}
interface AdaptiveHookContext extends Pick<AdaptivePlaywrightCrawlerContext, 'id' | 'session' | 'proxyInfo' | 'log'> {
    page?: Page;
    request: Request;
    gotoOptions?: PlaywrightGotoOptions;
}
type AdaptiveHook<ContextExtension = Dictionary<never>> = BrowserHook<AdaptiveHookContext, ContextExtension>;
type AdaptivePostNavigationHook<ContextExtension = Dictionary<never>> = BrowserHook<Omit<AdaptiveHookContext, 'request'> & {
    request: LoadedRequest<Request>;
}, ContextExtension>;
export interface AdaptivePlaywrightCrawlerOptions<ContextExtension = Dictionary<never>, ExtendedContext extends AdaptivePlaywrightCrawlerContext = AdaptivePlaywrightCrawlerContext & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<AdaptivePlaywrightCrawlerContext['request']>>, StatisticStateExtension extends AdaptivePlaywrightCrawlerStatisticState = AdaptivePlaywrightCrawlerStatisticState> extends Omit<BasicCrawlerOptions<AdaptivePlaywrightCrawlerContext, ContextExtension, ExtendedContext, Routes, StatisticStateExtension>, 'preNavigationHooks' | 'postNavigationHooks'> {
    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies.
     * The function accepts a subset of the crawling context. If you attempt to access the `page` property during HTTP-only crawling,
     * an exception will be thrown. If it's not caught, the request will be transparently retried in a browser.
     *
     * A hook may optionally return a partial object whose properties are merged into the crawling context,
     * allowing the hook to override context members for subsequent hooks and pipeline stages.
     */
    preNavigationHooks?: AdaptiveHook<ContextExtension>[];
    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts a subset of the crawling context. If you attempt to access the `page` property during HTTP-only crawling,
     * an exception will be thrown. If it's not caught, the request will be transparently retried in a browser.
     *
     * A hook may optionally return a partial object whose properties are merged into the crawling context
     * (e.g. to override `response` after solving a challenge).
     */
    postNavigationHooks?: AdaptivePostNavigationHook<ContextExtension>[];
    /**
     * Specifies the frequency of rendering type detection checks - 0.1 means roughly 10% of requests.
     * Defaults to 0.1 (so 10%).
     */
    renderingTypeDetectionRatio?: number;
    /**
     * An optional callback that is called on the storage writes recorded by the request handler in plain
     * HTTP mode (exposed as a read-only {@apilink StorageTransactionView}).
     * If it returns false, the request is retried in a browser.
     * If no callback is specified, every result is considered valid.
     */
    resultChecker?: (result: StorageTransactionView) => boolean;
    /**
     * An optional callback that decides whether an error thrown during the plain HTTP request handler
     * should be propagated (instead of falling back to browser navigation).
     *
     * If the callback returns `true`, the error is thrown, triggering the standard retry mechanism.
     * If the callback returns `false` (or is not provided), the error is logged and the crawler
     * falls back to browser navigation (default behavior).
     *
     * @default () => false
     */
    shouldPropagateError?: (error: Error, context: PlaywrightCrawlingContext) => Awaitable<boolean>;
    /**
     * An optional callback used in rendering type detection. On each detection, the result of the plain HTTP run is compared to that of the browser one.
     * If a callback is provided, the contract is as follows:
     *   It the callback returns true or 'equal', the results are considered equal and the target site is considered static.
     *   If it returns false or 'different', the target site is considered client-rendered.
     *   If it returns 'inconclusive', the detection result won't be used.
     * If no result comparator is specified, but there is a `resultChecker`, any site where the `resultChecker` returns true is considered static.
     * If neither `resultComparator` nor `resultChecker` are specified, a deep comparison of returned dataset items is used as a default.
     *
     * For a stricter, ready-made comparator that also takes enqueued requests and key-value store changes into account, see {@apilink fullResultComparator}.
     */
    resultComparator?: (resultA: StorageTransactionView, resultB: StorageTransactionView) => boolean | 'equal' | 'different' | 'inconclusive';
    /**
     * A custom rendering type predictor. A predictor passed here is borrowed - the crawler never drives its
     * lifecycle, so set it up yourself (the built-in {@apilink RenderingTypePredictor} needs `initialize()`).
     * Omit the option and the crawler builds its own from `renderingTypeDetectionRatio` - and initializes it.
     */
    renderingTypePredictor?: IRenderingTypePredictor;
}
/**
 * An extension of {@apilink PlaywrightCrawler} that uses a more limited request handler interface so that it is able to switch to HTTP-only crawling when it detects it may be possible.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new AdaptivePlaywrightCrawler({
 *     renderingTypeDetectionRatio: 0.1,
 *     async requestHandler({ querySelector, pushData, enqueueLinks, request, log }) {
 *         // This function is called to extract data from a single web page
 *         const $prices = await querySelector('span.price')
 *
 *         await pushData({
 *             url: request.url,
 *             price: $prices.filter(':contains("$")').first().text(),
 *         })
 *
 *         await enqueueLinks({ selector: '.pagination a' })
 *     },
 * });
 *
 * await crawler.run([
 *     'http://www.example.com/page-1',
 *     'http://www.example.com/page-2',
 * ]);
 * ```
 *
 * @experimental
 */
export declare class AdaptivePlaywrightCrawler<ContextExtension = Dictionary<never>, ExtendedContext extends AdaptivePlaywrightCrawlerContext = AdaptivePlaywrightCrawlerContext & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<AdaptivePlaywrightCrawlerContext['request']>>, StatisticStateExtension extends AdaptivePlaywrightCrawlerStatisticState = AdaptivePlaywrightCrawlerStatisticState> extends BasicCrawler<AdaptivePlaywrightCrawlerContext, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    #private;
    constructor(options?: AdaptivePlaywrightCrawlerOptions<ContextExtension, ExtendedContext, Routes, StatisticStateExtension>);
    protected init(): Promise<void>;
    protected buildContextPipeline(): ContextPipeline<CrawlingContext, AdaptivePlaywrightCrawlerContext>;
    private adaptCheerioContext;
    private adaptPlaywrightContext;
    /**
     * Runs one request handler attempt inside its own {@apilink StorageTransaction}, wrapping the inner
     * (static or browser) context pipeline. The transaction is pushed to `transactions` *at creation
     * time, before the `try`* - the `ok: false` branch of the returned {@apilink Result} carries no
     * result, and failed attempts are routine here. The caller owns the outcome and disposal.
     */
    private crawlOne;
    protected runRequestHandler(crawlingContext: CrawlingContext): Promise<void>;
    private enqueueLinks;
    private createLogProxy;
    teardown(): Promise<void>;
}
export declare function createAdaptivePlaywrightRouter<Context extends AdaptivePlaywrightCrawlerContext = AdaptivePlaywrightCrawlerContext, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export declare function createAdaptivePlaywrightRouter<Context extends AdaptivePlaywrightCrawlerContext = AdaptivePlaywrightCrawlerContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
export declare function createAdaptivePlaywrightRouter<Context extends AdaptivePlaywrightCrawlerContext = AdaptivePlaywrightCrawlerContext, const Schemas extends RouteSchemas = RouteSchemas>(schemas: Schemas): RouterHandler<Context, RoutesFromSchemas<Schemas>>;
/**
 * An opt-in {@apilink AdaptivePlaywrightCrawlerOptions.resultComparator|`resultComparator`} that considers two
 * request handler results equal only if *all* of their observable effects match - the pushed dataset items, the
 * enqueued requests, and the key-value store changes. This is stricter than the default comparator, which only
 * compares dataset items.
 *
 * **Beware:** enqueued URLs are compared exactly. The same page rendered in a browser and via plain HTTP often
 * yields links that differ only in tracking query parameters, for example:
 * - `https://sdk.apify.com/docs/guides/getting-started`
 * - `https://sdk.apify.com/docs/guides/getting-started?__hsfp=1136113150&__hssc=7591405.1.173549427712`
 *
 * Such links are treated as *different*, which will make the crawler favor browser rendering for those pages.
 *
 * **Example usage:**
 * ```ts
 * const crawler = new AdaptivePlaywrightCrawler({
 *     resultComparator: fullResultComparator,
 *     async requestHandler({ pushData, enqueueLinks }) {
 *         // ...
 *     },
 * });
 * ```
 */
export declare function fullResultComparator(resultA: StorageTransactionView, resultB: StorageTransactionView): boolean;
export {};
