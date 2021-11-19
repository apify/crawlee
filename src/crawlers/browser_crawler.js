import ow from 'ow';
import { BrowserPool, BrowserController } from 'browser-pool'; // eslint-disable-line import/no-duplicates,no-unused-vars
import { BASIC_CRAWLER_TIMEOUT_BUFFER_SECS } from '../constants';
import EVENTS from '../session_pool/events'; // eslint-disable-line import/no-duplicates
import { addTimeoutToPromise } from '../utils';
import { validators } from '../validators';
import {
    throwOnBlockedRequest,
    handleRequestTimeout,
} from './crawler_utils';

/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { BasicCrawler, CrawlingContext } from './basic_crawler';
import { HandleFailedRequest } from './basic_crawler';
import { ProxyConfiguration, ProxyInfo } from '../proxy_configuration';
import { Session } from '../session_pool/session';
import { BrowserPoolOptions } from 'browser-pool';
import { RequestList } from '../request_list';
import { RequestQueue } from '../storages/request_queue';
import Request from '../request';
import { SessionPoolOptions } from '../session_pool/session_pool';
import { AutoscaledPoolOptions } from '../autoscaling/autoscaled_pool';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

/**
 * @typedef BrowserCrawlingContext
 * @property {BrowserController} browserController
 */
/**
 * @callback Hook
 * @param {BrowserCrawlingContext & CrawlingContext} crawlingContext
 * @param {Object<string,*>} gotoOptions
 * @returns {Promise<void>}
 */
/**
 * @callback BrowserHandlePageFunction
 * @param {BrowserCrawlingContext & CrawlingContext} context
 * @returns {Promise<void>}
 */
/**
 * @callback GotoFunction
 * @param {BrowserCrawlingContext & CrawlingContext} context
 * @param {Object<string,*>} gotoOptions
 * @returns {Promise<*>}
 */

