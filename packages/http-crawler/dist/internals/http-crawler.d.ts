/// <reference types="node" />
/// <reference types="node" />
import type { BasicCrawlerOptions, ErrorHandler, RequestHandler, CrawlingContext, ProxyConfiguration, Request, Session } from '@crawlee/basic';
import { BasicCrawler, CrawlerExtension, Configuration } from '@crawlee/basic';
import type { Awaitable, Dictionary, GetUserDataFromRequest, RouterRoutes } from '@crawlee/types';
import type { RequestLike, ResponseLike } from 'content-type';
import type { OptionsInit } from 'got-scraping';
import type { JsonValue } from 'type-fest';
import type { IncomingMessage } from 'node:http';
export type HttpErrorHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends JsonValue = any> = ErrorHandler<HttpCrawlingContext<UserData, JSONData>>;
export interface HttpCrawlerOptions<Context extends InternalHttpCrawlingContext = InternalHttpCrawlingContext> extends BasicCrawlerOptions<Context> {
    /**
     * An alias for {@apilink HttpCrawlerOptions.requestHandler}
     * Soon to be removed, use `requestHandler` instead.
     * @deprecated
     */
    handlePageFunction?: HttpCrawlerOptions<Context>['requestHandler'];
    /**
     * Timeout in which the HTTP request to the resource needs to finish, given in seconds.
     */
    navigationTimeoutSecs?: number;
    /**
     * If set to true, SSL certificate errors will be ignored.
     */
    ignoreSslErrors?: boolean;
    /**
     * If set, this crawler will be configured for all connections to use
     * [Apify Proxy](https://console.apify.com/proxy) or your own Proxy URLs provided and rotated according to the configuration.
     * For more information, see the [documentation](https://docs.apify.com/proxy).
     */
    proxyConfiguration?: ProxyConfiguration;
    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function accepts two parameters, `crawlingContext` and `gotOptions`,
     * which are passed to the `requestAsBrowser()` function the crawler calls to navigate.
     * Example:
     * ```
     * preNavigationHooks: [
     *     async (crawlingContext, gotOptions) => {
     *         // ...
     *     },
     * ]
     * ```
     *
     * Modyfing `pageOptions` is supported only in Playwright incognito.
     * See {@apilink PrePageCreateHook}
     */
    preNavigationHooks?: InternalHttpHook<Context>[];
    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts `crawlingContext` as the only parameter.
     * Example:
     * ```
     * postNavigationHooks: [
     *     async (crawlingContext) => {
     *         // ...
     *     },
     * ]
     * ```
     */
    postNavigationHooks?: InternalHttpHook<Context>[];
    /**
     * An array of [MIME types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types)
     * you want the crawler to load and process. By default, only `text/html` and `application/xhtml+xml` MIME types are supported.
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
     * Automatically saves cookies to Session. Works only if Session Pool is used.
     *
     * It parses cookie from response "set-cookie" header saves or updates cookies for session and once the session is used for next request.
     * It passes the "Cookie" header to the request with the session cookies.
     */
    persistCookiesPerSession?: boolean;
}
/**
 * @internal
 */
export type InternalHttpHook<Context> = (crawlingContext: Context, gotOptions: OptionsInit) => Awaitable<void>;
export type HttpHook<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends JsonValue = any> = InternalHttpHook<HttpCrawlingContext<UserData, JSONData>>;
/**
 * @internal
 */
