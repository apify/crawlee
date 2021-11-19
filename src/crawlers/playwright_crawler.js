import ow from 'ow';

/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { Page } from 'playwright';
import { BrowserPoolOptions, BrowserPool } from 'browser-pool';
import { PlaywrightLauncher, PlaywrightLaunchContext } from '../browser_launchers/playwright_launcher';
import BrowserCrawler, { BrowserCrawlingContext } from './browser_crawler';
import { HandleFailedRequest, CrawlingContext } from './basic_crawler';
import { ProxyConfiguration, ProxyInfo } from '../proxy_configuration';
import { SessionPoolOptions } from '../session_pool/session_pool';
import { RequestList } from '../request_list';
import { RequestQueue } from '../storages/request_queue';
import Statistics from './statistics';
import Request from '../request';
import AutoscaledPool, { AutoscaledPoolOptions } from '../autoscaling/autoscaled_pool';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

import { gotoExtended } from '../playwright_utils';

/**
 * @typedef PlaywrightGotoOptions
 * @property {number} [timeout]
 *   Maximum operation time in milliseconds, defaults to 30 seconds, pass `0` to disable timeout.
 *   The default value can be changed by using the browserContext.setDefaultNavigationTimeout(timeout),
 *   browserContext.setDefaultTimeout(timeout), page.setDefaultNavigationTimeout(timeout) or page.setDefaultTimeout(timeout) methods.
 * @property {"domcontentloaded"|"load"|"networkidle"} [waitUntil]
 *   When to consider operation succeeded, defaults to `load`. Events can be either:
 *     - `'domcontentloaded'` - consider operation to be finished when the `DOMContentLoaded` event is fired.
 *     - `'load'` - consider operation to be finished when the `load` event is fired.
 *     - `'networkidle'` - consider operation to be finished when there are no network connections for at least `500` ms.
 * @property {string} [referer]
 *   Referer header value. If provided it will take preference over the referer header value set by page.setExtraHTTPHeaders(headers).
 */
/**
 * @callback PlaywrightHook
 * @param {{ page: Page, crawler: PlaywrightCrawler } & BrowserCrawlingContext & CrawlingContext} crawlingContext
 * @param {PlaywrightGotoOptions} gotoOptions
 * @returns {Promise<void>}
 */
/**
 * @typedef PlaywrightHandlePageFunctionParam
 * @property {Page} page
 * @property {PlaywrightCrawler} crawler
 */
/**
 * @callback PlaywrightHandlePageFunction
 * @param {PlaywrightHandlePageFunctionParam & BrowserCrawlingContext & CrawlingContext} context
 * @returns {Promise<void>}
 */

/**
 * @typedef PlaywrightCrawlerOptions
 * @property {PlaywrightHandlePageFunction} handlePageFunction
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
 *   crawler: PlaywrightCrawler,
 * }
 * ```
 *
 *   `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
 *   `page` is an instance of the `Playwright`
 *   [`Page`](https://playwright.dev/docs/api/class-page)
 *   `browserController` is an instance of the
 *   [`BrowserController`](https://github.com/apify/browser-pool#browsercontroller),
 *   `response` is an instance of the `Playwright`
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
 * @property {number} [navigationTimeoutSecs=60]
 *   Timeout in which page navigation needs to finish, in seconds.
 * @property {HandleFailedRequest} [handleFailedRequestFunction]
 *   A function to handle requests that failed more than `option.maxRequestRetries` times.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request,
 *   response: Response,
 *   page: Page,
 *   session: Session,
 *   browserController: BrowserController,
 *   proxyInfo: ProxyInfo,
 *   crawler: PlaywrightCrawler,
 * }
 * ```
 *   Where the {@link Request} instance corresponds to the failed request, and the `Error` instance
 *   represents the last error thrown during processing of the request.
 * @property {Array<PlaywrightHook>} [preNavigationHooks]
 *   Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
 *   or browser properties before navigation. The function accepts two parameters, `crawlingContext` and `gotoOptions`,
 *   which are passed to the `page.goto()` function the crawler calls to navigate.
 *   Example:
 * ```
 * preNavigationHooks: [
 *     async (crawlingContext, gotoOptions) => {
 *         await page.evaluate((attr) => { window.foo = attr; }, 'bar');
 *     },
 * ]
 * ```
 * @property {Array<PlaywrightHook>} [postNavigationHooks]
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
 * @property {PlaywrightLaunchContext} [launchContext]
 *   The same options as used by {@link Apify#launchPlaywright}.
 * @property {number} [handlePageTimeoutSecs=60]
 *   Timeout in which the function passed as `handlePageFunction` needs to finish, in seconds.
 * @property {BrowserPoolOptions} [browserPoolOptions]
 *   Custom options passed to the underlying [`BrowserPool`](https://github.com/apify/browser-pool#BrowserPool) constructor.
 *   You can tweak those to fine-tune browser management.
 * @property {boolean} [persistCookiesPerSession=true]
 *   Automatically saves cookies to Session. Works only if Session Pool is used.
 * @property {ProxyConfiguration} [proxyConfiguration]
 *   If set, `PlaywrightCrawler` will be configured for all connections to use
 *   [Apify Proxy](https://console.apify.com/proxy) or your own Proxy URLs provided and rotated according to the configuration.
 *   For more information, see the [documentation](https://docs.apify.com/proxy).
 * @property {RequestList} [requestList]
 *   Static list of URLs to be processed.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {RequestQueue} [requestQueue]
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {number} [maxRequestRetries=3]
 *   Indicates how many times the request is retried if {@link PlaywrightCrawlerOptions.handlePageFunction} fails.
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
 *   Playwright crawler will initialize the  {@link SessionPool} with the corresponding `sessionPoolOptions`.
 *   The session instance will be than available in the `handleRequestFunction`.
 * @property {SessionPoolOptions} [sessionPoolOptions] The configuration options for {@link SessionPool} to use.
 */