/**
 * @typedef BrowserCrawlerOptions
 * @property {BrowserHandlePageFunction} handlePageFunction
 *   Function that is called to process each request.
 *   It is passed an object with the following fields:
 *
 * ```
 * {
 *   request: Request,
 *   response: Response,
 *   page: Page,
 *   session: Session,
 *   browserController: BrowserController,
 *   proxyInfo: ProxyInfo,
 *   crawler: BrowserCrawler,
 * }
 * ```
 *
 *   `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
 *   `page` is an instance of the `Puppeteer`
 *   [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) or `Playwright`
 *   [`Page`](https://playwright.dev/docs/api/class-page)
 *   `browserPool` is an instance of the
 *   [`BrowserPool`](https://github.com/apify/browser-pool#BrowserPool),
 *   `browserController` is an instance of the
 *   [`BrowserController`](https://github.com/apify/browser-pool#browsercontroller),
 *   `response` is an instance of the `Puppeteer`
 *   [`Response`](https://pptr.dev/#?product=Puppeteer&show=api-class-response) or `Playwright`
 *   [`Response`](https://playwright.dev/docs/api/class-response),
 *   which is the main resource response as returned by `page.goto(request.url)`.
 *   The function must return a promise, which is then awaited by the crawler.
 *
 *   If the function throws an exception, the crawler will try to re-crawl the
 *   request later, up to `option.maxRequestRetries` times.
 *   If all the retries fail, the crawler calls the function
 *   provided to the `handleFailedRequestFunction` parameter.
 *   To make this work, you should **always**
 *   let your function throw exceptions rather than catch them.
 *   The exceptions are logged to the request using the
 *   {@link Request#pushErrorMessage} function.
 * @property {number} [handlePageTimeoutSecs=60]
 *   Timeout in which the function passed as `handlePageFunction` needs to finish, in seconds.
 * @property {GotoFunction} [gotoFunction]
 *   Navigation function for corresponding library. `page.goto(url)` is supported by both `playwright` and `puppeteer`.
 * @property {HandleFailedRequest} [handleFailedRequestFunction]
 *   A function to handle requests that failed more than `option.maxRequestRetries` times.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request,
 *   response: Response,
 *   page: Page,
 *   browserPool: BrowserPool,
 *   autoscaledPool: AutoscaledPool,
 *   session: Session,
 *   browserController: BrowserController,
 *   proxyInfo: ProxyInfo,
 * }
 * ```
 *   Where the {@link Request} instance corresponds to the failed request, and the `Error` instance
 *   represents the last error thrown during processing of the request.
 * @property {BrowserPoolOptions} [browserPoolOptions]
 *   Custom options passed to the underlying [`BrowserPool`](https://github.com/apify/browser-pool#BrowserPool) constructor.
 *   You can tweak those to fine-tune browser management.
 * @property {boolean} [persistCookiesPerSession=true]
 *   Automatically saves cookies to Session. Works only if Session Pool is used.
 * @property {ProxyConfiguration} [proxyConfiguration]
 *   If set, `PuppeteerCrawler` will be configured for all connections to use
 *   [Apify Proxy](https://console.apify.com/proxy) or your own Proxy URLs provided and rotated according to the configuration.
 *   For more information, see the [documentation](https://docs.apify.com/proxy).
 * @property {Array<Hook>} [preNavigationHooks]
 *   Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
 *   or browser properties before navigation. The function accepts two parameters, `crawlingContext` and `gotoOptions`,
 *   which are passed to the `page.goto()` function the crawler calls to navigate.
 *   Example:
 * ```
 * preNavigationHooks: [
 *     async (crawlingContext, gotoOptions) => {
 *         const { page } = crawlingContext;
 *         await page.evaluate((attr) => { window.foo = attr; }, 'bar');
 *     },
 * ]
 * ```
 * @property {Array<Hook>} [postNavigationHooks]
 *   Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
 *   The function accepts `crawlingContext` as the only parameter.
 *   Example:
 * ```
 * postNavigationHooks: [
 *     async (crawlingContext) => {
 *         const { page } = crawlingContext;
 *         if (hasCaptcha(page)) {
 *             await solveCaptcha (page);
 *         }
 *     },
 * ]
 * ```
 * @property {RequestList} [requestList]
 *   Static list of URLs to be processed.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {RequestQueue} [requestQueue]
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {number} [handleRequestTimeoutSecs=60]
 *   Timeout in which the function passed as `handleRequestFunction` needs to finish, in seconds.
 * @property {HandleFailedRequest} [handleFailedRequestFunction]
 *   A function to handle requests that failed more than `option.maxRequestRetries` times.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request,
 *   error: Error,
 *   session: Session,
 *   crawler: BrowserCrawler,
 * }
 * ```
 *   where the {@link Request} instance corresponds to the failed request, and the `Error` instance
 *   represents the last error thrown during processing of the request.
 *
 *   See
 *   [source code](https://github.com/apify/apify-js/blob/master/src/crawlers/basic_crawler.js#L11)
 *   for the default implementation of this function.
 * @property {number} [maxRequestRetries=3]
 *   Indicates how many times the request is retried if {@link BasicCrawlerOptions.handleRequestFunction} fails.
 * @property {number} [maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @property {AutoscaledPoolOptions} [autoscaledPoolOptions]
 *   Custom options passed to the underlying {@link AutoscaledPool} constructor.
 *   Note that the `runTaskFunction` and `isTaskReadyFunction` options
 *   are provided by `BasicCrawler` and cannot be overridden.
 *   However, you can provide a custom implementation of `isFinishedFunction`.
 * @property {number} [minConcurrency=1]
 *   Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 *
 *   *WARNING:* If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
 *   If you're not sure, just keep the default value and the concurrency will scale up automatically.
 * @property {number} [maxConcurrency=1000]
 *   Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 * @property {boolean} [useSessionPool=true]
 *   Browser crawler will initialize the  {@link SessionPool} with the corresponding `sessionPoolOptions`.
 *   The session instance will be than available in the `handleRequestFunction`.
 * @property {SessionPoolOptions} [sessionPoolOptions] The configuration options for {@link SessionPool} to use.
 * @ignore
 */

