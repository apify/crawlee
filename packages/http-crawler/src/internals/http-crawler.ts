import { addTimeoutToPromise, tryCancel } from '@apify/timeout';
import { concatStreamToBuffer, readStreamToString } from '@apify/utilities';
import type {
    AutoscaledPoolOptions,
    BasicCrawlerOptions,
    ErrorHandler,
    RequestHandler,
    CrawlingContext,
    ProxyConfiguration,
    Request,
    Session,
} from '@crawlee/basic';
import {
    BasicCrawler,
    BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
    CrawlerExtension,
    mergeCookies,
    Router,
    validators,
    Configuration,
    RequestState,
} from '@crawlee/basic';
import type { Awaitable, Dictionary } from '@crawlee/types';
import type { RequestLike, ResponseLike } from 'content-type';
import contentTypeParser from 'content-type';
import mime from 'mime-types';
import type { OptionsInit, Method, Request as GotRequest, Options } from 'got-scraping';
import { gotScraping, TimeoutError } from 'got-scraping';
import type { JsonValue } from 'type-fest';
import { extname } from 'node:path';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import iconv from 'iconv-lite';
import ow from 'ow';
import util from 'node:util';

/**
 * Default mime types, which HttpScraper supports.
 */
const HTML_AND_XML_MIME_TYPES = ['text/html', 'text/xml', 'application/xhtml+xml', 'application/xml'];
const APPLICATION_JSON_MIME_TYPE = 'application/json';
const HTTP_OPTIMIZED_AUTOSCALED_POOL_OPTIONS: AutoscaledPoolOptions = {
    desiredConcurrency: 10,
    snapshotterOptions: {
        eventLoopSnapshotIntervalSecs: 2,
        maxBlockedMillis: 100,
    },
    systemStatusOptions: {
        maxEventLoopOverloadedRatio: 0.7,
    },
};

export type HttpErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends JsonValue = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > = ErrorHandler<HttpCrawlingContext<UserData, JSONData>>;

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
export type InternalHttpHook<Context> = (
    crawlingContext: Context,
    gotOptions: OptionsInit,
) => Awaitable<void>;

export type HttpHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends JsonValue = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = InternalHttpHook<HttpCrawlingContext<UserData, JSONData>>;

/**
 * @internal
 */
export interface InternalHttpCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends JsonValue = any, // with default to Dictionary we cant use a typed router in untyped crawler
    Crawler = HttpCrawler<any>
    > extends CrawlingContext<Crawler, UserData> {
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
    contentType: { type: string; encoding: BufferEncoding };
    response: IncomingMessage;
}

export interface HttpCrawlingContext<UserData extends Dictionary = any, JSONData extends JsonValue = any>
    extends InternalHttpCrawlingContext<UserData, JSONData, HttpCrawler<HttpCrawlingContext<UserData, JSONData>>> {}

export type HttpRequestHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends JsonValue = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > = RequestHandler<HttpCrawlingContext<UserData, JSONData>>;

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
export class HttpCrawler<Context extends InternalHttpCrawlingContext<any, any, HttpCrawler<Context>>> extends BasicCrawler<Context> {
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
     * All `HttpCrawlerOptions` parameters are passed via an options object.
     */
    constructor(options: HttpCrawlerOptions<Context> = {}, override readonly config = Configuration.getGlobalConfig()) {
        ow(options, 'HttpCrawlerOptions', ow.object.exactShape(HttpCrawler.optionsShape));

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
            autoscaledPoolOptions = HTTP_OPTIMIZED_AUTOSCALED_POOL_OPTIONS,
            ...basicCrawlerOptions
        } = options;

        super({
            ...basicCrawlerOptions,
            requestHandler,
            autoscaledPoolOptions,
            // We need to add some time for internal functions to finish,
            // but not too much so that we would stall the crawler.
            requestHandlerTimeoutSecs: navigationTimeoutSecs + requestHandlerTimeoutSecs + BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
        }, config);

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

