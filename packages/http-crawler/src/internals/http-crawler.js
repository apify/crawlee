import { Readable } from 'node:stream';
import util from 'node:util';
import { BasicCrawler, ContextPipeline, NavigationSkippedError, remainingNavigationWindowMillis, RequestState, Router, SessionError, } from '@crawlee/basic';
import { RequestThrottledError, getCookiesFromResponse } from '@crawlee/core';
import { ResponseWithUrl } from '@crawlee/http-client';
import { parseArgument, RETRY_CSS_SELECTORS, schemas } from '@crawlee/utils/internal';
import contentTypeParser from 'content-type';
import iconv from 'iconv-lite';
import { z } from 'zod';
import { addTimeoutToPromise, storage, TimeoutError, tryCancel } from '@apify/timeout';
import { extractCharsetFromHtmlBytes, parseContentTypeFromResponse, processHttpRequestOptions } from './utils.js';
/**
 * Default mime types, which HttpScraper supports.
 */
const HTML_AND_XML_MIME_TYPES = ['text/html', 'text/xml', 'application/xhtml+xml', 'application/xml'];
const APPLICATION_JSON_MIME_TYPE = 'application/json';
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
export const HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS = {
    desiredConcurrency: 10,
    loadSignals: {
        eventLoop: {
            snapshotIntervalSecs: 2,
            maxBlockedMillis: 100,
            overloadedRatio: 0.7,
        },
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
export class HttpCrawler extends BasicCrawler {
    // Internal storage uses the base (non-extended) context types. The public option types are
    // extension-aware for consumer DX, but internally the pipeline composes hooks against the
    // concrete crawling context, which does not statically carry `ContextExtension`. The members
    // added by `extendContext` are present at runtime regardless.
    #preNavigationHooks;
    #postNavigationHooks;
    #saveResponseCookies;
    #navigationTimeoutMillis;
    #ignoreTlsErrors;
    #suggestResponseEncoding;
    #forceResponseEncoding;
    #supportedMimeTypes;
    /**
     * @internal
     */
    static optionsShape = {
        ...BasicCrawler.optionsShape,
        navigationTimeoutSecs: schemas.anyNumber.default(30),
        ignoreTlsErrors: z.boolean().default(true),
        additionalMimeTypes: schemas.arrayOf(z.string(), 'strings').default(() => []),
        suggestResponseEncoding: z.string().optional(),
        forceResponseEncoding: z.string().optional(),
        saveResponseCookies: z.boolean().default(true),
        preNavigationHooks: schemas.anyArray.default(() => []),
        postNavigationHooks: schemas.anyArray.default(() => []),
    };
    /** @internal */
    static optionsSchema = z.strictObject(HttpCrawler.optionsShape);
    /**
     * All `HttpCrawlerOptions` parameters are passed via an options object.
     */
    constructor(options = {}) {
        const { navigationTimeoutSecs, ignoreTlsErrors, additionalMimeTypes, suggestResponseEncoding, forceResponseEncoding, saveResponseCookies, preNavigationHooks, postNavigationHooks, 
        // BasicCrawler
        contextPipelineBuilder, ...basicCrawlerOptions } = parseArgument(options, HttpCrawler.optionsSchema, 'HttpCrawlerOptions');
        super({
            ...basicCrawlerOptions,
            contextPipelineBuilder: contextPipelineBuilder ??
                (() => this.buildContextPipeline()),
        });
        this.#supportedMimeTypes = new Set([...HTML_AND_XML_MIME_TYPES, APPLICATION_JSON_MIME_TYPE]);
        if (additionalMimeTypes.length)
            this.extendSupportedMimeTypes(additionalMimeTypes);
        if (suggestResponseEncoding && forceResponseEncoding) {
            this.log.warning('Both forceResponseEncoding and suggestResponseEncoding options are set. Using forceResponseEncoding.');
        }
        this.#navigationTimeoutMillis = navigationTimeoutSecs * 1000;
        this.#ignoreTlsErrors = ignoreTlsErrors;
        this.#suggestResponseEncoding = suggestResponseEncoding;
        this.#forceResponseEncoding = forceResponseEncoding;
        // Cast away the extension-aware option types to the base internal storage types (see the field
        // declarations above). This is sound - the hooks only ever receive the base context plus the
        // members `extendContext` added at runtime.
        this.#preNavigationHooks = preNavigationHooks;
        this.#postNavigationHooks = [
            ({ request, response }) => this.abortDownloadOfBody(request, response),
            ...postNavigationHooks,
        ];
        this.#saveResponseCookies = saveResponseCookies;
    }
    getNavigationTimeoutMillis() {
        return this.#navigationTimeoutMillis;
    }
    /**
     * Folds {@apilink HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS} into the default system, keeping the user's
     * concurrency shortcuts on top. Not called for a supplied
     * {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`} — spread the constant into it yourself to
     * keep the tuning.
     */
    createDefaultConcurrencySystem(options) {
        return super.createDefaultConcurrencySystem({
            ...HTTP_OPTIMIZED_CONCURRENCY_SYSTEM_OPTIONS,
            ...options,
        });
    }
    buildContextPipeline() {
        // When navigation is skipped, `prepareHttpRequest` has already installed throwing getters for
        // the response-derived members, so the guarded action is bypassed and the context left untouched.
        const skipGuard = (action) => ({
            action: async (ctx) => (ctx.request.skipNavigation ? {} : ((await action(ctx)) ?? {})),
        });
        // A single navigation window covers the pre-navigation hooks, the navigation, and the post-navigation
        // hooks: the whole phase shares one `navigationTimeoutSecs` budget, so a slow hook eats into the same
        // window the navigation uses instead of each step being timed on its own.
        const navigationTimedOut = `Navigation timed out after ${this.#navigationTimeoutMillis / 1000} seconds.`;
        const windowGuard = (step) => skipGuard(async (ctx) => {
            const remaining = remainingNavigationWindowMillis(ctx, this.#navigationTimeoutMillis);
            if (remaining <= 0) {
                throw new TimeoutError(navigationTimedOut);
            }
            return addTimeoutToPromise(async () => step(ctx), remaining, navigationTimedOut);
        });
        let pipeline = ContextPipeline.create().compose({
            action: this.prepareHttpRequest.bind(this),
        });
        for (const hook of this.#preNavigationHooks) {
            pipeline = pipeline.compose(windowGuard(hook));
        }
        let pipelineWithNavigation = pipeline.compose(skipGuard(this.makeHttpRequest.bind(this)));
        for (const hook of this.#postNavigationHooks) {
            pipelineWithNavigation = pipelineWithNavigation.compose(windowGuard(hook));
        }
        return pipelineWithNavigation
            .compose({ action: this.processHttpResponse.bind(this) })
            .compose({ action: this.handleBlockedRequestByContent.bind(this) });
    }
    async prepareHttpRequest(crawlingContext) {
        const { request } = crawlingContext;
        if (request.skipNavigation) {
            return {
                request: new Proxy(request, {
                    get(target, propertyName, receiver) {
                        if (propertyName === 'loadedUrl') {
                            throw new NavigationSkippedError('The `request.loadedUrl` property is not available - `skipNavigation` was used');
                        }
                        return Reflect.get(target, propertyName, receiver);
                    },
                }),
                get response() {
                    throw new NavigationSkippedError('The `response` property is not available - `skipNavigation` was used');
                },
            };
        }
        request.state = RequestState.BEFORE_NAV;
        return {};
    }
    async makeHttpRequest(crawlingContext) {
        tryCancel();
        const { request, session } = crawlingContext;
        const proxyUrl = crawlingContext.proxyInfo?.url;
        // Bound the request by whatever is left of the shared navigation window (the pre-navigation hooks may
        // have already spent part of it), so it produces a clean navigation-timeout error rather than the raw
        // client abort.
        const httpResponse = await addTimeoutToPromise(async () => this.requestFunction({ request, session, proxyUrl }), Math.max(1, remainingNavigationWindowMillis(crawlingContext, this.#navigationTimeoutMillis)), `Navigation timed out after ${this.#navigationTimeoutMillis / 1000} seconds.`);
        tryCancel();
        request.loadedUrl = httpResponse?.url;
        request.state = RequestState.AFTER_NAV;
        return { request: request, response: httpResponse };
    }
    async processHttpResponse(crawlingContext) {
        if (crawlingContext.request.skipNavigation) {
            return {
                get contentType() {
                    throw new NavigationSkippedError('The `contentType` property is not available - `skipNavigation` was used');
                },
                get body() {
                    throw new NavigationSkippedError('The `body` property is not available - `skipNavigation` was used');
                },
                get json() {
                    throw new NavigationSkippedError('The `json` property is not available - `skipNavigation` was used');
                },
                get waitForSelector() {
                    throw new NavigationSkippedError('The `waitForSelector` method is not available - `skipNavigation` was used');
                },
                get parseWithCheerio() {
                    throw new NavigationSkippedError('The `parseWithCheerio` method is not available - `skipNavigation` was used');
                },
            };
        }
        tryCancel();
        // Before `parseResponse`, which throws for error status codes - a 429 the user opted into treating as an
        // error is still a rate limit the domain should back off from.
        if (crawlingContext.response.status === 429) {
            const retryAfter = crawlingContext.response.headers.get('retry-after');
            if (this.recordDomainRateLimit(crawlingContext.request.url, retryAfter)) {
                // This is the one path that never reads the body, so cancel it to release the connection
                // rather than leaving it to the garbage collector.
                await crawlingContext.response.body?.cancel().catch(() => { });
                throw new RequestThrottledError(`${crawlingContext.request.url} responded with 429.`);
            }
        }
        // Reading the body is still part of the navigation, so it draws from the same shared window: on a server
        // that streams the body slowly the request completes (headers arrive) but the body read would otherwise
        // run unbounded. `extendTimeout` from a post-navigation hook has already pushed this deadline out if asked.
        const remaining = remainingNavigationWindowMillis(crawlingContext, this.#navigationTimeoutMillis);
        if (remaining <= 0) {
            throw new TimeoutError(`Navigation timed out after ${this.#navigationTimeoutMillis / 1000} seconds.`);
        }
        const parsed = await addTimeoutToPromise(async () => this.parseResponse(crawlingContext.request, crawlingContext.response), remaining, `Navigation timed out after ${this.#navigationTimeoutMillis / 1000} seconds.`);
        tryCancel();
        const response = parsed.response;
        const contentType = parsed.contentType;
        const waitForSelector = async (selector, _timeoutMs) => {
            const cheerio = await import('cheerio');
            const $ = cheerio.load(parsed.body.toString());
            if ($(selector).get().length === 0) {
                throw new Error(`Selector '${selector}' not found.`);
            }
        };
        const parseWithCheerio = async (selector, timeoutMs) => {
            const cheerio = await import('cheerio');
            const $ = cheerio.load(parsed.body.toString());
            if (selector) {
                await crawlingContext.waitForSelector(selector, timeoutMs);
            }
            return $;
        };
        this.throwOnBlockedRequest(response.status);
        if (this.#saveResponseCookies) {
            try {
                for (const cookie of getCookiesFromResponse(response)) {
                    if (!cookie)
                        continue;
                    try {
                        await crawlingContext.session.cookieJar.setCookie(cookie, response.url, {
                            ignoreError: false,
                        });
                    }
                    catch (e) {
                        this.log.debug(`Could not set cookie: ${e.message}`);
                    }
                }
            }
            catch (e) {
                this.log.exception(e, 'Could not get cookies from response');
            }
        }
        return {
            get json() {
                if (contentType.type !== APPLICATION_JSON_MIME_TYPE)
                    return null;
                const jsonString = parsed.body.toString(contentType.encoding);
                return JSON.parse(jsonString);
            },
            waitForSelector,
            parseWithCheerio,
            contentType,
            body: parsed.body,
        };
    }
    async handleBlockedRequestByContent(crawlingContext) {
        if (this.retryOnBlocked) {
            const error = await this.isRequestBlocked(crawlingContext);
            if (error)
                throw new SessionError(error);
        }
        return {};
    }
    async isRequestBlocked(crawlingContext) {
        if (HTML_AND_XML_MIME_TYPES.includes(crawlingContext.contentType.type)) {
            const $ = await crawlingContext.parseWithCheerio();
            const foundSelectors = RETRY_CSS_SELECTORS.filter((selector) => $(selector).length > 0);
            if (foundSelectors.length > 0) {
                return `Found selectors: ${foundSelectors.join(', ')}`;
            }
        }
        if (this.blockedStatusCodes.has(crawlingContext.response.status)) {
            return `Blocked by status code ${crawlingContext.response.status}`;
        }
        return false;
    }
    /**
     * Function to make the HTTP request. It performs optimizations
     * on the request such as only downloading the request body if the
     * received content type matches text/html, application/xml, application/xhtml+xml.
     */
    async requestFunction({ request, session, proxyUrl }) {
        const opts = this.getRequestOptions(request, session, proxyUrl);
        try {
            return await this.requestAsBrowser(opts, session);
        }
        catch (e) {
            if (e instanceof Error && e.constructor.name === 'TimeoutError') {
                this.handleRequestTimeout(session);
                return new Response(); // this will never happen, as handleRequestTimeout always throws
            }
            if (this.isProxyError(e)) {
                throw new SessionError(this.getMessageFromError(e));
            }
            else {
                throw e;
            }
        }
    }
    /**
     * Encodes and parses response according to the provided content type
     */
    async parseResponse(request, response) {
        const { status } = response;
        const { type, charset } = parseContentTypeFromResponse(response);
        const { response: reencodedResponse, encoding } = this.encodeResponse(request, response, charset);
        const contentType = { type, encoding };
        if (status >= 400 && status <= 599) {
            this.statistics.registerStatusCode(status);
        }
        if (this.isErrorStatusCode(status)) {
            const body = await reencodedResponse.text(); // TODO - this always uses UTF-8 (see https://developer.mozilla.org/en-US/docs/Web/API/Request/text)
            // Errors are often sent as JSON, so attempt to parse them,
            // despite Accept header being set to text/html.
            if (type === APPLICATION_JSON_MIME_TYPE) {
                const errorResponse = JSON.parse(body);
                let { message } = errorResponse;
                if (!message)
                    message = util.inspect(errorResponse, { depth: 1, maxArrayLength: 10 });
                throw new Error(`${status} - ${message}`);
            }
            if (this.additionalHttpErrorStatusCodes.has(status)) {
                throw new Error(`${status} - Error status code was set by user.`);
            }
            // It's not a JSON, so it's probably some text. Get the first 100 chars of it.
            throw new Error(`${status} - Internal Server Error: ${body.slice(0, 100)}`);
        }
        else if (HTML_AND_XML_MIME_TYPES.includes(type)) {
            if (!charset && !this.#forceResponseEncoding) {
                const rawBytes = Buffer.from(await response.arrayBuffer());
                const metaCharset = extractCharsetFromHtmlBytes(rawBytes);
                const charsetToUse = metaCharset ?? this.#suggestResponseEncoding ?? 'utf-8';
                const body = iconv.encodingExists(charsetToUse)
                    ? iconv.decode(rawBytes, charsetToUse)
                    : rawBytes.toString('utf8');
                return { response, contentType: { type, encoding: 'utf-8' }, body };
            }
            return { response, contentType, body: await reencodedResponse.text() };
        }
        else {
            const body = Buffer.from(await reencodedResponse.bytes());
            return {
                body,
                response,
                contentType,
            };
        }
    }
    /**
     * Combines the provided `requestOptions` with mandatory (non-overridable) values.
     */
    getRequestOptions(request, session, proxyUrl) {
        const requestOptions = {
            url: request.url,
            method: request.method,
            proxyUrl,
            timeout: this.#navigationTimeoutMillis,
            sessionToken: session,
            headers: request.headers,
            body: undefined,
        };
        if (requestOptions.headers?.cookie || requestOptions.headers?.Cookie) {
            requestOptions.headers.Cookie = this.getCookieHeaderFromRequest(request);
            delete requestOptions.headers.cookie;
        }
        if (/PATCH|POST|PUT/.test(request.method))
            requestOptions.body = request.payload ?? '';
        return requestOptions;
    }
    encodeResponse(request, response, encoding) {
        if (this.#forceResponseEncoding) {
            encoding = this.#forceResponseEncoding;
        }
        else if (!encoding && this.#suggestResponseEncoding) {
            encoding = this.#suggestResponseEncoding;
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
        if (iconv.encodingExists(encoding)) {
            const encodeStream = iconv.encodeStream(utf8);
            const decodeStream = iconv
                .decodeStream(encoding)
                .on('error', (err) => encodeStream.emit('error', err));
            const reencodedBody = response.body
                ? Readable.toWeb(Readable.from(Readable.fromWeb(response.body)
                    .pipe(decodeStream)
                    .pipe(encodeStream)))
                : null;
            return {
                response: new ResponseWithUrl(reencodedBody, response),
                encoding: utf8,
            };
        }
        throw new Error(`Resource ${request.url} served with unsupported charset/encoding: ${encoding}`);
    }
    /**
     * Checks and extends supported mime types
     */
    extendSupportedMimeTypes(additionalMimeTypes) {
        for (const mimeType of additionalMimeTypes) {
            if (mimeType === '*/*') {
                this.#supportedMimeTypes.add(mimeType);
                continue;
            }
            try {
                const parsedType = contentTypeParser.parse(mimeType);
                this.#supportedMimeTypes.add(parsedType.type);
            }
            catch (err) {
                throw new Error(`Can not parse mime type ${mimeType} from "options.additionalMimeTypes".`);
            }
        }
    }
    /**
     * Handles timeout request
     */
    handleRequestTimeout(session) {
        session.markBad();
        throw new Error(`Request timed out after ${this.#navigationTimeoutMillis / 1000} seconds.`);
    }
    abortDownloadOfBody(request, response) {
        const { status } = response;
        const { type } = parseContentTypeFromResponse(response);
        const isTransientContentType = status >= 500 || this.blockedStatusCodes.has(status);
        if (!this.#supportedMimeTypes.has(type) && !this.#supportedMimeTypes.has('*/*') && !isTransientContentType) {
            request.noRetry = true;
            throw new Error(`Resource ${request.url} served Content-Type ${type}, ` +
                `but only ${Array.from(this.#supportedMimeTypes).join(', ')} are allowed. Skipping resource.`);
        }
    }
    /**
     * @internal wraps public utility for mocking purposes
     */
    requestAsBrowser = async (options, session) => {
        const opts = processHttpRequestOptions({
            ...options,
            responseType: 'text',
        });
        // When saveResponseCookies is false, the response cookies must not mutate the
        // session jar. Reads still go through the session (so session.setCookie() in pre-nav
        // hooks keeps working) but a per-request clone is passed in so writes are discarded.
        const cookieJar = this.#saveResponseCookies ? session.cookieJar : await session.cookieJar.clone();
        // Bind the request to the shared navigation window instead of a fixed per-request timeout, so
        // `extendTimeout()` can push the deadline and a fixed `AbortSignal.timeout` won't fire on its own and
        // kill a lazily-read body mid-extension. This aborts the socket only during the header phase; the body
        // read is bounded separately at the promise level (see `processHttpResponse`), so a slow-streaming body
        // still fails cleanly with a navigation timeout, though the socket is left to close on its own.
        const cancelSignal = storage.getStore()?.cancelTask.signal;
        const response = await this.httpClient.sendRequest(new Request(opts.url, {
            body: opts.body ? Readable.toWeb(opts.body) : undefined,
            headers: new Headers(opts.headers),
            method: opts.method,
            // Node-specific option to make the request body work with streams
            duplex: 'half',
        }), {
            session,
            cookieJar,
            signal: cancelSignal,
            timeoutMillis: cancelSignal ? undefined : opts.timeout,
            ignoreTlsErrors: this.#ignoreTlsErrors,
        });
        return response;
    };
}
export function createHttpRouter(routesOrSchemas) {
    return Router.create(routesOrSchemas);
}