/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless browsers with [Puppeteer](https://github.com/puppeteer/puppeteer)
 * and [Playwright](https://github.com/microsoft/playwright).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `BrowserCrawler` uses headless or even headfull browsers to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, consider using {@link CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster. @TODO: more?
 *
 * The source URLs are represented using {@link Request} objects that are fed from
 * {@link RequestList} or {@link RequestQueue} instances provided by the {@link BrowserCrawlerOptions.requestList}
 * or {@link BrowserCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@link BrowserCrawlerOptions.requestList} and {@link BrowserCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * `BrowserCrawler` opens a new browser page (i.e. tab or window) for each {@link Request} object to crawl
 * and then calls the function provided by user as the {@link BrowserCrawlerOptions.handlePageFunction} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the {@link BrowserCrawlerOptions.autoscaledPoolOptions}
 * parameter of the `BrowserCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPoolOptions} are available directly in the `BrowserCrawler` constructor.
 *
 * Note that the pool of browser instances is internally managed by the {@link BrowserPool} class.
 *
 * await crawler.run();
 * ```
 * @property {Statistics} stats
 *  Contains statistics about the current run.
 * @property {RequestList} [requestList]
 *  A reference to the underlying {@link RequestList} class that manages the crawler's {@link Request}s.
 *  Only available if used by the crawler.
 * @property {RequestQueue} [requestQueue]
 *  A reference to the underlying {@link RequestQueue} class that manages the crawler's {@link Request}s.
 *  Only available if used by the crawler.
 * @property {SessionPool} [sessionPool]
 *  A reference to the underlying {@link SessionPool} class that manages the crawler's {@link Session}s.
 *  Only available if used by the crawler.
 * @property {ProxyConfiguration} [proxyConfiguration]
 *  A reference to the underlying {@link ProxyConfiguration} class that manages the crawler's proxies.
 *  Only available if used by the crawler.
 * @property {BrowserPool} browserPool
 *  A reference to the underlying `BrowserPool` class that manages the crawler's browsers.
 *  For more information about it, see the [`browser-pool` module](https://github.com/apify/browser-pool).
 * @property {AutoscaledPool} autoscaledPool
 *  A reference to the underlying {@link AutoscaledPool} class that manages the concurrency of the crawler.
 *  Note that this property is only initialized after calling the {@link CheerioCrawler#run} function.
 *  You can use it to change the concurrency settings on the fly,
 *  to pause the crawler by calling {@link AutoscaledPool#pause}
 *  or to abort it by calling {@link AutoscaledPool#abort}.
 * @ignore
 */
export default class BrowserCrawler extends BasicCrawler {
    /**
     * @internal
     * @type any
     */
    static optionsShape = {
        ...BasicCrawler.optionsShape,
        // TODO temporary until the API is unified in V2
        handleRequestFunction: ow.undefined,

        handlePageFunction: ow.function,
        gotoFunction: ow.optional.function,

        gotoTimeoutSecs: ow.optional.number.greaterThan(0),
        navigationTimeoutSecs: ow.optional.number.greaterThan(0),
        handlePageTimeoutSecs: ow.optional.number.greaterThan(0),
        preNavigationHooks: ow.optional.array,
        postNavigationHooks: ow.optional.array,

        browserPoolOptions: ow.object,
        sessionPoolOptions: ow.optional.object,
        persistCookiesPerSession: ow.optional.boolean,
        useSessionPool: ow.optional.boolean,
        proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),
    };

    /**
     * @param {BrowserCrawlerOptions} options
     * All `BrowserCrawler` parameters are passed via an options object.
     */
    constructor(options) {
        ow(options, 'BrowserCrawlerOptions', ow.object.exactShape(BrowserCrawler.optionsShape));
        const {
            handlePageFunction,
            handlePageTimeoutSecs = 60,
            navigationTimeoutSecs = 60,
            gotoFunction, // deprecated
            gotoTimeoutSecs, // deprecated
            persistCookiesPerSession,
            proxyConfiguration,
            browserPoolOptions,
            preNavigationHooks = [],
            postNavigationHooks = [],
            ...basicCrawlerOptions
        } = options;

        super({
            ...basicCrawlerOptions,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
            handleRequestTimeoutSecs: navigationTimeoutSecs + handlePageTimeoutSecs + BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
        });

        // Cookies should be persisted per session only if session pool is used
        if (!this.useSessionPool && persistCookiesPerSession) {
            throw new Error('You cannot use "persistCookiesPerSession" without "useSessionPool" set to true.');
        }

        if (gotoTimeoutSecs) {
            this.log.deprecated('Option "gotoTimeoutSecs" is deprecated. Use "navigationTimeoutSecs" instead.');
        }

        this.handlePageFunction = handlePageFunction;
        this.handlePageTimeoutSecs = handlePageTimeoutSecs;
        this.handlePageTimeoutMillis = this.handlePageTimeoutSecs * 1000;
        this.navigationTimeoutMillis = (gotoTimeoutSecs || navigationTimeoutSecs) * 1000;

        this.gotoFunction = gotoFunction;
        this.defaultGotoOptions = {
            timeout: this.navigationTimeoutMillis,
        };

        this.proxyConfiguration = proxyConfiguration;

        /** @type {Array<Hook>} */
        this.preNavigationHooks = preNavigationHooks;
        /** @type {Array<Hook>} */
        this.postNavigationHooks = postNavigationHooks;

        if (this.useSessionPool) {
            this.persistCookiesPerSession = persistCookiesPerSession !== undefined ? persistCookiesPerSession : true;
        } else {
            this.persistCookiesPerSession = false;
        }

        const { preLaunchHooks = [], postLaunchHooks = [], ...rest } = browserPoolOptions;
        this.browserPool = new BrowserPool({
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

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @param {BrowserCrawlingContext & CrawlingContext} crawlingContext
     * @ignore
     * @protected
     * @internal
     */
    async _handleRequestFunction(crawlingContext) {
        const { request, session } = crawlingContext;

        const newPageOptions = {
            id: crawlingContext.id,
        };

        const useIncognitoPages = this.launchContext && this.launchContext.useIncognitoPages;
        if (this.proxyConfiguration && useIncognitoPages) {
            const proxyInfo = this.proxyConfiguration.newProxyInfo(session && session.id);
            crawlingContext.session = session;
            crawlingContext.proxyInfo = proxyInfo;

            newPageOptions.proxyUrl = proxyInfo.url;

            // Disable SSL verification for MITM proxies
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
        this._enhanceCrawlingContextWithPageInfo(crawlingContext, page, useIncognitoPages);

        if (this.useSessionPool) {
            const sessionCookies = session.getPuppeteerCookies(request.url);
            if (sessionCookies.length) {
                await crawlingContext.browserController.setCookies(page, sessionCookies);
            }
        }

        try {
            await this._handleNavigation(crawlingContext);

            await this._responseHandler(crawlingContext);

            // save cookies
            // @TODO: Should we save the cookies also after/only the handle page?
            if (this.persistCookiesPerSession) {
                const cookies = await crawlingContext.browserController.getCookies(page);
                session.setPuppeteerCookies(cookies, request.loadedUrl);
            }

            await addTimeoutToPromise(
                this.handlePageFunction(crawlingContext),
                this.handlePageTimeoutMillis,
                `handlePageFunction timed out after ${this.handlePageTimeoutMillis / 1000} seconds.`,
            );

            if (session) session.markGood();
        } finally {
            page.close().catch((error) => this.log.debug('Error while closing page', { error }));
        }
    }

    /**
     * @param {BrowserCrawlingContext & CrawlingContext} crawlingContext
     * @param {*} page
     * @param {boolean} useIncognitoPages
     * @ignore
     * @protected
     * @internal
     */
    _enhanceCrawlingContextWithPageInfo(crawlingContext, page, useIncognitoPages) {
        crawlingContext.page = page;

        // This switch is because the crawlingContexts are created on per request basis.
        // However, we need to add the proxy info and session from browser, which is created based on the browser-pool configuration.
        // We would not have to do this switch if the proxy and configuration worked as in CheerioCrawler,
        // which configures proxy and session for every new request
        const browserControllerInstance = this.browserPool.getBrowserControllerByPage(page);
        crawlingContext.browserController = browserControllerInstance;

        if (!useIncognitoPages) {
            crawlingContext.session = browserControllerInstance.launchContext.session;
        }

        if (!crawlingContext.proxyInfo) {
            crawlingContext.proxyInfo = browserControllerInstance.launchContext.proxyInfo;
        }
    }

    /**
     * @param {BrowserCrawlingContext & CrawlingContext} crawlingContext
     * @ignore
     * @protected
     * @internal
     */
    async _handleNavigation(crawlingContext) {
        /** @type {*} */
        const gotoOptions = { ...this.defaultGotoOptions };
        await this._executeHooks(this.preNavigationHooks, crawlingContext, gotoOptions);
        try {
            crawlingContext.response = await this._navigationHandler(crawlingContext, gotoOptions);
        } catch (error) {
            this._handleNavigationTimeout(crawlingContext, error);

            throw error;
        }

        await this._executeHooks(this.postNavigationHooks, crawlingContext, gotoOptions);
    }

    /**
     * Marks session bad in case of navigation timeout.
     * @param {BrowserCrawlingContext & CrawlingContext} crawlingContext
     * @param {Error} error
     * @ignore
     * @protected
     * @internal
     */
    _handleNavigationTimeout(crawlingContext, error) {
        const { session } = crawlingContext;

        if (error && error.constructor.name === 'TimeoutError') {
            handleRequestTimeout(session, error.message);
        }
    }

    /**
     * @param {BrowserCrawlingContext & CrawlingContext} crawlingContext
     * @param {Object<string,*>} gotoOptions
     * @ignore
     * @protected
     * @internal
     */
    async _navigationHandler(crawlingContext, gotoOptions) {
        if (!this.gotoFunction) {
            // @TODO: although it is optional in the validation,
            //  because when you make automation library specific you can override this handler.
            throw new Error('BrowserCrawler: You must specify a gotoFunction!');
        }
        return this.gotoFunction(crawlingContext, gotoOptions);
    }

    /**
     * Should be overriden in case of different automation library that does not support this response API.
     * // @TODO: This can be also done as a postNavigation hook except the loadedUrl marking.
     * @param {BrowserCrawlingContext & CrawlingContext} crawlingContext
     * @return {Promise<void>}
     * @ignore
     * @protected
     * @internal
     */
    async _responseHandler(crawlingContext) {
        const { response, session, request, page } = crawlingContext;

        if (this.sessionPool && response) {
            if (typeof response === 'object' && typeof response.status === 'function') {
                throwOnBlockedRequest(session, response.status());
            } else {
                this.log.debug('Got a malformed Browser response.', { request, response });
            }
        }

        request.loadedUrl = await page.url();
    }

    /**
     * @param {string} pageId
     * @param {*} launchContext
     * @ignore
     * @protected
     * @internal
     */
    async _extendLaunchContext(pageId, launchContext) {
        const launchContextExtends = {};

        if (this.sessionPool) {
            launchContextExtends.session = await this.sessionPool.getSession();
        }

        if (this.proxyConfiguration) {
            const proxyInfo = this.proxyConfiguration.newProxyInfo(launchContextExtends.session && launchContextExtends.session.id);
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

    /**
     *
     * @param {string} pageId
     * @param {BrowserController} browserController
     * @ignore
     * @protected
     * @internal
     */
    _maybeAddSessionRetiredListener(pageId, browserController) {
        if (this.sessionPool) {
            const listener = (session) => {
                const { launchContext } = browserController;
                if (session.id === launchContext.session.id) {
                    this.browserPool.retireBrowserController(browserController);
                }
            };

            this.sessionPool.on(EVENTS.SESSION_RETIRED, listener);
            browserController.on('browserClosed', () => this.sessionPool.removeListener(EVENTS.SESSION_RETIRED, listener));
        }
    }

    /**
     * Function for cleaning up after all request are processed.
     * @ignore
     */
    async teardown() {
        await this.browserPool.destroy();
        await super.teardown();
    }
}
