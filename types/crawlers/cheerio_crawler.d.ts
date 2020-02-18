export default CheerioCrawler;
export type CheerioCrawlerOptions = {
    /**
     * User-provided function that performs the logic of the crawler. It is called for each page
     * loaded and parsed by the crawler.
     *
     * The function receives the following object as an argument:
     * ```javascript
     * {
     * // The Cheerio object's function with the parsed HTML.
     * $: Cheerio,
     *
     * // The request body of the web page, whose type depends on the content type.
     * body: String|Buffer,
     *
     * // The parsed object from JSON for responses with the "application/json" content types.
     * // For other content types it's null.
     * json: Object,
     *
     * // Apify.Request object with details of the requested web page
     * request: Request,
     *
     * // Parsed Content-Type HTTP header: { type, encoding }
     * contentType: Object,
     *
     * // An instance of Node's http.IncomingMessage object,
     * response: Object,
     *
     * // Underlying AutoscaledPool instance used to manage the concurrency of crawler
     * autoscaledPool: AutoscaledPool,
     *
     * // Session object, useful to work around anti-scraping protections
     * session: Session
     * }
     * ```
     * Type of `body` depends on the `Content-Type` header of the web page:
     * - String for `text/html`, `application/xhtml+xml`, `application/xml` MIME content types
     * - Buffer for others MIME content types
     *
     * Parsed `Content-Type` header using
     * <a href="https://www.npmjs.com/package/content-type" target="_blank">content-type package</a>
     * is stored in `contentType`.
     *
     * Cheerio is available only for HTML and XML content types.
     *
     * With the {@link Request} object representing the URL to crawl.
     *
     * If the function returns, the returned promise is awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     * If all the retries fail, the crawler calls the function
     * provided to the `handleFailedRequestFunction` parameter.
     * To make this work, you should **always**
     * let your function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * [`request.pushErrorMessage`](request#Request+pushErrorMessage) function.
     */
    handlePageFunction: CheerioHandlePage;
    /**
     * Static list of URLs to be processed.
     * Either `requestList` or `requestQueue` option must be provided (or both).
     */
    requestList?: RequestList;
    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     * Either `requestList` or `requestQueue` option must be provided (or both).
     */
    requestQueue?: RequestQueue;
    /**
     * Represents the options passed to the {@link requestAsBrowser} function that makes the HTTP requests to fetch the web pages.
     * Provided `requestOptions` are added to internal defaults that cannot be overridden to ensure
     * the operation of `CheerioCrawler` and all its options. Headers will not be merged,
     * use {@link RequestList} and/or {@link RequestQueue} to initialize your {@link Request} with the
     * correct headers or use `prepareRequestFunction` to modify your {@link Request} dynamically.
     * If you need more granular control over your requests, use {@link BasicCrawler}.
     *
     * The mandatory internal defaults that **CANNOT BE OVERRIDDEN** by `requestOptions`:
     * ```
     * {
     * url,       // Provided by RequestList and/or RequestQueue
     * method,    // Provided by RequestList and/or RequestQueue
     * headers,   // Provided by RequestList and/or RequestQueue
     * payload,   // Provided by RequestList and/or RequestQueue
     * strictSSL, // Use ignoreSslErrors
     * proxy,     // Use useApifyProxy or proxyUrls
     * }
     * ```
     */
    requestOptions?: utilsRequest.RequestAsBrowserOptions;
    /**
     * A function that executes before the HTTP request is made to the target resource.
     * This function is suitable for setting dynamic properties such as cookies to the {@link Request}.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     * request: Request,
     * session: Session
     * }
     * ```
     * where the {@link Request} instance corresponds to the initialized request
     * and the {@link Session} instance corresponds to used session.
     *
     * The function should modify the properties of the passed {@link Request} instance
     * in place because there are already earlier references to it. Making a copy and returning it from
     * this function is therefore not supported, because it would create inconsistencies where
     * different parts of SDK would have access to a different {@link Request} instance.
     */
    prepareRequestFunction?: PrepareRequest;
    /**
     * Timeout in which the function passed as `handlePageFunction` needs to finish, given in seconds.
     */
    handlePageTimeoutSecs?: number;
    /**
     * Timeout in which the HTTP request to the resource needs to finish, given in seconds.
     */
    requestTimeoutSecs?: number;
    /**
     * If set to true, SSL certificate errors will be ignored.
     */
    ignoreSslErrors?: boolean;
    /**
     * If set to `true`, `CheerioCrawler` will be configured to use
     * <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> for all connections.
     * For more information, see the <a href="https://docs.apify.com/proxy" target="_blank">documentation</a>
     */
    useApifyProxy?: boolean;
    /**
     * An array of proxy groups to be used
     * by the <a href="https://docs.apify.com/proxy" target="_blank">Apify Proxy</a>.
     * Only applied if the `useApifyProxy` option is `true`.
     */
    apifyProxyGroups?: string[];
    /**
     * Apify Proxy session identifier to be used with requests made by `CheerioCrawler`.
     * All HTTP requests going through the proxy with the same session identifier
     * will use the same target proxy server (i.e. the same IP address).
     * The identifier can only contain the following characters: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * Only applied if the `useApifyProxy` option is `true`.
     */
    apifyProxySession?: string;
    /**
     * An array of custom proxy URLs to be used by the `CheerioCrawler` instance.
     * The provided custom proxies' order will be randomized and the resulting list rotated.
     * Custom proxies are not compatible with Apify Proxy and an attempt to use both
     * configuration options will cause an error to be thrown on startup.
     */
    proxyUrls?: string[];
    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     * request: Request,
     * error: Error,
     * }
     * ```
     * where the {@link Request} instance corresponds to the failed request, and the `Error` instance
     * represents the last error thrown during processing of the request.
     *
     * See <a href="https://github.com/apifytech/apify-js/blob/master/src/crawlers/cheerio_crawler.js#L13">source code</a>
     * for the default implementation of this function.
     */
    handleFailedRequestFunction?: HandleFailedRequest;
    /**
     * An array of <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types"
     * target="_blank">MIME types</a> you want the crawler to load and process.
     * By default, only `text/html` and `application/xhtml+xml` MIME types are supported.
     */
    additionalMimeTypes?: string[];
    /**
     * Indicates how many times the request is retried if either `requestFunction` or `handlePageFunction` fails.
     */
    maxRequestRetries?: number;
    /**
     * Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
     * Always set this value in order to prevent infinite loops in misconfigured crawlers.
     * Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
     */
    maxRequestsPerCrawl?: number;
    /**
     * Custom options passed to the underlying {@link AutoscaledPool} constructor.
     * Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options
     * are provided by `CheerioCrawler` and cannot be overridden. Reasonable {@link Snapshotter}
     * and {@link SystemStatus} defaults are provided to account for the fact that `cheerio`
     * parses HTML synchronously and therefore blocks the event loop.
     */
    autoscaledPoolOptions?: AutoscaledPoolOptions;
    /**
     * Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
     * If you're not sure, just keep the default value and the concurrency will scale up automatically.
     */
    minConcurrency?: number;
    /**
     * Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
     */
    maxConcurrency?: number;
    /**
     * If set to true Crawler will automatically use Session Pool. It will automatically retire sessions on 403, 401 and 429 status codes.
     * It also marks Session as bad after a request timeout.
     */
    useSessionPool?: boolean;
    /**
     * Custom options passed to the underlying {@link SessionPool} constructor.
     */
    sessionPoolOptions?: SessionPoolOptions;
    /**
     * Automatically saves cookies to Session. Works only if Session Pool is used.
     *
     * It parses cookie from response "set-cookie" header saves or updates cookies for session and once the session is used for next request.
     * It passes the "Cookie" header to the request with the session cookies.
     */
    persistCookiesPerSession?: boolean;
};
export type PrepareRequestInputs = {
    /**
     * Original instance fo the {Request} object. Must be modified in-place.
     */
    request: Request;
};
export type PrepareRequest = (inputs: PrepareRequestInputs) => void | Promise<void>;
export type CheerioHandlePageInputs = {
    /**
     * The <a href="https://cheerio.js.org/">Cheerio</a> object with parsed HTML.
     */
    $?: CheerioStatic;
    /**
     * The request body of the web page.
     */
    body: string | Buffer;
    /**
     * The parsed object from JSON string if the response contains the content type application/json.
     */
    json?: any;
    /**
     * The original {Request} object.
     */
    request: Request;
    /**
     * Parsed `Content-Type header: { type, encoding }`.
     */
    contentType: {
        type: string;
        encoding: string;
    };
    /**
     * An instance of Node's http.IncomingMessage object,
     */
    response: IncomingMessage;
    autoscaledPool: AutoscaledPool;
    session?: any;
};
export type CheerioHandlePage = (inputs: CheerioHandlePageInputs) => Promise<void>;
/**
 * @typedef {Object} CheerioCrawlerOptions
 * @property {CheerioHandlePage} handlePageFunction
 *   User-provided function that performs the logic of the crawler. It is called for each page
 *   loaded and parsed by the crawler.
 *
 *   The function receives the following object as an argument:
 * ```javascript
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
declare class CheerioCrawler {
    /**
     * @param {CheerioCrawlerOptions} options
     */
    constructor(options?: CheerioCrawlerOptions);
    supportedMimeTypes: Set<string>;
    requestOptions: utilsRequest.RequestAsBrowserOptions;
    handlePageFunction: CheerioHandlePage;
    handlePageTimeoutMillis: number;
    requestTimeoutMillis: number;
    ignoreSslErrors: boolean;
    useApifyProxy: boolean;
    apifyProxyGroups: string[];
    apifyProxySession: string;
    proxyUrls: any;
    lastUsedProxyUrlIndex: number;
    prepareRequestFunction: PrepareRequest;
    persistCookiesPerSession: boolean;
    useSessionPool: boolean;
    basicCrawler: any;
    isRunningPromise: any;
    /**
     * Runs the crawler. Returns promise that gets resolved once all the requests got processed.
     *
     * @return {Promise}
     */
    run(): Promise<any>;
    autoscaledPool: any;
    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @param {Object} options
     * @param {Request} options.request
     * @param {AutoscaledPool} options.autoscaledPool
     * @param {Session} options.session
     * @ignore
     */
    _handleRequestFunction({ request, autoscaledPool, session }: {
        request: Request;
        autoscaledPool: AutoscaledPool;
        session: Session;
    }): Promise<void>;
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
    _requestFunction({ request, session }: {
        request: Request;
        session: Session;
    }): Promise<{
        dom: any;
        isXml: boolean;
        response: any;
        contentType: {
            type: string;
            encoding: any;
        };
        body?: undefined;
    } | {
        body: any;
        response: any;
        contentType: {
            type: string;
            encoding: any;
        };
        dom?: undefined;
        isXml?: undefined;
    }>;
    /**
     * Combines the provided `requestOptions` with mandatory (non-overridable) values.
     * @param {Request} request
     * @param {Session?} session
     * @ignore
     */
    _getRequestOptions(request: Request, session: Session): utilsRequest.RequestAsBrowserOptions & {
        url: any;
        method: any;
        headers: any;
        ignoreSslErrors: boolean;
        proxyUrl: string;
        stream: boolean;
        useCaseSensitiveHeaders: boolean;
        abortFunction: (res: any) => boolean;
        timeoutSecs: number;
    };
    /**
     * Enables the use of a proxy by returning a proxy URL
     * based on configured options or null if no proxy is used.
     * @param {Session?} session
     * @returns {string|null}
     * @ignore
     */
    _getProxyUrl(session?: Session): string;
    _encodeResponse(request: any, response: any, encoding: any): {
        response: any;
        encoding: any;
    };
    _parseHtmlToDom(response: any): Promise<any>;
    /**
     * Checks and extends supported mime types
     * @param {Array<String|Object>} additionalMimeTypes
     * @ignore
     */
    _extendSupportedMimeTypes(additionalMimeTypes: any[]): void;
    /**
     * Handles blocked request
     * @param session {Session}
     * @param statusCode {Number}
     * @private
     */
    _throwOnBlockedRequest(session: Session, statusCode: number): void;
    /**
     * Handles timeout request
     * @param session {Session}
     * @private
     */
    _handleRequestTimeout(session: Session): void;
    /**
     * @param {Object} options
     * @param {Error} options.error
     * @param {Request} options.request
     * @return {Promise<void>}
     * @ignore
     */
    _defaultHandleFailedRequestFunction({ error, request }: {
        error: Error;
        request: Request;
    }): Promise<void>;
}
import { RequestList } from "../request_list";
import { RequestQueue } from "../request_queue";
import * as utilsRequest from "../utils_request";
import { HandleFailedRequest } from "./basic_crawler";
import { AutoscaledPoolOptions } from "../autoscaling/autoscaled_pool";
import { SessionPoolOptions } from "../session_pool/session_pool";
import Request from "../request";
import { IncomingMessage } from "http";
import AutoscaledPool from "../autoscaling/autoscaled_pool";
import { Session } from "../session_pool/session";