        const className = this.constructor.name;

        const extensionOptions = extension.getCrawlerOptions();

        for (const [key, value] of Object.entries(extensionOptions)) {
            const isConfigurable = this.hasOwnProperty(key);
            const originalType = typeof this[key as keyof this];
            const extensionType = typeof value; // What if we want to null something? It is really needed?
            const isSameType = originalType === extensionType || value == null; // fast track for deleting keys
            const exists = this[key as keyof this] != null;

            if (!isConfigurable) { // Test if the property can be configured on the crawler
                throw new Error(`${extension.name} tries to set property "${key}" that is not configurable on ${className} instance.`);
            }

            if (!isSameType && exists) { // Assuming that extensions will only add up configuration
                throw new Error(
                    `${extension.name} tries to set property of different type "${extensionType}". "${className}.${key}: ${originalType}".`,
                );
            }

            this.log.warning(`${extension.name} is overriding "${className}.${key}: ${originalType}" with ${value}.`);

            this[key as keyof this] = value as this[keyof this];
        }
    }

    /**
     * Wrapper around requestHandler that opens and closes pages etc.
     */
    protected override async _runRequestHandler(crawlingContext: Context) {
        const { request, session } = crawlingContext;

        if (this.proxyConfiguration) {
            const sessionId = session ? session.id : undefined;
            crawlingContext.proxyInfo = await this.proxyConfiguration.newProxyInfo(sessionId);
        }
        if (!request.skipNavigation) {
            await this._handleNavigation(crawlingContext);
            tryCancel();

            const parsed = await this._parseResponse(request, crawlingContext.response!, crawlingContext);
            const response = parsed.response!;
            const contentType = parsed.contentType!;
            tryCancel();

            if (this.useSessionPool) {
                this._throwOnBlockedRequest(session!, response.statusCode!);
            }

            if (this.persistCookiesPerSession) {
                session!.setCookiesFromResponse(response);
            }

            request.loadedUrl = response.url;

            Object.assign(crawlingContext, parsed);

            Object.defineProperty(crawlingContext, 'json', {
                get() {
                    if (contentType.type !== APPLICATION_JSON_MIME_TYPE) return null;
                    const jsonString = parsed.body!.toString(contentType.encoding);
                    return JSON.parse(jsonString);
                },
            });
        }

        request.state = RequestState.REQUEST_HANDLER;
        try {
            await addTimeoutToPromise(
                () => Promise.resolve(this.requestHandler(crawlingContext)),
                this.userRequestHandlerTimeoutMillis,
                `requestHandler timed out after ${this.userRequestHandlerTimeoutMillis / 1000} seconds.`,
            );
            request.state = RequestState.DONE;
        } catch (e: any) {
            request.state = RequestState.ERROR;
            throw e;
        }
    }

    protected async _handleNavigation(crawlingContext: Context) {
        const gotOptions = {} as OptionsInit;
        const { request, session } = crawlingContext;
        const preNavigationHooksCookies = this._getCookieHeaderFromRequest(request);

        request.state = RequestState.BEFORE_NAV;
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

        request.state = RequestState.AFTER_NAV;
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

        if (mergedCookie !== '') {
            gotOptions.headers.Cookie = mergedCookie;
        }
    }

    /**
     * Function to make the HTTP request. It performs optimizations
     * on the request such as only downloading the request body if the
     * received content type matches text/html, application/xml, application/xhtml+xml.
     */
    protected async _requestFunction({ request, session, proxyUrl, gotOptions }: RequestFunctionOptions): Promise<IncomingMessage> {
        const opts = this._getRequestOptions(request, session, proxyUrl, gotOptions);

        try {
            return await this._requestAsBrowser(opts, session);
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
    protected async _parseResponse(request: Request, responseStream: IncomingMessage, crawlingContext: Context) {
        const { statusCode } = responseStream;
        const { type, charset } = parseContentTypeFromResponse(responseStream);
        const { response, encoding } = this._encodeResponse(request, responseStream, charset);
        const contentType = { type, encoding };

        if (statusCode! >= 400 && statusCode! <= 599) {
            this.stats.registerStatusCode(statusCode!);
        }

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
            throw new Error(`${statusCode} - Internal Server Error: ${body.slice(0, 100)}`);
        } else if (HTML_AND_XML_MIME_TYPES.includes(type)) {
            const isXml = type.includes('xml');
            const parsed = await this._parseHTML(response, isXml, crawlingContext);
            return { ...parsed, isXml, response, contentType };
        } else {
            const body = await concatStreamToBuffer(response);
            return { body, response, contentType };
        }
    }

    protected async _parseHTML(response: IncomingMessage, _isXml: boolean, _crawlingContext: Context): Promise<Partial<Context>> {
        return {
            body: await concatStreamToBuffer(response),
        } as Partial<Context>;
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

        if (/PATCH|POST|PUT/.test(request.method)) requestOptions.body = request.payload ?? '';

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

    /**
     * Checks and extends supported mime types
     */
    protected _extendSupportedMimeTypes(additionalMimeTypes: (string | RequestLike | ResponseLike)[]) {
        for (const mimeType of additionalMimeTypes) {
            if (mimeType === '*/*') {
                this.supportedMimeTypes.add(mimeType);
                continue;
            }

            try {
                const parsedType = contentTypeParser.parse(mimeType);
                this.supportedMimeTypes.add(parsedType.type);
            } catch (err) {
                throw new Error(`Can not parse mime type ${mimeType} from "options.additionalMimeTypes".`);
            }
        }
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

        if (!this.supportedMimeTypes.has(type) && !this.supportedMimeTypes.has('*/*') && statusCode! < 500) {
            request.noRetry = true;
            throw new Error(`Resource ${request.url} served Content-Type ${type}, `
                + `but only ${Array.from(this.supportedMimeTypes).join(', ')} are allowed. Skipping resource.`);
        }
    }

    /**
     * @internal wraps public utility for mocking purposes
     */
    private _requestAsBrowser = (options: OptionsInit & { isStream: true }, session?: Session) => {
        return new Promise<IncomingMessage>((resolve, reject) => {
            const stream = gotScraping(options);

            stream.on('redirect', (updatedOptions: Options, redirectResponse: IncomingMessage) => {
                if (this.persistCookiesPerSession) {
                    session!.setCookiesFromResponse(redirectResponse);

                    const cookieString = session!.getCookieString(updatedOptions.url!.toString());
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
    };
}

interface RequestFunctionOptions {
    request: Request;
    session?: Session;
    proxyUrl?: string;
    gotOptions: OptionsInit;
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
 * Gets parsed content type from response object
 * @param response HTTP response object
 */
function parseContentTypeFromResponse(response: IncomingMessage): { type: string; charset: BufferEncoding } {
    ow(response, ow.object.partialShape({
        url: ow.string.url,
        headers: ow.object,
    }));

    const { url, headers } = response;
    let parsedContentType;

    if (headers['content-type']) {
        try {
            parsedContentType = contentTypeParser.parse(headers['content-type']);
        } catch {
            // Can not parse content type from Content-Type header. Try to parse it from file extension.
        }
    }

    // Parse content type from file extension as fallback
    if (!parsedContentType) {
        const parsedUrl = new URL(url);
        const contentTypeFromExtname = mime.contentType(extname(parsedUrl.pathname))
            || 'application/octet-stream; charset=utf-8'; // Fallback content type, specified in https://tools.ietf.org/html/rfc7231#section-3.1.1.5
        parsedContentType = contentTypeParser.parse(contentTypeFromExtname);
    }

    return {
        type: parsedContentType.type,
        charset: parsedContentType.parameters.charset as BufferEncoding,
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
export function createHttpRouter<Context extends HttpCrawlingContext = HttpCrawlingContext>() {
    return Router.create<Context>();
}
