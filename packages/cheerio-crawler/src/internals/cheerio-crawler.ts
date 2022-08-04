import { addTimeoutToPromise, tryCancel } from '@apify/timeout';
import { concatStreamToBuffer, readStreamToString } from '@apify/utilities';
import type { BasicCrawlerOptions, ErrorHandler, RequestHandler } from '@crawlee/basic';
import { HttpCrawler } from '@crawlee/http';
import type { CrawlingContext, EnqueueLinksOptions, ProxyConfiguration, Request, RequestQueue } from '@crawlee/core';
import { enqueueLinks, Router, resolveBaseUrlForEnqueueLinksFiltering, Configuration } from '@crawlee/core';
import type { BatchAddRequestsResult, Awaitable, Dictionary } from '@crawlee/types';
import type { CheerioRoot } from '@crawlee/utils';
import { parseContentTypeFromResponse } from '@crawlee/utils';
import type { CheerioOptions } from 'cheerio';
import * as cheerio from 'cheerio';
import type { RequestLike, ResponseLike } from 'content-type';
import contentTypeParser from 'content-type';
import type { OptionsInit, Response as GotResponse, GotOptionsInit } from 'got-scraping';
import { DomHandler } from 'htmlparser2';
import { WritableStream } from 'htmlparser2/lib/WritableStream';
import type { IncomingMessage } from 'http';
import util from 'util';

export type CheerioErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > = ErrorHandler<CheerioCrawlingContext<UserData, JSONData>>;

export interface CheerioCrawlerOptions<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > extends Omit<BasicCrawlerOptions<CheerioCrawlingContext<UserData, JSONData>>,
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
    requestHandler?: CheerioRequestHandler<UserData, JSONData>;

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
    handlePageFunction?: CheerioRequestHandler<UserData, JSONData>;

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
    errorHandler?: CheerioErrorHandler<UserData, JSONData>;

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
    failedRequestHandler?: CheerioErrorHandler<UserData, JSONData>;

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
    handleFailedRequestFunction?: CheerioErrorHandler<UserData, JSONData>;

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
    preNavigationHooks?: CheerioHook<UserData, JSONData>[];

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
    postNavigationHooks?: CheerioHook<UserData, JSONData>[];

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

export type CheerioHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > = (
    crawlingContext: CheerioCrawlingContext<UserData, JSONData>,
    gotOptions: OptionsInit,
) => Awaitable<void>;

export interface CheerioCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > extends CrawlingContext<UserData> {
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

export type CheerioRequestHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > = RequestHandler<CheerioCrawlingContext<UserData, JSONData>>;
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
export class CheerioCrawler extends HttpCrawler<CheerioCrawlingContext> {
    protected override preNavigationHooks: CheerioHook[];
    protected override postNavigationHooks: CheerioHook[];

    /**
     * All `CheerioCrawler` parameters are passed via an options object.
     */
    constructor(options: CheerioCrawlerOptions = {}, override readonly config = Configuration.getGlobalConfig()) {
        super(options, config);
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

            // It's not a JSON, so it's probably some text. Get the first 100 chars of it.
            throw new Error(`${statusCode} - Internal Server Error: ${body.substr(0, 100)}`);
        } else if (HTML_AND_XML_MIME_TYPES.includes(type)) {
            const dom = await this._parseHtmlToDom(response);
            return ({ dom, isXml: type.includes('xml'), response, contentType });
        } else {
            const body = await concatStreamToBuffer(response);
            return { body, response, contentType };
        }
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
