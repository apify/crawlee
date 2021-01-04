/* eslint-disable class-methods-use-this */
import { readStreamToString, concatStreamToBuffer } from 'apify-shared/streams_utilities';
import * as cheerio from 'cheerio';
import * as contentTypeParser from 'content-type';
import * as htmlparser from 'htmlparser2';
import { WritableStream } from 'htmlparser2/lib/WritableStream';
import * as iconv from 'iconv-lite';
import ow from 'ow';
import * as util from 'util';
import { TimeoutError } from '../errors';
import { addTimeoutToPromise, parseContentTypeFromResponse } from '../utils';
import * as utilsRequest from '../utils_request'; // eslint-disable-line import/no-duplicates
import BasicCrawler from './basic_crawler'; // eslint-disable-line import/no-duplicates
import CrawlerExtension from './crawler_extension';

// TYPE IMPORTS
/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { IncomingMessage } from 'http';
import AutoscaledPool, { AutoscaledPoolOptions } from '../autoscaling/autoscaled_pool';
import { HandleFailedRequest } from './basic_crawler';
import Request from '../request';
import { RequestList } from '../request_list';
import { ProxyConfiguration, ProxyInfo } from '../proxy_configuration';
import { RequestQueue } from '../storages/request_queue';
import { Session } from '../session_pool/session';
import { SessionPoolOptions } from '../session_pool/session_pool';
import { validators } from '../validators';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

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

