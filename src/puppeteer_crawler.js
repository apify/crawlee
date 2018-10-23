import { checkParamOrThrow } from 'apify-client/build/utils';
import log from 'apify-shared/log';
import _ from 'underscore';
import BasicCrawler from './basic_crawler';
import PuppeteerPool from './puppeteer_pool';
import { createTimeoutPromise } from './utils';

const DEFAULT_OPTIONS = {
    gotoFunction: async ({ request, page }) => page.goto(request.url, { timeout: 60000 }),
    handlePageTimeoutSecs: 300,
    handleFailedRequestFunction: ({ request }) => {
        const details = _.pick(request, 'id', 'url', 'method', 'uniqueKey');
        log.error('PuppeteerCrawler: Request failed and reached maximum retries', details);
    },
};

const PAGE_CLOSE_TIMEOUT_MILLIS = 30000;

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
 *   ```
 *   {
 *       request: Request,
 *       page: Page,
 *       puppeteerPool: PuppeteerPool
 *   }
 *   ```
 *
 *   `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
 *   `page` is an instance of the `Puppeteer`
 *   <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a>
 *   class with `page.goto(request.url)` already called.
 *   `puppeteerPool` is an instance of the {@link PuppeteerPool} used by this `PuppeteerCrawler`.
 * @param {RequestList} options.requestList
 *   Static list of URLs to be processed.
 *   Either {@link RequestList} or {@link RequestQueue} must be provided.
 * @param {RequestQueue} options.requestQueue
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 *   Either {@link RequestList} or {@link RequestQueue} must be provided.
 * @param {Number} [options.handlePageTimeoutSecs=300]
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
 *   Function to handle requests that failed more than `option.maxRequestRetries` times.
 *   See source code on
 *   <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L11" target="_blank">GitHub</a>
 *   for default behavior.
 * @param {Number} [options.maxRequestRetries=3]
 *    Indicates how many times the request is retried if either `handlePageFunction()` or `gotoFunction()` fails.
 * @param {Number} [options.maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @param {Number} [options.maxOpenPagesPerInstance=50]
 *   Maximum number of opened tabs per browser. If this limit is reached then a new
 *   browser instance is started. See `maxOpenPagesPerInstance` parameter of {@link PuppeteerPool}.
 * @param {Number} [options.retireInstanceAfterRequestCount=100]
 *   Maximum number of requests that can be processed by a single browser instance.
 *   After the limit is reached the browser will be retired and new requests will
 *   be handled by a new browser instance.
 *   See `retireInstanceAfterRequestCount` parameter of {@link PuppeteerPool}.
 * @param {Number} [options.instanceKillerIntervalMillis=60000]
 *   Indicates how often are the open Puppeteer instances checked whether they can be closed.
 *   See `instanceKillerIntervalMillis` parameter of {@link PuppeteerPool}.
 * @param {Number} [options.killInstanceAfterMillis=300000]
 *   If Puppeteer instance reaches the `options.retireInstanceAfterRequestCount` limit then
 *   it is considered retired and no more tabs will be opened. After the last tab is closed
 *   the whole browser is closed too. This parameter defines a time limit for inactivity
 *   after which the browser is closed even if there are pending tabs. See
 *   `killInstanceAfterMillis` parameter of {@link PuppeteerPool}.
 * @param {Function} [options.launchPuppeteerFunction]
 *   Overrides the default function to launch a new Puppeteer instance.
 *   See `launchPuppeteerFunction` parameter of {@link PuppeteerPool}.
 *   See source code on
 *   <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28" target="_blank">GitHub</a>
 *   for default behavior.
 * @param {LaunchPuppeteerOptions} [options.launchPuppeteerOptions]
 *   Options used by [`Apify.launchPuppeteer()`](apify#module_Apify.launchPuppeteer) to start new Puppeteer instances.
 *   See `launchPuppeteerOptions` parameter of {@link PuppeteerPool} and [`LaunchPuppeteerOptions`](../typedefs/launchpuppeteeroptions).
 * @param {Object} [options.autoscaledPoolOptions]
 *   Custom options passed to the underlying {@link AutoscaledPool} instance constructor.
 *   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options
 *   are provided by `PuppeteerCrawler` and should not be overridden.
 * @param {Object} [options.minConcurrency=1]
 *   Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 * @param {Object} [options.maxConcurrency=1000]
 *   Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 */
class PuppeteerCrawler {
    constructor(options) {
        // For backwards compatibility, in the future we can remove this...
        if (!options.retireInstanceAfterRequestCount && options.abortInstanceAfterRequestCount) {
            log.warning('PuppeteerCrawler: Parameter `abortInstanceAfterRequestCount` is deprecated! Use `retireInstanceAfterRequestCount` instead!');
            options.retireInstanceAfterRequestCount = options.abortInstanceAfterRequestCount;
        }

        const {
            handlePageFunction,
            gotoFunction,
            pageOpsTimeoutMillis, // Deprecated, remove in the future.
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

            // PuppeteerPool options
            // TODO: We should put these into a single object, similarly to autoscaledPoolOptions
            maxOpenPagesPerInstance,
            retireInstanceAfterRequestCount,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
            launchPuppeteerFunction,
            launchPuppeteerOptions,
        } = _.defaults(options, DEFAULT_OPTIONS);

        checkParamOrThrow(handlePageFunction, 'options.handlePageFunction', 'Function');
        checkParamOrThrow(handleFailedRequestFunction, 'options.handleFailedRequestFunction', 'Maybe Function');
        checkParamOrThrow(gotoFunction, 'options.gotoFunction', 'Function');

        this.handlePageFunction = handlePageFunction;
        this.gotoFunction = gotoFunction;

        if (pageOpsTimeoutMillis) log.warning('options.pageOpsTimeoutMillis is deprecated, use options.handlePageTimeoutSecs instead.');
        this.handlePageTimeoutSecs = handlePageTimeoutSecs || Math.ceil(pageOpsTimeoutMillis / 1000);

        this.puppeteerPoolOptions = {
            maxOpenPagesPerInstance,
            retireInstanceAfterRequestCount,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
            launchPuppeteerFunction,
            launchPuppeteerOptions,
        };

        this.puppeteerPool = new PuppeteerPool(this.puppeteerPoolOptions);

        this.basicCrawler = new BasicCrawler({
            // Basic crawler options.
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
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
        if (this.isRunning) return this.isRunningPromise;

        this.puppeteerPool = new PuppeteerPool(this.puppeteerPoolOptions);
        this.isRunning = true;
        this.rejectOnAbortPromise = new Promise((r, reject) => { this.rejectOnAbort = reject; });
        try {
            this.isRunningPromise = this.basicCrawler.run();
            await this.isRunningPromise;
            this.isRunning = false;
        } catch (err) {
            this.isRunning = false; // Doing this before rejecting to make sure it's set when error handlers fire.
            this.rejectOnAbort(err);
        } finally {
            this.puppeteerPool.destroy();
        }
    }

    /**
     * Aborts the crawler by preventing crawls of additional pages and terminating the running ones.
     *
     * @return {Promise}
     */
    async abort() {
        this.isRunning = false;
        await this.basicCrawler.abort();
        this.rejectOnAbort(new Error('PuppeteerCrawler: .abort() function has been called. Aborting the crawler.'));
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @ignore
     */
    async _handleRequestFunction({ request }) {
        if (!this.isRunning) throw new Error('PuppeteerCrawler is stopped.'); // Pool will be destroyed.

        const page = await this.puppeteerPool.newPage();

        try {
            const pageOperationsPromise = this
                .gotoFunction({ page, request, puppeteerPool: this.puppeteerPool })
                .then((response) => {
                    return Promise.race([
                        this.handlePageFunction({ page, request, puppeteerPool: this.puppeteerPool, response }),
                        createTimeoutPromise(this.handlePageTimeoutSecs * 1000, 'PuppeteerCrawler: handlePageFunction timed out.'),
                    ]);
                });

            // rejectOnAbortPromise rejects when .abort() is called or BasicCrawler throws.
            // All running pages are therefore terminated with an error to be reclaimed and retried.
            return await Promise.race([pageOperationsPromise, this.rejectOnAbortPromise]);
        } finally {
            try {
                await Promise.race([page.close(), createTimeoutPromise(PAGE_CLOSE_TIMEOUT_MILLIS, 'Operation timed out.')]);
            } catch (err) {
                log.debug('PuppeteerCrawler: Page.close() failed.', { reason: err && err.message });
            }
        }
    }
}


export default PuppeteerCrawler;
