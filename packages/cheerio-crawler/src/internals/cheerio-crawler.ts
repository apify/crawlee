import { addTimeoutToPromise, tryCancel } from '@apify/timeout';
import { concatStreamToBuffer, readStreamToString } from '@apify/utilities';
import type { BasicCrawlerOptions, ErrorHandler, RequestHandler } from '@crawlee/basic';
import { BasicCrawler, BASIC_CRAWLER_TIMEOUT_BUFFER_SECS } from '@crawlee/basic';
import type { CrawlingContext, EnqueueLinksOptions, ProxyConfiguration, Request, RequestQueue, Session } from '@crawlee/core';
import { CrawlerExtension, enqueueLinks, mergeCookies, Router, resolveBaseUrlForEnqueueLinksFiltering, validators } from '@crawlee/core';
import type { BatchAddRequestsResult, Awaitable, Dictionary } from '@crawlee/types';
import type { CheerioRoot } from '@crawlee/utils';
import { entries, parseContentTypeFromResponse } from '@crawlee/utils';
import type { CheerioOptions } from 'cheerio';
import * as cheerio from 'cheerio';
import type { RequestLike, ResponseLike } from 'content-type';
import contentTypeParser from 'content-type';
import type { OptionsInit, Method, Request as GotRequest, Response as GotResponse, GotOptionsInit } from 'got-scraping';
import { gotScraping, TimeoutError } from 'got-scraping';
import { DomHandler } from 'htmlparser2';
import { WritableStream } from 'htmlparser2/lib/WritableStream';
import type { IncomingHttpHeaders, IncomingMessage } from 'http';
import iconv from 'iconv-lite';
import ow from 'ow';
import util from 'util';

/**
 * Default mime types, which CheerioScraper supports.
 */
const HTML_AND_XML_MIME_TYPES = ['text/html', 'text/xml', 'application/xhtml+xml', 'application/xml'];
const APPLICATION_JSON_MIME_TYPE = 'application/json';
const CHEERIO_OPTIMIZED_AUTOSCALED_POOL_OPTIONS = {
    snapshotterOptions: {
        eventLoopSnapshotIntervalSecs: 2,
        maxBlockedMillis: 100,
    },
    systemStatusOptions: {
        maxEventLoopOverloadedRatio: 0.7,
    },
};

export type CheerioErrorHandler<JSONData = Dictionary> = ErrorHandler<CheerioCrawlingContext<JSONData>>;

export interface CheerioCrawlerOptions<JSONData = Dictionary> extends Omit<BasicCrawlerOptions<CheerioCrawlingContext<JSONData>>,
    // Overridden with cheerio context
    | 'requestHandler'
    | 'handleRequestFunction'

    | 'failedRequestHandler'
    | 'handleFailedRequestFunction'
    | 'handleRequestTimeoutSecs'

    | 'errorHandler'