/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chromium, Firefox and Webkit browsers with [Playwright](https://github.com/microsoft/playwright).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `Playwright` uses headless browser to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, consider using {@link CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented using {@link Request} objects that are fed from
 * {@link RequestList} or {@link RequestQueue} instances provided by the {@link PlaywrightCrawlerOptions.requestList}
 * or {@link PlaywrightCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@link PlaywrightCrawlerOptions.requestList} and {@link PlaywrightCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * `PlaywrightCrawler` opens a new Chrome page (i.e. tab) for each {@link Request} object to crawl
 * and then calls the function provided by user as the {@link PlaywrightCrawlerOptions.handlePageFunction} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the {@link PlaywrightCrawlerOptions.autoscaledPoolOptions}
 * parameter of the `PlaywrightCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPoolOptions} are available directly in the `PlaywrightCrawler` constructor.
 *
 * Note that the pool of Playwright instances is internally managed by the {@link BrowserPool} class.
 * Many constructor options such as {@link PlaywrightCrawlerOptions.maxOpenPagesPerInstance} or
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new Apify.PlaywrightCrawler({
 *     requestList,
 *     handlePageFunction: async ({ page, request }) => {
 *         // This function is called to extract data from a single web page
 *         // 'page' is an instance of Playwright.Page with page.goto(request.url) already called
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
 * @property {Statistics} stats
 *  Contains statistics about the current run.
 * @property {RequestList} requestList
 *  A reference to the underlying {@link RequestList} class that manages the crawler's {@link Request}s.
 *  Only available if used by the crawler.
 * @property {RequestQueue} requestQueue
 *  A reference to the underlying {@link RequestQueue} class that manages the crawler's {@link Request}s.
 *  Only available if used by the crawler.
 * @property {SessionPool} sessionPool
 *  A reference to the underlying {@link SessionPool} class that manages the crawler's {@link Session}s.
 *  Only available if used by the crawler.
 * @property {ProxyConfiguration} proxyConfiguration
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
 */
class PlaywrightCrawler extends BrowserCrawler {
    /**
     * @internal
     * @type any
     */
    static optionsShape = {
        ...BrowserCrawler.optionsShape,
        browserPoolOptions: ow.optional.object,
        launcher: ow.optional.object,
        launchContext: ow.optional.object,
    };

    /**
     * @param {PlaywrightCrawlerOptions} options
     * All `PlaywrightCrawler` parameters are passed via an options object.
     */
    constructor(options) {
        ow(options, 'PlaywrightCrawlerOptions', ow.object.exactShape(PlaywrightCrawler.optionsShape));

        const {
            launchContext = {},
            browserPoolOptions = {},
            ...browserCrawlerOptions
        } = options;

        if (launchContext.proxyUrl) {
            throw new Error('PlaywrightCrawlerOptions.launchContext.proxyUrl is not allowed in PlaywrightCrawler.'
                + 'Use PlaywrightCrawlerOptions.proxyConfiguration');
        }
        const playwrightLauncher = new PlaywrightLauncher(launchContext);

        browserPoolOptions.browserPlugins = [
            playwrightLauncher.createBrowserPlugin(),
        ];

        super({
            ...browserCrawlerOptions,
            browserPoolOptions,
        });

        this.launchContext = launchContext;
    }

    /**
     * @param {*} crawlingContext
     * @param {*} gotoOptions
     * @ignore
     * @protected
     * @internal
     */
    async _navigationHandler(crawlingContext, gotoOptions) {
        if (this.gotoFunction) {
            this.log.deprecated('PlaywrightCrawler.gotoFunction is deprecated. Use "preNavigationHooks" and "postNavigationHooks" instead.');
            return this.gotoFunction(crawlingContext, gotoOptions);
        }
        return gotoExtended(crawlingContext.page, crawlingContext.request, gotoOptions);
    }
}

export default PlaywrightCrawler;
