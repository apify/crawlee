import ow from 'ow';
import { BrowserPool } from 'browser-pool'; // eslint-disable-line import/no-duplicates
import { BASIC_CRAWLER_TIMEOUT_MULTIPLIER } from '../constants';
import { SessionPool } from '../session_pool/session_pool'; // eslint-disable-line import/no-duplicates
import { addTimeoutToPromise } from '../utils';
import BasicCrawler from './basic_crawler'; // eslint-disable-line import/no-duplicates
import { validators } from '../validators';
import {
    throwOnBlockedRequest,
} from './crawler_utils';

// eslint-enable-line import/no-duplicates

/**
 * @typedef BrowserCrawlerOptions
 * @extends BasicCrawlerOptions
 * @property {function} handlePageFunction
 *   Function that is called to process each request.
 *   It is passed an object with the following fields:
 *
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
 *
 *   `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
 *   `page` is an instance of the `Puppeteer`
 *   [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page)
 *   which is the main resource response as returned by `page.goto(request.url)`.
 *   `browserPool` is an instance of the
 *   [`BrowserPool`](https://github.com/apify/browser-pool#BrowserPool),
 *   `browserController` is an instance of the
 *   [`BrowserController`](https://github.com/apify/browser-pool#browsercontroller),
 *   `response` is an instance of the `Puppeteer`
 *   [`Response`](https://pptr.dev/#?product=Puppeteer&show=api-class-response),
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
 * @property {function} [gotoFunction]
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
 * @property {boolean} [persistCookiesPerSession=false]
 *   Automatically saves cookies to Session. Works only if Session Pool is used.
 * @property {ProxyConfiguration} [proxyConfiguration]
 *   If set, `PuppeteerCrawler` will be configured for all connections to use
 *   [Apify Proxy](https://my.apify.com/proxy) or your own Proxy URLs provided and rotated according to the configuration.
 *   For more information, see the [documentation](https://docs.apify.com/proxy).
 * @property {array} [preNavigationHooks]
 * @property {array} [postNavigationHooks]
 */

/**
 * @TODO:
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chrome with [Puppeteer](https://github.com/puppeteer/puppeteer).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `PuppeteerCrawler` uses headless Chrome to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, consider using {@link CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented using {@link Request} objects that are fed from
 * {@link RequestList} or {@link RequestQueue} instances provided by the {@link BasicCrawlerOptions.requestList}
 * or {@link BasicCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@link BasicCrawlerOptions.requestList} and {@link BasicCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * `PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each {@link Request} object to crawl
 * and then calls the function provided by user as the {@link BrowserCrawlerOptions.handlePageFunction} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the {@link BasicCrawlerOptions.autoscaledPoolOptions}
 * parameter of the `PuppeteerCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPoolOptions} are available directly in the `PuppeteerCrawler` constructor.
 *
 * Note that the pool of Puppeteer instances is internally managed by the {@link BrowserPool} class.
 *
 * **Example usage:**
 * @TODO:
 * ```javascript
 * const crawler = new Apify.PuppeteerCrawler({
 *     requestList,
 *     handlePageFunction: async ({ page, request }) => {
 *         // This function is called to extract data from a single web page
 *         // 'page' is an instance of Puppeteer.Page with page.goto(request.url) already called
 *         // 'request' is an instance of Request class with information about the page to load
 *         await Apify.pushData({
 *             title: await page.title(),
 *             url: request.url,
 *             succeeded: true,
 *         })
 *     },
 *     handleFailedRequestFunction: async ({ request }) => {
 *         // This function is called when the crawling of a request failed too many times
 *         await Apify.pushData({
 *             url: request.url,
 *             succeeded: false,
 *             errors: request.errorMessages,
 *         })
 *     },
 * });
 *
 * await crawler.run();
 * ```
 *
 */
class BrowserCrawler extends BasicCrawler {
    static optionsShape = {
        ...BasicCrawler.optionsShape,
        // TODO temporary until the API is unified in V2
        handleRequestFunction: ow.undefined,

        handlePageFunction: ow.function,
        gotoFunction: ow.optional.function,

        handlePageTimeoutSecs: ow.optional.number,
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
            gotoFunction,
            persistCookiesPerSession = true,
            useSessionPool = true,
            sessionPoolOptions,
            proxyConfiguration,
            browserPoolOptions,
            preNavigationHooks = [],
            postNavigationHooks = [],
            ...basicCrawlerOptions
        } = options;

