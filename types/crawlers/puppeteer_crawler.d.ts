export default PuppeteerCrawler;
export type PuppeteerCrawlerOptions = {
    /**
     * Function that is called to process each request.
     * It is passed an object with the following fields:
     *
     * ```
     * {
     * request: Request,
     * response: Response,
     * page: Page,
     * puppeteerPool: PuppeteerPool,
     * autoscaledPool: AutoscaledPool,
     * session: Session,
     * }
     * ```
     *
     * `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
     * `page` is an instance of the `Puppeteer`
     * [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page)
     * `response` is an instance of the `Puppeteer`
     * [`Response`](https://pptr.dev/#?product=Puppeteer&show=api-class-response),
     * which is the main resource response as returned by `page.goto(request.url)`.
     * `puppeteerPool` is an instance of the {@link PuppeteerPool} used by this `PuppeteerCrawler`.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     * If all the retries fail, the crawler calls the function
     * provided to the `handleFailedRequestFunction` parameter.
     * To make this work, you should **always**
     * let your function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@link Request#pushErrorMessage} function.
     */
    handlePageFunction: PuppeteerHandlePage;
    /**
     * Static list of URLs to be processed.
     * Either `requestList` or `requestQueue` option must be provided (or both).
     */
    requestList?: RequestList;
    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     * Either `requestList` or `requestQueue` option must be provided (or both).
     */
    requestQueue?: RequestQueue;
    /**
     * Timeout in which the function passed as `handlePageFunction` needs to finish, in seconds.
     */
    handlePageTimeoutSecs?: number;
    /**
     * Overrides the function that opens the page in Puppeteer. The function should return the result of Puppeteer's
     * [page.goto()](https://pptr.dev/#?product=Puppeteer&show=api-pagegotourl-options) function,
     * i.e. a `Promise` resolving to the [Response](https://pptr.dev/#?product=Puppeteer&show=api-class-response) object.
     *
     * This is useful if you need to extend the page load timeout or select different criteria
     * to determine that the navigation succeeded.
     *
     * Note that a single page object is only used to process a single request and it is closed afterwards.
     *
     * By default, the function invokes {@link puppeteer#gotoExtended} with a timeout of 60 seconds.
     * For details, see source code on
     * [GitHub](https://github.com/apifytech/apify-js/blob/master/src/crawlers/puppeteer_crawler.js#L292).
     */
    gotoFunction?: PuppeteerGoto;
    /**
     * Timeout in which page navigation needs to finish, in seconds. When `gotoFunction()` is used and thus the default
     * function is overridden, this timeout will not be used and needs to be configured in the new `gotoFunction()`.
     */
    gotoTimeoutSecs?: number;
    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     * request: Request,
     * error: Error,
     * }
     * ```
     * Where the {@link Request} instance corresponds to the failed request, and the `Error` instance
     * represents the last error thrown during processing of the request.
     *
     * See
     * [source code](https://github.com/apifytech/apify-js/blob/master/src/crawlers/puppeteer_crawler.js#L301)
     * for the default implementation of this function.
     */
    handleFailedRequestFunction?: HandleFailedRequest;
    /**
     * Indicates how many times the request is retried if either `handlePageFunction()` or `gotoFunction()` fails.
     */
    maxRequestRetries?: number;
    /**
     * Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
     * Always set this value in order to prevent infinite loops in misconfigured crawlers.
     * Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
     */
    maxRequestsPerCrawl?: number;
    /**
     * Custom options passed to the underlying {@link PuppeteerPool} constructor.
     * You can tweak those to fine-tune browser management.
     */
    puppeteerPoolOptions?: PuppeteerPoolOptions;
    /**
     * Overrides the default function to launch a new Puppeteer instance.
     * Shortcut to the corresponding {@link PuppeteerPool} option.
     * See source code on
     * [GitHub](https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28)
     * for default behavior.
     */
    launchPuppeteerFunction?: LaunchPuppeteerFunction;
    /**
     * Options used by {@link Apify#launchPuppeteer} to start new Puppeteer instances.
     * Shortcut to the corresponding {@link PuppeteerPool} option.
     */
    launchPuppeteerOptions?: LaunchPuppeteerOptions;
    /**
     * Custom options passed to the underlying {@link AutoscaledPool} instance constructor.
     * Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options
     * are provided by `PuppeteerCrawler` and should not be overridden.
     */
    autoscaledPoolOptions?: AutoscaledPoolOptions;
    /**
     * Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the
     * corresponding {@link AutoscaledPoolOptions.minConcurrency} option.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU,
     * your crawler will run extremely slow or crash. If you're not sure, just keep the default value
     * and the concurrency will scale up automatically.
     */
    minConcurrency?: number;
    /**
     * Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the
     * corresponding {@link AutoscaledPoolOptions.maxConcurrency} option.
     */
    maxConcurrency?: number;
    /**
     * If set to true Crawler will automatically use Session Pool. It will automatically retire
     * sessions on 403, 401 and 429 status codes. It also marks Session as bad after a request timeout.
     */
    useSessionPool?: boolean;
    /**
     * Custom options passed to the underlying {@link SessionPool} constructor.
     */
    sessionPoolOptions?: SessionPoolOptions;
    /**
     * Automatically saves cookies to Session. Works only if Session Pool is used.
     */
    persistCookiesPerSession?: boolean;
};
export type PuppeteerHandlePageInputs = {
    /**
     * An instance of the {@link Request} object with details about the URL to open, HTTP method etc.
     */
    request: Request;
    /**
     * An instance of the Puppeteer
     * [`Response`](https://pptr.dev/#?product=Puppeteer&show=api-class-response),
     * which is the main resource response as returned by `page.goto(request.url)`.
     */
    response: PuppeteerResponse;
    /**
     * is an instance of the Puppeteer
     * [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page)
     */
    page: PuppeteerPage;
    /**
     * An instance of the {@link PuppeteerPool} used by this `PuppeteerCrawler`.
     */
    puppeteerPool: PuppeteerPool;
    /**
     * A reference to the underlying {@link AutoscaledPool} class that manages the concurrency of the crawler.
     * Note that this property is only initialized after calling the {@link PuppeteerCrawler#run} function.
     * You can use it to change the concurrency settings on the fly,
     * to pause the crawler by calling {@link AutoscaledPool#pause}
     * or to abort it by calling {@link AutoscaledPool#abort}.
     */
    autoscaledPool: AutoscaledPool;
    session?: Session;
};
export type PuppeteerHandlePage = (inputs: PuppeteerHandlePageInputs) => Promise<void>;
export type PuppeteerGotoInputs = {
    /**
     * is an instance of the Puppeteer
     * [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page)
     */
    page: PuppeteerPage;
    /**
     * An instance of the {@link Request} object with details about the URL to open, HTTP method etc.
     */
    request: Request;
    /**
     * An instance of the `AutoscaledPool`.
     */
    autoscaledPool: AutoscaledPool;
    /**
     * An instance of the {@link PuppeteerPool} used by this `PuppeteerCrawler`.
     */
    puppeteerPool: PuppeteerPool;
    /**
     * `Session` object for this request.
     */
    session?: Session;
};
export type PuppeteerGoto = (inputs: PuppeteerGotoInputs) => Promise<PuppeteerResponse | null>;
export type LaunchPuppeteer = (inputs: LaunchPuppeteerOptions) => Promise<Browser>;
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
 *   puppeteerPool: PuppeteerPool,
 *   autoscaledPool: AutoscaledPool,
 *   session: Session,
 * }
 * ```
 *
 *   `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
 *   `page` is an instance of the `Puppeteer`
 *   [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page)
 *   `response` is an instance of the `Puppeteer`
 *   [`Response`](https://pptr.dev/#?product=Puppeteer&show=api-class-response),
 *   which is the main resource response as returned by `page.goto(request.url)`.
 *   `puppeteerPool` is an instance of the {@link PuppeteerPool} used by this `PuppeteerCrawler`.
 *
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
 * @property {RequestList} [requestList]
 *   Static list of URLs to be processed.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {RequestQueue} [requestQueue]
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {number} [handlePageTimeoutSecs=60]
 *   Timeout in which the function passed as `handlePageFunction` needs to finish, in seconds.
 * @property {PuppeteerGoto} [gotoFunction]
 *   Overrides the function that opens the page in Puppeteer. The function should return the result of Puppeteer's
 *   [page.goto()](https://pptr.dev/#?product=Puppeteer&show=api-pagegotourl-options) function,
 *   i.e. a `Promise` resolving to the [Response](https://pptr.dev/#?product=Puppeteer&show=api-class-response) object.
 *
 *   This is useful if you need to extend the page load timeout or select different criteria
 *   to determine that the navigation succeeded.
 *
 *   Note that a single page object is only used to process a single request and it is closed afterwards.
 *
 *   By default, the function invokes {@link puppeteer#gotoExtended} with a timeout of 60 seconds.
 *   For details, see source code on
 *   [GitHub](https://github.com/apifytech/apify-js/blob/master/src/crawlers/puppeteer_crawler.js#L292).
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
 *   error: Error,
 * }
 * ```
 *   Where the {@link Request} instance corresponds to the failed request, and the `Error` instance
 *   represents the last error thrown during processing of the request.
 *
 *   See
 *   [source code](https://github.com/apifytech/apify-js/blob/master/src/crawlers/puppeteer_crawler.js#L301)
 *   for the default implementation of this function.
 * @property {number} [maxRequestRetries=3]
 *    Indicates how many times the request is retried if either `handlePageFunction()` or `gotoFunction()` fails.
 * @property {number} [maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @property {PuppeteerPoolOptions} [puppeteerPoolOptions]
 *   Custom options passed to the underlying {@link PuppeteerPool} constructor.
 *   You can tweak those to fine-tune browser management.
 * @property {LaunchPuppeteerFunction} [launchPuppeteerFunction]
 *   Overrides the default function to launch a new Puppeteer instance.
 *   Shortcut to the corresponding {@link PuppeteerPool} option.
 *   See source code on
 *   [GitHub](https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28)
 *   for default behavior.
 * @property {LaunchPuppeteerOptions} [launchPuppeteerOptions]
 *   Options used by {@link Apify#launchPuppeteer} to start new Puppeteer instances.
 *   Shortcut to the corresponding {@link PuppeteerPool} option.
 * @property {AutoscaledPoolOptions} [autoscaledPoolOptions]
 *   Custom options passed to the underlying {@link AutoscaledPool} instance constructor.
 *   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options
 *   are provided by `PuppeteerCrawler` and should not be overridden.
 * @property {number} [minConcurrency=1]
 *   Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the
 *   corresponding {@link AutoscaledPoolOptions.minConcurrency} option.
 *
 *   *WARNING:* If you set this value too high with respect to the available system memory and CPU,
 *   your crawler will run extremely slow or crash. If you're not sure, just keep the default value
 *   and the concurrency will scale up automatically.
 * @property {number} [maxConcurrency=1000]
 *   Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the
 *   corresponding {@link AutoscaledPoolOptions.maxConcurrency} option.
 * @property {boolean} [useSessionPool=false]
 *   If set to true Crawler will automatically use Session Pool. It will automatically retire
 *   sessions on 403, 401 and 429 status codes. It also marks Session as bad after a request timeout.
 * @property {SessionPoolOptions} [sessionPoolOptions]
 *   Custom options passed to the underlying {@link SessionPool} constructor.
 * @property {boolean} [persistCookiesPerSession=false]
 *   Automatically saves cookies to Session. Works only if Session Pool is used.
 */
/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chrome with [Puppeteer](https://github.com/GoogleChrome/puppeteer).
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
 * Note that the pool of Puppeteer instances is internally managed by the {@link PuppeteerPool} class.
 * Many constructor options such as {@link PuppeteerPoolOptions.maxOpenPagesPerInstance} or
 * {@link PuppeteerPoolOptions.launchPuppeteerFunction} are passed directly to the {@link PuppeteerPool} constructor.
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
 * @property {AutoscaledPool} autoscaledPool
 *  A reference to the underlying {@link AutoscaledPool} class that manages the concurrency of the crawler.
 *  Note that this property is only initialized after calling the {@link PuppeteerCrawler#run} function.
 *  You can use it to change the concurrency settings on the fly,
 *  to pause the crawler by calling {@link AutoscaledPool#pause}
 *  or to abort it by calling {@link AutoscaledPool#abort}.
 *
 */
declare class PuppeteerCrawler {
    /**
     * @param {PuppeteerCrawlerOptions} options
     * All `PuppeteerCrawler` parameters are passed via an options object.
     */
    constructor(options: PuppeteerCrawlerOptions);
    handlePageFunction: PuppeteerHandlePage;
    gotoFunction: PuppeteerGoto;
    handlePageTimeoutMillis: number;
    gotoTimeoutMillis: number;
    puppeteerPoolOptions: {
        launchPuppeteerFunction: LaunchPuppeteerFunction;
        launchPuppeteerOptions: LaunchPuppeteerOptions;
        /**
         * Enables the use of a preconfigured {@link LiveViewServer} that serves snapshots
         * just before a page would be recycled by `PuppeteerPool`. If there are no clients
         * connected, it has close to zero impact on performance.
         */
        useLiveView?: boolean;
        /**
         * Maximum number of open pages (i.e. tabs) per browser. When this limit is reached, new pages are loaded in a new browser instance.
         */
        maxOpenPagesPerInstance?: number;
        /**
         * Maximum number of requests that can be processed by a single browser instance.
         * After the limit is reached, the browser is retired and new requests are
         * handled by a new browser instance.
         */
        retireInstanceAfterRequestCount?: number;
        /**
         * All browser management operations such as launching a new browser, opening a new page
         * or closing a page will timeout after the set number of seconds and the connected
         * browser will be retired.
         */
        puppeteerOperationTimeoutSecs?: number;
        /**
         * Indicates how often are the open Puppeteer instances checked whether they can be closed.
         */
        instanceKillerIntervalSecs?: number;
        /**
         * When Puppeteer instance reaches the `retireInstanceAfterRequestCount` limit then
         * it is considered retired and no more tabs will be opened. After the last tab is closed the
         * whole browser is closed too. This parameter defines a time limit between the last tab was opened and
         * before the browser is closed even if there are pending open tabs.
         */
        killInstanceAfterSecs?: number;
        /**
         * Enables recycling of disk cache directories by Chrome instances.
         * When a browser instance is closed, its disk cache directory is not deleted but it's used by a newly opened browser instance.
         * This is useful to reduce amount of data that needs to be downloaded to speed up crawling and reduce proxy usage.
         * Note that the new browser starts with empty cookies, local storage etc. so this setting doesn't affect anonymity of your crawler.
         *
         * Beware that the disk cache directories can consume a lot of disk space.
         * To limit the space consumed, you can pass the `--disk-cache-size=X` argument to `launchPuppeteerargs`,
         * where `X` is the approximate maximum number of bytes for disk cache.
         *
         * Do not use the `recycleDiskCache` setting together with `--disk-cache-dir`
         * argument in `launchPuppeteerargs`, the behavior is undefined.
         */
        recycleDiskCache?: boolean;
        /**
         * With this option selected, all pages will be opened in a new incognito browser context, which means
         * that they will not share cookies or cache and their resources will not be throttled by one another.
         */
        useIncognitoPages?: boolean;
        /**
         * An array of custom proxy URLs to be used by the `PuppeteerPool` instance.
         * The provided custom proxies' order will be randomized and the resulting list rotated.
         * Custom proxies are not compatible with Apify Proxy and an attempt to use both
         * configuration options will cause an error to be thrown on startup.
         */
        proxyUrls?: string[];
    };
    puppeteerPool: PuppeteerPool | null;
    useSessionPool: boolean;
    sessionPoolOptions: SessionPoolOptions;
    persistCookiesPerSession: boolean;
    /** @ignore */
    basicCrawler: BasicCrawler;
    /**
     * Runs the crawler. Returns promise that gets resolved once all the requests got processed.
     *
     * @return {Promise<void>}
     */
    run(): Promise<void>;
    sessionPool: import("../session_pool/session_pool").SessionPool | undefined;
    isRunningPromise: Promise<void> | undefined;
    autoscaledPool: AutoscaledPool | undefined;
    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @param {Object} options
     * @param {Request} options.request
     * @param {AutoscaledPool} options.autoscaledPool
     * @ignore
     */
    _handleRequestFunction({ request, autoscaledPool }: {
        request: Request;
        autoscaledPool: AutoscaledPool;
    }): Promise<void>;
    /**
     * @param {Object} options
     * @param {PuppeteerPage} options.page
     * @param {Request} options.request
     * @return {Promise<PuppeteerResponse>}
     * @ignore
     */
    _defaultGotoFunction({ page, request }: {
        page: PuppeteerPage;
        request: Request;
    }): Promise<PuppeteerResponse>;
    /**
     * @param {Object} options
     * @param {Error} options.error
     * @param {Request} options.request
     * @return {Promise<void>}
     * @ignore
     */
    _defaultHandleFailedRequestFunction({ error, request }: {
        error: Error;
        request: Request;
    }): Promise<void>;
}
import { RequestList } from "../request_list";
import { RequestQueue } from "../request_queue";
import { HandleFailedRequest } from "./basic_crawler";
import { PuppeteerPoolOptions } from "../puppeteer_pool";
import { LaunchPuppeteerFunction } from "../puppeteer_pool";
import { LaunchPuppeteerOptions } from "../puppeteer";
import { AutoscaledPoolOptions } from "../autoscaling/autoscaled_pool";
import { SessionPoolOptions } from "../session_pool/session_pool";
import Request from "../request";
import { Response as PuppeteerResponse } from "puppeteer";
import { Page as PuppeteerPage } from "puppeteer";
import PuppeteerPool from "../puppeteer_pool";
import AutoscaledPool from "../autoscaling/autoscaled_pool";
import { Session } from "../session_pool/session";
import { Browser } from "puppeteer";
import BasicCrawler from "./basic_crawler";
