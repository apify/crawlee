/* eslint-disable class-methods-use-this */
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { readStreamToString, concatStreamToBuffer } from 'apify-shared/streams_utilities';
import cheerio from 'cheerio';
import contentTypeParser from 'content-type';
import htmlparser from 'htmlparser2';
import * as iconv from 'iconv-lite';
import _ from 'underscore';
import util from 'util';
import { getApifyProxyUrl } from '../actor';
import { BASIC_CRAWLER_TIMEOUT_MULTIPLIER } from '../constants';
import { TimeoutError } from '../errors';
import { addTimeoutToPromise, parseContentTypeFromResponse } from '../utils';
import * as utilsRequest from '../utils_request'; // eslint-disable-line import/no-duplicates
import BasicCrawler from './basic_crawler'; // eslint-disable-line import/no-duplicates

// TYPE IMPORTS
/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { IncomingMessage } from 'http';
import AutoscaledPool, { AutoscaledPoolOptions } from '../autoscaling/autoscaled_pool';
import { HandleFailedRequest } from './basic_crawler';
import Request, { RequestOptions } from '../request';
import { RequestList } from '../request_list';
import { RequestQueue } from '../request_queue';
import { Session } from '../session_pool/session';
import { SessionPoolOptions } from '../session_pool/session_pool';
import { Cheerio } from '../typedefs';
import { RequestAsBrowserOptions } from '../utils_request';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

/**
 * Default mime types, which CheerioScraper supports.
 */
const DEFAULT_MIME_TYPES = ['text/html', 'application/xhtml+xml'];
const DEFAULT_AUTOSCALED_POOL_OPTIONS = {
    snapshotterOptions: {
        eventLoopSnapshotIntervalSecs: 2,
        maxBlockedMillis: 100,
    },
    systemStatusOptions: {
        maxEventLoopOverloadedRatio: 0.7,
    },
};

