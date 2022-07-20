import { addTimeoutToPromise, tryCancel } from '@apify/timeout';
import type {
    EnqueueLinksOptions,
    CrawlingContext,
    ProxyConfiguration,
    ProxyInfo,
    RequestQueue,
    Session,
} from '@crawlee/core';
import {
    enqueueLinks,
    EVENT_SESSION_RETIRED,
    handleRequestTimeout,
    validators,
    resolveBaseUrl,
    Configuration,
} from '@crawlee/core';
import type {
    BasicCrawlerOptions,
    Awaitable,
    Dictionary,
} from '@crawlee/basic';
import {
    BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
    BasicCrawler,
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
import {
    BROWSER_CONTROLLER_EVENTS,
    BrowserPool,
} from '@crawlee/browser-pool';
import type { GotOptionsInit, Response as GotResponse } from 'got-scraping';
import ow from 'ow';
import { Cookie } from 'tough-cookie';
import type { BatchAddRequestsResult, Cookie as CookieObject } from '@crawlee/types';
import type { BrowserLaunchContext } from './browser-launcher';

export interface BrowserCrawlingContext<
    Page extends CommonPage = CommonPage,
    Response = Dictionary,
    ProvidedController = BrowserController,
    UserData extends Dictionary = Dictionary,
> extends CrawlingContext<UserData> {
    browserController: ProvidedController;
    page: Page;
    response?: Response;
    crawler: BrowserCrawler;
    enqueueLinks: (options?: BrowserCrawlerEnqueueLinksOptions) => Promise<BatchAddRequestsResult>;
    sendRequest: (overrideOptions?: Partial<GotOptionsInit>) => Promise<GotResponse<string>>;
}

export type BrowserCrawlerHandleRequest<
    Context extends BrowserCrawlingContext = BrowserCrawlingContext> = (inputs: Context) => Awaitable<void>;

export type BrowserCrawlerHandleFailedRequest<
    Context extends BrowserCrawlingContext= BrowserCrawlingContext>= (inputs: Context, error: Error) => Awaitable<void>;

export type BrowserCrawlerEnqueueLinksOptions = Omit<EnqueueLinksOptions, 'requestQueue' | 'urls'>

export type BrowserHook<
    Context = BrowserCrawlingContext,
    GoToOptions extends Record<PropertyKey, any> | undefined = Dictionary
> = (crawlingContext: Context, gotoOptions: GoToOptions) => Awaitable<void>;

export interface BrowserCrawlerOptions<
    Context extends BrowserCrawlingContext = BrowserCrawlingContext,
    InternalBrowserPoolOptions extends BrowserPoolOptions = BrowserPoolOptions,
    __BrowserPlugins extends BrowserPlugin[] = InferBrowserPluginArray<InternalBrowserPoolOptions['browserPlugins']>,
    __BrowserControllerReturn extends BrowserController = ReturnType<__BrowserPlugins[number]['createController']>,
    __LaunchContextReturn extends LaunchContext = ReturnType<__BrowserPlugins[number]['createLaunchContext']>
> extends Omit<
    BasicCrawlerOptions,
    // Overridden with browser context
    | 'requestHandler'
    | 'handleRequestFunction'

    | 'failedRequestHandler'
    | 'handleFailedRequestFunction'

    | 'errorHandler'
> {
    launchContext?: BrowserLaunchContext<any, any>;

    /**
     * Function that is called to process each request.
     *
     * The function receives the {@link BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as an argument, where:
     * - {@link BrowserCrawlingContext.request|`request`} is an instance of the {@link Request} object
     * with details about the URL to open, HTTP method etc;
     * - {@link BrowserCrawlingContext.page|`page`} is an instance of the
     * Puppeteer [Page](https://pptr.dev/api/puppeteer.page) or
     * Playwright [Page](https://playwright.dev/docs/api/class-page);
     * - {@link BrowserCrawlingContext.browserController|`browserController`} is an instance of the {@link BrowserController};
     * - {@link BrowserCrawlingContext.response|`response`} is an instance of the
     * Puppeteer [Response](https://pptr.dev/api/puppeteer.httpresponse) or
     * Playwright [Response](https://playwright.dev/docs/api/class-response),
     * which is the main resource response as returned by the respective `page.goto()` function.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to the {@link BrowserCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     * If all the retries fail, the crawler calls the function
     * provided to the {@link BrowserCrawlerOptions.failedRequestHandler|`failedRequestHandler`} parameter.
     * To make this work, we should **always**
     * let our function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@link Request.pushErrorMessage|`Request.pushErrorMessage()`} function.
     */
    requestHandler?: BrowserCrawlerHandleRequest<Context>;

    /**
     * Function that is called to process each request.
     *
     * The function receives the {@link BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as an argument, where:
     * - {@link BrowserCrawlingContext.request|`request`} is an instance of the {@link Request} object
     * with details about the URL to open, HTTP method etc;
     * - {@link BrowserCrawlingContext.page|`page`} is an instance of the
     * Puppeteer [Page](https://pptr.dev/api/puppeteer.page) or
     * Playwright [Page](https://playwright.dev/docs/api/class-page);
     * - {@link BrowserCrawlingContext.browserController|`browserController`} is an instance of the {@link BrowserController};
     * - {@link BrowserCrawlingContext.response|`response`} is an instance of the
     * Puppeteer [Response](https://pptr.dev/api/puppeteer.httpresponse) or
     * Playwright [Response](https://playwright.dev/docs/api/class-response),
     * which is the main resource response as returned by the respective `page.goto()` function.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to the {@link BrowserCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     * If all the retries fail, the crawler calls the function
     * provided to the {@link BrowserCrawlerOptions.failedRequestHandler|`failedRequestHandler`} parameter.
     * To make this work, we should **always**
     * let our function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@link Request.pushErrorMessage|`Request.pushErrorMessage()`} function.
     *
     * @deprecated `handlePageFunction` has been renamed to `requestHandler` and will be removed in a future version.
     * @ignore
     */
    handlePageFunction?: BrowserCrawlerHandleRequest<Context>;

    /**
     * User-provided function that allows modifying the request object before it gets retried by the crawler.
     * It's executed before each retry for the requests that failed less than {@link BrowserCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@link BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as the first argument,
     * where the {@link BrowserCrawlingContext.request|`request`} corresponds to the request to be retried.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    errorHandler?: BrowserCrawlerHandleFailedRequest<Context>;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the {@link BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as the first argument,
     * where the {@link BrowserCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    failedRequestHandler?: BrowserCrawlerHandleFailedRequest<Context>;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the {@link BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as the first argument,
     * where the {@link BrowserCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     *
     * @deprecated `handleFailedRequestFunction` has been renamed to `failedRequestHandler` and will be removed in a future version.
     * @ignore
     */
    handleFailedRequestFunction?: BrowserCrawlerHandleFailedRequest<Context>;

    /**
     * Custom options passed to the underlying {@link BrowserPool} constructor.
     * We can tweak those to fine-tune browser management.
     */
    browserPoolOptions?: Partial<BrowserPoolOptions> & Partial<BrowserPoolHooks<__BrowserControllerReturn, __LaunchContextReturn>>;

    /**
     * If set, the crawler will be configured for all connections to use
     * the Proxy URLs provided and rotated according to the configuration.
     */
    proxyConfiguration?: ProxyConfiguration;

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
     * Can be also set via {@link Configuration}.
     */
    headless?: boolean;
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
 * If the target website doesn't need JavaScript, we should consider using the {@link CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented by the {@link Request} objects that are fed from the {@link RequestList} or {@link RequestQueue} instances
 * provided by the {@link BrowserCrawlerOptions.requestList|`requestList`} or {@link BrowserCrawlerOptions.requestQueue|`requestQueue`}
 * constructor options, respectively. If neither `requestList` nor `requestQueue` options are provided,
 * the crawler will open the default request queue either when the {@link BrowserCrawler.addRequests|`crawler.addRequests()`} function is called,
 * or if `requests` parameter (representing the initial requests) of the {@link BrowserCrawler.run|`crawler.run()`} function is provided.
 *
 * If both {@link BrowserCrawlerOptions.requestList|`requestList`} and {@link BrowserCrawlerOptions.requestQueue|`requestQueue`} options are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to the {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * `BrowserCrawler` opens a new browser page (i.e. tab or window) for each {@link Request} object to crawl
 * and then calls the function provided by user as the {@link BrowserCrawlerOptions.requestHandler|`requestHandler`} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the {@link BrowserCrawlerOptions.autoscaledPoolOptions|`autoscaledPoolOptions`}
 * parameter of the `BrowserCrawler` constructor.
 * For user convenience, the {@link AutoscaledPoolOptions.minConcurrency|`minConcurrency`} and
 * {@link AutoscaledPoolOptions.maxConcurrency|`maxConcurrency`} options of the
 * underlying {@link AutoscaledPool} constructor are available directly in the `BrowserCrawler` constructor.
 *
 * > *NOTE:* the pool of browser instances is internally managed by the {@link BrowserPool} class.
 *
 * @category Crawlers
 */
export abstract class BrowserCrawler<
    InternalBrowserPoolOptions extends BrowserPoolOptions = BrowserPoolOptions,
    LaunchOptions = Dictionary,
    Context extends BrowserCrawlingContext = BrowserCrawlingContext,
    GoToOptions extends Record<PropertyKey, any> = Dictionary
> extends BasicCrawler<Context> {
    /**
     * A reference to the underlying {@link ProxyConfiguration} class that manages the crawler's proxies.
     * Only available if used by the crawler.
     */
    proxyConfiguration?: ProxyConfiguration;

    /**
     * A reference to the underlying {@link BrowserPool} class that manages the crawler's browsers.
     */
    browserPool: BrowserPool<InternalBrowserPoolOptions>;

    launchContext: BrowserLaunchContext<LaunchOptions, unknown>;

    protected userProvidedRequestHandler!: BrowserCrawlerHandleRequest<Context>;
    protected navigationTimeoutMillis: number;
    protected preNavigationHooks: BrowserHook<Context>[];
    protected postNavigationHooks: BrowserHook<Context>[];
    protected persistCookiesPerSession: boolean;

    protected static override optionsShape = {
        ...BasicCrawler.optionsShape,
        handlePageFunction: ow.optional.function,

        navigationTimeoutSecs: ow.optional.number.greaterThan(0),
        preNavigationHooks: ow.optional.array,
        postNavigationHooks: ow.optional.array,

        launchContext: ow.optional.object,
        browserPoolOptions: ow.object,
        sessionPoolOptions: ow.optional.object,
        persistCookiesPerSession: ow.optional.boolean,
        useSessionPool: ow.optional.boolean,
        proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),
    };

    /**
     * All `BrowserCrawler` parameters are passed via an options object.
     */
    protected constructor(options: BrowserCrawlerOptions<Context> = {}, override readonly config = Configuration.getGlobalConfig()) {
        ow(options, 'BrowserCrawlerOptions', ow.object.exactShape(BrowserCrawler.optionsShape));
        const {
            navigationTimeoutSecs = 60,
            requestHandlerTimeoutSecs = 60,
            persistCookiesPerSession,
            proxyConfiguration,
            launchContext = {},
            browserPoolOptions,
            preNavigationHooks = [],
            postNavigationHooks = [],
            // Ignored
            handleRequestFunction,

            requestHandler: userProvidedRequestHandler,
            handlePageFunction,

            failedRequestHandler,
            handleFailedRequestFunction,
            headless,
            ...basicCrawlerOptions
        } = options;

        super({
            ...basicCrawlerOptions,
            requestHandler: (...args) => this._runRequestHandler(...args),
            requestHandlerTimeoutSecs: navigationTimeoutSecs + requestHandlerTimeoutSecs + BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
        }, config);

        this._handlePropertyNameChange({
            newName: 'requestHandler',
            oldName: 'handlePageFunction',
            propertyKey: 'userProvidedRequestHandler',
            newProperty: userProvidedRequestHandler,
            oldProperty: handlePageFunction,
            allowUndefined: true, // fallback to the default router
        });

        if (!this.userProvidedRequestHandler) {
            this.userProvidedRequestHandler = this.router;
        }

        this._handlePropertyNameChange({
            newName: 'failedRequestHandler',
            oldName: 'handleFailedRequestFunction',
            propertyKey: 'failedRequestHandler',
            newProperty: failedRequestHandler,
            oldProperty: handleFailedRequestFunction,
            allowUndefined: true,
        });

        // Cookies should be persisted per session only if session pool is used
        if (!this.useSessionPool && persistCookiesPerSession) {
            throw new Error('You cannot use "persistCookiesPerSession" without "useSessionPool" set to true.');
        }

        this.launchContext = launchContext;
        this.navigationTimeoutMillis = navigationTimeoutSecs * 1000;
        this.proxyConfiguration = proxyConfiguration;
        this.preNavigationHooks = preNavigationHooks;
        this.postNavigationHooks = postNavigationHooks;

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
            if (browserPoolOptions.useFingerprints) this.log.info('Custom user agent provided, disabling automatic browser fingerprint injection!');
            browserPoolOptions.useFingerprints = false;
        }

        const { preLaunchHooks = [], postLaunchHooks = [], ...rest } = browserPoolOptions;

        this.browserPool = new BrowserPool<InternalBrowserPoolOptions>({
            ...rest as any,
            preLaunchHooks: [
                this._extendLaunchContext.bind(this),
                ...preLaunchHooks,
            ],
            postLaunchHooks: [
                this._maybeAddSessionRetiredListener.bind(this),
                ...postLaunchHooks,
            ],
        });
    }

    /**
     * Wrapper around requestHandler that opens and closes pages etc.
     */
    protected override async _runRequestHandler(crawlingContext: Context) {
        const newPageOptions: Dictionary = {
            id: crawlingContext.id,
        };

        const useIncognitoPages = this.launchContext?.useIncognitoPages;

        if (this.proxyConfiguration && useIncognitoPages) {
            const { session } = crawlingContext;

            const proxyInfo = await this.proxyConfiguration.newProxyInfo(session?.id);
            crawlingContext.proxyInfo = proxyInfo;

            newPageOptions.proxyUrl = proxyInfo.url;

            if (this.proxyConfiguration.isManInTheMiddle) {
                /**
                 * @see https://playwright.dev/docs/api/class-browser/#browser-new-context
                 * @see https://github.com/puppeteer/puppeteer/blob/main/docs/api.md
                 */
                newPageOptions.pageOptions = {
                    ignoreHTTPSErrors: true,
                };
            }
        }

        const page = await this.browserPool.newPage(newPageOptions) as CommonPage;
        tryCancel();
        this._enhanceCrawlingContextWithPageInfo(crawlingContext, page, useIncognitoPages);

        // DO NOT MOVE THIS LINE ABOVE!
        // `enhanceCrawlingContextWithPageInfo` gives us a valid session.
        // For example, `sessionPoolOptions.sessionOptions.maxUsageCount` can be `1`.
        // So we must not save the session prior to making sure it was used only once, otherwise we would use it twice.
        const { request, session } = crawlingContext;

        try {
            if (!request.skipNavigation) {
                await this._handleNavigation(crawlingContext);
                tryCancel();

                await this._responseHandler(crawlingContext);
                tryCancel();

                // save cookies
                // TODO: Should we save the cookies also after/only the handle page?
                if (this.persistCookiesPerSession) {
                    const cookies = await crawlingContext.browserController.getCookies(page);
                    tryCancel();
                    session?.setCookies(cookies, request.loadedUrl!);
                }
            }

            await addTimeoutToPromise(
                () => Promise.resolve(this.userProvidedRequestHandler(crawlingContext)),
                this.requestHandlerTimeoutMillis,
                `requestHandler timed out after ${this.requestHandlerTimeoutMillis / 1000} seconds.`,
            );
            tryCancel();

            if (session) session.markGood();
        } finally {
            await page.close().catch((error: Error) => this.log.debug('Error while closing page', { error }));
        }
    }

    protected _enhanceCrawlingContextWithPageInfo(crawlingContext: Context, page: CommonPage, useIncognitoPages?: boolean): void {
        crawlingContext.page = page;

        // This switch is because the crawlingContexts are created on per request basis.
        // However, we need to add the proxy info and session from browser, which is created based on the browser-pool configuration.
        // We would not have to do this switch if the proxy and configuration worked as in CheerioCrawler,
        // which configures proxy and session for every new request
        const browserControllerInstance = this.browserPool.getBrowserControllerByPage(page as any) as Context['browserController'];
        crawlingContext.browserController = browserControllerInstance;

        if (!useIncognitoPages) {
            crawlingContext.session = browserControllerInstance.launchContext.session as Session;
        }

        if (!crawlingContext.proxyInfo) {
            crawlingContext.proxyInfo = browserControllerInstance.launchContext.proxyInfo as ProxyInfo;
        }

        crawlingContext.enqueueLinks = async (enqueueOptions) => {
            return browserCrawlerEnqueueLinks({
                options: enqueueOptions,
                page,
                requestQueue: await this.getRequestQueue(),
                originalRequestUrl: new URL(crawlingContext.request.url).origin,
                finalRequestUrl: new URL(crawlingContext.request.loadedUrl ?? crawlingContext.request.url).origin,
            });
        };
    }

    protected async _handleNavigation(crawlingContext: Context) {
        const gotoOptions = { timeout: this.navigationTimeoutMillis } as unknown as GoToOptions;

        const preNavigationHooksCookies = this._getCookieHeaderFromRequest(crawlingContext.request);

        await this._executeHooks(this.preNavigationHooks, crawlingContext, gotoOptions);
        tryCancel();

        const postNavigationHooksCookies = this._getCookieHeaderFromRequest(crawlingContext.request);

        await this._applyCookies(crawlingContext, preNavigationHooksCookies, postNavigationHooksCookies);

        try {
            crawlingContext.response = await this._navigationHandler(crawlingContext, gotoOptions) ?? undefined;
        } catch (error) {
            await this._handleNavigationTimeout(crawlingContext, error as Error);

            throw error;
        }

        tryCancel();
        await this._executeHooks(this.postNavigationHooks, crawlingContext, gotoOptions);
    }

    protected async _applyCookies({ session, request, page, browserController }: Context, preHooksCookies: string, postHooksCookies: string) {
        const sessionCookie = session?.getCookies(request.url) ?? [];
        const parsedPreHooksCookies = preHooksCookies.split(/ *; */).map((c) => Cookie.parse(c)?.toJSON());
        const parsedPostHooksCookies = postHooksCookies.split(/ *; */).map((c) => Cookie.parse(c)?.toJSON());

        await browserController.setCookies(
            page,
            [
                ...sessionCookie,
                ...parsedPreHooksCookies,
                ...parsedPostHooksCookies,
            ].filter((c): c is CookieObject => typeof c !== 'undefined'),
        );
    }

    /**
     * Marks session bad in case of navigation timeout.
     */
    protected async _handleNavigationTimeout(crawlingContext: Context, error: Error): Promise<void> {
        const { session } = crawlingContext;

        if (error && error.constructor.name === 'TimeoutError') {
            handleRequestTimeout({ session, errorMessage: error.message });
        }

        await crawlingContext.page.close();
    }

    protected abstract _navigationHandler(crawlingContext: Context, gotoOptions: GoToOptions): Promise<Context['response'] | null | undefined>;

    /**
     * Should be overridden in case of different automation library that does not support this response API.
     */
    protected async _responseHandler(crawlingContext: Context): Promise<void> {
        const { response, session, request, page } = crawlingContext;

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
            launchContextExtends.session = await this.sessionPool.getSession();
        }

        if (this.proxyConfiguration) {
            const proxyInfo = await this.proxyConfiguration.newProxyInfo(launchContextExtends.session?.id);
            launchContext.proxyUrl = proxyInfo.url;
            launchContextExtends.proxyInfo = proxyInfo;

            // Disable SSL verification for MITM proxies
            if (this.proxyConfiguration.isManInTheMiddle) {
                /**
                 * @see https://playwright.dev/docs/api/class-browser/#browser-new-context
                 * @see https://github.com/puppeteer/puppeteer/blob/main/docs/api.md
                 */
                (launchContext.launchOptions as Dictionary).ignoreHTTPSErrors = true;
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
                        browserController as Parameters<BrowserPool<InternalBrowserPoolOptions>['retireBrowserController']>[0],
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
    options?: BrowserCrawlerEnqueueLinksOptions;
    page: CommonPage;
    requestQueue: RequestQueue;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}

/** @internal */
export async function browserCrawlerEnqueueLinks({
    options,
    page,
    requestQueue,
    originalRequestUrl,
    finalRequestUrl,
}: EnqueueLinksInternalOptions) {
    const baseUrl = resolveBaseUrl({
        enqueueStrategy: options?.strategy,
        finalRequestUrl,
        originalRequestUrl,
        userProvidedBaseUrl: options?.baseUrl,
    });

    const urls = await extractUrlsFromPage(page as any, options?.selector ?? 'a', baseUrl);

    return enqueueLinks({
        requestQueue,
        urls,
        baseUrl,
        ...options,
    });
}

/**
 * Extracts URLs from a given page.
 * @ignore
 */
// eslint-disable-next-line @typescript-eslint/ban-types
async function extractUrlsFromPage(page: { $$eval: Function }, selector: string, baseUrl?: string): Promise<string[]> {
    const urls = await page.$$eval(selector, (linkEls: HTMLLinkElement[]) => linkEls.map((link) => link.getAttribute('href')).filter((href) => !!href)) ?? [];

    return urls.map((href: string) => {
        // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
        const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
        if (!isHrefAbsolute && !baseUrl) {
            throw new Error(`An extracted URL: ${href} is relative and options.baseUrl is not set. `
                    + 'Use options.baseUrl in enqueueLinks() to automatically resolve relative URLs.');
        }
        return baseUrl
            ? (new URL(href, baseUrl)).href
            : href;
    });
}
