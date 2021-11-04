import ow from 'ow';

import { gotoExtended } from '../puppeteer_utils';
import applyStealthToBrowser from '../stealth/stealth';

/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { PuppeteerLauncher, PuppeteerLaunchContext } from '../browser_launchers/puppeteer_launcher';
import { HandleFailedRequest } from './basic_crawler';
import BrowserCrawler, { BrowserCrawlingContext } from './browser_crawler';
import { ProxyConfiguration } from '../proxy_configuration';
import { SessionPoolOptions } from '../session_pool/session_pool';
import { CrawlingContext } from './basic_crawler';
import { Page, DirectNavigationOptions } from 'puppeteer';
import { RequestList } from '../request_list';
import { RequestQueue } from '../storages/request_queue';
import { AutoscaledPoolOptions } from '../autoscaling/autoscaled_pool';
import { BrowserPoolOptions } from 'browser-pool';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

/**
 * @callback PuppeteerHook
 * @param {{ page: Page, crawler: PuppeteerCrawler } & BrowserCrawlingContext & CrawlingContext} crawlingContext
 * @param {DirectNavigationOptions} gotoOptions
 * @returns {Promise<void>}
 */
/**
 * @typedef PuppeteerHandlePageFunctionParam
 * @property {Page} page
 * @property {PuppeteerCrawler} crawler
 */
/**
 * @callback PuppeteerHandlePage
 * @param {CrawlingContext & BrowserCrawlingContext & { page: Page, crawler: PuppeteerCrawler }} context
 * @returns {Promise<void>}
 */
/**
 * @typedef PuppeteerCrawlerOptions
 * @property {PuppeteerHandlePage} handlePageFunction
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
 *   crawler: PuppeteerCrawler,
 * }
 * ```
 *
 *   `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
 *   `page` is an instance of the `Puppeteer`
 *   [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page)
 *   `browserPool` is an instance of the
 *   [`BrowserPool`](https://github.com/apify/browser-pool#BrowserPool),
 *   `browserController` is an instance of the
 *   [`BrowserController`](https://github.com/apify/browser-pool#browsercontroller),
 *   `response` is an instance of the `Puppeteer`
 *   [`Response`](https://pptr.dev/#?product=Puppeteer&show=api-class-response),
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
 *   crawler: PuppeteerCrawler,
 * }
 * ```
 *   Where the {@link Request} instance corresponds to the failed request, and the `Error` instance
 *   represents the last error thrown during processing of the request.
 * @property {PuppeteerLaunchContext} [launchContext]
 *   Options used by {@link Apify#launchPuppeteer} to start new Puppeteer instances.
 * @property {number} [handlePageTimeoutSecs=60]
 *   Timeout in which the function passed as `handlePageFunction` needs to finish, in seconds.
 * @property {BrowserPoolOptions} [browserPoolOptions]
 *   Custom options passed to the underlying [`BrowserPool`](https://github.com/apify/browser-pool#BrowserPool) constructor.
 *   You can tweak those to fine-tune browser management.
 * @property {boolean} [persistCookiesPerSession=true]
 *   Automatically saves cookies to Session. Works only if Session Pool is used.
 * @property {ProxyConfiguration} [proxyConfiguration]
 *   If set, `PuppeteerCrawler` will be configured for all connections to use
 *   [Apify Proxy](https://console.apify.com/proxy) or your own Proxy URLs provided and rotated according to the configuration.
 *   For more information, see the [documentation](https://docs.apify.com/proxy).
 * @property {Array<PuppeteerHook>} [preNavigationHooks]
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
 * @property {Array<PuppeteerHook>} [postNavigationHooks]
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
 * @property {number} [maxRequestRetries=3]
 *   Indicates how many times the request is retried if {@link PuppeteerCrawlerOptions.handlePageFunction} fails.
 * @property {number} [maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @property {AutoscaledPoolOptions} [autoscaledPoolOptions]
 *   Custom options passed to the underlying {@link AutoscaledPool} constructor.
 *   Note that the `runTaskFunction` and `isTaskReadyFunction` options
 *   are provided by the crawler and cannot be overridden.
 *   However, you can provide a custom implementation of `isFinishedFunction`.
 * @property {number} [minConcurrency=1]
 *   Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 *
 *   *WARNING:* If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
 *   If you're not sure, just keep the default value and the concurrency will scale up automatically.
 * @property {number} [maxConcurrency=1000]
 *   Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 * @property {boolean} [useSessionPool=true]
 *   Puppeteer crawler will initialize the  {@link SessionPool} with the corresponding `sessionPoolOptions`.
 *   The session instance will be than available in the `handleRequestFunction`.
 * @property {SessionPoolOptions} [sessionPoolOptions] The configuration options for {@link SessionPool} to use.
 */

/**
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
 * {@link RequestList} or {@link RequestQueue} instances provided by the {@link PuppeteerCrawlerOptions.requestList}
 * or {@link PuppeteerCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@link PuppeteerCrawlerOptions.requestList} and {@link PuppeteerCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * `PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each {@link Request} object to crawl
 * and then calls the function provided by user as the {@link PuppeteerCrawlerOptions.handlePageFunction} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the {@link PuppeteerCrawlerOptions.autoscaledPoolOptions}
 * parameter of the `PuppeteerCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPoolOptions} are available directly in the `PuppeteerCrawler` constructor.
 *
 * Note that the pool of Puppeteer instances is internally managed by the {@link BrowserPool} class.
 *
 * **Example usage:**
 *
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
class PuppeteerCrawler extends BrowserCrawler {
    /**
     * @internal
     * @type any
     */
    static optionsShape = {
        ...BrowserCrawler.optionsShape,
        browserPoolOptions: ow.optional.object,
        launchContext: ow.optional.object,
    }

    /**
    * @param {PuppeteerCrawlerOptions} options
    * All `PuppeteerCrawler` parameters are passed via an options object.
    */
    constructor(options = {}) {
        ow(options, 'PuppeteerCrawlerOptions', ow.object.exactShape(PuppeteerCrawler.optionsShape));

        const {
            launchContext = {}, // @TODO: should not launcher be inside launchContext
            browserPoolOptions = {},
            proxyConfiguration,
            ...browserCrawlerOptions
        } = options;

        const {
            stealth = false,
        } = launchContext;

        if (launchContext.proxyUrl) {
            throw new Error('PuppeteerCrawlerOptions.launchContext.proxyUrl is not allowed in PuppeteerCrawler.'
                + 'Use PuppeteerCrawlerOptions.proxyConfiguration');
        }
        const puppeteerLauncher = new PuppeteerLauncher(launchContext);

        browserPoolOptions.browserPlugins = [
            puppeteerLauncher.createBrowserPlugin(),
        ];

        super({
            ...browserCrawlerOptions,
            proxyConfiguration,
            browserPoolOptions,
        });

        if (stealth) {
            this.browserPool.postLaunchHooks.push(async (pageId, browserController) => {
                // @TODO: We can do this better now. It is not necessary to override the page.
                // we can modify the page in the postPageCreateHook
                const { hideWebDriver, ...newStealthOptions } = puppeteerLauncher.stealthOptions;
                await applyStealthToBrowser(browserController.browser, newStealthOptions);
            });
        }

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
            this.log.deprecated('PuppeteerCrawlerOptions.gotoFunction is deprecated. Use "preNavigationHooks" and "postNavigationHooks" instead.');

            return this.gotoFunction(crawlingContext, gotoOptions);
        }
        return gotoExtended(crawlingContext.page, crawlingContext.request, gotoOptions);
    }
}

export default PuppeteerCrawler;