/**
 * @typedef {Object} CheerioCrawlerOptions
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
 *   // Underlying AutoscaledPool instance used to manage the concurrency of crawler
 *   autoscaledPool: AutoscaledPool,
 *
 *   // Session object, useful to work around anti-scraping protections
 *   session: Session
 * }
 * ```
 *
 *   Type of `body` depends on the `Content-Type` header of the web page:
 *   - String for `text/html`, `application/xhtml+xml`, `application/xml` MIME content types
 *   - Buffer for others MIME content types
 *
 *   Parsed `Content-Type` header using
 *   <a href="https://www.npmjs.com/package/content-type" target="_blank">content-type package</a>
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
 *   [`request.pushErrorMessage`](request#Request+pushErrorMessage) function.
 * @property {RequestList} [requestList]
 *   Static list of URLs to be processed.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {RequestQueue} [requestQueue]
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {RequestAsBrowserOptions} [requestOptions]
 *   Represents the options passed to the {@link requestAsBrowser} function that makes the HTTP requests to fetch the web pages.
 *   Provided `requestOptions` are added to internal defaults that cannot be overridden to ensure
 *   the operation of `CheerioCrawler` and all its options. Headers will not be merged,
 *   use {@link RequestList} and/or {@link RequestQueue} to initialize your {@link Request} with the
 *   correct headers or use `prepareRequestFunction` to modify your {@link Request} dynamically.
 *   If you need more granular control over your requests, use {@link BasicCrawler}.
 *
 *   The mandatory internal defaults that **CANNOT BE OVERRIDDEN** by `requestOptions`:
 *   ```
 *   {
 *       url,       // Provided by RequestList and/or RequestQueue
 *       method,    // Provided by RequestList and/or RequestQueue
 *       headers,   // Provided by RequestList and/or RequestQueue
 *       payload,   // Provided by RequestList and/or RequestQueue
 *       strictSSL, // Use ignoreSslErrors
 *       proxy,     // Use useApifyProxy or proxyUrls
 *   }
 *   ```
 * @property {PrepareRequest} [prepareRequestFunction]
 *   A function that executes before the HTTP request is made to the target resource.
 *   This function is suitable for setting dynamic properties such as cookies to the {@link Request}.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request,
 *   session: Session
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
 * @property {Number} [handlePageTimeoutSecs=60]
 *   Timeout in which the function passed as `handlePageFunction` needs to finish, given in seconds.
 * @property {Number} [requestTimeoutSecs=30]
 *   Timeout in which the HTTP request to the resource needs to finish, given in seconds.
 * @property {Boolean} [ignoreSslErrors=true]
 *   If set to true, SSL certificate errors will be ignored.
 * @property {Boolean} [useApifyProxy=false]
 *   If set to `true`, `CheerioCrawler` will be configured to use
 *   <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> for all connections.
 *   For more information, see the <a href="https://docs.apify.com/proxy" target="_blank">documentation</a>
 * @property {String[]} [apifyProxyGroups]
 *   An array of proxy groups to be used
 *   by the <a href="https://docs.apify.com/proxy" target="_blank">Apify Proxy</a>.
 *   Only applied if the `useApifyProxy` option is `true`.
 * @property {String} [apifyProxySession]
 *   Apify Proxy session identifier to be used with requests made by `CheerioCrawler`.
 *   All HTTP requests going through the proxy with the same session identifier
 *   will use the same target proxy server (i.e. the same IP address).
 *   The identifier can only contain the following characters: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
 *   Only applied if the `useApifyProxy` option is `true`.
 * @property {String[]} [proxyUrls]
 *   An array of custom proxy URLs to be used by the `CheerioCrawler` instance.
 *   The provided custom proxies' order will be randomized and the resulting list rotated.
 *   Custom proxies are not compatible with Apify Proxy and an attempt to use both
 *   configuration options will cause an error to be thrown on startup.
 * @property {HandleFailedRequest} [handleFailedRequestFunction]
 *   A function to handle requests that failed more than `option.maxRequestRetries` times.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request,
 *   error: Error,
 * }
 * ```
 *   where the {@link Request} instance corresponds to the failed request, and the `Error` instance
 *   represents the last error thrown during processing of the request.
 *
 *   See <a href="https://github.com/apifytech/apify-js/blob/master/src/crawlers/cheerio_crawler.js#L13">source code</a>
 *   for the default implementation of this function.
 * @property {String[]} [additionalMimeTypes]
 *   An array of <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types"
 *   target="_blank">MIME types</a> you want the crawler to load and process.
 *   By default, only `text/html` and `application/xhtml+xml` MIME types are supported.
 * @property {Number} [maxRequestRetries=3]
 *   Indicates how many times the request is retried if either `requestFunction` or `handlePageFunction` fails.
 * @property {Number} [maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @property {AutoscaledPoolOptions} [autoscaledPoolOptions]
 *   Custom options passed to the underlying {@link AutoscaledPool} constructor.
 *   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options
 *   are provided by `CheerioCrawler` and cannot be overridden. Reasonable {@link Snapshotter}
 *   and {@link SystemStatus} defaults are provided to account for the fact that `cheerio`
 *   parses HTML synchronously and therefore blocks the event loop.
 * @property {Number} [minConcurrency=1]
 *   Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 *
 *   *WARNING:* If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
 *   If you're not sure, just keep the default value and the concurrency will scale up automatically.
 * @property {Number} [maxConcurrency=1000]
 *   Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 * @property {Boolean} [useSessionPool=false]
 *   If set to true Crawler will automatically use Session Pool. It will automatically retire sessions on 403, 401 and 429 status codes.
 *   It also marks Session as bad after a request timeout.
 * @property {SessionPoolOptions} [sessionPoolOptions]
 *   Custom options passed to the underlying {@link SessionPool} constructor.
 * @property {Boolean} [persistCookiesPerSession]
 *   Automatically saves cookies to Session. Works only if Session Pool is used.
 *
 *   It parses cookie from response "set-cookie" header saves or updates cookies for session and once the session is used for next request.
 *   It passes the "Cookie" header to the request with the session cookies.
 */