/**
 * @typedef CheerioCrawlerOptions
 * @property {CheerioHandlePage} handlePageFunction
 *   User-provided function that performs the logic of the crawler. It is called for each page
 *   loaded and parsed by the crawler.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   // The Cheerio object's function with the parsed HTML.
 *   $: Cheerio,
 *
 *   // The request body of the web page, whose type depends on the content type.
 *   body: String|Buffer,
 *
 *   // The parsed object from JSON for responses with the "application/json" content types.
 *   // For other content types it's null.
 *   json: Object,
 *
 *   // Apify.Request object with details of the requested web page
 *   request: Request,
 *
 *   // Parsed Content-Type HTTP header: { type, encoding }
 *   contentType: Object,
 *
 *   // An instance of Node's http.IncomingMessage object,
 *   response: Object,
 *
 *   // Session object, useful to work around anti-scraping protections
 *   session: Session
 *
 *   // ProxyInfo object with information about currently used proxy
 *   proxyInfo: ProxyInfo
 *
 *   // The running cheerio crawler instance.
 *   crawler: CheerioCrawler
 * }
 * ```
 *
 *   Type of `body` depends on the `Content-Type` header of the web page:
 *   - String for `text/html`, `application/xhtml+xml`, `application/xml` MIME content types
 *   - Buffer for others MIME content types
 *
 *   Parsed `Content-Type` header using
 *   [content-type package](https://www.npmjs.com/package/content-type)
 *   is stored in `contentType`.
 *
 *   Cheerio is available only for HTML and XML content types.
 *
 *   With the {@link Request} object representing the URL to crawl.
 *
 *   If the function returns, the returned promise is awaited by the crawler.
 *
 *   If the function throws an exception, the crawler will try to re-crawl the
 *   request later, up to `option.maxRequestRetries` times.
 *   If all the retries fail, the crawler calls the function
 *   provided to the `handleFailedRequestFunction` parameter.
 *   To make this work, you should **always**
 *   let your function throw exceptions rather than catch them.
 *   The exceptions are logged to the request using the
 *   {@link Request#pushErrorMessage} function.
 * @property {RequestList} [requestList]
 *   Static list of URLs to be processed.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {RequestQueue} [requestQueue]
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {PrepareRequest} [prepareRequestFunction]
 *   A function that executes before the HTTP request is made to the target resource.
 *   This function is suitable for setting dynamic properties such as cookies to the {@link Request}.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request,
 *   session: Session,
 *   proxyInfo: ProxyInfo,
 *   crawler: CheerioCrawler,
 * }
 * ```
 *   where the {@link Request} instance corresponds to the initialized request
 *   and the {@link Session} instance corresponds to used session.
 *
 *   The function should modify the properties of the passed {@link Request} instance
 *   in place because there are already earlier references to it. Making a copy and returning it from
 *   this function is therefore not supported, because it would create inconsistencies where
 *   different parts of SDK would have access to a different {@link Request} instance.
 *
 * @property {PostResponse} [postResponseFunction]
 * A function that executes right after the HTTP request is made to the target resource and response is returned.
 * This function is suitable for overriding custom properties of response e.g. setting headers because of response parsing.
 *
 * **Example usage:**
 *
 * ```javascript
 *  const cheerioCrawlerOptions = {
 *      // ...
 *      postResponseFunction: ({ request, response }) => {
 *          if (request.userData.parseAsJSON) {
 *              response.headers['content-type'] = 'application/json; charset=utf-8';
 *          }
 *      }
 *  }
 * ```
 * The function receives the following object as an argument:
 * ```
 * {
 *   response: Object,
 *   request: Request,
 *   session: Session,
 *   proxyInfo: ProxyInfo,
 *   crawler: CheerioCrawler,
 * }
 * ```
 * The response is an instance of Node's http.IncomingMessage object.
 * @property {number} [handlePageTimeoutSecs=60]
 *   Timeout in which the function passed as `handlePageFunction` needs to finish, given in seconds.
 * @property {number} [requestTimeoutSecs=30]
 *   Timeout in which the HTTP request to the resource needs to finish, given in seconds.
 * @property {boolean} [ignoreSslErrors=true]
 *   If set to true, SSL certificate errors will be ignored.
 * @property {ProxyConfiguration} [proxyConfiguration]
 *   If set, `CheerioCrawler` will be configured for all connections to use
 *   [Apify Proxy](https://my.apify.com/proxy) or your own Proxy URLs provided and rotated according to the configuration.
 *   For more information, see the [documentation](https://docs.apify.com/proxy).
 * @property {HandleFailedRequest} [handleFailedRequestFunction]
 *   A function to handle requests that failed more than `option.maxRequestRetries` times.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   error: Error,
 *   request: Request,
 *   session: Session,
 *   $: Cheerio,
 *   body: String|Buffer,
 *   json: Object,
 *   contentType: Object,
 *   response: Object,
 *   proxyInfo: ProxyInfo,
 *   crawler: CheerioCrawler,
 * }
 * ```
 *   where the {@link Request} instance corresponds to the failed request, and the `Error` instance
 *   represents the last error thrown during processing of the request.
 *
 *   See [source code](https://github.com/apify/apify-js/blob/master/src/crawlers/cheerio_crawler.js#L13)
 *   for the default implementation of this function.
 * @property {string[]} [additionalMimeTypes]
 *   An array of <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types"
 *   target="_blank">MIME types</a> you want the crawler to load and process.
 *   By default, only `text/html` and `application/xhtml+xml` MIME types are supported.
 * @property {string} [suggestResponseEncoding]
 *   By default `CheerioCrawler` will extract correct encoding from the HTTP response headers.
 *   Sadly, there are some websites which use invalid headers. Those are encoded using the UTF-8 encoding.
 *   If those sites actually use a different encoding, the response will be corrupted. You can use
 *   `suggestResponseEncoding` to fall back to a certain encoding, if you know that your target website uses it.
 *   To force a certain encoding, disregarding the response headers, use {@link CheerioCrawlerOptions.forceResponseEncoding}
 *   ```
 *   // Will fall back to windows-1250 encoding if none found
 *   suggestResponseEncoding: 'windows-1250'
 *   ```
 * @property {string} [forceResponseEncoding]
 *   By default `CheerioCrawler` will extract correct encoding from the HTTP response headers. Use `forceResponseEncoding`
 *   to force a certain encoding, disregarding the response headers.
 *   To only provide a default for missing encodings, use {@link CheerioCrawlerOptions.suggestResponseEncoding}
 *   ```
 *   // Will force windows-1250 encoding even if headers say otherwise
 *   forceResponseEncoding: 'windows-1250'
 *   ```
 * @property {number} [maxRequestRetries=3]
 *   Indicates how many times the request is retried if either `requestFunction` or `handlePageFunction` fails.
 * @property {number} [maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @property {AutoscaledPoolOptions} [autoscaledPoolOptions]
 *   Custom options passed to the underlying {@link AutoscaledPool} constructor.
 *   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options
 *   are provided by `CheerioCrawler` and cannot be overridden. Reasonable {@link Snapshotter}
 *   and {@link SystemStatus} defaults are provided to account for the fact that `cheerio`
 *   parses HTML synchronously and therefore blocks the event loop.
 * @property {number} [minConcurrency=1]
 *   Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 *
 *   *WARNING:* If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
 *   If you're not sure, just keep the default value and the concurrency will scale up automatically.
 * @property {number} [maxConcurrency=1000]
 *   Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 * @property {boolean} [useSessionPool=false]
 *   If set to true Crawler will automatically use Session Pool. It will automatically retire sessions on 403, 401 and 429 status codes.
 *   It also marks Session as bad after a request timeout.
 * @property {SessionPoolOptions} [sessionPoolOptions]
 *   Custom options passed to the underlying {@link SessionPool} constructor.
 * @property {boolean} [persistCookiesPerSession]
 *   Automatically saves cookies to Session. Works only if Session Pool is used.
 *
 *   It parses cookie from response "set-cookie" header saves or updates cookies for session and once the session is used for next request.
 *   It passes the "Cookie" header to the request with the session cookies.
 */

