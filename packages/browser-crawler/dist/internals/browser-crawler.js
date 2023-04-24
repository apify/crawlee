"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.browserCrawlerEnqueueLinks = exports.BrowserCrawler = void 0;
const tslib_1 = require("tslib");
const timeout_1 = require("@apify/timeout");
const basic_1 = require("@crawlee/basic");
const browser_pool_1 = require("@crawlee/browser-pool");
const ow_1 = tslib_1.__importDefault(require("ow"));
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
class BrowserCrawler extends basic_1.BasicCrawler {
    /**
     * All `BrowserCrawler` parameters are passed via an options object.
     */
    constructor(options = {}, config = basic_1.Configuration.getGlobalConfig()) {
        var _a;
        (0, ow_1.default)(options, 'BrowserCrawlerOptions', ow_1.default.object.exactShape(BrowserCrawler.optionsShape));
        const { navigationTimeoutSecs = 60, requestHandlerTimeoutSecs = 60, persistCookiesPerSession, proxyConfiguration, launchContext = {}, browserPoolOptions, preNavigationHooks = [], postNavigationHooks = [], 
        // Ignored
        handleRequestFunction, requestHandler: userProvidedRequestHandler, handlePageFunction, failedRequestHandler, handleFailedRequestFunction, headless, ...basicCrawlerOptions } = options;
        super({
            ...basicCrawlerOptions,
            requestHandler: (...args) => this._runRequestHandler(...args),
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
        /**
         * A reference to the underlying {@apilink BrowserPool} class that manages the crawler's browsers.
         */
        Object.defineProperty(this, "browserPool", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "launchContext", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "userProvidedRequestHandler", {
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
        Object.defineProperty(this, "requestHandlerTimeoutInnerMillis", {
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
        this.requestHandlerTimeoutInnerMillis = requestHandlerTimeoutSecs * 1000;
        this.proxyConfiguration = proxyConfiguration;
        this.preNavigationHooks = preNavigationHooks;
        this.postNavigationHooks = postNavigationHooks;
        if (headless != null) {
            (_a = this.launchContext).launchOptions ?? (_a.launchOptions = {});
            this.launchContext.launchOptions.headless = headless;
        }
        if (this.useSessionPool) {
            this.persistCookiesPerSession = persistCookiesPerSession !== undefined ? persistCookiesPerSession : true;
        }
        else {
            this.persistCookiesPerSession = false;
        }
        if (launchContext?.userAgent) {
            if (browserPoolOptions.useFingerprints)
                this.log.info('Custom user agent provided, disabling automatic browser fingerprint injection!');
            browserPoolOptions.useFingerprints = false;
        }
        const { preLaunchHooks = [], postLaunchHooks = [], ...rest } = browserPoolOptions;
        this.browserPool = new browser_pool_1.BrowserPool({
            ...rest,
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
    async _cleanupContext(crawlingContext) {
        const { page } = crawlingContext;
        // Page creation may be aborted
        if (page) {
            await page.close().catch((error) => this.log.debug('Error while closing page', { error }));
        }
    }
    /**
     * Wrapper around requestHandler that opens and closes pages etc.
     */
    async _runRequestHandler(crawlingContext) {
        const newPageOptions = {
            id: crawlingContext.id,
        };
        const useIncognitoPages = this.launchContext?.useIncognitoPages;
        const experimentalContainers = this.launchContext?.experimentalContainers;
        if (this.proxyConfiguration && (useIncognitoPages || experimentalContainers)) {
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
        const page = await this.browserPool.newPage(newPageOptions);
        (0, timeout_1.tryCancel)();
        this._enhanceCrawlingContextWithPageInfo(crawlingContext, page, useIncognitoPages || experimentalContainers);
        // DO NOT MOVE THIS LINE ABOVE!
        // `enhanceCrawlingContextWithPageInfo` gives us a valid session.
        // For example, `sessionPoolOptions.sessionOptions.maxUsageCount` can be `1`.
        // So we must not save the session prior to making sure it was used only once, otherwise we would use it twice.
        const { request, session } = crawlingContext;
        if (!request.skipNavigation) {
            await this._handleNavigation(crawlingContext);
            (0, timeout_1.tryCancel)();
            await this._responseHandler(crawlingContext);
            (0, timeout_1.tryCancel)();
            // save cookies
            // TODO: Should we save the cookies also after/only the handle page?
            if (this.persistCookiesPerSession) {
                const cookies = await crawlingContext.browserController.getCookies(page);
                (0, timeout_1.tryCancel)();
                session?.setCookies(cookies, request.loadedUrl);
            }
        }
        request.state = basic_1.RequestState.REQUEST_HANDLER;
        try {
            await (0, timeout_1.addTimeoutToPromise)(() => Promise.resolve(this.userProvidedRequestHandler(crawlingContext)), this.requestHandlerTimeoutInnerMillis, `requestHandler timed out after ${this.requestHandlerTimeoutInnerMillis / 1000} seconds.`);
            request.state = basic_1.RequestState.DONE;
        }
        catch (e) {
            request.state = basic_1.RequestState.ERROR;
            throw e;
        }
        (0, timeout_1.tryCancel)();
        if (session)
            session.markGood();
    }
    _enhanceCrawlingContextWithPageInfo(crawlingContext, page, createNewSession) {
        crawlingContext.page = page;
        // This switch is because the crawlingContexts are created on per request basis.
        // However, we need to add the proxy info and session from browser, which is created based on the browser-pool configuration.
        // We would not have to do this switch if the proxy and configuration worked as in CheerioCrawler,
        // which configures proxy and session for every new request
        const browserControllerInstance = this.browserPool.getBrowserControllerByPage(page);
        crawlingContext.browserController = browserControllerInstance;
        if (!createNewSession) {
            crawlingContext.session = browserControllerInstance.launchContext.session;
        }
        if (!crawlingContext.proxyInfo) {
            crawlingContext.proxyInfo = browserControllerInstance.launchContext.proxyInfo;
        }
        crawlingContext.enqueueLinks = async (enqueueOptions) => {
            return browserCrawlerEnqueueLinks({
                options: enqueueOptions,
                page,
                requestQueue: await this.getRequestQueue(),
                originalRequestUrl: crawlingContext.request.url,
                finalRequestUrl: crawlingContext.request.loadedUrl,
            });
        };
    }
    async _handleNavigation(crawlingContext) {
        const gotoOptions = { timeout: this.navigationTimeoutMillis };
        const preNavigationHooksCookies = this._getCookieHeaderFromRequest(crawlingContext.request);
        crawlingContext.request.state = basic_1.RequestState.BEFORE_NAV;
        await this._executeHooks(this.preNavigationHooks, crawlingContext, gotoOptions);
        (0, timeout_1.tryCancel)();
        const postNavigationHooksCookies = this._getCookieHeaderFromRequest(crawlingContext.request);
        await this._applyCookies(crawlingContext, preNavigationHooksCookies, postNavigationHooksCookies);
        try {
            crawlingContext.response = await this._navigationHandler(crawlingContext, gotoOptions) ?? undefined;
        }
        catch (error) {
            await this._handleNavigationTimeout(crawlingContext, error);
            crawlingContext.request.state = basic_1.RequestState.ERROR;
            throw error;
        }
        (0, timeout_1.tryCancel)();
        crawlingContext.request.state = basic_1.RequestState.AFTER_NAV;
        await this._executeHooks(this.postNavigationHooks, crawlingContext, gotoOptions);
    }
    async _applyCookies({ session, request, page, browserController }, preHooksCookies, postHooksCookies) {
        const sessionCookie = session?.getCookies(request.url) ?? [];
        const parsedPreHooksCookies = preHooksCookies.split(/ *; */).map((c) => (0, basic_1.cookieStringToToughCookie)(c));
        const parsedPostHooksCookies = postHooksCookies.split(/ *; */).map((c) => (0, basic_1.cookieStringToToughCookie)(c));
        await browserController.setCookies(page, [
            ...sessionCookie,
            ...parsedPreHooksCookies,
            ...parsedPostHooksCookies,
        ]
            .filter((c) => typeof c !== 'undefined' && c !== null)
            .map((c) => ({ ...c, url: c.domain ? undefined : request.url })));
    }
    /**
     * Marks session bad in case of navigation timeout.
     */
    async _handleNavigationTimeout(crawlingContext, error) {
        const { session } = crawlingContext;
        if (error && error.constructor.name === 'TimeoutError') {
            (0, basic_1.handleRequestTimeout)({ session, errorMessage: error.message });
        }
        await crawlingContext.page.close();
    }
    /**
     * Should be overridden in case of different automation library that does not support this response API.
     */
    async _responseHandler(crawlingContext) {
        const { response, session, request, page } = crawlingContext;
        if (typeof response === 'object' && typeof response.status === 'function') {
            const status = response.status();
            this.stats.registerStatusCode(status);
        }
        if (this.sessionPool && response && session) {
            if (typeof response === 'object' && typeof response.status === 'function') {
                this._throwOnBlockedRequest(session, response.status());
            }
            else {
                this.log.debug('Got a malformed Browser response.', { request, response });
            }
        }
        request.loadedUrl = await page.url();
    }
    async _extendLaunchContext(_pageId, launchContext) {
        const launchContextExtends = {};
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
                launchContext.launchOptions.ignoreHTTPSErrors = true;
            }
        }
        launchContext.extend(launchContextExtends);
    }
    _maybeAddSessionRetiredListener(_pageId, browserController) {
        if (this.sessionPool) {
            const listener = (session) => {
                const { launchContext } = browserController;
                if (session.id === launchContext.session.id) {
                    this.browserPool.retireBrowserController(browserController);
                }
            };
            this.sessionPool.on(basic_1.EVENT_SESSION_RETIRED, listener);
            browserController.on("browserClosed" /* BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED */, () => {
                return this.sessionPool.removeListener(basic_1.EVENT_SESSION_RETIRED, listener);
            });
        }
    }
    /**
     * Function for cleaning up after all requests are processed.
     * @ignore
     */
    async teardown() {
        await this.browserPool.destroy();
        await super.teardown();
    }
}
Object.defineProperty(BrowserCrawler, "optionsShape", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        ...basic_1.BasicCrawler.optionsShape,
        handlePageFunction: ow_1.default.optional.function,
        navigationTimeoutSecs: ow_1.default.optional.number.greaterThan(0),
        preNavigationHooks: ow_1.default.optional.array,
        postNavigationHooks: ow_1.default.optional.array,
        launchContext: ow_1.default.optional.object,
        headless: ow_1.default.optional.boolean,
        browserPoolOptions: ow_1.default.object,
        sessionPoolOptions: ow_1.default.optional.object,
        persistCookiesPerSession: ow_1.default.optional.boolean,
        useSessionPool: ow_1.default.optional.boolean,
        proxyConfiguration: ow_1.default.optional.object.validate(basic_1.validators.proxyConfiguration),
    }
});
exports.BrowserCrawler = BrowserCrawler;
/** @internal */
async function browserCrawlerEnqueueLinks({ options, page, requestQueue, originalRequestUrl, finalRequestUrl, }) {
    const baseUrl = (0, basic_1.resolveBaseUrlForEnqueueLinksFiltering)({
        enqueueStrategy: options?.strategy,
        finalRequestUrl,
        originalRequestUrl,
        userProvidedBaseUrl: options?.baseUrl,
    });
    const urls = await extractUrlsFromPage(page, options?.selector ?? 'a', options?.baseUrl ?? finalRequestUrl ?? originalRequestUrl);
    return (0, basic_1.enqueueLinks)({
        requestQueue,
        urls,
        baseUrl,
        ...options,
    });
}
exports.browserCrawlerEnqueueLinks = browserCrawlerEnqueueLinks;
/**
 * Extracts URLs from a given page.
 * @ignore
 */
// eslint-disable-next-line @typescript-eslint/ban-types
async function extractUrlsFromPage(page, selector, baseUrl) {
    const urls = await page.$$eval(selector, (linkEls) => linkEls.map((link) => link.getAttribute('href')).filter((href) => !!href)) ?? [];
    return urls.map((href) => {
        // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
        const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
        if (!isHrefAbsolute && !baseUrl) {
            throw new Error(`An extracted URL: ${href} is relative and options.baseUrl is not set. `
                + 'Use options.baseUrl in enqueueLinks() to automatically resolve relative URLs.');
        }
        return baseUrl
            ? (0, basic_1.tryAbsoluteURL)(href, baseUrl)
            : href;
    })
        .filter((href) => !!href);
}
//# sourceMappingURL=browser-crawler.js.map