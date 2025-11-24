import type {
    Awaitable,
    BasicCrawlerOptions,
    BasicCrawlingContext,
    CrawlingContext,
    Dictionary,
    EnqueueLinksOptions,
    ErrorHandler,
    LoadedRequest,
    ProxyInfo,
    Request,
    RequestHandler,
    RequestProvider,
    Session,
    SkippedRequestCallback,
} from '@crawlee/basic';
import {
    BasicCrawler,
    BLOCKED_STATUS_CODES as DEFAULT_BLOCKED_STATUS_CODES,
    Configuration,
    ContextPipeline,
    cookieStringToToughCookie,
    enqueueLinks,
    EVENT_SESSION_RETIRED,
    handleRequestTimeout,
    RequestState,
    resolveBaseUrlForEnqueueLinksFiltering,
    SessionError,
    tryAbsoluteURL,
    validators,
} from '@crawlee/basic';
import type {
    BrowserController,
    BrowserPlugin,
    BrowserPoolHooks,
    BrowserPoolOptions,
    CommonPage,
    InferBrowserPluginArray,
    LaunchContext,
} from '@crawlee/browser-pool';
import { BROWSER_CONTROLLER_EVENTS, BrowserPool } from '@crawlee/browser-pool';
import type { BatchAddRequestsResult, Cookie as CookieObject } from '@crawlee/types';
import type { RobotsTxtFile } from '@crawlee/utils';
import { CLOUDFLARE_RETRY_CSS_SELECTORS, RETRY_CSS_SELECTORS, sleep } from '@crawlee/utils';
import ow from 'ow';
import type { ReadonlyDeep } from 'type-fest';

import { tryCancel } from '@apify/timeout';

import type { BrowserLaunchContext } from './browser-launcher.js';

interface BaseResponse {
    status(): number;
}

type ContextDifference<T, U> = Omit<U, keyof T> & Partial<U>;

export interface BrowserCrawlingContext<
    Page extends CommonPage = CommonPage,
    Response extends BaseResponse = BaseResponse,
    ProvidedController = BrowserController,
    UserData extends Dictionary = Dictionary,
> extends CrawlingContext<UserData> {
    /**
     * An instance of the {@apilink BrowserController} that manages the browser instance and provides access to its API.
     */
    browserController: ProvidedController;

    /**
     * The browser page object where the web page is loaded and rendered.
     */
    page: Page;

    /**
     * The request object that was successfully loaded and navigated to, including the {@apilink Request.loadedUrl|`loadedUrl`} property.
     */
    request: LoadedRequest<Request<UserData>>;

    /**
     * The HTTP response object returned by the browser's navigation.
     */
    response: Response;

    /**
     * Helper function for extracting URLs from the current page and adding them to the request queue.
     */
    enqueueLinks: (options?: EnqueueLinksOptions) => Promise<BatchAddRequestsResult>;
}

export type BrowserHook<Context = BrowserCrawlingContext, GoToOptions extends Dictionary | undefined = Dictionary> = (
    crawlingContext: Context,
    gotoOptions: GoToOptions,
) => Awaitable<void>;

export interface BrowserCrawlerOptions<
    Page extends CommonPage = CommonPage,
    Response extends BaseResponse = BaseResponse,
    ProvidedController extends BrowserController = BrowserController,
    Context extends BrowserCrawlingContext<Page, Response, ProvidedController, Dictionary> = BrowserCrawlingContext<
        Page,
        Response,
        ProvidedController,
        Dictionary
    >,
    ContextExtension = {},
    ExtendedContext extends Context = Context & ContextExtension,
    InternalBrowserPoolOptions extends BrowserPoolOptions = BrowserPoolOptions,
    __BrowserPlugins extends BrowserPlugin[] = InferBrowserPluginArray<InternalBrowserPoolOptions['browserPlugins']>,
    __BrowserControllerReturn extends BrowserController = ReturnType<__BrowserPlugins[number]['createController']>,
    __LaunchContextReturn extends LaunchContext = ReturnType<__BrowserPlugins[number]['createLaunchContext']>,
