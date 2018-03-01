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
 * PuppeteerCrawler provides a simple framework for parallel crawling of a url list provided by Apify.RequestList
 * or a dynamically enqueued requests provided by Apify.RequestQueue (TODO). Each url is opened in Puppeteer (Chrome)
 * browser.
 *
 * For each url in the list or queue it opens a Chrome tab and then calls handlePageFunction. The concurrency is scaled
 * based on available memory using Apify.AutoscaledPool.
 *
 * Basic usage of PuppeteerCrawler:
 *
 * ```javascript
 * const crawler = new Apify.PuppeteerCrawler({
 *     requestList,
 *     // Parameter page here is an intance of Puppeteer.Page with page.goto(request.url) already called
 *     handlePageFunction: async ({ page, request }) => {
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
 * @param {RequestList} options.requestList List of the requests to be processed. (See `requestList` parameter of `Apify.BasicCrawler`)
 * @param {Function} options.handlePageFunction Function to process each request.
 * @param {Number} [options.pageOpsTimeoutMillis=30000] Timeout for options.handlePagefunction
 * @param {Function} [options.gotoFunction=({ request, page }) => page.goto(request.url)] Overrides default gotoFunction. This function
 *                   should return a result of page.goto(), ie. Puppeteers Response object.

 * @param {Function} [options.handleFailedRequestFunction=({ request }) => log.error('Request failed', _.pick(request, 'url', 'uniqueKey'))]
 *                   Function to handle requests that failed more then option.maxRequestRetries times. (See `handleFailedRequestFunction`
 *                   parameter of `Apify.BasicCrawler`)
 * @param {Number} [options.maxRequestRetries=3] How many times request is retried if handleRequestFunction failed. (See `maxRequestRetries`
 *                                               parameter of `Apify.BasicCrawler`)
 *
 * @param {Number} [options.maxMemoryMbytes] Maximal memory available in the system (See `maxMemoryMbytes` parameter of `Apify.AutoscaledPool`).
 * @param {Number} [options.maxConcurrency=1] Minimal concurrency of requests processing (See `maxConcurrency` parameter of `Apify.AutoscaledPool`).
 * @param {Number} [options.minConcurrency=1000] Maximal concurrency of request processing (See `minConcurrency` parameter of `Apify.AutoscaledPool`).
 * @param {Number} [options.minFreeMemoryRatio=0.2] Minumum ratio of free memory kept in the system.
 *
 * @param {Number} [options.maxOpenPagesPerInstance=100] Maximal number of opened tabs per browser. If limit is reached then the new
 *                                                        browser gets started. (See `maxOpenPagesPerInstance` parameter of `Apify.PuppeteerPool`)
 * @param {Number} [options.abortInstanceAfterRequestCount=150] Maximal number of requests proceeded from one browser. After that browser
 *                                                              gets restarted. (See `abortInstanceAfterRequestCount` parameter of
 *                                                              `Apify.PuppeteerPool`)
 * @param {Function} [options.launchPuppeteerFunction] Overrides how new Puppeteer instance gets launched. (See `launchPuppeteerFunction` parameter of
 *                                                     `Apify.PuppeteerPool`)
 * @param {Number} [options.instanceKillerIntervalMillis=60000] How often opened Puppeteer instances get checked if some of then might be
 *                                                              closed. (See `instanceKillerIntervalMillis` parameter of `Apify.PuppeteerPool`)
 * @param {Number} [options.killInstanceAfterMillis=300000] If Puppeteer instance reaches the limit options.abortInstanceAfterRequestCount then it's
 *                                                          considered retired and no more tabs will be opened. After the last tab get's closed the
 *                                                          whole browser gets closed. This defines limit of inactivity after the browser gets closed
 *                                                          even if there are pending tabs. (See `killInstanceAfterMillis` parameter of
 *                                                          `Apify.PuppeteerPool`)
 * @param {Object} [options.puppeteerConfig={ dumpio: process.env.NODE_ENV !== 'production', slowMo: 0, args: []}] Configuration of Puppeteer
 *                                                          instances. (See `puppeteerConfig` parameter of `Apify.PuppeteerPool`)
 * @param {Boolean} [options.disableProxy=false] Disables proxying thru Apify proxy. (See `disableProxy` parameter of `Apify.PuppeteerPool`)
 * @param {Array} [options.groups] Apify proxy groups to be used. (See `Apify.getApifyProxyUrl()` for more)
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

            // Basic crawler options
            requestList,
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
            maxRequestRetries,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
            handleFailedRequestFunction,

            // Autoscaled pool options.
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
            minFreeMemoryRatio,
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
