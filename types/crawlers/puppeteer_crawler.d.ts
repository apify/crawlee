export default PuppeteerCrawler;
/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chrome with <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a>.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `PuppeteerCrawler` uses headless Chrome to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, consider using {@link CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented using {@link Request} objects that are fed from
 * {@link RequestList} or {@link RequestQueue} instances provided by the [`requestList`](#new_PuppeteerCrawler_new)
 * or [`requestQueue`](#new_PuppeteerCrawler_new) constructor options, respectively.
 *
 * If both [`requestList`](#new_PuppeteerCrawler_new) and [`requestQueue`](#new_PuppeteerCrawler_new) are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * `PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each {@link Request} object to crawl
 * and then calls the function provided by user as the [`handlePageFunction()`](#new_PuppeteerCrawler_new) option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the `autoscaledPoolOptions`
 * parameter of the `PuppeteerCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPool} options are available directly in the `PuppeteerCrawler` constructor.
 *
 * Note that the pool of Puppeteer instances is internally managed by
 * the {@link PuppeteerPool} class. Many constructor options
 * such as `maxOpenPagesPerInstance` or `launchPuppeteerFunction` are passed directly
 * to {@link PuppeteerPool} constructor.
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
declare class PuppeteerCrawler {
    /**
     * @param {Object} options All `PuppeteerCrawler` parameters are passed
     *   via an options object with the following keys:
     * @param {PuppeteerHandlePage} options.handlePageFunction
     *   Function that is called to process each request.
     *   It is passed an object with the following fields:
     *
     * ```
     * {
     *   request: Request,
     *   response: Response,
     *   page: Page,
     *   puppeteerPool: PuppeteerPool,
     *   autoscaledPool: AutoscaledPool,
     *   session: Session,
     * }
     * ```
     *
     *   `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
     *   `page` is an instance of the `Puppeteer`
     *   <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a>
     *   `response` is an instance of the `Puppeteer`
     *   <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-response" target="_blank"><code>Response</code></a>,
     *   which is the main resource response as returned by `page.goto(request.url)`.
     *   `puppeteerPool` is an instance of the {@link PuppeteerPool} used by this `PuppeteerCrawler`.
     *
     *   The function must return a promise, which is then awaited by the crawler.
     *
     *   If the function throws an exception, the crawler will try to re-crawl the
     *   request later, up to `option.maxRequestRetries` times.
     *   If all the retries fail, the crawler calls the function
     *   provided to the `options.handleFailedRequestFunction` parameter.
     *   To make this work, you should **always**
     *   let your function throw exceptions rather than catch them.
     *   The exceptions are logged to the request using the
     *   [`request.pushErrorMessage`](request#Request+pushErrorMessage) function.
     * @param {RequestList} options.requestList
     *   Static list of URLs to be processed.
     *   Either `requestList` or `requestQueue` option must be provided (or both).
     * @param {RequestQueue} options.requestQueue
     *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     *   Either `requestList` or `requestQueue` option must be provided (or both).
     * @param {Number} [options.handlePageTimeoutSecs=60]
     *   Timeout in which the function passed as `options.handlePageFunction` needs to finish, in seconds.
     * @param {Function} [options.gotoFunction]
     *   Overrides the function that opens the page in Puppeteer. The function should return the result of Puppeteer's
     *   <a href="https://pptr.dev/#?product=Puppeteer&show=api-pagegotourl-options" target="_blank">page.goto()</a> function,
     *   i.e. a `Promise` resolving to the <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-response" target="_blank">Response</a> object.
     *
     *   This is useful if you need to extend the page load timeout or select different criteria
     *   to determine that the navigation succeeded.
     *
     *   Note that a single page object is only used to process a single request and it is closed afterwards.
     *
     *   By default, the function invokes [`Apify.utils.puppeteer.gotoExtended()`](puppeteer#puppeteer.gotoExtended) with a timeout of 60 seconds.
     *   For details, see source code on
     *   <a href="https://github.com/apifytech/apify-js/blob/master/src/crawlers/puppeteer_crawler.js#L292" target="_blank">GitHub</a>.
     * @param {Number} [options.gotoTimeoutSecs=60]
     *   Timeout in which page navigation needs to finish, in seconds. When `options.gotoFunction()` is used and thus the default
     *   function is overridden, this timeout will not be used and needs to be configured in the new `gotoFunction()`.
     * @param {HandleFailedRequest} [options.handleFailedRequestFunction]
     *   A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     *   The function receives the following object as an argument:
     * ```
     * {
     *   request: Request,
     *   error: Error,
     * }
     * ```
     *   Where the {@link Request} instance corresponds to the failed request, and the `Error` instance
     *   represents the last error thrown during processing of the request.
     *
     *   See
     *   <a href="https://github.com/apifytech/apify-js/blob/master/src/crawlers/puppeteer_crawler.js#L301" target="_blank">source code</a>
     *   for the default implementation of this function.
     * @param {Number} [options.maxRequestRetries=3]
     *    Indicates how many times the request is retried if either `handlePageFunction()` or `gotoFunction()` fails.
     * @param {Number} [options.maxRequestsPerCrawl]
     *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
     *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
     *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
     * @param {Object} [options.puppeteerPoolOptions]
     *   Custom options passed to the underlying {@link PuppeteerPool} constructor.
     *   You can tweak those to fine-tune browser management.
     * @param {Function} [options.launchPuppeteerFunction]
     *   Overrides the default function to launch a new Puppeteer instance.
     *   Shortcut to the corresponding {@link PuppeteerPool} option.
     *   See source code on
     *   <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28" target="_blank">GitHub</a>
     *   for default behavior.
     * @param {LaunchPuppeteerOptions} [options.launchPuppeteerOptions]
     *   Options used by [`Apify.launchPuppeteer()`](apify#module_Apify.launchPuppeteer) to start new Puppeteer instances.
     *   Shortcut to the corresponding {@link PuppeteerPool} option. See [`LaunchPuppeteerOptions`](../typedefs/launchpuppeteeroptions).
     * @param {Object} [options.autoscaledPoolOptions]
     *   Custom options passed to the underlying {@link AutoscaledPool} instance constructor.
     *   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options
     *   are provided by `PuppeteerCrawler` and should not be overridden.
     * @param {Object} [options.minConcurrency=1]
     *   Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
     *
     *   *WARNING:* If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
     *   If you're not sure, just keep the default value and the concurrency will scale up automatically.
     * @param {Object} [options.maxConcurrency=1000]
     *   Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
     * @param {Boolean} [options.useSessionPool=false]
     *   If set to true Crawler will automatically use Session Pool. It will automatically retire sessions on 403, 401 and 429 status codes.
     *   It also marks Session as bad after a request timeout.
     * @param {Object} [options.sessionPoolOptions]
     *   Custom options passed to the underlying {@link SessionPool} constructor.
     * @param {Boolean} [options.persistCookiesPerSession]
     *   Automatically saves cookies to Session. Works only if Session Pool is used.
     */
    constructor(options: {
        handlePageFunction: any;
        requestList: RequestList;
        requestQueue: RequestQueue;
        handlePageTimeoutSecs?: number;
        gotoFunction?: Function;
        gotoTimeoutSecs?: number;
        handleFailedRequestFunction?: any;
        maxRequestRetries?: number;
        maxRequestsPerCrawl?: number;
        puppeteerPoolOptions?: any;
        launchPuppeteerFunction?: Function;
        launchPuppeteerOptions?: any;
        autoscaledPoolOptions?: any;
        minConcurrency?: any;
        maxConcurrency?: any;
        useSessionPool?: boolean;
        sessionPoolOptions?: any;
        persistCookiesPerSession?: boolean;
    });
    handlePageFunction: any;
    gotoFunction: Function;
    handlePageTimeoutMillis: number;
    gotoTimeoutMillis: number;
    puppeteerPoolOptions: any;
    puppeteerPool: PuppeteerPool;
    useSessionPool: boolean;
    sessionPoolOptions: any;
    persistCookiesPerSession: boolean;
    basicCrawler: BasicCrawler;
    /**
     * Runs the crawler. Returns promise that gets resolved once all the requests got processed.
     *
     * @return {Promise<void>}
     */
    run(): Promise<void>;
    sessionPool: import("../session_pool/session_pool").SessionPool;
    isRunningPromise: Promise<void>;
    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @ignore
     */
    _handleRequestFunction({ request, autoscaledPool }: {
        request: any;
        autoscaledPool: any;
    }): Promise<void>;
    /**
     * @param {Page} page
     * @param {Request} request
     * @return {Promise<Response>}
     * @ignore
     */
    _defaultGotoFunction({ page, request }: any): Promise<Response>;
    /**
     * @param {Request} request
     * @return {Promise}
     * @ignore
     */
    _defaultHandleFailedRequestFunction({ request }: Request): Promise<any>;
}
import PuppeteerPool from "../puppeteer_pool";
import BasicCrawler from "./basic_crawler";
import Request from "../request";
import { RequestList } from "../request_list";
import { RequestQueue } from "../request_queue";