> extends Omit<
        BasicCrawlerOptions<Context, ExtendedContext>,
        // Overridden with browser context
        'requestHandler' | 'failedRequestHandler' | 'errorHandler'
    > {
    launchContext?: BrowserLaunchContext<any, any>;

    /**
     * Function that is called to process each request.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as an argument, where:
     * - {@apilink BrowserCrawlingContext.request|`request`} is an instance of the {@apilink Request} object
     * with details about the URL to open, HTTP method etc;
     * - {@apilink BrowserCrawlingContext.page|`page`} is an instance of the
     * Puppeteer [Page](https://pptr.dev/api/puppeteer.page) or
     * Playwright [Page](https://playwright.dev/docs/api/class-page);
     * - {@apilink BrowserCrawlingContext.browserController|`browserController`} is an instance of the {@apilink BrowserController};
     * - {@apilink BrowserCrawlingContext.response|`response`} is an instance of the
     * Puppeteer [Response](https://pptr.dev/api/puppeteer.httpresponse) or
     * Playwright [Response](https://playwright.dev/docs/api/class-response),
     * which is the main resource response as returned by the respective `page.goto()` function.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to the {@apilink BrowserCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     * If all the retries fail, the crawler calls the function
     * provided to the {@apilink BrowserCrawlerOptions.failedRequestHandler|`failedRequestHandler`} parameter.
     * To make this work, we should **always**
     * let our function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@apilink Request.pushErrorMessage|`Request.pushErrorMessage()`} function.
     */
    requestHandler?: RequestHandler<ExtendedContext>;

    /**
     * User-provided function that allows modifying the request object before it gets retried by the crawler.
     * It's executed before each retry for the requests that failed less than {@apilink BrowserCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as the first argument,
     * where the {@apilink BrowserCrawlingContext.request|`request`} corresponds to the request to be retried.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    errorHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as the first argument,
     * where the {@apilink BrowserCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    failedRequestHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;

    /**
     * Custom options passed to the underlying {@apilink BrowserPool} constructor.
     * We can tweak those to fine-tune browser management.
     */
    browserPoolOptions?: Partial<BrowserPoolOptions> &
        Partial<BrowserPoolHooks<__BrowserControllerReturn, __LaunchContextReturn>>;

    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function accepts two parameters, `crawlingContext` and `gotoOptions`,
     * which are passed to the `page.goto()` function the crawler calls to navigate.
     *
     * **Example:**
     *
     * ```js
     * preNavigationHooks: [
     *     async (crawlingContext, gotoOptions) => {
     *         const { page } = crawlingContext;
     *         await page.evaluate((attr) => { window.foo = attr; }, 'bar');
     *         gotoOptions.timeout = 60_000;
     *         gotoOptions.waitUntil = 'domcontentloaded';
     *     },
     * ]
     * ```
     *
     * Modyfing `pageOptions` is supported only in Playwright incognito.
     * See {@apilink PrePageCreateHook}
     */
    preNavigationHooks?: BrowserHook<Context>[];

    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts `crawlingContext` as the only parameter.
     *
     * **Example:**
     *
     * ```js
     * postNavigationHooks: [
     *     async (crawlingContext) => {
     *         const { page } = crawlingContext;
     *         if (hasCaptcha(page)) {
     *             await solveCaptcha(page);
     *         }
     *     },
     * ]
     * ```
     */
    postNavigationHooks?: BrowserHook<Context>[];

    /**
     * Timeout in which page navigation needs to finish, in seconds.
     */
    navigationTimeoutSecs?: number;

    /**
     * Defines whether the cookies should be persisted for sessions.
     * This can only be used when `useSessionPool` is set to `true`.
     */
    persistCookiesPerSession?: boolean;

    /**
     * Whether to run browser in headless mode. Defaults to `true`.
     * Can be also set via {@apilink Configuration}.
     */
    headless?: boolean | 'new' | 'old'; // `new`/`old` are for puppeteer only

    /**
     * Whether to ignore custom elements (and their #shadow-roots) when processing the page content via `parseWithCheerio` helper.
     * By default, they are expanded automatically. Use this option to disable this behavior.
     */
    ignoreShadowRoots?: boolean;

    /**
     * Whether to ignore `iframes` when processing the page content via `parseWithCheerio` helper.
     * By default, `iframes` are expanded automatically. Use this option to disable this behavior.
     */
    ignoreIframes?: boolean;
}