/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests and
 * <a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a> HTML parser.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `CheerioCrawler` uses raw HTTP requests to download web pages,
 * it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
 * to display the content, you might need to use {@link PuppeteerCrawler} instead,
 * because it loads the pages using full-featured headless Chrome browser.
 *
 * `CheerioCrawler` downloads each URL using a plain HTTP request,
 * parses the HTML content using <a href="https://www.npmjs.com/package/cheerio" target="_blank">Cheerio</a>
 * and then invokes the user-provided [`handlePageFunction()`](#new_CheerioCrawler_new) to extract page data
 * using a <a href="https://jquery.com/" target="_blank">jQuery</a>-like interface to the parsed HTML DOM.
 *
 * The source URLs are represented using {@link Request} objects that are fed from
 * {@link RequestList} or {@link RequestQueue} instances provided by the [`requestList`](#new_CheerioCrawler_new)
 * or [`requestQueue`](#new_CheerioCrawler_new) constructor options, respectively.
 *
 * If both [`requestList`](#new_CheerioCrawler_new) and [`requestQueue`](#new_CheerioCrawler_new) are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * `CheerioCrawler` downloads the web pages using the {@link requestAsBrowser} utility function.
 * You can use the `requestOptions` parameter to pass additional options to this function.
 *
 * By default, `CheerioCrawler` only processes web pages with the `text/html`
 * and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the [`additionalMimeTypes`](#new_CheerioCrawler_new) constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For details, see {@link CheerioCrawlerOptions#handlePageFunction}.
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
 * @property {AutoscaledPool} autoscaledPool
 *  A reference to the underlying {@link AutoscaledPool} class that manages the concurrency of the crawler.
 *  Note that this property is only initialized after calling the {@link CheerioCrawler#run} function.
 *  You can use it to change the concurrency settings on the fly,
 *  to pause the crawler by calling {@link AutoscaledPool#pause}
 *  or to abort it by calling {@link AutoscaledPool#abort}.
 */
class CheerioCrawler {
    /**
     * @param {CheerioCrawlerOptions} options
     */
    constructor(options = {}) {
        const {
            requestOptions,
            handlePageFunction,
            requestTimeoutSecs = 30,
            handlePageTimeoutSecs = 60,
            ignoreSslErrors = true,
            useApifyProxy = false,
            apifyProxyGroups,
            apifyProxySession,
            proxyUrls,
            additionalMimeTypes = [],

            // Autoscaled pool shorthands
            minConcurrency,
            maxConcurrency,

            // Basic crawler options
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleFailedRequestFunction = this._defaultHandleFailedRequestFunction,
            autoscaledPoolOptions = DEFAULT_AUTOSCALED_POOL_OPTIONS,
            prepareRequestFunction,
            useSessionPool = false,
            sessionPoolOptions = {},
            persistCookiesPerSession = false,
        } = options;

        checkParamOrThrow(handlePageFunction, 'options.handlePageFunction', 'Function');
        checkParamOrThrow(requestOptions, 'options.requestOptions', 'Maybe Object');
        checkParamOrThrow(requestTimeoutSecs, 'options.requestTimeoutSecs', 'Number');
        checkParamOrThrow(handlePageTimeoutSecs, 'options.handlePageTimeoutSecs', 'Number');
        checkParamOrThrow(ignoreSslErrors, 'options.ignoreSslErrors', 'Maybe Boolean');
        checkParamOrThrow(useApifyProxy, 'options.useApifyProxy', 'Maybe Boolean');
        checkParamOrThrow(apifyProxyGroups, 'options.apifyProxyGroups', 'Maybe [String]');
        checkParamOrThrow(apifyProxySession, 'options.apifyProxySession', 'Maybe String');
        checkParamOrThrow(proxyUrls, 'options.proxyUrls', 'Maybe [String]');
        checkParamOrThrow(prepareRequestFunction, 'options.prepareRequestFunction', 'Maybe Function');
        checkParamOrThrow(additionalMimeTypes, 'options.additionalMimeTypes', '[String]');
        checkParamOrThrow(useSessionPool, 'options.useSessionPool', 'Boolean');
        checkParamOrThrow(sessionPoolOptions, 'options.sessionPoolOptions', 'Object');
        checkParamOrThrow(persistCookiesPerSession, 'options.persistCookiesPerSession', 'Boolean');
        // Enforce valid proxy configuration
        if (proxyUrls && !proxyUrls.length) throw new Error('Parameter "options.proxyUrls" of type Array must not be empty');
        if (useApifyProxy && proxyUrls) throw new Error('Cannot combine "options.useApifyProxy" with "options.proxyUrls"!');
        if (persistCookiesPerSession && !useSessionPool) {
            throw new Error('Cannot use "options.persistCookiesPerSession" without "options.useSessionPool"');
        }

        if (apifyProxySession && useSessionPool) {
            throw new Error('Cannot use "options.apifyProxySession" with "options.useSessionPool"');
        }

        this.supportedMimeTypes = new Set(DEFAULT_MIME_TYPES);
        if (additionalMimeTypes.length) this._extendSupportedMimeTypes(additionalMimeTypes);

        this.requestOptions = requestOptions;
        this.handlePageFunction = handlePageFunction;
        this.handlePageTimeoutMillis = handlePageTimeoutSecs * 1000;
        this.requestTimeoutMillis = requestTimeoutSecs * 1000;
        this.ignoreSslErrors = ignoreSslErrors;
        this.useApifyProxy = useApifyProxy;
        this.apifyProxyGroups = apifyProxyGroups;
        this.apifyProxySession = apifyProxySession;
        this.proxyUrls = _.shuffle(proxyUrls);
        this.lastUsedProxyUrlIndex = 0;
        this.prepareRequestFunction = prepareRequestFunction;
        this.persistCookiesPerSession = persistCookiesPerSession;
        this.useSessionPool = useSessionPool;

        this.basicCrawler = new BasicCrawler({
            // Basic crawler options.
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
            handleRequestTimeoutSecs: handlePageTimeoutSecs * BASIC_CRAWLER_TIMEOUT_MULTIPLIER,
            handleFailedRequestFunction,

            // Autoscaled pool options.
            minConcurrency,
            maxConcurrency,
            autoscaledPoolOptions,

            // Session pool options
            sessionPoolOptions,
            useSessionPool,
        });

        this.isRunningPromise = null;
    }

    /**
     * Runs the crawler. Returns promise that gets resolved once all the requests got processed.
     *
     * @return {Promise}
     */
    async run() {
        if (this.isRunningPromise) return this.isRunningPromise;

        this.isRunningPromise = this.basicCrawler.run();
        this.autoscaledPool = this.basicCrawler.autoscaledPool;

        await this.isRunningPromise;
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @param {Object} options
     * @param {Request} options.request
     * @param {AutoscaledPool} options.autoscaledPool
     * @param {Session} options.session
     * @ignore
     */
    async _handleRequestFunction({ request, autoscaledPool, session }) {
        if (this.prepareRequestFunction) await this.prepareRequestFunction({ request, session });
        const { dom, isXml, body, contentType, response } = await addTimeoutToPromise(
            this._requestFunction({ request, session }),
            this.requestTimeoutMillis,
            `CheerioCrawler: request timed out after ${this.requestTimeoutMillis / 1000} seconds.`,
        );

        if (this.useSessionPool) {
            this._throwOnBlockedRequest(session, response.statusCode);
        }

        if (this.persistCookiesPerSession) {
            session.setCookiesFromResponse(response);
        }

        request.loadedUrl = response.url;

        const $ = dom ? cheerio.load(dom, { xmlMode: isXml }) : null;
        const context = {
            $,
            // Using a getter here not to break the original API
            // and lazy load the HTML only when needed.
            get html() {
                log.deprecated('CheerioCrawler: The "html" parameter of handlePageFunction is deprecated, use "body" instead.');
                return dom && !isXml && $.html({ decodeEntities: false });
            },
            get json() {
                if (contentType.type !== 'application/json') return null;
                const jsonString = body.toString(contentType.encoding);
                return JSON.parse(jsonString);
            },
            get body() {
                // NOTE: For XML/HTML documents, we don't store the original body and only reconstruct it from Cheerio's DOM.
                // This is to save memory for high-concurrency crawls. The downside is that changes
                // made to DOM are reflected in the HTML, but we can live with that...
                if (dom) {
                    return isXml ? $.xml() : $.html({ decodeEntities: false });
                }
                return body;
            },
            contentType,
            request,
            response,
            autoscaledPool,
            session,
        };
        return addTimeoutToPromise(
            this.handlePageFunction(context),
            this.handlePageTimeoutMillis,
            `CheerioCrawler: handlePageFunction timed out after ${this.handlePageTimeoutMillis / 1000} seconds.`,
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
     * @ignore
     */
    async _requestFunction({ request, session }) {
        // Using the streaming API of Request to be able to
        // handle the response based on headers receieved.

        if (this.persistCookiesPerSession) {
            const { headers } = request;
            headers.Cookie = session.getCookieString(request.url);
        }

        const opts = this._getRequestOptions(request, session);
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

        const { statusCode } = responseStream;
        const { type, charset } = parseContentTypeFromResponse(responseStream);
        const { response, encoding } = this._encodeResponse(request, responseStream, charset);
        const contentType = { type, encoding };

        if (statusCode >= 500) {
            const body = await readStreamToString(response, encoding);

            // Errors are often sent as JSON, so attempt to parse them,
            // despite Accept header being set to text/html.
            if (type === 'application/json') {
                const errorResponse = JSON.parse(body);
                let { message } = errorResponse;
                if (!message) message = util.inspect(errorResponse, { depth: 1, maxArrayLength: 10 });
                throw new Error(`${statusCode} - ${message}`);
            }

            // It's not a JSON so it's probably some text. Get the first 100 chars of it.
            throw new Error(`CheerioCrawler: ${statusCode} - Internal Server Error: ${body.substr(0, 100)}`);
        } else if (type === 'text/html' || type === 'application/xhtml+xml' || type === 'application/xml') {
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
     * @param {Session?} session
     * @ignore
     */
    _getRequestOptions(request, session) {
        const mandatoryRequestOptions = {
            url: request.url,
            method: request.method,
            headers: Object.assign({}, request.headers),
            ignoreSslErrors: this.ignoreSslErrors,
            proxyUrl: this._getProxyUrl(session),
            stream: true,
            useCaseSensitiveHeaders: true,
            abortFunction: (res) => {
                const { statusCode } = res;
                const { type } = parseContentTypeFromResponse(res);

                if (statusCode === 406) {
                    request.noRetry = true;
                    throw new Error(`CheerioCrawler: Resource ${request.url} is not available in HTML format. Skipping resource.`);
                }

                if (!this.supportedMimeTypes.has(type) && statusCode < 500) {
                    request.noRetry = true;
                    throw new Error(`CheerioCrawler: Resource ${request.url} served Content-Type ${type}, `
                        + `but only ${Array.from(this.supportedMimeTypes).join(', ')} are allowed. Skipping resource.`);
                }

                return false;
            },
            timeoutSecs: this.requestTimeoutMillis / 1000,
        };

        if (/PATCH|POST|PUT/.test(request.method)) mandatoryRequestOptions.payload = request.payload;

        return Object.assign({}, this.requestOptions, mandatoryRequestOptions);
    }

    /**
     * Enables the use of a proxy by returning a proxy URL
     * based on configured options or null if no proxy is used.
     * @param {Session?} session
     * @returns {string|null}
     * @ignore
     */
    _getProxyUrl(session = {}) {
        if (this.useApifyProxy) {
            return getApifyProxyUrl({
                groups: this.apifyProxyGroups,
                session: session.id || this.apifyProxySession,
                groupsParamName: 'options.apifyProxyGroups',
                sessionParamName: 'options.apifyProxySession',
            });
        }
        if (this.proxyUrls) {
            return this.proxyUrls[this.lastUsedProxyUrlIndex++ % this.proxyUrls.length];
        }
        return null;
    }

    _encodeResponse(request, response, encoding) {
        if (!encoding || Buffer.isEncoding(encoding)) return { response, encoding };

        if (iconv.encodingExists(encoding)) {
            const finalEncoding = 'utf8';
            const encodeStream = iconv.encodeStream(finalEncoding);
            const decodeStream = iconv.decodeStream(encoding).on('error', err => encodeStream.emit('error', err));
            response.on('error', err => decodeStream.emit('error', err));
            const encodedResponse = response.pipe(decodeStream).pipe(encodeStream);
            encodedResponse.statusCode = response.statusCode;
            encodedResponse.headers = response.headers;
            encodedResponse.url = response.url;
            return {
                response: encodedResponse,
                encoding: finalEncoding,
            };
        }

        throw new Error(`CheerioCrawler: Resource ${request.url} served with unsupported charset/encoding: ${encoding}`);
    }

    async _parseHtmlToDom(response) {
        return new Promise((resolve, reject) => {
            const domHandler = new htmlparser.DomHandler((err, dom) => {
                if (err) reject(err);
                else resolve(dom);
            });
            const parser = new htmlparser.Parser(domHandler, { decodeEntities: true });
            response.on('error', reject).pipe(parser);
        });
    }

    /**
     * Checks and extends supported mime types
     * @param {Array<String|Object>} additionalMimeTypes
     * @ignore
     */
    _extendSupportedMimeTypes(additionalMimeTypes) {
        additionalMimeTypes.forEach((mimeType) => {
            try {
                const parsedType = contentTypeParser.parse(mimeType);
                this.supportedMimeTypes.add(parsedType.type);
            } catch (err) {
                throw new Error(`CheerioCrawler: Can not parse mime type ${mimeType} from "options.additionalMimeTypes".`);
            }
        });
    }

    /**
     * Handles blocked request
     * @param session {Session}
     * @param statusCode {Number}
     * @private
     */
    _throwOnBlockedRequest(session, statusCode) {
        const isBlocked = session.retireOnBlockedStatusCodes(statusCode);

        if (isBlocked) {
            throw new Error(`CheerioCrawler: Request blocked - received ${statusCode} status code`);
        }
    }

    /**
     * Handles timeout request
     * @param session {Session}
     * @private
     */
    _handleRequestTimeout(session) {
        if (session) session.markBad();
        throw new Error(`CheerioCrawler: request timed out after ${this.handlePageTimeoutMillis / 1000} seconds.`);
    }

    /**
     * @param {Object} options
     * @param {Error} options.error
     * @param {Request} options.request
     * @return {Promise<void>}
     * @ignore
     */
    async _defaultHandleFailedRequestFunction({ error, request }) { // eslint-disable-line class-methods-use-this
        const details = _.pick(request, 'id', 'url', 'method', 'uniqueKey');
        log.exception(error, 'CheerioCrawler: Request failed and reached maximum retries', details);
    }
}

export default CheerioCrawler;

/**
 * @typedef PrepareRequestInputs
 * @property {Request} request Original instance fo the {Request} object. Must be modified in-place.
 */
/**
 * @callback PrepareRequest
 * @param {PrepareRequestInputs} inputs Arguments passed to this callback.
 * @returns {void|Promise<void>}
 */

/**
 * @typedef CheerioHandlePageInputs
 * @property {Cheerio} [$] The <a href="https://cheerio.js.org/">Cheerio</a> object with parsed HTML.
 * @property {String|Buffer} body The request body of the web page.
 * @property {Object} [json] The parsed object from JSON string if the response contains the content type application/json.
 * @property {Request} request The original {Request} object.
 * @property {{ type: string, encoding: string }} contentType Parsed `Content-Type header: { type, encoding }`.
 * @property {IncomingMessage} response An instance of Node's http.IncomingMessage object,
 * @property {AutoscaledPool} autoscaledPool
 * @property {session} [session]
 */
/**
 * @callback CheerioHandlePage
 * @param {CheerioHandlePageInputs} inputs Arguments passed to this callback.
 * @returns {Promise<void>}
 */
