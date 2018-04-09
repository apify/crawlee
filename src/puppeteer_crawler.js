import { checkParamOrThrow } from 'apify-client/build/utils';
import _ from 'underscore';
import Promise from 'bluebird';
import BasicCrawler from './basic_crawler';
import PuppeteerPool from './puppeteer_pool';
import { isPromise } from './utils';

const DEFAULT_OPTIONS = {
    gotoFunction: ({ request, page }) => page.goto(request.url),
    pageOpsTimeoutMillis: 30000,
};

/**
 * Provides a simple framework for parallel crawling of web pages
 * using the headless Chrome with Puppeteer.
 * The URLs of pages to visit are given by `Request` objects that are provided by the `RequestList` class
 * or a dynamically enqueued requests provided by the `RequestQueue` class.
 *
 * For each `Request` object to crawl the class opens a Chrome tab and then calls
 * the function provided by user in the `handlePageFunction` option. New tasks are only
 * started if there is enough free CPU capacity and memory available,
 * internally using the `AutoscaledPool` instance.
 *
 * Basic usage:
 *
 * ```javascript
 * const crawler = new Apify.PuppeteerCrawler({
 *     requestList,
 *     handlePageFunction: async ({ page, request }) => {
 *         // 'page' is an instance of Puppeteer.Page with page.goto(request.url) already called
 *         // 'request' is an instance of Request class with information about the page to load
 *         await Apify.pushData({
 *             title: await page.title(),
 *             url: request.url,
 *             succeeded: true,
 *         })
 *     },
 *     handleFailedRequestFunction: async ({ request }) => {
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
 * @param {RequestList} [options.requestList] List of the requests to be processed.
 *                      See the `requestList` parameter of `BasicCrawler` for more details.
 * @param {RequestList} [options.requestQueue] Queue of the requests to be processed.
 *                      See the `requestQueue` parameter of `BasicCrawler` for more details.
 * @param {Function} [options.handlePageFunction] Function that is called to process each request.
 *                   It is passed an object with the following fields:
 *                   `request` is an instance of the `Request` object with details about the URL to open, HTTP method etc.
 *                   `page` is an instance of the `Puppeteer.Page` class with `page.goto(request.url)` already called.
 * @param {Number} [options.pageOpsTimeoutMillis=30000] Timeout in which the fuction passed as `options.handlePageFunction` needs to finish.
 * @param {Function} [options.gotoFunction=({ request, page }) => page.goto(request.url)] Overrides the function that opens the request in Puppeteer.
 *                   This function should return a result of `page.goto()`, i.e. the Puppeteer's `Response` object.
 * @param {Function} [options.handleFailedRequestFunction=({ request }) => log.error('Request failed', _.pick(request, 'url', 'uniqueKey'))]
 *                   Function to handle requests that failed more than `option.maxRequestRetries` times. See the `handleFailedRequestFunction`
 *                   parameter of `Apify.BasicCrawler` for details.
 * @param {Number} [options.maxRequestRetries=3] How many times each request is retried if `handleRequestFunction` failed. See `maxRequestRetries`
 *                                               parameter of `BasicCrawler`.
 * @param {Number} [options.maxMemoryMbytes] Maximum memory available for crawling. See `maxMemoryMbytes` parameter of `AutoscaledPool`.
 * @param {Number} [options.maxConcurrency=1000] Maximum concurrency of request processing. See `maxConcurrency` parameter of `AutoscaledPool`.
 * @param {Number} [options.minConcurrency=1] Minimum concurrency of requests processing. See `minConcurrency` parameter of `AutoscaledPool`.
 * @param {Number} [options.minFreeMemoryRatio=0.2] Minimum ratio of free memory kept in the system. See `minFreeMemoryRatio` parameter of
 *                                                  `AutoscaledPool`.
 * @param {Function} [opts.isFinishedFunction] By default PuppeteerCrawler finishes when all the requests have been processed.
 *                                             You can override this behaviour by providing custom `isFinishedFunction`.
 *                                             This function that is called every time there are no requests being processed.
 *                                             If it resolves to `true` then the crawler's run finishes.
 *                                             See `isFinishedFunction` parameter of `AutoscaledPool`.
 * @param {Number} [options.maxOpenPagesPerInstance=100] Maximum number of opened tabs per browser. If this limit is reached then a new
 *                                                        browser instance is started. See `maxOpenPagesPerInstance` parameter of `PuppeteerPool`.
 * @param {Number} [options.abortInstanceAfterRequestCount=150] Maximum number of requests that can be processed by a single browser instance.
 *                                                              After this limit is reached the browser is restarted.
 *                                                              See `abortInstanceAfterRequestCount` parameter of `PuppeteerPool`.
 * @param {Function} [options.launchPuppeteerFunction] Overrides how new Puppeteer instance gets launched. See `launchPuppeteerFunction` parameter of
 *                                                     `PuppeteerPool`.
 * @param {Number} [options.instanceKillerIntervalMillis=60000] How often the launched Puppeteer instances are checked whether they can be
 *                                                              closed. See `instanceKillerIntervalMillis` parameter of `PuppeteerPool`.
 * @param {Number} [options.killInstanceAfterMillis=300000] If Puppeteer instance reaches the `options.abortInstanceAfterRequestCount` limit then
 *                                                          it is considered retired and no more tabs will be opened. After the last tab is closed
 *                                                          the whole browser is closed too. This parameter defines a time limit for inactivity
 *                                                          after which the browser is closed even if there are pending tabs. See
 *                                                          `killInstanceAfterMillis` parameter of `PuppeteerPool`.
 * @param {Object} [options.puppeteerConfig={ dumpio: process.env.NODE_ENV !== 'production', slowMo: 0, args: []}] Default options for each
 *                                                          new Puppeteer instance. See `puppeteerConfig` parameter of `PuppeteerPool`.
 * @param {Boolean} [options.disableProxy=false] Disables proxying through Apify proxy. See `disableProxy` parameter of `PuppeteerPool`.
 * @param {Array} [options.groups] Apify proxy groups to be used. See `Apify.getApifyProxyUrl()` for more details.
 */
