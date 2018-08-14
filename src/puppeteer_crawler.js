import { checkParamOrThrow } from 'apify-client/build/utils';
import log from 'apify-shared/log';
import _ from 'underscore';
import Promise from 'bluebird';
import BasicCrawler from './basic_crawler';
import PuppeteerPool from './puppeteer_pool';
import { isPromise } from './utils';

const DEFAULT_OPTIONS = {
    gotoFunction: ({ request, page }) => page.goto(request.url, { timeout: 60000 }),
    pageOpsTimeoutMillis: 300000,
};

const PAGE_CLOSE_TIMEOUT_MILLIS = 30000;

/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chrome with [Puppeteer](https://github.com/GoogleChrome/puppeteer).
 * The URLs of pages to visit are given by `Request` objects that are fed from a list (see `RequestList` class)
 * or from a dynamic queue (see `RequestQueue` class).
 *
 * `PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each `Request` object to crawl
 * and then calls the function provided by user as the `handlePageFunction` option.
 * New tasks are only started if there is enough free CPU and memory available,
 * using the `AutoscaledPool` class internally.
 *
 * Basic usage:
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
 *
 * @param {RequestList} [options.requestList]
 *   List of the requests to be processed.
 *   See the `requestList` parameter of `BasicCrawler` for more details.
 * @param {RequestQueue} [options.requestQueue]
 *   Queue of the requests to be processed.
 *   See the `requestQueue` parameter of `BasicCrawler` for more details.
 * @param {Function} [options.handlePageFunction]
 *   Function that is called to process each request.
 *   It is passed an object with the following fields:
 *   `request` is an instance of the `Request` object with details about the URL to open, HTTP method etc.
 *   `page` is an instance of the `Puppeteer.Page` class with `page.goto(request.url)` already called.
 * @param {Number} [options.pageOpsTimeoutMillis=300000]
 *   Timeout in which the function passed as `options.handlePageFunction` needs to finish.
 * @param {Function} [options.gotoFunction=({ request, page }) => page.goto(request.url, { timeout: 60000 })]
 *   Overrides the function that opens the request in Puppeteer.
 *   The function should return a result of Puppeteer's
 *   <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagegotourl-options">page.goto()</a> function,
 *   i.e. a promise resolving to the <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-response">Response</a> object.
 *
 *   For example, this is useful if you need to extend the page load timeout or select a different criteria
 *   to determine that the navigation succeeded.
 *
 *   Note that a single page object is only used to process a single request and it is closed afterwards.
 * @param {Function} [options.handleFailedRequestFunction=({ request }) => log.error('Request failed', _.pick(request, 'url', 'uniqueKey'))]
 *   Function to handle requests that failed more than `option.maxRequestRetries` times. See the `handleFailedRequestFunction`
 *   parameter of `Apify.BasicCrawler` for details.
 * @param {Number} [options.maxRequestRetries=3]
 *   Indicates how many times each request is retried if `handleRequestFunction` failed.
 *   See `maxRequestRetries` parameter of `BasicCrawler`.
 * @param {Number} [options.maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 *   See `maxRequestsPerCrawl` parameter of `BasicCrawler`.
 * @param {Number} [options.maxMemoryMbytes]
 *   Maximum memory available for crawling. See `maxMemoryMbytes` parameter of `AutoscaledPool`.
 * @param {Number} [options.maxConcurrency=1000]
 *   Maximum concurrency of request processing. See `maxConcurrency` parameter of `AutoscaledPool`.
 * @param {Number} [options.minConcurrency=1]
 *   Minimum concurrency of requests processing. See `minConcurrency` parameter of `AutoscaledPool`.
 * @param {Number} [options.minFreeMemoryRatio=0.2]
 *   Minimum ratio of free memory kept in the system. See `minFreeMemoryRatio` parameter of `AutoscaledPool`.
 * @param {Function} [opts.isFinishedFunction]
 *   By default PuppeteerCrawler finishes when all the requests have been processed.
 *   You can override this behaviour by providing custom `isFinishedFunction`.
 *   This function that is called every time there are no requests being processed.
 *   If it resolves to `true` then the crawler's run finishes.
 *   See `isFinishedFunction` parameter of `AutoscaledPool`.
 * @param {Number} [options.maxOpenPagesPerInstance=50]
 *   Maximum number of opened tabs per browser. If this limit is reached then a new
 *   browser instance is started. See `maxOpenPagesPerInstance` parameter of `PuppeteerPool`.
 * @param {Number} [options.retireInstanceAfterRequestCount=100]
 *   Maximum number of requests that can be processed by a single browser instance.
 *   After the limit is reached the browser will be retired and new requests will
 *   be handled by a new browser instance.
 *   See `retireInstanceAfterRequestCount` parameter of `PuppeteerPool`.
 * @param {Number} [options.instanceKillerIntervalMillis=60000]
 *   How often the launched Puppeteer instances are checked whether they can be
 *   closed. See `instanceKillerIntervalMillis` parameter of `PuppeteerPool`.
 * @param {Number} [options.killInstanceAfterMillis=300000]
 *   If Puppeteer instance reaches the `options.retireInstanceAfterRequestCount` limit then
 *   it is considered retired and no more tabs will be opened. After the last tab is closed
 *   the whole browser is closed too. This parameter defines a time limit for inactivity
 *   after which the browser is closed even if there are pending tabs. See
 *   `killInstanceAfterMillis` parameter of `PuppeteerPool`.
 * @param {Object} [options.puppeteerConfig={ dumpio: process.env.NODE_ENV !== 'production', slowMo: 0, args: []}]
 *   Default options for each new `Puppeteer` instance. See `puppeteerConfig` parameter of `PuppeteerPool`.
 * @param {Function} [options.launchPuppeteerFunction=launchPuppeteerOptions&nbsp;=>&nbsp;Apify.launchPuppeteer(launchPuppeteerOptions)]
 *   Overrides the default function to launch a new Puppeteer instance.
 *   See `launchPuppeteerFunction` parameter of `PuppeteerPool`.
 * @param {LaunchPuppeteerOptions} [options.launchPuppeteerOptions]
 *   Options used by `Apify.launchPuppeteer()` to start new Puppeteer instances.
 *   See `launchPuppeteerOptions` parameter of `PuppeteerPool`.
 */
export default class PuppeteerCrawler {
    constructor(opts) {
        // For backwards compatibility, in the future we can remove this...
        if (!opts.retireInstanceAfterRequestCount && opts.abortInstanceAfterRequestCount) {
            log.warning('PuppeteerCrawler: Parameter `abortInstanceAfterRequestCount` is deprecated! Use `retireInstanceAfterRequestCount` instead!');
            opts.retireInstanceAfterRequestCount = opts.abortInstanceAfterRequestCount;
        }

        const {
            handlePageFunction,
            gotoFunction,
            pageOpsTimeoutMillis,

            // Autoscaled pool options
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
            minFreeMemoryRatio,
            isFinishedFunction,

            // Basic crawler options
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleFailedRequestFunction,

            // Puppeteer Pool options
            maxOpenPagesPerInstance,
            retireInstanceAfterRequestCount,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
            launchPuppeteerFunction,
            launchPuppeteerOptions,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(handlePageFunction, 'opts.handlePageFunction', 'Function');
        checkParamOrThrow(handleFailedRequestFunction, 'opts.handleFailedRequestFunction', 'Maybe Function');
        checkParamOrThrow(gotoFunction, 'opts.gotoFunction', 'Function');

        this.handlePageFunction = handlePageFunction;
        this.gotoFunction = gotoFunction;
        this.pageOpsTimeoutMillis = pageOpsTimeoutMillis;

        this.puppeteerPool = new PuppeteerPool({
            maxOpenPagesPerInstance,
            retireInstanceAfterRequestCount,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
            launchPuppeteerFunction,
            launchPuppeteerOptions,
        });

        this.basicCrawler = new BasicCrawler({
            // Basic crawler options.
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
            handleFailedRequestFunction,

            // Autoscaled pool options.
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
            minFreeMemoryRatio,
            isFinishedFunction,
            ignoreMainProcess: true,
        });
    }

    /**
     * Runs the crawler. Returns promise that gets resolved once all the requests got processed.
     *
     * @return {Promise}
     */
    run() {
        return this.basicCrawler.run()
            .finally(() => this.puppeteerPool.destroy());
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @ignore
     */
    _handleRequestFunction({ request }) {
        let page;

        return this.puppeteerPool
            .newPage()
            .then((newPage) => { page = newPage; })
            .then(() => this.gotoFunction({ page, request, puppeteerPool: this.puppeteerPool }))
            .then((response) => {
                const promise = this.handlePageFunction({
                    page,
                    request,
                    puppeteerPool: this.puppeteerPool,
                    response,
                });

                if (!isPromise(promise)) throw new Error('User provided handlePageFunction must return a Promise.');

                return promise;
            })
            .timeout(this.pageOpsTimeoutMillis, 'PuppeteerCrawler: handlePageFunction timed out.')
            .finally(() => {
                return Promise
                    .try(() => {
                        if (page) return page.close();
                    })
                    .timeout(PAGE_CLOSE_TIMEOUT_MILLIS, 'Operation timed out.')
                    .catch(err => log.debug('PuppeteerCrawler: Page.close() failed.', { reason: err ? err.message : err }));
            });
    }
}