> {
    /**
     * User-provided function that performs the logic of the crawler. It is called for each page
     * loaded and parsed by the crawler.
     *
     * The function receives the {@link CheerioCrawlingContext} as an argument,
     * where the {@link CheerioCrawlingContext.request} instance represents the URL to crawl.
     *
     * Type of {@link CheerioCrawlingContext.body} depends on the `Content-Type` header of the web page:
     * - String for `text/html`, `application/xhtml+xml`, `application/xml` MIME content types
     * - Buffer for others MIME content types
     *
     * Parsed `Content-Type` header using
     * [content-type package](https://www.npmjs.com/package/content-type)
     * is stored in {@link CheerioCrawlingContext.contentType}`.
     *
     * Cheerio is available only for HTML and XML content types.
     *
     * If the function returns, the returned promise is awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     * If all the retries fail, the crawler calls the function
     * provided to the `failedRequestHandler` parameter.
     * To make this work, you should **always**
     * let your function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@link Request.pushErrorMessage} function.
     */
    requestHandler?: CheerioRequestHandler<JSONData>;

    /**
     * User-provided function that performs the logic of the crawler. It is called for each page
     * loaded and parsed by the crawler.
     *
     * The function receives the {@link CheerioCrawlingContext} as an argument,
     * where the {@link CheerioCrawlingContext.request} instance represents the URL to crawl.
     *
     * Type of {@link CheerioCrawlingContext.body} depends on the `Content-Type` header of the web page:
     * - String for `text/html`, `application/xhtml+xml`, `application/xml` MIME content types
     * - Buffer for others MIME content types
     *
     * Parsed `Content-Type` header using
     * [content-type package](https://www.npmjs.com/package/content-type)
     * is stored in {@link CheerioCrawlingContext.contentType}`.
     *
     * Cheerio is available only for HTML and XML content types.
     *
     * If the function returns, the returned promise is awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     * If all the retries fail, the crawler calls the function
     * provided to the `failedRequestHandler` parameter.
     * To make this work, you should **always**
     * let your function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@link Request.pushErrorMessage} function.
     *
     * @deprecated `handlePageFunction` has been renamed to `requestHandler` and will be removed in a future version.
     * @ignore
     */
    handlePageFunction?: CheerioRequestHandler<JSONData>;

    /**
     * Timeout in which the HTTP request to the resource needs to finish, given in seconds.
     */
    navigationTimeoutSecs?: number;

    /**
     * If set to true, SSL certificate errors will be ignored.
     */
    ignoreSslErrors?: boolean;

    /**
     * If set, `CheerioCrawler` will be configured for all connections to use
     * [Apify Proxy](https://console.apify.com/proxy) or your own Proxy URLs provided and rotated according to the configuration.
     * For more information, see the [documentation](https://docs.apify.com/proxy).
     */
    proxyConfiguration?: ProxyConfiguration;

    /**
     * User-provided function that allows modifying the request object before it gets retried by the crawler.
     * It's executed before each retry for the requests that failed less than `option.maxRequestRetries` times.
     *
     * The function receives the {@link CheerioCrawlingContext} as the first argument,
     * where the {@link CheerioCrawlingContext.request} corresponds to the request to be retried.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    errorHandler?: CheerioErrorHandler<JSONData>;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the {@link CheerioCrawlingContext} as the first argument,
     * where the {@link CheerioCrawlingContext.request} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     *
     * See [source code](https://github.com/apify/crawlee/blob/master/src/crawlers/cheerio_crawler.js#L13)
     * for the default implementation of this function.
     */
    failedRequestHandler?: CheerioErrorHandler<JSONData>;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the {@link CheerioCrawlingContext} as the first argument,
     * where the {@link CheerioCrawlingContext.request} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     *
     * See [source code](https://github.com/apify/crawlee/blob/master/src/crawlers/cheerio_crawler.js#L13)
     * for the default implementation of this function.
     *
     * @deprecated `handleFailedRequestFunction` has been renamed to `failedRequestHandler` and will be removed in a future version.
     * @ignore
     */
    handleFailedRequestFunction?: CheerioErrorHandler<JSONData>;

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
     */
    preNavigationHooks?: CheerioHook<JSONData>[];

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
    postNavigationHooks?: CheerioHook<JSONData>[];

    /**
     * An array of [MIME types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types)
     * you want the crawler to load and process. By default, only `text/html` and `application/xhtml+xml` MIME types are supported.
     */
    additionalMimeTypes?: string[];

    /**
     * By default `CheerioCrawler` will extract correct encoding from the HTTP response headers.
     * Sadly, there are some websites which use invalid headers. Those are encoded using the UTF-8 encoding.
     * If those sites actually use a different encoding, the response will be corrupted. You can use
     * `suggestResponseEncoding` to fall back to a certain encoding, if you know that your target website uses it.
     * To force a certain encoding, disregarding the response headers, use {@link CheerioCrawlerOptions.forceResponseEncoding}
     * ```
     * // Will fall back to windows-1250 encoding if none found
     * suggestResponseEncoding: 'windows-1250'
     * ```
     */
    suggestResponseEncoding?: string;

    /**
     * By default `CheerioCrawler` will extract correct encoding from the HTTP response headers. Use `forceResponseEncoding`
     * to force a certain encoding, disregarding the response headers.
     * To only provide a default for missing encodings, use {@link CheerioCrawlerOptions.suggestResponseEncoding}
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

export type CheerioHook<JSONData = Dictionary> = (
    crawlingContext: CheerioCrawlingContext<JSONData>,
    gotOptions: OptionsInit,
) => Awaitable<void>;

export interface CheerioCrawlingContext<JSONData extends Dictionary = Dictionary> extends CrawlingContext<JSONData> {
    /**
     * The [Cheerio](https://cheerio.js.org/) object with parsed HTML.
     */
    $: CheerioRoot;

    /**
     * The request body of the web page.
     */
    body: (string | Buffer);

    /**
     * The parsed object from JSON string if the response contains the content type application/json.
     */
    json: JSONData;

    /**
     * Parsed `Content-Type header: { type, encoding }`.
     */
    contentType: { type: string; encoding: string };
    crawler: CheerioCrawler;
    response: IncomingMessage;
    enqueueLinks: (options?: CheerioCrawlerEnqueueLinksOptions) => Promise<BatchAddRequestsResult>;
    sendRequest: (overrideOptions?: Partial<GotOptionsInit>) => Promise<GotResponse<string>>;
}

export type CheerioRequestHandler<JSONData = Dictionary> = RequestHandler<CheerioCrawlingContext<JSONData>>;
export interface CheerioCrawlerEnqueueLinksOptions extends Omit<EnqueueLinksOptions, 'urls' | 'requestQueue'> {}

/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests and
 * [cheerio](https://www.npmjs.com/package/cheerio) HTML parser.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `CheerioCrawler` uses raw HTTP requests to download web pages,
 * it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
 * to display the content, you might need to use {@link PuppeteerCrawler} or {@link PlaywrightCrawler} instead,
 * because it loads the pages using full-featured headless Chrome browser.
 *
 * `CheerioCrawler` downloads each URL using a plain HTTP request,
 * parses the HTML content using [Cheerio](https://www.npmjs.com/package/cheerio)
 * and then invokes the user-provided {@link CheerioCrawlerOptions.requestHandler} to extract page data
 * using a [jQuery](https://jquery.com/)-like interface to the parsed HTML DOM.
 *
 * The source URLs are represented using {@link Request} objects that are fed from
 * {@link RequestList} or {@link RequestQueue} instances provided by the {@link CheerioCrawlerOptions.requestList}
 * or {@link CheerioCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@link CheerioCrawlerOptions.requestList} and {@link CheerioCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * We can use the `preNavigationHooks` to adjust `gotOptions`:
 *
 * ```
 * preNavigationHooks: [
 *     (crawlingContext, gotOptions) => {
 *         // ...
 *     },
 * ]
 * ```
 *
 * By default, `CheerioCrawler` only processes web pages with the `text/html`
 * and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@link CheerioCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For details, see {@link CheerioCrawlerOptions.requestHandler}.
 *
 * New requests are only dispatched when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the `autoscaledPoolOptions`
 * parameter of the `CheerioCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPool} options are available directly in the `CheerioCrawler` constructor.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Prepare a list of URLs to crawl
 * const requestList = await RequestList.open(null, [
 *     { url: 'http://www.example.com/page-1' },
 *     { url: 'http://www.example.com/page-2' },
 * ]);
 *
 * // Crawl the URLs
 * const crawler = new CheerioCrawler({
 *     requestList,
 *     async requestHandler({ request, response, body, contentType, $ }) {
 *         const data = [];
 *
 *         // Do some data extraction from the page with Cheerio.
 *         $('.some-collection').each((index, el) => {
 *             data.push({ title: $(el).find('.some-title').text() });
 *         });
 *
 *         // Save the data to dataset.
 *         await Dataset.pushData({
 *             url: request.url,
 *             html: body,
 *             data,
 *         })
 *     },
 * });
 *
 * await crawler.run();
 * ```
 * @category Crawlers
 */
export class CheerioCrawler extends BasicCrawler<CheerioCrawlingContext> {
    /**
     * A reference to the underlying {@link ProxyConfiguration} class that manages the crawler's proxies.
     * Only available if used by the crawler.
     */
    proxyConfiguration?: ProxyConfiguration;

    protected userRequestHandlerTimeoutMillis: number;
    protected preNavigationHooks: CheerioHook[];
    protected postNavigationHooks: CheerioHook[];
    protected persistCookiesPerSession: boolean;
    protected navigationTimeoutMillis: number;
    protected ignoreSslErrors: boolean;
    protected suggestResponseEncoding?: string;
    protected forceResponseEncoding?: string;
    protected readonly supportedMimeTypes: Set<string>;

    protected static override optionsShape = {
        ...BasicCrawler.optionsShape,
        handlePageFunction: ow.optional.function,

        navigationTimeoutSecs: ow.optional.number,
        ignoreSslErrors: ow.optional.boolean,
        additionalMimeTypes: ow.optional.array.ofType(ow.string),
        suggestResponseEncoding: ow.optional.string,
        forceResponseEncoding: ow.optional.string,
        proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),
        persistCookiesPerSession: ow.optional.boolean,

        preNavigationHooks: ow.optional.array,
        postNavigationHooks: ow.optional.array,
    };

    /**
     * All `CheerioCrawler` parameters are passed via an options object.
     */
    constructor(options: CheerioCrawlerOptions = {}) {
        ow(options, 'CheerioCrawlerOptions', ow.object.exactShape(CheerioCrawler.optionsShape));

        const {
            requestHandler,
            handlePageFunction,

            requestHandlerTimeoutSecs = 60,
            navigationTimeoutSecs = 30,
            ignoreSslErrors = true,
            additionalMimeTypes = [],
            suggestResponseEncoding,
            forceResponseEncoding,
            proxyConfiguration,
            persistCookiesPerSession,
            preNavigationHooks = [],
            postNavigationHooks = [],

            // Ignored
            handleRequestFunction,

            // BasicCrawler
            autoscaledPoolOptions = CHEERIO_OPTIMIZED_AUTOSCALED_POOL_OPTIONS,
            ...basicCrawlerOptions
        } = options;

        super({
            ...basicCrawlerOptions,
            // Will be overridden below
            requestHandler,
            autoscaledPoolOptions,
            // We need to add some time for internal functions to finish,
            // but not too much so that we would stall the crawler.
            requestHandlerTimeoutSecs: navigationTimeoutSecs + requestHandlerTimeoutSecs + BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
        });

        this._handlePropertyNameChange({
            newName: 'requestHandler',
            oldName: 'handlePageFunction',
            propertyKey: 'requestHandler',
            newProperty: requestHandler,
            oldProperty: handlePageFunction,
            allowUndefined: true,
        });

        if (!this.requestHandler) {
            this.requestHandler = this.router;
        }

        // Cookies should be persisted per session only if session pool is used
        if (!this.useSessionPool && persistCookiesPerSession) {
            throw new Error('You cannot use "persistCookiesPerSession" without "useSessionPool" set to true.');
        }

        this.supportedMimeTypes = new Set([...HTML_AND_XML_MIME_TYPES, APPLICATION_JSON_MIME_TYPE]);
        if (additionalMimeTypes.length) this._extendSupportedMimeTypes(additionalMimeTypes);

        if (suggestResponseEncoding && forceResponseEncoding) {
            this.log.warning('Both forceResponseEncoding and suggestResponseEncoding options are set. Using forceResponseEncoding.');
        }

        this.userRequestHandlerTimeoutMillis = requestHandlerTimeoutSecs * 1000;
        this.navigationTimeoutMillis = navigationTimeoutSecs * 1000;
        this.ignoreSslErrors = ignoreSslErrors;
        this.suggestResponseEncoding = suggestResponseEncoding;
        this.forceResponseEncoding = forceResponseEncoding;
        this.proxyConfiguration = proxyConfiguration;
        this.preNavigationHooks = preNavigationHooks;
        this.postNavigationHooks = [
            ({ request, response }) => this._abortDownloadOfBody(request, response!),
            ...postNavigationHooks,
        ];

        if (this.useSessionPool) {
            this.persistCookiesPerSession = persistCookiesPerSession ?? true;
        } else {
            this.persistCookiesPerSession = false;
        }
    }

    /**
     * **EXPERIMENTAL**
     * Function for attaching CrawlerExtensions such as the Unblockers.
     * @param extension Crawler extension that overrides the crawler configuration.
     */
    use(extension: CrawlerExtension) {
        ow(extension, ow.object.instanceOf(CrawlerExtension));

        const extensionOptions = extension.getCrawlerOptions();

        for (const [key, value] of entries(extensionOptions)) {
            const isConfigurable = this.hasOwnProperty(key);
            const originalType = typeof this[key as keyof this];
            const extensionType = typeof value; // What if we want to null something? It is really needed?
            const isSameType = originalType === extensionType || value == null; // fast track for deleting keys
            const exists = this[key as keyof this] != null;

            if (!isConfigurable) { // Test if the property can be configured on the crawler
                throw new Error(`${extension.name} tries to set property "${key}" that is not configurable on CheerioCrawler instance.`);
            }

            if (!isSameType && exists) { // Assuming that extensions will only add up configuration
                throw new Error(
                    `${extension.name} tries to set property of different type "${extensionType}". "CheerioCrawler.${key}: ${originalType}".`,
                );
            }

            this.log.warning(`${extension.name} is overriding "CheerioCrawler.${key}: ${originalType}" with ${value}.`);

            this[key as keyof this] = value as this[keyof this];
        }
    }

    /**
     * Wrapper around requestHandler that opens and closes pages etc.
     */
    protected override async _runRequestHandler(crawlingContext: CheerioCrawlingContext) {
        const { request, session } = crawlingContext;

        if (this.proxyConfiguration) {
            const sessionId = session ? session.id : undefined;
            crawlingContext.proxyInfo = await this.proxyConfiguration.newProxyInfo(sessionId);
        }
        if (!request.skipNavigation) {
            await this._handleNavigation(crawlingContext);
            tryCancel();

            const { dom, isXml, body, contentType, response } = await this._parseResponse(request, crawlingContext.response!);
            tryCancel();

            if (this.useSessionPool) {
                this._throwOnBlockedRequest(session!, response.statusCode!);
            }

            if (this.persistCookiesPerSession) {
                session!.setCookiesFromResponse(response);
            }

            request.loadedUrl = response.url;

            const $ = dom
                ? cheerio.load(dom as string, {
                    xmlMode: isXml,
                    // Recent versions of cheerio use parse5 as the HTML parser/serializer. It's more strict than htmlparser2
                    // and not good for scraping. It also does not have a great streaming interface.
                    // Here we tell cheerio to use htmlparser2 for serialization, otherwise the conflict produces weird errors.
                    _useHtmlParser2: true,
                } as CheerioOptions)
                : null;

            crawlingContext.$ = $!;
            crawlingContext.contentType = contentType;
            crawlingContext.response = response;
            crawlingContext.enqueueLinks = async (enqueueOptions) => {
                return cheerioCrawlerEnqueueLinks({
                    options: enqueueOptions,
                    $,
                    requestQueue: await this.getRequestQueue(),
                    originalRequestUrl: crawlingContext.request.url,
                    finalRequestUrl: crawlingContext.request.loadedUrl,
                });
            };

            Object.defineProperty(crawlingContext, 'json', {
                get() {
                    if (contentType.type !== APPLICATION_JSON_MIME_TYPE) return null;
                    const jsonString = body!.toString(contentType.encoding);
                    return JSON.parse(jsonString);
                },
            });

            Object.defineProperty(crawlingContext, 'body', {
                get() {
                // NOTE: For XML/HTML documents, we don't store the original body and only reconstruct it from Cheerio's DOM.
                // This is to save memory for high-concurrency crawls. The downside is that changes
                // made to DOM are reflected in the HTML, but we can live with that...
                    if (dom) {
                        return isXml ? $!.xml() : $!.html({ decodeEntities: false });
                    }
                    return body;
                },
            });
        }

        return addTimeoutToPromise(
            () => Promise.resolve(this.requestHandler(crawlingContext)),
            this.userRequestHandlerTimeoutMillis,
            `requestHandler timed out after ${this.userRequestHandlerTimeoutMillis / 1000} seconds.`,
        );
    }

    protected async _handleNavigation(crawlingContext: CheerioCrawlingContext) {
        const gotOptions = {} as OptionsInit;
        const { request, session } = crawlingContext;
        const preNavigationHooksCookies = this._getCookieHeaderFromRequest(request);

        // Execute pre navigation hooks before applying session pool cookies,
        // as they may also set cookies in the session
        await this._executeHooks(this.preNavigationHooks, crawlingContext, gotOptions);
        tryCancel();

        const postNavigationHooksCookies = this._getCookieHeaderFromRequest(request);

        this._applyCookies(crawlingContext, gotOptions, preNavigationHooksCookies, postNavigationHooksCookies);

        const proxyUrl = crawlingContext.proxyInfo?.url;

        crawlingContext.response = await addTimeoutToPromise(
            () => this._requestFunction({ request, session, proxyUrl, gotOptions }),
            this.navigationTimeoutMillis,
            `request timed out after ${this.navigationTimeoutMillis / 1000} seconds.`,
        );
        tryCancel();

        await this._executeHooks(this.postNavigationHooks, crawlingContext, gotOptions);
        tryCancel();
    }

    /**
     * Sets the cookie header to `gotOptions` based on the provided request and session headers, as well as any changes that occurred due to hooks.
     */
    private _applyCookies({ session, request }: CrawlingContext, gotOptions: OptionsInit, preHookCookies: string, postHookCookies: string) {
        const sessionCookie = session?.getCookieString(request.url) ?? '';
        let alteredGotOptionsCookies = (gotOptions.headers?.Cookie || gotOptions.headers?.cookie || '');

        if (gotOptions.headers?.Cookie && gotOptions.headers?.cookie) {
            const {
                Cookie: upperCaseHeader,
                cookie: lowerCaseHeader,
            } = gotOptions.headers;

            // eslint-disable-next-line max-len
            this.log.warning(`Encountered mixed casing for the cookie headers in the got options for request ${request.url} (${request.id}). Their values will be merged`);

            const sourceCookies = [];

            if (Array.isArray(lowerCaseHeader)) {
                sourceCookies.push(...lowerCaseHeader);
            } else {
                sourceCookies.push(lowerCaseHeader);
            }

            if (Array.isArray(upperCaseHeader)) {
                sourceCookies.push(...upperCaseHeader);
            } else {
                sourceCookies.push(upperCaseHeader);
            }

            alteredGotOptionsCookies = mergeCookies(request.url, sourceCookies);
        }

        const sourceCookies = [
            sessionCookie,
            preHookCookies,
        ];

        if (Array.isArray(alteredGotOptionsCookies)) {
            sourceCookies.push(...alteredGotOptionsCookies);
        } else {
            sourceCookies.push(alteredGotOptionsCookies);
        }

        sourceCookies.push(postHookCookies);

        const mergedCookie = mergeCookies(request.url, sourceCookies);

        gotOptions.headers ??= {};
        Reflect.deleteProperty(gotOptions.headers, 'Cookie');
        Reflect.deleteProperty(gotOptions.headers, 'cookie');
        gotOptions.headers.Cookie = mergedCookie;
    }

    /**
     * Function to make the HTTP request. It performs optimizations
     * on the request such as only downloading the request body if the
     * received content type matches text/html, application/xml, application/xhtml+xml.
     */
    protected async _requestFunction({ request, session, proxyUrl, gotOptions }: RequestFunctionOptions): Promise<IncomingMessage> {
        const opts = this._getRequestOptions(request, session, proxyUrl, gotOptions);

        try {
            return await this._requestAsBrowser(opts);
        } catch (e) {
            if (e instanceof TimeoutError) {
                this._handleRequestTimeout(session);
                return undefined as unknown as IncomingMessage;
            }

            throw e;
        }
    }

    /**
     * Encodes and parses response according to the provided content type
     */
    protected async _parseResponse(request: Request, responseStream: IncomingMessage) {
        const { statusCode } = responseStream;
        const { type, charset } = parseContentTypeFromResponse(responseStream);
        const { response, encoding } = this._encodeResponse(request, responseStream, charset);
        const contentType = { type, encoding };

        if (statusCode! >= 500) {
            const body = await readStreamToString(response, encoding);

            // Errors are often sent as JSON, so attempt to parse them,
            // despite Accept header being set to text/html.
            if (type === APPLICATION_JSON_MIME_TYPE) {
                const errorResponse = JSON.parse(body);
                let { message } = errorResponse;
                if (!message) message = util.inspect(errorResponse, { depth: 1, maxArrayLength: 10 });
                throw new Error(`${statusCode} - ${message}`);
            }

            // It's not a JSON so it's probably some text. Get the first 100 chars of it.
            throw new Error(`${statusCode} - Internal Server Error: ${body.substr(0, 100)}`);
        } else if (HTML_AND_XML_MIME_TYPES.includes(type)) {
            const dom = await this._parseHtmlToDom(response);
            return ({ dom, isXml: type.includes('xml'), response, contentType });
        } else {
            const body = await concatStreamToBuffer(response);
            return { body, response, contentType };
        }
    }

    /**
     * Combines the provided `requestOptions` with mandatory (non-overridable) values.
     */
    protected _getRequestOptions(request: Request, session?: Session, proxyUrl?: string, gotOptions?: OptionsInit) {
        const requestOptions: OptionsInit & { isStream: true } = {
            url: request.url,
            method: request.method as Method,
            proxyUrl,
            timeout: { request: this.navigationTimeoutMillis },
            sessionToken: session,
            ...gotOptions,
            headers: { ...request.headers, ...gotOptions?.headers },
            https: {
                ...gotOptions?.https,
                rejectUnauthorized: !this.ignoreSslErrors,
            },
            isStream: true,
        };

        // Delete any possible lowercased header for cookie as they are merged in _applyCookies under the uppercase Cookie header
        Reflect.deleteProperty(requestOptions.headers!, 'cookie');

        // TODO this is incorrect, the check for man in the middle needs to be done
        //   on individual proxy level, not on the `proxyConfiguration` level,
        //   because users can use normal + MITM proxies in a single configuration.
        // Disable SSL verification for MITM proxies
        if (this.proxyConfiguration && this.proxyConfiguration.isManInTheMiddle) {
            requestOptions.https = {
                ...requestOptions.https,
                rejectUnauthorized: false,
            };
        }

        if (/PATCH|POST|PUT/.test(request.method)) requestOptions.body = request.payload;

        return requestOptions;
    }

    protected _encodeResponse(request: Request, response: IncomingMessage, encoding: BufferEncoding): {
        encoding: BufferEncoding;
        response: IncomingMessage;
    } {
        if (this.forceResponseEncoding) {
            encoding = this.forceResponseEncoding as BufferEncoding;
        } else if (!encoding && this.suggestResponseEncoding) {
            encoding = this.suggestResponseEncoding as BufferEncoding;
        }

        // Fall back to utf-8 if we still don't have encoding.
        const utf8 = 'utf8';
        if (!encoding) return { response, encoding: utf8 };

        // This means that the encoding is one of Node.js supported
        // encodings and we don't need to re-encode it.
        if (Buffer.isEncoding(encoding)) return { response, encoding };

        // Try to re-encode a variety of unsupported encodings to utf-8
        if (iconv.encodingExists(encoding)) {
            const encodeStream = iconv.encodeStream(utf8);
            const decodeStream = iconv.decodeStream(encoding).on('error', (err) => encodeStream.emit('error', err));
            response.on('error', (err: Error) => decodeStream.emit('error', err));
            const encodedResponse = response.pipe(decodeStream).pipe(encodeStream) as NodeJS.ReadWriteStream & {
                statusCode?: number;
                headers: IncomingHttpHeaders;
                url?: string;
            };
            encodedResponse.statusCode = response.statusCode;
            encodedResponse.headers = response.headers;
            encodedResponse.url = response.url;
            return {
                response: encodedResponse as any,
                encoding: utf8,
            };
        }

        throw new Error(`Resource ${request.url} served with unsupported charset/encoding: ${encoding}`);
    }

    protected async _parseHtmlToDom(response: IncomingMessage) {
        return new Promise((resolve, reject) => {
            const domHandler = new DomHandler((err, dom) => {
                if (err) reject(err);
                else resolve(dom);
            });
            const parser = new WritableStream(domHandler, { decodeEntities: true });
            parser.on('error', reject);
            response
                .on('error', reject)
                .pipe(parser);
        });
    }

    /**
     * Checks and extends supported mime types
     */
    protected _extendSupportedMimeTypes(additionalMimeTypes: (string | RequestLike | ResponseLike)[]) {
        additionalMimeTypes.forEach((mimeType) => {
            try {
                const parsedType = contentTypeParser.parse(mimeType);
                this.supportedMimeTypes.add(parsedType.type);
            } catch (err) {
                throw new Error(`Can not parse mime type ${mimeType} from "options.additionalMimeTypes".`);
            }
        });
    }

    /**
     * Handles timeout request
     */
    protected _handleRequestTimeout(session?: Session) {
        session?.markBad();
        throw new Error(`request timed out after ${this.requestHandlerTimeoutMillis / 1000} seconds.`);
    }

    private _abortDownloadOfBody(request: Request, response: IncomingMessage) {
        const { statusCode } = response;
        const { type } = parseContentTypeFromResponse(response);

        if (statusCode === 406) {
            request.noRetry = true;
            throw new Error(`Resource ${request.url} is not available in the format requested by the Accept header. Skipping resource.`);
        }

        if (!this.supportedMimeTypes.has(type) && statusCode! < 500) {
            request.noRetry = true;
            throw new Error(`Resource ${request.url} served Content-Type ${type}, `
                + `but only ${Array.from(this.supportedMimeTypes).join(', ')} are allowed. Skipping resource.`);
        }
    }

    /**
     * @internal wraps public utility for mocking purposes
     */
    private _requestAsBrowser = (options: OptionsInit & { isStream: true }) => {
        return new Promise<IncomingMessage>((resolve, reject) => {
            const stream = gotScraping(options);

            stream.on('error', reject);
            stream.on('response', () => {
                resolve(addResponsePropertiesToStream(stream));
            });
        });
    };
}

interface EnqueueLinksInternalOptions {
    options?: CheerioCrawlerEnqueueLinksOptions;
    $: CheerioRoot | null;
    requestQueue: RequestQueue;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}

/** @internal */
export async function cheerioCrawlerEnqueueLinks({ options, $, requestQueue, originalRequestUrl, finalRequestUrl }: EnqueueLinksInternalOptions) {
    if (!$) {
        throw new Error('Cannot enqueue links because the DOM is not available.');
    }

    const baseUrl = resolveBaseUrlForEnqueueLinksFiltering({
        enqueueStrategy: options?.strategy,
        finalRequestUrl,
        originalRequestUrl,
        userProvidedBaseUrl: options?.baseUrl,
    });

    const urls = extractUrlsFromCheerio($, options?.selector ?? 'a', options?.baseUrl ?? finalRequestUrl ?? originalRequestUrl);

    return enqueueLinks({
        requestQueue,
        urls,
        baseUrl,
        ...options,
    });
}

interface RequestFunctionOptions {
    request: Request;
    session?: Session;
    proxyUrl?: string;
    gotOptions: OptionsInit;
}

/**
 * Extracts URLs from a given Cheerio object.
 * @ignore
 */
function extractUrlsFromCheerio($: CheerioRoot, selector: string, baseUrl?: string): string[] {
    return $(selector)
        .map((_i, el) => $(el).attr('href'))
        .get()
        .filter((href) => !!href)
        .map((href) => {
            // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
            const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
            if (!isHrefAbsolute && !baseUrl) {
                throw new Error(`An extracted URL: ${href} is relative and options.baseUrl is not set. `
                    + 'Use options.baseUrl in enqueueLinks() to automatically resolve relative URLs.');
            }
            const tryAbsolute = () => {
                try {
                    return (new URL(href, baseUrl)).href;
                } catch {
                    return undefined;
                }
            };
            return baseUrl
                ? tryAbsolute()
                : href;
        })
        .filter((href) => !!href) as string[];
}

/**
 * The stream object returned from got does not have the below properties.
 * At the same time, you can't read data directly from the response stream,
 * because they won't get emitted unless you also read from the primary
 * got stream. To be able to work with only one stream, we move the expected props
 * from the response stream to the got stream.
 * @internal
 */
function addResponsePropertiesToStream(stream: GotRequest) {
    const properties = [
        'statusCode', 'statusMessage', 'headers',
        'complete', 'httpVersion', 'rawHeaders',
        'rawTrailers', 'trailers', 'url',
        'request',
    ];

    const response = stream.response!;

    response.on('end', () => {
        // @ts-expect-error
        Object.assign(stream.rawTrailers, response.rawTrailers);
        // @ts-expect-error
        Object.assign(stream.trailers, response.trailers);

        // @ts-expect-error
        stream.complete = response.complete;
    });

    for (const prop of properties) {
        if (!(prop in stream)) {
            // @ts-expect-error
            stream[prop] = response[prop as keyof IncomingMessage];
        }
    }

    return stream as unknown as IncomingMessage;
}

/**
 * Creates new {@link Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@link CheerioCrawler}.
 * Defaults to the {@link CheerioCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<CheerioCrawlingContext>()`.
 *
 * ```ts
 * import { CheerioCrawler, createCheerioRouter } from 'crawlee';
 *
 * const router = createCheerioRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new CheerioCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
export function createCheerioRouter<Context extends CheerioCrawlingContext = CheerioCrawlingContext>() {
    return Router.create<Context>();
}
