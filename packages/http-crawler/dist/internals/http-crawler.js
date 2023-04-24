"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHttpRouter = exports.HttpCrawler = void 0;
const tslib_1 = require("tslib");
const timeout_1 = require("@apify/timeout");
const utilities_1 = require("@apify/utilities");
const basic_1 = require("@crawlee/basic");
const content_type_1 = tslib_1.__importDefault(require("content-type"));
const mime_types_1 = tslib_1.__importDefault(require("mime-types"));
const got_scraping_1 = require("got-scraping");
const node_path_1 = require("node:path");
const iconv_lite_1 = tslib_1.__importDefault(require("iconv-lite"));
const ow_1 = tslib_1.__importDefault(require("ow"));
const node_util_1 = tslib_1.__importDefault(require("node:util"));
/**
 * Default mime types, which HttpScraper supports.
 */
const HTML_AND_XML_MIME_TYPES = ['text/html', 'text/xml', 'application/xhtml+xml', 'application/xml'];
const APPLICATION_JSON_MIME_TYPE = 'application/json';
const HTTP_OPTIMIZED_AUTOSCALED_POOL_OPTIONS = {
    desiredConcurrency: 10,
    snapshotterOptions: {
        eventLoopSnapshotIntervalSecs: 2,
        maxBlockedMillis: 100,
    },
    systemStatusOptions: {
        maxEventLoopOverloadedRatio: 0.7,
    },
};
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
class HttpCrawler extends basic_1.BasicCrawler {
    /**
     * All `HttpCrawlerOptions` parameters are passed via an options object.
     */
    constructor(options = {}, config = basic_1.Configuration.getGlobalConfig()) {
        (0, ow_1.default)(options, 'HttpCrawlerOptions', ow_1.default.object.exactShape(HttpCrawler.optionsShape));
        const { requestHandler, handlePageFunction, requestHandlerTimeoutSecs = 60, navigationTimeoutSecs = 30, ignoreSslErrors = true, additionalMimeTypes = [], suggestResponseEncoding, forceResponseEncoding, proxyConfiguration, persistCookiesPerSession, preNavigationHooks = [], postNavigationHooks = [], 
        // Ignored
        handleRequestFunction, 
        // BasicCrawler
        autoscaledPoolOptions = HTTP_OPTIMIZED_AUTOSCALED_POOL_OPTIONS, ...basicCrawlerOptions } = options;
        super({
            ...basicCrawlerOptions,
            requestHandler,
            autoscaledPoolOptions,
            // We need to add some time for internal functions to finish,
            // but not too much so that we would stall the crawler.
            requestHandlerTimeoutSecs: navigationTimeoutSecs + requestHandlerTimeoutSecs + basic_1.BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
        }, config);
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        /**
         * A reference to the underlying {@apilink ProxyConfiguration} class that manages the crawler's proxies.
         * Only available if used by the crawler.
         */
        Object.defineProperty(this, "proxyConfiguration", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "userRequestHandlerTimeoutMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "preNavigationHooks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "postNavigationHooks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "persistCookiesPerSession", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "navigationTimeoutMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ignoreSslErrors", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "suggestResponseEncoding", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "forceResponseEncoding", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "supportedMimeTypes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * @internal wraps public utility for mocking purposes
         */
        Object.defineProperty(this, "_requestAsBrowser", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (options, session) => {
                return new Promise((resolve, reject) => {
                    const stream = (0, got_scraping_1.gotScraping)(options);
                    stream.on('redirect', (updatedOptions, redirectResponse) => {
                        if (this.persistCookiesPerSession) {
                            session.setCookiesFromResponse(redirectResponse);
                            const cookieString = session.getCookieString(updatedOptions.url.toString());
                            if (cookieString !== '') {
                                updatedOptions.headers.Cookie = cookieString;
                            }
                        }
                    });
                    stream.on('error', reject);
                    stream.on('response', () => {
                        resolve(addResponsePropertiesToStream(stream));
                    });
                });
            }
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
        if (additionalMimeTypes.length)
            this._extendSupportedMimeTypes(additionalMimeTypes);
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
            ({ request, response }) => this._abortDownloadOfBody(request, response),
            ...postNavigationHooks,
        ];
        if (this.useSessionPool) {
            this.persistCookiesPerSession = persistCookiesPerSession ?? true;
        }
        else {
            this.persistCookiesPerSession = false;
        }
    }
    /**
     * **EXPERIMENTAL**
     * Function for attaching CrawlerExtensions such as the Unblockers.
     * @param extension Crawler extension that overrides the crawler configuration.
     */
    use(extension) {
        (0, ow_1.default)(extension, ow_1.default.object.instanceOf(basic_1.CrawlerExtension));
        const className = this.constructor.name;
        const extensionOptions = extension.getCrawlerOptions();
        for (const [key, value] of Object.entries(extensionOptions)) {
            const isConfigurable = this.hasOwnProperty(key);
            const originalType = typeof this[key];
            const extensionType = typeof value; // What if we want to null something? It is really needed?
            const isSameType = originalType === extensionType || value == null; // fast track for deleting keys
            const exists = this[key] != null;
            if (!isConfigurable) { // Test if the property can be configured on the crawler
                throw new Error(`${extension.name} tries to set property "${key}" that is not configurable on ${className} instance.`);
            }
            if (!isSameType && exists) { // Assuming that extensions will only add up configuration
                throw new Error(`${extension.name} tries to set property of different type "${extensionType}". "${className}.${key}: ${originalType}".`);
            }
            this.log.warning(`${extension.name} is overriding "${className}.${key}: ${originalType}" with ${value}.`);
            this[key] = value;
        }
    }
    /**
     * Wrapper around requestHandler that opens and closes pages etc.
     */
    async _runRequestHandler(crawlingContext) {
        const { request, session } = crawlingContext;
        if (this.proxyConfiguration) {
            const sessionId = session ? session.id : undefined;
            crawlingContext.proxyInfo = await this.proxyConfiguration.newProxyInfo(sessionId);
        }
        if (!request.skipNavigation) {
            await this._handleNavigation(crawlingContext);
            (0, timeout_1.tryCancel)();
            const parsed = await this._parseResponse(request, crawlingContext.response, crawlingContext);
            const response = parsed.response;
            const contentType = parsed.contentType;
            (0, timeout_1.tryCancel)();
            if (this.useSessionPool) {
                this._throwOnBlockedRequest(session, response.statusCode);
            }
            if (this.persistCookiesPerSession) {
                session.setCookiesFromResponse(response);
            }
            request.loadedUrl = response.url;
            Object.assign(crawlingContext, parsed);
            Object.defineProperty(crawlingContext, 'json', {
                get() {
                    if (contentType.type !== APPLICATION_JSON_MIME_TYPE)
                        return null;
                    const jsonString = parsed.body.toString(contentType.encoding);
                    return JSON.parse(jsonString);
                },
            });
        }
        request.state = basic_1.RequestState.REQUEST_HANDLER;
        try {
            await (0, timeout_1.addTimeoutToPromise)(() => Promise.resolve(this.requestHandler(crawlingContext)), this.userRequestHandlerTimeoutMillis, `requestHandler timed out after ${this.userRequestHandlerTimeoutMillis / 1000} seconds.`);
            request.state = basic_1.RequestState.DONE;
        }
        catch (e) {
            request.state = basic_1.RequestState.ERROR;
            throw e;
        }
    }
    async _handleNavigation(crawlingContext) {
        const gotOptions = {};
        const { request, session } = crawlingContext;
        const preNavigationHooksCookies = this._getCookieHeaderFromRequest(request);
        request.state = basic_1.RequestState.BEFORE_NAV;
        // Execute pre navigation hooks before applying session pool cookies,
        // as they may also set cookies in the session
        await this._executeHooks(this.preNavigationHooks, crawlingContext, gotOptions);
        (0, timeout_1.tryCancel)();
        const postNavigationHooksCookies = this._getCookieHeaderFromRequest(request);
        this._applyCookies(crawlingContext, gotOptions, preNavigationHooksCookies, postNavigationHooksCookies);
        const proxyUrl = crawlingContext.proxyInfo?.url;
        crawlingContext.response = await (0, timeout_1.addTimeoutToPromise)(() => this._requestFunction({ request, session, proxyUrl, gotOptions }), this.navigationTimeoutMillis, `request timed out after ${this.navigationTimeoutMillis / 1000} seconds.`);
        (0, timeout_1.tryCancel)();
        request.state = basic_1.RequestState.AFTER_NAV;
        await this._executeHooks(this.postNavigationHooks, crawlingContext, gotOptions);
        (0, timeout_1.tryCancel)();
    }
    /**
     * Sets the cookie header to `gotOptions` based on the provided request and session headers, as well as any changes that occurred due to hooks.
     */
    _applyCookies({ session, request }, gotOptions, preHookCookies, postHookCookies) {
        const sessionCookie = session?.getCookieString(request.url) ?? '';
        let alteredGotOptionsCookies = (gotOptions.headers?.Cookie || gotOptions.headers?.cookie || '');
        if (gotOptions.headers?.Cookie && gotOptions.headers?.cookie) {
            const { Cookie: upperCaseHeader, cookie: lowerCaseHeader, } = gotOptions.headers;
            // eslint-disable-next-line max-len
            this.log.warning(`Encountered mixed casing for the cookie headers in the got options for request ${request.url} (${request.id}). Their values will be merged`);
            const sourceCookies = [];
            if (Array.isArray(lowerCaseHeader)) {
                sourceCookies.push(...lowerCaseHeader);
            }
            else {
                sourceCookies.push(lowerCaseHeader);
            }
            if (Array.isArray(upperCaseHeader)) {
                sourceCookies.push(...upperCaseHeader);
            }
            else {
                sourceCookies.push(upperCaseHeader);
            }
            alteredGotOptionsCookies = (0, basic_1.mergeCookies)(request.url, sourceCookies);
        }
        const sourceCookies = [
            sessionCookie,
            preHookCookies,
        ];
        if (Array.isArray(alteredGotOptionsCookies)) {
            sourceCookies.push(...alteredGotOptionsCookies);
        }
        else {
            sourceCookies.push(alteredGotOptionsCookies);
        }
        sourceCookies.push(postHookCookies);
        const mergedCookie = (0, basic_1.mergeCookies)(request.url, sourceCookies);
        gotOptions.headers ?? (gotOptions.headers = {});
        Reflect.deleteProperty(gotOptions.headers, 'Cookie');
        Reflect.deleteProperty(gotOptions.headers, 'cookie');
        if (mergedCookie !== '') {
            gotOptions.headers.Cookie = mergedCookie;
        }
    }
    /**
     * Function to make the HTTP request. It performs optimizations
     * on the request such as only downloading the request body if the
     * received content type matches text/html, application/xml, application/xhtml+xml.
     */
    async _requestFunction({ request, session, proxyUrl, gotOptions }) {
        const opts = this._getRequestOptions(request, session, proxyUrl, gotOptions);
        try {
            return await this._requestAsBrowser(opts, session);
        }
        catch (e) {
            if (e instanceof got_scraping_1.TimeoutError) {
                this._handleRequestTimeout(session);
                return undefined;
            }
            throw e;
        }
    }
    /**
     * Encodes and parses response according to the provided content type
     */
    async _parseResponse(request, responseStream, crawlingContext) {
        const { statusCode } = responseStream;
        const { type, charset } = parseContentTypeFromResponse(responseStream);
        const { response, encoding } = this._encodeResponse(request, responseStream, charset);
        const contentType = { type, encoding };
        if (statusCode >= 400 && statusCode <= 599) {
            this.stats.registerStatusCode(statusCode);
        }
        if (statusCode >= 500) {
            const body = await (0, utilities_1.readStreamToString)(response, encoding);
            // Errors are often sent as JSON, so attempt to parse them,
            // despite Accept header being set to text/html.
            if (type === APPLICATION_JSON_MIME_TYPE) {
                const errorResponse = JSON.parse(body);
                let { message } = errorResponse;
                if (!message)
                    message = node_util_1.default.inspect(errorResponse, { depth: 1, maxArrayLength: 10 });
                throw new Error(`${statusCode} - ${message}`);
            }
            // It's not a JSON, so it's probably some text. Get the first 100 chars of it.
            throw new Error(`${statusCode} - Internal Server Error: ${body.slice(0, 100)}`);
        }
        else if (HTML_AND_XML_MIME_TYPES.includes(type)) {
            const isXml = type.includes('xml');
            const parsed = await this._parseHTML(response, isXml, crawlingContext);
            return { ...parsed, isXml, response, contentType };
        }
        else {
            const body = await (0, utilities_1.concatStreamToBuffer)(response);
            return { body, response, contentType, enqueueLinks: () => Promise.resolve({ processedRequests: [], unprocessedRequests: [] }) };
        }
    }
    async _parseHTML(response, _isXml, _crawlingContext) {
        return {
            body: await (0, utilities_1.concatStreamToBuffer)(response),
        };
    }
    /**
     * Combines the provided `requestOptions` with mandatory (non-overridable) values.
     */
    _getRequestOptions(request, session, proxyUrl, gotOptions) {
        const requestOptions = {
            url: request.url,
            method: request.method,
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
        Reflect.deleteProperty(requestOptions.headers, 'cookie');
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
        if (/PATCH|POST|PUT/.test(request.method))
            requestOptions.body = request.payload ?? '';
        return requestOptions;
    }
    _encodeResponse(request, response, encoding) {
        if (this.forceResponseEncoding) {
            encoding = this.forceResponseEncoding;
        }
        else if (!encoding && this.suggestResponseEncoding) {
            encoding = this.suggestResponseEncoding;
        }
        // Fall back to utf-8 if we still don't have encoding.
        const utf8 = 'utf8';
        if (!encoding)
            return { response, encoding: utf8 };
        // This means that the encoding is one of Node.js supported
        // encodings and we don't need to re-encode it.
        if (Buffer.isEncoding(encoding))
            return { response, encoding };
        // Try to re-encode a variety of unsupported encodings to utf-8
        if (iconv_lite_1.default.encodingExists(encoding)) {
            const encodeStream = iconv_lite_1.default.encodeStream(utf8);
            const decodeStream = iconv_lite_1.default.decodeStream(encoding).on('error', (err) => encodeStream.emit('error', err));
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
    /**
     * Checks and extends supported mime types
     */
    _extendSupportedMimeTypes(additionalMimeTypes) {
        for (const mimeType of additionalMimeTypes) {
            if (mimeType === '*/*') {
                this.supportedMimeTypes.add(mimeType);
                continue;
            }
            try {
                const parsedType = content_type_1.default.parse(mimeType);
                this.supportedMimeTypes.add(parsedType.type);
            }
            catch (err) {
                throw new Error(`Can not parse mime type ${mimeType} from "options.additionalMimeTypes".`);
            }
        }
    }
    /**
     * Handles timeout request
     */
    _handleRequestTimeout(session) {
        session?.markBad();
        throw new Error(`request timed out after ${this.requestHandlerTimeoutMillis / 1000} seconds.`);
    }
    _abortDownloadOfBody(request, response) {
        const { statusCode } = response;
        const { type } = parseContentTypeFromResponse(response);
        if (statusCode === 406) {
            request.noRetry = true;
            throw new Error(`Resource ${request.url} is not available in the format requested by the Accept header. Skipping resource.`);
        }
        if (!this.supportedMimeTypes.has(type) && !this.supportedMimeTypes.has('*/*') && statusCode < 500) {
            request.noRetry = true;
            throw new Error(`Resource ${request.url} served Content-Type ${type}, `
                + `but only ${Array.from(this.supportedMimeTypes).join(', ')} are allowed. Skipping resource.`);
        }
    }
}
Object.defineProperty(HttpCrawler, "optionsShape", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        ...basic_1.BasicCrawler.optionsShape,
        handlePageFunction: ow_1.default.optional.function,
        navigationTimeoutSecs: ow_1.default.optional.number,
        ignoreSslErrors: ow_1.default.optional.boolean,
        additionalMimeTypes: ow_1.default.optional.array.ofType(ow_1.default.string),
        suggestResponseEncoding: ow_1.default.optional.string,
        forceResponseEncoding: ow_1.default.optional.string,
        proxyConfiguration: ow_1.default.optional.object.validate(basic_1.validators.proxyConfiguration),
        persistCookiesPerSession: ow_1.default.optional.boolean,
        preNavigationHooks: ow_1.default.optional.array,
        postNavigationHooks: ow_1.default.optional.array,
    }
});
exports.HttpCrawler = HttpCrawler;
/**
 * The stream object returned from got does not have the below properties.
 * At the same time, you can't read data directly from the response stream,
 * because they won't get emitted unless you also read from the primary
 * got stream. To be able to work with only one stream, we move the expected props
 * from the response stream to the got stream.
 * @internal
 */
function addResponsePropertiesToStream(stream) {
    const properties = [
        'statusCode', 'statusMessage', 'headers',
        'complete', 'httpVersion', 'rawHeaders',
        'rawTrailers', 'trailers', 'url',
        'request',
    ];
    const response = stream.response;
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
            stream[prop] = response[prop];
        }
    }
    return stream;
}
/**
 * Gets parsed content type from response object
 * @param response HTTP response object
 */
function parseContentTypeFromResponse(response) {
    (0, ow_1.default)(response, ow_1.default.object.partialShape({
        url: ow_1.default.string.url,
        headers: ow_1.default.object,
    }));
    const { url, headers } = response;
    let parsedContentType;
    if (headers['content-type']) {
        try {
            parsedContentType = content_type_1.default.parse(headers['content-type']);
        }
        catch {
            // Can not parse content type from Content-Type header. Try to parse it from file extension.
        }
    }
    // Parse content type from file extension as fallback
    if (!parsedContentType) {
        const parsedUrl = new URL(url);
        const contentTypeFromExtname = mime_types_1.default.contentType((0, node_path_1.extname)(parsedUrl.pathname))
            || 'application/octet-stream; charset=utf-8'; // Fallback content type, specified in https://tools.ietf.org/html/rfc7231#section-3.1.1.5
        parsedContentType = content_type_1.default.parse(contentTypeFromExtname);
    }
    return {
        type: parsedContentType.type,
        charset: parsedContentType.parameters.charset,
    };
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
function createHttpRouter(routes) {
    return basic_1.Router.create(routes);
}
exports.createHttpRouter = createHttpRouter;
//# sourceMappingURL=http-crawler.js.map