/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests and
 * [cheerio](https://www.npmjs.com/package/cheerio) HTML parser.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `CheerioCrawler` uses raw HTTP requests to download web pages,
 * it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
 * to display the content, you might need to use {@link PuppeteerCrawler} instead,
 * because it loads the pages using full-featured headless Chrome browser.
 *
 * `CheerioCrawler` downloads each URL using a plain HTTP request,
 * parses the HTML content using [Cheerio](https://www.npmjs.com/package/cheerio)
 * and then invokes the user-provided {@link CheerioCrawlerOptions.handlePageFunction} to extract page data
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
 * `CheerioCrawler` downloads the web pages using the {@link utils#requestAsBrowser} utility function.
 *
 * By default, `CheerioCrawler` only processes web pages with the `text/html`
 * and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@link CheerioCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For details, see {@link CheerioCrawlerOptions.handlePageFunction}.
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
 * const requestList = new Apify.RequestList({
 *   sources: [
 *       { url: 'http://www.example.com/page-1' },
 *       { url: 'http://www.example.com/page-2' },
 *   ],
 * });
 * await requestList.initialize();
 *
 * // Crawl the URLs
 * const crawler = new Apify.CheerioCrawler({
 *     requestList,
 *     handlePageFunction: async ({ request, response, body, contentType, $ }) => {
 *         const data = [];
 *
 *         // Do some data extraction from the page with Cheerio.
 *         $('.some-collection').each((index, el) => {
 *             data.push({ title: $(el).find('.some-title').text() });
 *         });
 *
 *         // Save the data to dataset.
 *         await Apify.pushData({
 *             url: request.url,
 *             html: body,
 *             data,
 *         })
 *     },
 * });
 *
 * await crawler.run();
 * ```
 * @property {Statistics} stats
 *  Contains statistics about the current run.
 * @property {?RequestList} requestList
 *  A reference to the underlying {@link RequestList} class that manages the crawler's {@link Request}s.
 *  Only available if used by the crawler.
 * @property {?RequestQueue} requestQueue
 *  A reference to the underlying {@link RequestQueue} class that manages the crawler's {@link Request}s.
 *  Only available if used by the crawler.
 * @property {?SessionPool} sessionPool
 *  A reference to the underlying {@link SessionPool} class that manages the crawler's {@link Session}s.
 *  Only available if used by the crawler.
 * @property {?ProxyConfiguration} proxyConfiguration
 *  A reference to the underlying {@link ProxyConfiguration} class that manages the crawler's proxies.
 *  Only available if used by the crawler.
 * @property {AutoscaledPool} autoscaledPool
 *  A reference to the underlying {@link AutoscaledPool} class that manages the concurrency of the crawler.
 *  Note that this property is only initialized after calling the {@link CheerioCrawler#run} function.
 *  You can use it to change the concurrency settings on the fly,
 *  to pause the crawler by calling {@link AutoscaledPool#pause}
 *  or to abort it by calling {@link AutoscaledPool#abort}.
 */
class CheerioCrawler extends BasicCrawler {
    static optionsShape = {
        ...BasicCrawler.optionsShape,
        // TODO temporary until the API is unified in V2
        handleRequestFunction: ow.undefined,

        handlePageFunction: ow.function,
        requestTimeoutSecs: ow.optional.number,
        handlePageTimeoutSecs: ow.optional.number,
        ignoreSslErrors: ow.optional.boolean,
        additionalMimeTypes: ow.optional.array.ofType(ow.string),
        suggestResponseEncoding: ow.optional.string,
        forceResponseEncoding: ow.optional.string,
        proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),
        prepareRequestFunction: ow.optional.function,
        postResponseFunction: ow.optional.function,
        persistCookiesPerSession: ow.optional.boolean,

        // Deprecated
        requestOptions: ow.optional.object,
    }

    /**
     * @param {CheerioCrawlerOptions} options
     * All `CheerioCrawler` parameters are passed via an options object.
     */
    constructor(options) {
        ow(options, 'CheerioCrawlerOptions', ow.object.exactShape(CheerioCrawler.optionsShape));

        const {
            handlePageFunction,
            requestTimeoutSecs = 30,
            handlePageTimeoutSecs = 60,
            ignoreSslErrors = true,
            additionalMimeTypes = [],
            suggestResponseEncoding,
            forceResponseEncoding,
            proxyConfiguration,
            prepareRequestFunction,
            postResponseFunction,
            persistCookiesPerSession = false,

            // Deprecated
            requestOptions,

            // BasicCrawler
            autoscaledPoolOptions = CHEERIO_OPTIMIZED_AUTOSCALED_POOL_OPTIONS,
            ...basicCrawlerOptions
        } = options;

        super({
            ...basicCrawlerOptions,
            // TODO temporary until the API is unified in V2
            handleRequestFunction: handlePageFunction,
            autoscaledPoolOptions,
            // We need to add some time for internal functions to finish,
            // but not too much so that we would stall the crawler.
            handleRequestTimeoutSecs: (requestTimeoutSecs + handlePageTimeoutSecs * 2) + 5,
        });

        if (persistCookiesPerSession && !this.useSessionPool) {
            throw new Error('Cannot use "options.persistCookiesPerSession" without "options.useSessionPool"');
        }

        this.supportedMimeTypes = new Set([...HTML_AND_XML_MIME_TYPES, APPLICATION_JSON_MIME_TYPE]);
        if (additionalMimeTypes.length) this._extendSupportedMimeTypes(additionalMimeTypes);

        if (requestOptions) {
            // DEPRECATED 2020-03-22
            this.requestOptions = requestOptions;
            this.log.deprecated('options.requestOptions is deprecated. Use options.prepareRequestFunction instead.');
        }

        if (suggestResponseEncoding && forceResponseEncoding) {
            this.log.warning('Both forceResponseEncoding and suggestResponseEncoding options are set. Using forceResponseEncoding.');
        }

        this.handlePageTimeoutMillis = handlePageTimeoutSecs * 1000;
        this.requestTimeoutMillis = requestTimeoutSecs * 1000;
        this.ignoreSslErrors = ignoreSslErrors;
        this.suggestResponseEncoding = suggestResponseEncoding;
        this.forceResponseEncoding = forceResponseEncoding;
        this.prepareRequestFunction = prepareRequestFunction;
        this.postResponseFunction = postResponseFunction;
        this.proxyConfiguration = proxyConfiguration;
        this.persistCookiesPerSession = persistCookiesPerSession;
    }

    /**
     * **EXPERIMENTAL**
     * Function for attaching CrawlerExtensions such as the Unblockers.
     * @param {CrawlerExtension} extension - Crawler extension that overrides the crawler configuration.
     */
    use(extension) {
        ow(extension, ow.object.instanceOf(CrawlerExtension));

        const extensionOptions = extension.getCrawlerOptions();
        // TODO temporary until the API is unified in V2
        extensionOptions.userProvidedHandler = extensionOptions.handlePageFunction;
        delete extensionOptions.handlePageFunction;

        for (const [key, value] of Object.entries(extensionOptions)) {
            const isConfigurable = this.hasOwnProperty(key); // eslint-disable-line
            const originalType = typeof this[key];
            const extensionType = typeof value; // What if we want to null something? It is really needed?
            const isSameType = originalType === extensionType || value == null; // fast track for deleting keys
            const exists = this[key] != null;

            if (!isConfigurable) { // Test if the property can be configured on the crawler
                throw new Error(`${extension.name} tries to set property "${key}" that is not configurable on CheerioCrawler instance.`);
            }

            if (!isSameType && exists) { // Assuming that extensions will only add up configuration
                throw new Error(
                    `${extension.name} tries to set property of different type "${extensionType}". "CheerioCrawler.${key}: ${originalType}".`,
                );
            }

            this.log.warning(`${extension.name} is overriding "CheerioCrawler.${key}: ${originalType}" with ${value}.`);

            this[key] = value;
        }
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @param {Object} crawlingContext
     * @param {Request} crawlingContext.request
     * @param {Session} [crawlingContext.session]
     * @ignore
     */
    async _handleRequestFunction(crawlingContext) {
        const { request, session } = crawlingContext;

        if (this.proxyConfiguration) {
            const sessionId = session ? session.id : undefined;
            crawlingContext.proxyInfo = this.proxyConfiguration.newProxyInfo(sessionId);
        }

        if (this.prepareRequestFunction) await this.prepareRequestFunction(crawlingContext);

        const proxyUrl = crawlingContext.proxyInfo && crawlingContext.proxyInfo.url;

        crawlingContext.response = await addTimeoutToPromise(
            this._requestFunction({ request, session, proxyUrl }),
            this.requestTimeoutMillis,
            `request timed out after ${this.requestTimeoutMillis / 1000} seconds.`,
        );

        if (this.postResponseFunction) await this.postResponseFunction(crawlingContext);

        const { dom, isXml, body, contentType, response } = await this._parseResponse(request, crawlingContext.response);

        if (this.useSessionPool) {
            this._throwOnBlockedRequest(session, response.statusCode);
        }

        if (this.persistCookiesPerSession) {
            session.setCookiesFromResponse(response);
        }

        request.loadedUrl = response.url;

        const $ = dom ? cheerio.load(dom, { xmlMode: isXml }) : null;

        crawlingContext.$ = $;
        crawlingContext.contentType = contentType;
        crawlingContext.response = response;
        Object.defineProperty(crawlingContext, 'json', {
            get() {
                if (contentType.type !== APPLICATION_JSON_MIME_TYPE) return null;
                const jsonString = body.toString(contentType.encoding);
                return JSON.parse(jsonString);
            },
        });
        Object.defineProperty(crawlingContext, 'body', {
            get() {
                // NOTE: For XML/HTML documents, we don't store the original body and only reconstruct it from Cheerio's DOM.
                // This is to save memory for high-concurrency crawls. The downside is that changes
                // made to DOM are reflected in the HTML, but we can live with that...
                if (dom) {
                    return isXml ? $.xml() : $.html({ decodeEntities: false });
                }
                return body;
            },
        });

        return addTimeoutToPromise(
            this.userProvidedHandler(crawlingContext),
            this.handlePageTimeoutMillis,
            `handlePageFunction timed out after ${this.handlePageTimeoutMillis / 1000} seconds.`,
        );
    }

    /**
     * Function to make the HTTP request. It performs optimizations
     * on the request such as only downloading the request body if the
     * received content type matches text/html, application/xml, application/xhtml+xml.
     *
     * @param {Object} options
     * @param {Request} options.request
     * @param {Session} options.session
     * @param {string} options.proxyUrl
     * @returns {Promise<IncomingMessage|Readable>}
     * @ignore
     */
    async _requestFunction({ request, session, proxyUrl }) {
        // Using the streaming API of Request to be able to
        // handle the response based on headers receieved.

        if (this.persistCookiesPerSession) {
            const { headers } = request;
            headers.Cookie = session.getCookieString(request.url);
        }

        const opts = this._getRequestOptions(request, session, proxyUrl);
        let responseStream;

        try {
            responseStream = await utilsRequest.requestAsBrowser(opts);
        } catch (e) {
            if (e instanceof TimeoutError) {
                this._handleRequestTimeout(session);
            } else {
                throw e;
            }
        }

        return responseStream;
    }

    /**
     * Encodes and parses response according to the provided content type
     * @param {Request} request
     * @param {IncomingMessage|Readable} responseStream
     * @returns {Promise<object>}
     * @ignore
     */
    async _parseResponse(request, responseStream) {
        const { statusCode } = responseStream;
        const { type, charset } = parseContentTypeFromResponse(responseStream);
        const { response, encoding } = this._encodeResponse(request, responseStream, charset);
        const contentType = { type, encoding };

        if (statusCode >= 500) {
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
     * @param {Request} request
     * @param {Session} [session]
     * @param {string} [proxyUrl]
     * @ignore
     */
    _getRequestOptions(request, session, proxyUrl) {
        const mandatoryRequestOptions = {
            url: request.url,
            method: request.method,
            headers: { ...request.headers },
            ignoreSslErrors: this.ignoreSslErrors,
            proxyUrl,
            stream: true,
            useCaseSensitiveHeaders: true,
            abortFunction: (res) => {
                const { statusCode } = res;
                const { type } = parseContentTypeFromResponse(res);

                if (statusCode === 406) {
                    request.noRetry = true;
                    throw new Error(`Resource ${request.url} is not available in HTML format. Skipping resource.`);
                }

                if (!this.supportedMimeTypes.has(type) && statusCode < 500) {
                    request.noRetry = true;
                    throw new Error(`Resource ${request.url} served Content-Type ${type}, `
                        + `but only ${Array.from(this.supportedMimeTypes).join(', ')} are allowed. Skipping resource.`);
                }

                return false;
            },
            timeoutSecs: this.requestTimeoutMillis / 1000,
        };

        if (/PATCH|POST|PUT/.test(request.method)) mandatoryRequestOptions.payload = request.payload;

        return { ...this.requestOptions, ...mandatoryRequestOptions };
    }

    _encodeResponse(request, response, encoding) {
        if (this.forceResponseEncoding) {
            encoding = this.forceResponseEncoding;
        } else if (!encoding && this.suggestResponseEncoding) {
            encoding = this.suggestResponseEncoding;
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
            response.on('error', (err) => decodeStream.emit('error', err));
            const encodedResponse = response.pipe(decodeStream).pipe(encodeStream);
            encodedResponse.statusCode = response.statusCode;
            encodedResponse.headers = response.headers;
            encodedResponse.url = response.url;
            return {
                response: encodedResponse,
                encoding: utf8,
            };
        }

        throw new Error(`Resource ${request.url} served with unsupported charset/encoding: ${encoding}`);
    }

    async _parseHtmlToDom(response) {
        return new Promise((resolve, reject) => {
            const domHandler = new htmlparser.DomHandler((err, dom) => {
                if (err) reject(err);
                else resolve(dom);
            });
            const parser = new WritableStream(domHandler, { decodeEntities: true });
            parser.on('error', reject);
            response.on('error', reject).pipe(parser);
        });
    }

    /**
     * Checks and extends supported mime types
     * @param {Array<(string|Object)>} additionalMimeTypes
     * @ignore
     */
    _extendSupportedMimeTypes(additionalMimeTypes) {
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
     * Handles blocked request
     * @param {Session} session
     * @param {number} statusCode
     * @private
     */
    _throwOnBlockedRequest(session, statusCode) {
        const isBlocked = session.retireOnBlockedStatusCodes(statusCode);

        if (isBlocked) {
            throw new Error(`Request blocked - received ${statusCode} status code`);
        }
    }

    /**
     * Handles timeout request
     * @param {Session} session
     * @private
     */
    _handleRequestTimeout(session) {
        if (session) session.markBad();
        throw new Error(`request timed out after ${this.handlePageTimeoutMillis / 1000} seconds.`);
    }
}

export default CheerioCrawler;

/**
 * @typedef PrepareRequestInputs
 * @property {Request} request
 *  Original instance fo the {Request} object. Must be modified in-place.
 * @property {Session} [session]
 *  The current session
 * @property {ProxyInfo} [proxyInfo]
 *  An object with information about currently used proxy by the crawler
 *  and configured by the {@link ProxyConfiguration} class.
 * @property {CheerioCrawler} [crawler]
 */

/**
 * @callback PrepareRequest
 * @param {PrepareRequestInputs} inputs Arguments passed to this callback.
 * @returns {(void|Promise<void>)}
 */

/**
 * @typedef PostResponseInputs
 * @property {IncomingMessage|Readable} response stream
 * @property {Request} request
 *  Original instance fo the {Request} object. Must be modified in-place.
 * @property {Session} [session]
 *  The current session
 * @property {ProxyInfo} [proxyInfo]
 *  An object with information about currently used proxy by the crawler
 *  and configured by the {@link ProxyConfiguration} class.
 *  @property {CheerioCrawler} [crawler]
 */

/**
 * @callback PostResponse
 * @param {PostResponseInputs} inputs Arguments passed to this callback.
 * @returns {(void|Promise<void>)}
 */

/**
 * @typedef CheerioHandlePageInputs
 * @property {cheerio.Selector} [$]
 *  The [Cheerio](https://cheerio.js.org/) object with parsed HTML.
 * @property {(string|Buffer)} body
 *  The request body of the web page.
 * @property {*} [json]
 *  The parsed object from JSON string if the response contains the content type application/json.
 * @property {Request} request
 *   The original {@link Request} object.
 * @property {{ type: string, encoding: string }} contentType
 *  Parsed `Content-Type header: { type, encoding }`.
 * @property {IncomingMessage} response
 *   An instance of Node's http.IncomingMessage object,
 * @property {Session} [session]
 * @property {ProxyInfo} [proxyInfo]
 *   An object with information about currently used proxy by the crawler
 *   and configured by the {@link ProxyConfiguration} class.
 * @property {CheerioCrawler} [crawler]
 */

/**
 * @callback CheerioHandlePage
 * @param {CheerioHandlePageInputs} inputs Arguments passed to this callback.
 * @returns {Promise<void>}
 */