        if (!useSessionPool && persistCookiesPerSession) {
            // @TODO: Maybe we could also automatically set persistCookiesPerSession to false when useSessionPool is false and log warning
            throw new Error('You cannot use "persistCookiesPerSession" without "useSessionPool" set to true.');
        }

        super({
            ...basicCrawlerOptions,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
            handleRequestTimeoutSecs: handlePageTimeoutSecs * BASIC_CRAWLER_TIMEOUT_MULTIPLIER,
        });

        this.handlePageFunction = handlePageFunction;
        this.handlePageTimeoutSecs = handlePageTimeoutSecs;
        this.handlePageTimeoutMillis = this.handlePageTimeoutSecs * 1000;

        this.gotoFunction = gotoFunction;

        this.persistCookiesPerSession = persistCookiesPerSession;
        this.proxyConfiguration = proxyConfiguration;

        this.preNavigationHooks = preNavigationHooks;
        this.postNavigationHooks = postNavigationHooks;

        if (useSessionPool) {
            this.sessionPool = new SessionPool({
                ...sessionPoolOptions,
                log: this.log,
            });
        }

        const { preLaunchHooks = [], ...rest } = browserPoolOptions;
        this.browserPool = new BrowserPool({
            ...rest,
            preLaunchHooks: [
                this._extendLaunchContext.bind(this),
                ...preLaunchHooks,
            ],
        });
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @param {Object} crawlingContext
     * @param {Request} crawlingContext.request
     * @param {AutoscaledPool} crawlingContext.autoscaledPool
     * @param {Session} [crawlingContext.session]
     * @ignore
     */
    async _handleRequestFunction(crawlingContext) {
        const { id } = crawlingContext;
        const page = await this.browserPool.newPage({ id });
        this._enhanceCrawlingContextWithPageInfo(crawlingContext, page);

        const { request, session } = crawlingContext;

        if (this.persistCookiesPerSession) {
            const cookies = crawlingContext.session.getPuppeteerCookies(request.url);
            await crawlingContext.browserController.setCookies(page, cookies);
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
            try {
                await page.close();
            } catch (error) {
                // Only log error in page close.
                this.log.debug('Error while closing page', { error });
            }
        }
    }

    _enhanceCrawlingContextWithPageInfo(crawlingContext, page) {
        crawlingContext.page = page;

        // This is the wierd spam because of browser to proxy not page to proxy.
        const browserControllerInstance = this.browserPool.getBrowserControllerByPage(page);
        crawlingContext.browserController = browserControllerInstance;

        crawlingContext.session = browserControllerInstance.launchContext.session;
        crawlingContext.proxyInfo = browserControllerInstance.launchContext.proxyInfo;

        crawlingContext.crawler = this;
    }

    async _handleNavigation(crawlingContext) {
        try {
            await this._executeHooks(this.preNavigationHooks, crawlingContext);
            crawlingContext.response = await this._navigationHandler(crawlingContext);
        } catch (err) {
            crawlingContext.error = err;

            return this._executeHooks(this.postNavigationHooks, crawlingContext);
        }

        await this._executeHooks(this.postNavigationHooks, crawlingContext);
    }

    async _navigationHandler(crawlingContext) {
        if (!this.gotoFunction) {
            // @TODO: although it is optional in the validation,
            //  because when you make automation library specific you can override this handler.
            throw new Error('BrowserCrawler: You must specify a gotoFunction!');
        }
        return this.gotoFunction(crawlingContext);
    }

    /**
     * Should be overriden in case of different automation library that does not support this response API.
     * // @TODO: This can be also done as a postNavigation hook except the loadedUrl marking.
     * @param crawlingContext
     * @return {Promise<void>}
     * @private
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

    async _extendLaunchContext(pageId, launchContext) {
        const launchContextExtends = {};

        if (this.sessionPool) {
            launchContextExtends.session = await this.sessionPool.getSession();
        }

        if (this.proxyConfiguration) {
            const proxyInfo = await this.proxyConfiguration.newProxyInfo(launchContextExtends.session && launchContextExtends.session.id);

            launchContext.proxyUrl = proxyInfo.url;

            launchContextExtends.proxyInfo = proxyInfo;
        }

        launchContext.extend(launchContextExtends);
    }

    async _executeHooks(hooks, ...args) {
        if (Array.isArray(hooks) && hooks.length) {
            for (const hook of hooks) {
                await hook(...args);
            }
        }
    }
}

export default BrowserCrawler;