export interface InternalHttpCrawlingContext<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends JsonValue = any, // with default to Dictionary we cant use a typed router in untyped crawler
Crawler = HttpCrawler<any>> extends CrawlingContext<Crawler, UserData> {
    /**
     * The request body of the web page.
     * The type depends on the `Content-Type` header of the web page:
     * - String for `text/html`, `application/xhtml+xml`, `application/xml` MIME content types
     * - Buffer for others MIME content types
     */
    body: (string | Buffer);
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
    response: IncomingMessage;
}
export interface HttpCrawlingContext<UserData extends Dictionary = any, JSONData extends JsonValue = any> extends InternalHttpCrawlingContext<UserData, JSONData, HttpCrawler<HttpCrawlingContext<UserData, JSONData>>> {
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
 * The source URLs are represented using {@apilink Request} objects that are fed from
 * {@apilink RequestList} or {@apilink RequestQueue} instances provided by the {@apilink HttpCrawlerOptions.requestList}
 * or {@apilink HttpCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@apilink HttpCrawlerOptions.requestList} and {@apilink HttpCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@apilink RequestList} and automatically enqueues all of them
 * to {@apilink RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * We can use the `preNavigationHooks` to adjust `gotOptions`:
 *
 * ```javascript
 * preNavigationHooks: [
 *     (crawlingContext, gotOptions) => {
 *         // ...
 *     },
 * ]
 * ```
 *
 * By default, this crawler only processes web pages with the `text/html`
 * and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@apilink HttpCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For details, see {@apilink HttpCrawlerOptions.requestHandler}.
 *
 * New requests are only dispatched when there is enough free CPU and memory available,
 * using the functionality provided by the {@apilink AutoscaledPool} class.
 * All {@apilink AutoscaledPool} configuration options can be passed to the `autoscaledPoolOptions`
 * parameter of the constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@apilink AutoscaledPool} options are available directly in the constructor.
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
export declare class HttpCrawler<Context extends InternalHttpCrawlingContext<any, any, HttpCrawler<Context>>> extends BasicCrawler<Context> {
    readonly config: Configuration;
    /**
     * A reference to the underlying {@apilink ProxyConfiguration} class that manages the crawler's proxies.
     * Only available if used by the crawler.
     */
    proxyConfiguration?: ProxyConfiguration;
    protected userRequestHandlerTimeoutMillis: number;
    protected preNavigationHooks: InternalHttpHook<Context>[];
    protected postNavigationHooks: InternalHttpHook<Context>[];
    protected persistCookiesPerSession: boolean;
    protected navigationTimeoutMillis: number;
    protected ignoreSslErrors: boolean;
    protected suggestResponseEncoding?: string;
    protected forceResponseEncoding?: string;
    protected readonly supportedMimeTypes: Set<string>;
    protected static optionsShape: {
        handlePageFunction: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        navigationTimeoutSecs: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        ignoreSslErrors: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        additionalMimeTypes: import("ow").ArrayPredicate<string>;
        suggestResponseEncoding: import("ow").StringPredicate & import("ow").BasePredicate<string | undefined>;
        forceResponseEncoding: import("ow").StringPredicate & import("ow").BasePredicate<string | undefined>;
        proxyConfiguration: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        persistCookiesPerSession: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        preNavigationHooks: import("ow").ArrayPredicate<unknown> & import("ow").BasePredicate<unknown[] | undefined>;
        postNavigationHooks: import("ow").ArrayPredicate<unknown> & import("ow").BasePredicate<unknown[] | undefined>;
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
     * All `HttpCrawlerOptions` parameters are passed via an options object.
     */
    constructor(options?: HttpCrawlerOptions<Context>, config?: Configuration);
    /**
     * **EXPERIMENTAL**
     * Function for attaching CrawlerExtensions such as the Unblockers.
     * @param extension Crawler extension that overrides the crawler configuration.
     */
    use(extension: CrawlerExtension): void;
    /**
     * Wrapper around requestHandler that opens and closes pages etc.
     */
    protected _runRequestHandler(crawlingContext: Context): Promise<void>;
    protected _handleNavigation(crawlingContext: Context): Promise<void>;
    /**
     * Sets the cookie header to `gotOptions` based on the provided request and session headers, as well as any changes that occurred due to hooks.
     */
    protected _applyCookies({ session, request }: CrawlingContext, gotOptions: OptionsInit, preHookCookies: string, postHookCookies: string): void;
    /**
     * Function to make the HTTP request. It performs optimizations
     * on the request such as only downloading the request body if the
     * received content type matches text/html, application/xml, application/xhtml+xml.
     */
    protected _requestFunction({ request, session, proxyUrl, gotOptions }: RequestFunctionOptions): Promise<IncomingMessage>;
    /**
     * Encodes and parses response according to the provided content type
     */
    protected _parseResponse(request: Request, responseStream: IncomingMessage, crawlingContext: Context): Promise<(Partial<Context> & {
        isXml: boolean;
        response: IncomingMessage;
        contentType: {
            type: string;
            encoding: BufferEncoding;
        };
    }) | {
        body: Buffer;
        response: IncomingMessage;
        contentType: {
            type: string;
            encoding: BufferEncoding;
        };
        enqueueLinks: () => Promise<{
            processedRequests: never[];
            unprocessedRequests: never[];
        }>;
    }>;
    protected _parseHTML(response: IncomingMessage, _isXml: boolean, _crawlingContext: Context): Promise<Partial<Context>>;
    /**
     * Combines the provided `requestOptions` with mandatory (non-overridable) values.
     */
    protected _getRequestOptions(request: Request, session?: Session, proxyUrl?: string, gotOptions?: OptionsInit): OptionsInit & {
        isStream: true;
    };
    protected _encodeResponse(request: Request, response: IncomingMessage, encoding: BufferEncoding): {
        encoding: BufferEncoding;
        response: IncomingMessage;
    };
    /**
     * Checks and extends supported mime types
     */
    protected _extendSupportedMimeTypes(additionalMimeTypes: (string | RequestLike | ResponseLike)[]): void;
    /**
     * Handles timeout request
     */
    protected _handleRequestTimeout(session?: Session): void;
    private _abortDownloadOfBody;
    /**
     * @internal wraps public utility for mocking purposes
     */
    private _requestAsBrowser;
}
interface RequestFunctionOptions {
    request: Request;
    session?: Session;
    proxyUrl?: string;
    gotOptions: OptionsInit;
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
export declare function createHttpRouter<Context extends HttpCrawlingContext = HttpCrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, UserData>): import("@crawlee/basic").RouterHandler<Context>;
export {};
//# sourceMappingURL=http-crawler.d.ts.map