import { PlaywrightPlugin } from 'browser-pool';
import ow from 'ow';
import BrowserCrawler from './browser_crawler';
import { handleRequestTimeout } from './crawler_utils';
import { gotoExtended } from '../puppeteer_utils';
/**
 * @typedef PlaywrightCrawlerOptions
 * @extends BrowserCrawlerOptions
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
 @property {PlaywrightGoto} [gotoFunction]
 *   Overrides the function that opens the page in Playwright. The function should return the result of Playwright's
 *   [page.goto()](https://playwright.dev/docs/api/class-page#pagegotourl-options) function,
 *   i.e. a `Promise` resolving to the [Response](https://playwright.dev/docs/api/class-response) object.
 **
 *   This is useful if you need to select different criteria to determine navigation success and also to do any
 *   pre or post processing such as injecting cookies into the page.
 *
 *   Note that a single page object is only used to process a single request and it is closed afterwards.
 *
 *   By default, the function invokes {@link puppeteer#gotoExtended} with a timeout of 60 seconds.
 * @property {number} [gotoTimeoutSecs=60]
 *   Timeout in which page navigation needs to finish, in seconds. When `gotoFunction()` is used and thus the default
 *   function is overridden, this timeout will not be used and needs to be configured in the new `gotoFunction()`.
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
 * and then calls the function provided by user as the {@link PlaywrightCrawlerOptions.handlePageFunction} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the {@link BasicCrawlerOptions.autoscaledPoolOptions}
 * parameter of the `PuppeteerCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPoolOptions} are available directly in the `PuppeteerCrawler` constructor.
 *
 * Note that the pool of Puppeteer instances is internally managed by the {@link BrowserPool} class.
 * Many constructor options such as {@link PuppeteerPoolOptions.maxOpenPagesPerInstance} or
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
 */
class PlaywrightCrawler extends BrowserCrawler {
    static optionsShape = {
        ...BrowserCrawler.optionsShape,
        browserPoolOptions: ow.optional.object,
        gotoTimeoutSecs: ow.optional.number,
        launchPuppeteerOptions: ow.optional.object,
    }

    constructor(options = {}) {
        ow(options, 'PlaywrightCrawlerOptions', ow.object.exactShape(PlaywrightCrawler.optionsShape));

        const {
            playwrightModule = require('playwright').chromium, // eslint-disable-line
            launchPlaywrightOptions = {},
            gotoTimeoutSecs,
            browserPoolOptions = {},
            ...browserCrawlerOptions
        } = options;

        browserCrawlerOptions.postNavigationHooks = [({ error, session }) => {
            // It would be better to compare the instances,
            if (error && error.constructor.name === 'TimeoutError') {
                handleRequestTimeout(session, error.message);
            }
        }];

        browserPoolOptions.browserPlugins = [
            new PlaywrightPlugin(
                // eslint-disable-next-line
                playwrightModule,
                {
                    launchOptions: launchPlaywrightOptions,
                },
            ),
        ];

        super({
            ...browserCrawlerOptions,
            browserPoolOptions,
        });

        this.gotoTimeoutMillis = gotoTimeoutSecs * 1000;

        this.launchPlaywrightOptions = launchPlaywrightOptions;
        this.playwrightModule = playwrightModule;
    }

    async _navigationHandler(crawlingContext) {
        if (this.gotoFunction) return this.gotoFunction(crawlingContext);
        return gotoExtended(crawlingContext.page, crawlingContext.request, { timeout: this.gotoTimeoutMillis });
    }
}

export default PlaywrightCrawler;
