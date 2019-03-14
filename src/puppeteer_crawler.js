import { checkParamOrThrow } from 'apify-client/build/utils';
import log from 'apify-shared/log';
import _ from 'underscore';
import BasicCrawler from './basic_crawler';
import PuppeteerPool from './puppeteer_pool';
import { addTimeoutToPromise } from './utils';
import { BASIC_CRAWLER_TIMEOUT_MULTIPLIER } from './constants';

const DEFAULT_OPTIONS = {
    gotoFunction: async ({ request, page }) => page.goto(request.url, { timeout: 60000 }),
    handlePageTimeoutSecs: 60,
    handleFailedRequestFunction: ({ request }) => {
        const details = _.pick(request, 'id', 'url', 'method', 'uniqueKey');
        log.error('PuppeteerCrawler: Request failed and reached maximum retries', details);
    },
};

/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chrome with <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a>.
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
 *         // This function is called when crawling of a request failed too many time
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
 * @param {Object} options All `PuppeteerCrawler` parameters are passed
 *   via an options object with the following keys:
 * @param {Function} options.handlePageFunction
 *   Function that is called to process each request.
 *   It is passed an object with the following fields:
 *
 * ```
 * {
 *   request: Request,
 *   response: Response,
 *   page: Page,
 *   puppeteerPool: PuppeteerPool,
 *   autoscaledPool: AutoscaledPool
 * }
 * ```
 *
 *   `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
 *   `response` is an instance of the `Puppeteer`
 *   <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a>
 *   `page` is an instance of the `Puppeteer`
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
 *   The exceptions are logged to the request using the {@link Request.pushErrorMessage} function.
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
 *   See source code on
 *   <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L9" target="_blank">GitHub</a>
 *   for default behavior.
 * @param {Function} [options.handleFailedRequestFunction]
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
 *   <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L11" target="_blank">source code</a>
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
 */
class PuppeteerCrawler {
    constructor(options) {
        const {
            handlePageFunction,
            gotoFunction,
            handlePageTimeoutSecs,

            // AutoscaledPool shorthands
            maxConcurrency,
            minConcurrency,

            // BasicCrawler options
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleFailedRequestFunction,
            autoscaledPoolOptions,

            // PuppeteerPool options and shorthands
            puppeteerPoolOptions,
            launchPuppeteerFunction,
            launchPuppeteerOptions,

            // TODO Deprecated PuppeteerPool options
            maxOpenPagesPerInstance,
            retireInstanceAfterRequestCount,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
            proxyUrls,

        } = _.defaults({}, options, DEFAULT_OPTIONS);

        checkParamOrThrow(handlePageFunction, 'options.handlePageFunction', 'Function');
        checkParamOrThrow(handlePageTimeoutSecs, 'options.handlePageTimeoutSecs', 'Number');
        checkParamOrThrow(handleFailedRequestFunction, 'options.handleFailedRequestFunction', 'Maybe Function');
        checkParamOrThrow(gotoFunction, 'options.gotoFunction', 'Function');
        checkParamOrThrow(puppeteerPoolOptions, 'options.puppeteerPoolOptions', 'Maybe Object');

        this.handlePageFunction = handlePageFunction;
        this.gotoFunction = gotoFunction;

        this.handlePageTimeoutMillis = handlePageTimeoutSecs * 1000;

        // TODO Deprecated in 3/2019
        const deprecatedPuppeteerPoolOptions = {
            maxOpenPagesPerInstance,
            retireInstanceAfterRequestCount,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
            proxyUrls,
        };
        Object.entries(deprecatedPuppeteerPoolOptions).forEach(([key, value]) => {
            if (value) log.deprecated(`PuppeteerCrawler: options.${key} is deprecated. Use options.puppeteerPoolOptions instead.`);
        });
        // puppeteerPoolOptions can be null or undefined or Object, so we merge it this way, because null is not replaced by defaults above.
        this.puppeteerPoolOptions = Object.assign(
            {},
            puppeteerPoolOptions,
            { launchPuppeteerFunction, launchPuppeteerOptions },
            deprecatedPuppeteerPoolOptions,
        );

        this.puppeteerPool = null; // Constructed when .run()

        this.basicCrawler = new BasicCrawler({
            // Basic crawler options.
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
            handleRequestTimeoutSecs: handlePageTimeoutSecs * BASIC_CRAWLER_TIMEOUT_MULTIPLIER,
            handleFailedRequestFunction,

            // Autoscaled pool options.
            maxConcurrency,
            minConcurrency,
            autoscaledPoolOptions,
        });
    }

    /**
     * Runs the crawler. Returns promise that gets resolved once all the requests got processed.
     *
     * @return {Promise}
     */
    async run() {
        if (this.isRunningPromise) return this.isRunningPromise;

        this.puppeteerPool = new PuppeteerPool(this.puppeteerPoolOptions);
        try {
            this.isRunningPromise = this.basicCrawler.run();
            await this.isRunningPromise;
        } finally {
            this.puppeteerPool.destroy();
        }
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @ignore
     */
    async _handleRequestFunction({ request, autoscaledPool }) {
        const page = await this.puppeteerPool.newPage();
        try {
            const response = await this.gotoFunction({ page, request, autoscaledPool, puppeteerPool: this.puppeteerPool });
            request.loadedUrl = page.url();
            await addTimeoutToPromise(
                this.handlePageFunction({ page, request, autoscaledPool, puppeteerPool: this.puppeteerPool, response }),
                this.handlePageTimeoutMillis,
                'PuppeteerCrawler: handlePageFunction timed out.',
            );
        } finally {
            await this.puppeteerPool.recyclePage(page);
        }
    }
}


export default PuppeteerCrawler;