/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless browsers with [Puppeteer](https://github.com/puppeteer/puppeteer)
 * and [Playwright](https://github.com/microsoft/playwright).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `BrowserCrawler` uses headless (or even headful) browsers to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, we should consider using the {@apilink CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented by the {@apilink Request} objects that are fed from the {@apilink RequestList} or {@apilink RequestQueue} instances
 * provided by the {@apilink BrowserCrawlerOptions.requestList|`requestList`} or {@apilink BrowserCrawlerOptions.requestQueue|`requestQueue`}
 * constructor options, respectively. If neither `requestList` nor `requestQueue` options are provided,
 * the crawler will open the default request queue either when the {@apilink BrowserCrawler.addRequests|`crawler.addRequests()`} function is called,
 * or if `requests` parameter (representing the initial requests) of the {@apilink BrowserCrawler.run|`crawler.run()`} function is provided.
 *
 * If both {@apilink BrowserCrawlerOptions.requestList|`requestList`} and {@apilink BrowserCrawlerOptions.requestQueue|`requestQueue`} options are used,
 * the instance first processes URLs from the {@apilink RequestList} and automatically enqueues all of them
 * to the {@apilink RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * `BrowserCrawler` opens a new browser page (i.e. tab or window) for each {@apilink Request} object to crawl
 * and then calls the function provided by user as the {@apilink BrowserCrawlerOptions.requestHandler|`requestHandler`} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@apilink AutoscaledPool} class.
 * All {@apilink AutoscaledPool} configuration options can be passed to the {@apilink BrowserCrawlerOptions.autoscaledPoolOptions|`autoscaledPoolOptions`}
 * parameter of the `BrowserCrawler` constructor.
 * For user convenience, the {@apilink AutoscaledPoolOptions.minConcurrency|`minConcurrency`} and
 * {@apilink AutoscaledPoolOptions.maxConcurrency|`maxConcurrency`} options of the
 * underlying {@apilink AutoscaledPool} constructor are available directly in the `BrowserCrawler` constructor.
 *
 * > *NOTE:* the pool of browser instances is internally managed by the {@apilink BrowserPool} class.
 *
 * @category Crawlers
 */
export abstract class BrowserCrawler<
    Page extends CommonPage = CommonPage,
    Response extends BaseResponse = BaseResponse,
    ProvidedController extends BrowserController = BrowserController,
    InternalBrowserPoolOptions extends BrowserPoolOptions = BrowserPoolOptions,
    LaunchOptions extends Dictionary | undefined = Dictionary,
    Context extends BrowserCrawlingContext<Page, Response, ProvidedController, Dictionary> = BrowserCrawlingContext<
        Page,
        Response,
        ProvidedController,
        Dictionary
    >,
    ContextExtension = {},
    ExtendedContext extends Context = Context & ContextExtension,
    GoToOptions extends Dictionary = Dictionary,
> extends BasicCrawler<Context, ContextExtension, ExtendedContext> {
    /**
     * A reference to the underlying {@apilink BrowserPool} class that manages the crawler's browsers.
     */
    browserPool: BrowserPool<InternalBrowserPoolOptions>;

    launchContext: BrowserLaunchContext<LaunchOptions, unknown>;

    protected readonly ignoreShadowRoots: boolean;
    protected readonly ignoreIframes: boolean;

    protected navigationTimeoutMillis: number;
    protected preNavigationHooks: BrowserHook<Context>[];
    protected postNavigationHooks: BrowserHook<Context>[];
    protected persistCookiesPerSession: boolean;

    protected static override optionsShape = {
        ...BasicCrawler.optionsShape,

        navigationTimeoutSecs: ow.optional.number.greaterThan(0),
        preNavigationHooks: ow.optional.array,
        postNavigationHooks: ow.optional.array,

        launchContext: ow.optional.object,
        headless: ow.optional.any(ow.boolean, ow.string),
        browserPoolOptions: ow.object,
        sessionPoolOptions: ow.optional.object,
        persistCookiesPerSession: ow.optional.boolean,
        useSessionPool: ow.optional.boolean,
        proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),
    };

    /**
     * All `BrowserCrawler` parameters are passed via an options object.
     */
    protected constructor(
        options: BrowserCrawlerOptions<
            Page,
            Response,
            ProvidedController,
            Context,
            ContextExtension,
            ExtendedContext
        > & {
            contextPipelineBuilder: () => ContextPipeline<CrawlingContext, Context>;
        },
        override readonly config = Configuration.getGlobalConfig(),
    ) {
        ow(options, 'BrowserCrawlerOptions', ow.object.exactShape(BrowserCrawler.optionsShape));
        const {
            navigationTimeoutSecs = 60,
            persistCookiesPerSession,
            launchContext = {},
            browserPoolOptions,
            preNavigationHooks = [],
            postNavigationHooks = [],
            headless,
            ignoreIframes = false,
            ignoreShadowRoots = false,
            contextPipelineBuilder,
            extendContext,
            proxyConfiguration,
            ...basicCrawlerOptions
        } = options;

        super(
            {
                ...basicCrawlerOptions,
                contextPipelineBuilder: () =>
                    contextPipelineBuilder()
                        .compose({ action: this.performNavigation.bind(this) })
                        .compose({ action: this.handleBlockedRequestByContent.bind(this) })
                        .compose({ action: this.restoreRequestState.bind(this) }),
                extendContext: extendContext as (context: Context) => Awaitable<ContextExtension>,
            },
            config,
        );

        // Cookies should be persisted per session only if session pool is used
        if (!this.useSessionPool && persistCookiesPerSession) {
            throw new Error('You cannot use "persistCookiesPerSession" without "useSessionPool" set to true.');
        }

        this.launchContext = launchContext;
        this.navigationTimeoutMillis = navigationTimeoutSecs * 1000;
        this.proxyConfiguration = proxyConfiguration;
        this.preNavigationHooks = preNavigationHooks;
        this.postNavigationHooks = postNavigationHooks;
        this.ignoreIframes = ignoreIframes;
        this.ignoreShadowRoots = ignoreShadowRoots;

        if (headless != null) {
            this.launchContext.launchOptions ??= {} as LaunchOptions;
            (this.launchContext.launchOptions as Dictionary).headless = headless;
        }

        if (this.useSessionPool) {
            this.persistCookiesPerSession = persistCookiesPerSession !== undefined ? persistCookiesPerSession : true;
        } else {
            this.persistCookiesPerSession = false;
        }

        if (launchContext?.userAgent) {
            if (browserPoolOptions.useFingerprints)
                this.log.info('Custom user agent provided, disabling automatic browser fingerprint injection!');
            browserPoolOptions.useFingerprints = false;
        }

        const { preLaunchHooks = [], postLaunchHooks = [], ...rest } = browserPoolOptions;

        this.browserPool = new BrowserPool<InternalBrowserPoolOptions>({
            ...(rest as any),
            preLaunchHooks: [this._extendLaunchContext.bind(this), ...preLaunchHooks],
            postLaunchHooks: [this._maybeAddSessionRetiredListener.bind(this), ...postLaunchHooks],
        });
    }

    protected buildContextPipeline(): ContextPipeline<
        CrawlingContext,
        BrowserCrawlingContext<Page, Response, ProvidedController, Dictionary>
    > {
        return ContextPipeline.create<CrawlingContext>().compose({
            action: this.preparePage.bind(this),
            cleanup: async (context: {
                page: Page;
                registerDeferredCleanup: BasicCrawlingContext['registerDeferredCleanup'];
            }) => {
                context.registerDeferredCleanup(async () => {
                    await context.page
                        .close()
                        .catch((error: Error) => this.log.debug('Error while closing page', { error }));
                });
            },
        });
    }

    private async containsSelectors(page: CommonPage, selectors: string[]): Promise<string[] | null> {
        const foundSelectors = (await Promise.all(selectors.map((selector) => (page as any).$(selector))))
            .map((x, i) => [x, selectors[i]] as [any, string])
            .filter(([x]) => x !== null)
            .map(([, selector]) => selector);

        return foundSelectors.length > 0 ? foundSelectors : null;
    }

    protected async isRequestBlocked(
        crawlingContext: BrowserCrawlingContext<Page, Response, ProvidedController>,
    ): Promise<string | false> {
        const { page, response } = crawlingContext;

        const blockedStatusCodes =
            // eslint-disable-next-line dot-notation
            (this.sessionPool?.['blockedStatusCodes'].length ?? 0) > 0
                ? // eslint-disable-next-line dot-notation
                  this.sessionPool!['blockedStatusCodes']
                : DEFAULT_BLOCKED_STATUS_CODES;

        // Cloudflare specific heuristic - wait 5 seconds if we get a 403 for the JS challenge to load / resolve.
        if ((await this.containsSelectors(page, CLOUDFLARE_RETRY_CSS_SELECTORS)) && response?.status() === 403) {
            await sleep(5000);

            // here we cannot test for response code, because we only have the original response, not the possible Cloudflare redirect on passed challenge.
            const foundSelectors = await this.containsSelectors(page, RETRY_CSS_SELECTORS);

            if (!foundSelectors) return false;
            return `Cloudflare challenge failed, found selectors: ${foundSelectors.join(', ')}`;
        }

        const foundSelectors = await this.containsSelectors(page, RETRY_CSS_SELECTORS);
        const blockedStatusCode = blockedStatusCodes.find((x) => x === (response?.status() ?? 0));

        if (foundSelectors) return `Found selectors: ${foundSelectors.join(', ')}`;
        if (blockedStatusCode) return `Received blocked status code: ${blockedStatusCode}`;

        return false;
    }

    private async preparePage(
        crawlingContext: CrawlingContext,
    ): Promise<
        ContextDifference<CrawlingContext, BrowserCrawlingContext<Page, Response, ProvidedController, Dictionary>>
    > {
        const newPageOptions: Dictionary = {
            id: crawlingContext.id,
        };

        const useIncognitoPages = this.launchContext?.useIncognitoPages;

        if (crawlingContext.session?.proxyInfo) {
            const proxyInfo = crawlingContext.session.proxyInfo;
            crawlingContext.proxyInfo = proxyInfo;

            newPageOptions.proxyUrl = proxyInfo?.url;
            newPageOptions.proxyTier = proxyInfo?.proxyTier;

            if (proxyInfo?.ignoreTlsErrors) {
                /**
                 * @see https://playwright.dev/docs/api/class-browser/#browser-new-context
                 * @see https://github.com/puppeteer/puppeteer/blob/main/docs/api.md
                 */
                newPageOptions.pageOptions = {
                    ignoreHTTPSErrors: true,
                    acceptInsecureCerts: true,
                };
            }
        }

        const page = (await this.browserPool.newPage(newPageOptions)) as Page;
        tryCancel();

        const browserControllerInstance = this.browserPool.getBrowserControllerByPage(
            page as any,
        ) as ProvidedController;

        return {
            page,
            get response(): Response {
                throw new Error(
                    "The `response` property is not available. This might mean that you're trying to access it before navigation or that navigation resulted in `null` (this should only happen with `about:` URLs)",
                );
            },
            browserController: browserControllerInstance,
            session: useIncognitoPages
                ? crawlingContext.session
                : (browserControllerInstance.launchContext.session as Session),
            proxyInfo: crawlingContext.proxyInfo ?? (browserControllerInstance.launchContext.proxyInfo as ProxyInfo),
            enqueueLinks: async (enqueueOptions: EnqueueLinksOptions = {}) => {
                return browserCrawlerEnqueueLinks({
                    options: enqueueOptions,
                    page,
                    requestQueue: await this.getRequestQueue(),
                    robotsTxtFile: await this.getRobotsTxtFileForUrl(crawlingContext.request.url),
                    onSkippedRequest: this.onSkippedRequest,
                    originalRequestUrl: crawlingContext.request.url,
                    finalRequestUrl: crawlingContext.request.loadedUrl,
                });
            },
        };
    }

    private async performNavigation(crawlingContext: Context): Promise<{
        request: LoadedRequest<Request>;
        response?: Response;
    }> {
        if (crawlingContext.request.skipNavigation) {
            return {
                request: new Proxy(crawlingContext.request, {
                    get(target, propertyName, receiver) {
                        if (propertyName === 'loadedUrl') {
                            throw new Error(
                                'The `request.loadedUrl` property is not available - `skipNavigation` was used',
                            );
                        }
                        return Reflect.get(target, propertyName, receiver);
                    },
                }) as LoadedRequest<Request>,
                get response(): Response {
                    throw new Error('The `response` property is not available - `skipNavigation` was used');
                },
            };
        }

        const gotoOptions = { timeout: this.navigationTimeoutMillis } as unknown as GoToOptions;

        const preNavigationHooksCookies = this._getCookieHeaderFromRequest(crawlingContext.request);

        crawlingContext.request.state = RequestState.BEFORE_NAV;
        await this._executeHooks(this.preNavigationHooks, crawlingContext, gotoOptions);
        tryCancel();

        const postNavigationHooksCookies = this._getCookieHeaderFromRequest(crawlingContext.request);

        await this._applyCookies(crawlingContext, preNavigationHooksCookies, postNavigationHooksCookies);

        let response: Response | undefined;

        try {
            response = (await this._navigationHandler(crawlingContext, gotoOptions)) ?? undefined;
        } catch (error) {
            await this._handleNavigationTimeout(crawlingContext, error as Error);

            crawlingContext.request.state = RequestState.ERROR;

            this._throwIfProxyError(error as Error);
            throw error;
        }
        tryCancel();

        crawlingContext.request.state = RequestState.AFTER_NAV;
        await this._executeHooks(this.postNavigationHooks, crawlingContext, gotoOptions);

        await this.processResponse(response, crawlingContext);
        tryCancel();

        // save cookies
        // TODO: Should we save the cookies also after/only the handle page?
        if (this.persistCookiesPerSession) {
            const cookies = await crawlingContext.browserController.getCookies(crawlingContext.page);
            tryCancel();
            crawlingContext.session?.setCookies(cookies, crawlingContext.request.loadedUrl!);
        }

        if (response !== undefined) {
            return {
                request: crawlingContext.request as LoadedRequest<Request>,
                response,
            };
        }

        return {
            request: crawlingContext.request as LoadedRequest<Request>,
        };
    }

    private async handleBlockedRequestByContent(
        crawlingContext: BrowserCrawlingContext<Page, Response, ProvidedController>,
    ) {
        if (this.retryOnBlocked) {
            const error = await this.isRequestBlocked(crawlingContext);
            if (error) throw new SessionError(error);
        }

        return {};
    }

    private async restoreRequestState(crawlingContext: CrawlingContext) {
        crawlingContext.request.state = RequestState.REQUEST_HANDLER;
        return {};
    }

    protected async _applyCookies(
        { session, request, page, browserController }: BrowserCrawlingContext,
        preHooksCookies: string,
        postHooksCookies: string,
    ) {
        const sessionCookie = session?.getCookies(request.url) ?? [];
        const parsedPreHooksCookies = preHooksCookies.split(/ *; */).map((c) => cookieStringToToughCookie(c));
        const parsedPostHooksCookies = postHooksCookies.split(/ *; */).map((c) => cookieStringToToughCookie(c));

        await browserController.setCookies(
            page,
            [...sessionCookie, ...parsedPreHooksCookies, ...parsedPostHooksCookies]
                .filter((c): c is CookieObject => typeof c !== 'undefined' && c !== null)
                .map((c) => ({ ...c, url: c.domain ? undefined : request.url })),
        );
    }

    /**
     * Marks session bad in case of navigation timeout.
     */
    protected async _handleNavigationTimeout(crawlingContext: BrowserCrawlingContext, error: Error): Promise<void> {
        const { session } = crawlingContext;

        if (error && error.constructor.name === 'TimeoutError') {
            handleRequestTimeout({ session, errorMessage: error.message });
        }

        await crawlingContext.page.close();
    }

    /**
     * Transforms proxy-related errors to `SessionError`.
     */
    protected _throwIfProxyError(error: Error) {
        if (this.isProxyError(error)) {
            throw new SessionError(this._getMessageFromError(error) as string);
        }
    }

    protected abstract _navigationHandler(
        crawlingContext: BrowserCrawlingContext<Page, Response, ProvidedController>,
        gotoOptions: GoToOptions,
    ): Promise<Context['response'] | null | undefined>;

    private async processResponse(
        response: Response | undefined,
        crawlingContext: BrowserCrawlingContext,
    ): Promise<void> {
        const { session, request, page } = crawlingContext;

        if (typeof response === 'object' && typeof response.status === 'function') {
            const status: number = response.status();

            this.stats.registerStatusCode(status);
        }

        if (this.sessionPool && response && session) {
            if (typeof response === 'object' && typeof response.status === 'function') {
                this._throwOnBlockedRequest(session, response.status());
            } else {
                this.log.debug('Got a malformed Browser response.', { request, response });
            }
        }

        request.loadedUrl = await page.url();
    }

    protected async _extendLaunchContext(_pageId: string, launchContext: LaunchContext): Promise<void> {
        const launchContextExtends: { session?: Session; proxyInfo?: ProxyInfo } = {};

        if (this.sessionPool) {
            launchContextExtends.session = await this.sessionPool.newSession({
                proxyInfo: await this.proxyConfiguration?.newProxyInfo({
                    // cannot pass a request here, since session is created on browser launch
                }),
            });
        }

        if (!launchContext.proxyUrl && launchContextExtends.session?.proxyInfo) {
            const proxyInfo = launchContextExtends.session.proxyInfo;

            launchContext.proxyUrl = proxyInfo?.url;
            launchContextExtends.proxyInfo = proxyInfo;

            // Disable SSL verification for MITM proxies
            if (proxyInfo?.ignoreTlsErrors) {
                /**
                 * @see https://playwright.dev/docs/api/class-browser/#browser-new-context
                 * @see https://github.com/puppeteer/puppeteer/blob/main/docs/api.md
                 */
                (launchContext.launchOptions as Dictionary).ignoreHTTPSErrors = true;
                (launchContext.launchOptions as Dictionary).acceptInsecureCerts = true;
            }
        }

        launchContext.extend(launchContextExtends);
    }

    protected _maybeAddSessionRetiredListener(_pageId: string, browserController: Context['browserController']): void {
        if (this.sessionPool) {
            const listener = (session: Session) => {
                const { launchContext } = browserController;
                if (session.id === (launchContext.session as Session).id) {
                    this.browserPool.retireBrowserController(
                        browserController as Parameters<
                            BrowserPool<InternalBrowserPoolOptions>['retireBrowserController']
                        >[0],
                    );
                }
            };

            this.sessionPool.on(EVENT_SESSION_RETIRED, listener);
            browserController.on(BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED, () => {
                return this.sessionPool!.removeListener(EVENT_SESSION_RETIRED, listener);
            });
        }
    }

    /**
     * Function for cleaning up after all requests are processed.
     * @ignore
     */
    override async teardown(): Promise<void> {
        await this.browserPool.destroy();
        await super.teardown();
    }
}

/** @internal */
interface EnqueueLinksInternalOptions {
    options?: ReadonlyDeep<Omit<EnqueueLinksOptions, 'requestQueue'>> & Pick<EnqueueLinksOptions, 'requestQueue'>;
    page: CommonPage;
    requestQueue: RequestProvider;
    robotsTxtFile?: RobotsTxtFile;
    onSkippedRequest?: SkippedRequestCallback;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}

/** @internal */
export async function browserCrawlerEnqueueLinks({
    options,
    page,
    requestQueue,
    robotsTxtFile,
    onSkippedRequest,
    originalRequestUrl,
    finalRequestUrl,
}: EnqueueLinksInternalOptions) {
    const baseUrl = resolveBaseUrlForEnqueueLinksFiltering({
        enqueueStrategy: options?.strategy,
        finalRequestUrl,
        originalRequestUrl,
        userProvidedBaseUrl: options?.baseUrl,
    });

    const urls = await extractUrlsFromPage(
        page as any,
        options?.selector ?? 'a',
        options?.baseUrl ?? finalRequestUrl ?? originalRequestUrl,
    );

    return enqueueLinks({
        requestQueue,
        robotsTxtFile,
        onSkippedRequest,
        urls,
        baseUrl,
        ...(options as EnqueueLinksOptions),
    });
}

/**
 * Extracts URLs from a given page.
 * @ignore
 */
export async function extractUrlsFromPage(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    page: { $$eval: Function },
    selector: string,
    baseUrl: string,
): Promise<string[]> {
    const urls =
        (await page.$$eval(selector, (linkEls: HTMLLinkElement[]) =>
            linkEls.map((link) => link.getAttribute('href')).filter((href) => !!href),
        )) ?? [];
    const [base] = await page.$$eval('base', (els: HTMLLinkElement[]) => els.map((el) => el.getAttribute('href')));
    const absoluteBaseUrl = base && tryAbsoluteURL(base, baseUrl);

    if (absoluteBaseUrl) {
        baseUrl = absoluteBaseUrl;
    }

    return urls
        .map((href: string) => {
            // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
            const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
            if (!isHrefAbsolute && !baseUrl) {
                throw new Error(
                    `An extracted URL: ${href} is relative and options.baseUrl is not set. ` +
                        'Use options.baseUrl in enqueueLinks() to automatically resolve relative URLs.',
                );
            }

            return baseUrl ? tryAbsoluteURL(href, baseUrl) : href;
        })
        .filter((href: string | undefined) => !!href);
}