export default class PuppeteerCrawler {
    constructor(opts) {
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
            handleFailedRequestFunction,

            // Puppeteer Pool options
            maxOpenPagesPerInstance,
            abortInstanceAfterRequestCount,
            launchPuppeteerFunction,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,

            // TODO: 'groups' is not a great name, but we need to
            // review proxy settings in general
            groups,
            puppeteerConfig,
            disableProxy,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(handlePageFunction, 'opts.handlePageFunction', 'Function');
        checkParamOrThrow(handleFailedRequestFunction, 'opts.handleFailedRequestFunction', 'Maybe Function');
        checkParamOrThrow(gotoFunction, 'opts.gotoFunction', 'Function');
        checkParamOrThrow(pageOpsTimeoutMillis, 'opts.pageOpsTimeoutMillis', 'Number');

        this.handlePageFunction = handlePageFunction;
        this.gotoFunction = gotoFunction;
        this.pageOpsTimeoutMillis = pageOpsTimeoutMillis;

        this.puppeteerPool = new PuppeteerPool({
            maxOpenPagesPerInstance,
            abortInstanceAfterRequestCount,
            launchPuppeteerFunction,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
            groups,
            puppeteerConfig,
            disableProxy,
        });

        this.basicCrawler = new BasicCrawler({
            // Basic crawler options.
            requestList,
            requestQueue,
            maxRequestRetries,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
            handleFailedRequestFunction,

            // Autoscaled pool options.
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
            minFreeMemoryRatio,
            isFinishedFunction,
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

        const handlePagePromise = this.puppeteerPool
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
            });

        const timeoutPromise = new Promise(resolve => setTimeout(resolve, this.pageOpsTimeoutMillis));

        return Promise
            .race([
                handlePagePromise,
                timeoutPromise.then(() => { throw new Error('PuppeteerCrawler: handlePageFunction timed out'); }),
            ])
            .finally(() => {
                if (page) return page.close();
            });
    }
}
