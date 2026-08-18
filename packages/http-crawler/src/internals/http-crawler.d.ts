import type { BasicCrawlerOptions, ConcurrencySystem, ConcurrencySystemOptions, CrawlingContext, ErrorHandler, GetUserDataFromRequest, Request as CrawleeRequest, RequestHandler, RequireContextPipeline, RouterHandler, RouterRoutes, RouteSchemas, RoutesFromSchemas } from '@crawlee/basic';
import { BasicCrawler, ContextPipeline } from '@crawlee/basic';
import { type LoadedRequest } from '@crawlee/core';
import type { Awaitable, Dictionary } from '@crawlee/types';
import type { CheerioAPI } from 'cheerio';
import type { JsonValue } from 'type-fest';
import { z } from 'zod';
/**
 * A higher starting concurrency and a relaxed event loop signal, since HTTP-only crawling barely touches the event
 * loop. {@apilink HttpCrawler} folds these into the {@apilink ConcurrencySystem} it builds by default.
 *
 * A {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`} you supply yourself replaces that default
 * wholesale, tuning included, so spread these options in if you want to keep it:
 *
 * ```typescript
 * new ConcurrencySystem({ ...HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS, maxConcurrency: 50 });
 * ```
 */
export declare const HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS: ConcurrencySystemOptions;
export type HttpErrorHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends JsonValue = any, // with default to Dictionary we cant use a typed router in untyped crawler
ContextExtension = Dictionary<never>> = ErrorHandler<CrawlingContext, HttpCrawlingContext<UserData, JSONData> & ContextExtension>;
export interface HttpCrawlerOptions<Context extends InternalHttpCrawlingContext = InternalHttpCrawlingContext, ContextExtension = Dictionary<never>, ExtendedContext extends Context = Context & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>, StatisticStateExtension extends object = {}> extends BasicCrawlerOptions<Context, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    /**
     * Timeout for the whole navigation phase, given in seconds. A single window shared by the
     * `preNavigationHooks`, the navigation (the HTTP request to the resource), and the `postNavigationHooks` -
     * so a slow hook eats into the same budget the navigation uses. Separate from the
     * {@apilink BasicCrawlerOptions.requestHandlerTimeoutSecs|`requestHandlerTimeoutSecs`}, which times only the
     * request handler.
     */
    navigationTimeoutSecs?: number;
    /**
     * If set to `true`, TLS/SSL certificate errors are ignored. Forwarded to the HTTP client as
     * {@apilink SendRequestOptions.ignoreTlsErrors|`ignoreTlsErrors`} on every navigation request, so custom
     * {@apilink BaseHttpClient} implementations should honor that flag (the built-in impit and got-scraping
     * clients do; the native fetch fallback cannot disable TLS verification and warns instead).
     *
     * @default true
     */
    ignoreTlsErrors?: boolean;
    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function accepts one parameter `crawlingContext`,
     * which is passed to the `requestAsBrowser()` function the crawler calls to navigate.
     *
     * A hook may optionally return a partial object whose properties are merged into the crawling context,
     * allowing the hook to override context members for subsequent hooks and pipeline stages.
     *
     * The context is built up in the following order: base context (`request`, `session`, helpers, ...) ->
     * `extendContext` -> `preNavigationHooks` -> navigation -> `postNavigationHooks` -> `requestHandler`.
     * This means the members added by `extendContext` are already available here, but navigation-dependent
     * members (e.g. `response`, `body`, `$`) are not.
     * Example:
     * ```
     * preNavigationHooks: [
     *     async (crawlingContext) => {
     *         // ...
     *     },
     * ]
     * ```
     */
    preNavigationHooks?: InternalHttpHook<CrawlingContext<any>, ContextExtension>[];
    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts `crawlingContext` as the only parameter.
     *
     * A hook may optionally return a partial object whose properties are merged into the crawling context,
     * which is useful for overriding the `response` after solving a challenge or re-fetching the resource.
     * Example:
     * ```
     * postNavigationHooks: [
     *     async (crawlingContext) => {
     *         if (await needsRevalidation(crawlingContext)) {
     *             return { response: await refetch(crawlingContext.request) };
     *         }
     *     },
     * ]
     * ```
     */
    postNavigationHooks?: ((crawlingContext: CrawlingContextWithResponse & ContextExtension) => Awaitable<void | Partial<CrawlingContextWithResponse>>)[];
    /**
     * An array of [MIME types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types)
     * you want the crawler to load and process. By default, only `text/html`, `application/xhtml+xml`, `text/xml`, `application/xml`,
     * and `application/json` MIME types are supported.
     */
    additionalMimeTypes?: string[];
    /**
     * By default this crawler will extract correct encoding from the HTTP response headers.
     * Sadly, there are some websites which use invalid headers. Those are encoded using the UTF-8 encoding.
     * If those sites actually use a different encoding, the response will be corrupted. You can use
     * `suggestResponseEncoding` to fall back to a certain encoding, if you know that your target website uses it.
     * To force a certain encoding, disregarding the response headers, use {@apilink HttpCrawlerOptions.forceResponseEncoding}
     * ```
     * // Will fall back to windows-1250 encoding if none found
     * suggestResponseEncoding: 'windows-1250'
     * ```
     */
    suggestResponseEncoding?: string;
    /**
     * By default this crawler will extract correct encoding from the HTTP response headers. Use `forceResponseEncoding`
     * to force a certain encoding, disregarding the response headers.
     * To only provide a default for missing encodings, use {@apilink HttpCrawlerOptions.suggestResponseEncoding}
     * ```
     * // Will force windows-1250 encoding even if headers say otherwise
     * forceResponseEncoding: 'windows-1250'
     * ```
     */
    forceResponseEncoding?: string;
    /**
     * Automatically saves cookies to Session. Enabled by default.
     *
     * It parses cookie from response "set-cookie" header saves or updates cookies for session and once the session is used for next request.
     * It passes the "Cookie" header to the request with the session cookies.
     */
    saveResponseCookies?: boolean;
}
export type InternalHttpHook<Context, ContextExtension = {}> = (crawlingContext: Context & ContextExtension) => Awaitable<void | Partial<Context>>;
export type HttpHook<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends JsonValue = any> = InternalHttpHook<HttpCrawlingContext<UserData, JSONData>>;
interface CrawlingContextWithResponse<UserData extends Dictionary = any> extends CrawlingContext<UserData> {
    /**
     * The request object that was successfully loaded and navigated to, including the {@apilink Request.loadedUrl|`loadedUrl`} property.
     */
    request: LoadedRequest<CrawleeRequest<UserData>>;
    /**
     * The HTTP response object containing status code, headers, and other response metadata.
     */
    response: Response;
}
export interface InternalHttpCrawlingContext<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends JsonValue = any> extends CrawlingContextWithResponse<UserData> {
    /**
     * The request body of the web page.
     * The type depends on the `Content-Type` header of the web page:
     * - String for `text/html`, `application/xhtml+xml`, `application/xml` MIME content types
     * - Buffer for others MIME content types
     */
    body: string | Buffer;
    /**
     * The parsed object from JSON string if the response contains the content type application/json.
     */
    json: JSONData;
    /**
     * Parsed `Content-Type header: { type, encoding }`.
     */
    contentType: {
        type: string;
        encoding: BufferEncoding;
    };
    /**
     * Wait for an element matching the selector to appear. Timeout is ignored.
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
     * When provided with the `selector` argument, it will throw if it's not available.
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
}
export interface HttpCrawlingContext<UserData extends Dictionary = any, JSONData extends JsonValue = any> extends InternalHttpCrawlingContext<UserData, JSONData> {
}
export type HttpRequestHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends JsonValue = any> = RequestHandler<HttpCrawlingContext<UserData, JSONData>>;
/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * It is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
 * to display the content, you might need to use {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler} instead,
 * because it loads the pages using full-featured headless Chrome browser.
 *
 * This crawler downloads each URL using a plain HTTP request and doesn't do any HTML parsing.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from the
 * {@apilink IRequestManager|request manager} provided via the {@apilink HttpCrawlerOptions.requestManager|`requestManager`}
 * constructor option (a {@apilink RequestQueue} is itself a request manager). To read from a read-only source such
 * as a {@apilink RequestList} while still being able to enqueue new requests, combine it with a queue into a
 * {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`} and pass the
 * result as `requestManager`.
 *
 * > The {@apilink HttpCrawlerOptions.requestList|`requestList`} and {@apilink HttpCrawlerOptions.requestQueue|`requestQueue`}
 * > options are deprecated; they are still accepted and folded into a single `requestManager` for back-compat.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * We can use the `preNavigationHooks` to adjust the crawling context before the request is made:
 *
 * ```javascript
 * preNavigationHooks: [
 *     (crawlingContext) => {
 *         // ...
 *     },
 * ]
 * ```
 *
 * By default, this crawler only processes web pages with the `text/html`, `application/xhtml+xml`, `text/xml`, `application/xml`,
 * and `application/json` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@apilink HttpCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For details, see {@apilink HttpCrawlerOptions.requestHandler}.
 *
 * New requests are only dispatched when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the
 * constructor, or, for finer control, by injecting a pre-configured
 * {@apilink ConcurrencySystem|`concurrencySystem`}.
 *
 * **Example usage:**
 *
 * ```javascript
 * import { HttpCrawler, Dataset } from '@crawlee/http';
 *
 * const crawler = new HttpCrawler({
 *     requestList,
 *     async requestHandler({ request, response, body, contentType }) {
 *         // Save the data to dataset.
 *         await Dataset.pushData({
 *             url: request.url,
 *             html: body,
 *         });
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
export declare class HttpCrawler<Context extends InternalHttpCrawlingContext<any, any> = InternalHttpCrawlingContext, ContextExtension = Dictionary<never>, ExtendedContext extends Context = Context & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>, StatisticStateExtension extends object = {}> extends BasicCrawler<Context, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    #private;
    /**
     * @internal
     */
    protected static optionsShape: {
        navigationTimeoutSecs: z.ZodDefault<z.ZodCustom<number, number>>;
        ignoreTlsErrors: z.ZodDefault<z.ZodBoolean>;
        additionalMimeTypes: z.ZodDefault<z.ZodArray<z.ZodString>>;
        suggestResponseEncoding: z.ZodOptional<z.ZodString>;
        forceResponseEncoding: z.ZodOptional<z.ZodString>;
        saveResponseCookies: z.ZodDefault<z.ZodBoolean>;
        preNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        postNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
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
        ignoreTlsErrors: z.ZodDefault<z.ZodBoolean>;
        additionalMimeTypes: z.ZodDefault<z.ZodArray<z.ZodString>>;
        suggestResponseEncoding: z.ZodOptional<z.ZodString>;
        forceResponseEncoding: z.ZodOptional<z.ZodString>;
        saveResponseCookies: z.ZodDefault<z.ZodBoolean>;
        preNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        postNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
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
     * All `HttpCrawlerOptions` parameters are passed via an options object.
     */
    constructor(options?: HttpCrawlerOptions<Context, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> & RequireContextPipeline<InternalHttpCrawlingContext, Context>);
    protected getNavigationTimeoutMillis(): number;
    /**
     * Folds {@apilink HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS} into the default system, keeping the user's
     * concurrency shortcuts on top. Not called for a supplied
     * {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`} — spread the constant into it yourself to
     * keep the tuning.
     */
    protected createDefaultConcurrencySystem(options: ConcurrencySystemOptions): ConcurrencySystem;
    protected buildContextPipeline(): ContextPipeline<CrawlingContext, InternalHttpCrawlingContext>;
    private prepareHttpRequest;
    private makeHttpRequest;
    private processHttpResponse;
    private handleBlockedRequestByContent;
    protected isRequestBlocked(crawlingContext: InternalHttpCrawlingContext): Promise<string | false>;
    /**
     * Function to make the HTTP request. It performs optimizations
     * on the request such as only downloading the request body if the
     * received content type matches text/html, application/xml, application/xhtml+xml.
     */
    private requestFunction;
    /**
     * Encodes and parses response according to the provided content type
     */
    private parseResponse;
    /**
     * Combines the provided `requestOptions` with mandatory (non-overridable) values.
     */
    private getRequestOptions;
    private encodeResponse;
    /**
     * Checks and extends supported mime types
     */
    private extendSupportedMimeTypes;
    /**
     * Handles timeout request
     */
    private handleRequestTimeout;
    private abortDownloadOfBody;
    /**
     * @internal wraps public utility for mocking purposes
     */
    private requestAsBrowser;
}
/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@apilink HttpCrawler}.
 * Defaults to the {@apilink HttpCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<HttpCrawlingContext>()`.
 *
 * ```ts
 * import { HttpCrawler, createHttpRouter } from 'crawlee';
 *
 * const router = createHttpRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new HttpCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
export declare function createHttpRouter<Context extends HttpCrawlingContext = HttpCrawlingContext, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export declare function createHttpRouter<Context extends HttpCrawlingContext = HttpCrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
export declare function createHttpRouter<Context extends HttpCrawlingContext = HttpCrawlingContext, const Schemas extends RouteSchemas = RouteSchemas>(schemas: Schemas): RouterHandler<Context, RoutesFromSchemas<Schemas>>;
export {};
