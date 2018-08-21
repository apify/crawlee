import rp from 'request-promise';
import _ from 'underscore';
import cheerio from 'cheerio';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import BasicCrawler from './basic_crawler';
import { createTimeoutPromise } from './utils';

const DEFAULT_OPTIONS = {
    handlePageTimeoutSecs: 300,
    ignoreSslErrors: false,
    handleFailedRequestFunction: ({ request }) => {
        const details = _.pick(request, 'id', 'url', 'method', 'uniqueKey');

        log.error('CheerioCrawler: Request failed and reached maximum retries', details);
    },
};


/**
 * Builds upon the `BasicCrawler` with functionality specifically designed for parsing raw HTML
 * of web pages. It uses the `cheerio` npm package to provide the user with a pre-parsed HTML
 * document, that may be manipulated in a same way one would manipulate the DOM in the browser
 * with jQuery.
 *
 * Unlike `BasicCrawler` which uses a `handleRequestFunction`, the `CheerioCrawler` uses a `handlePageFunction`.
 * This function gets invoked only after the HTTP response is received and the page's HTML has been parsed.
 * To customize the HTTP request that is used to fetch the raw HTML, see the `requestFunction` option.
 *
 * `CheerioCrawler` invokes `handlePageFunction` for each `Request` object fetched from `options.requestList` or `options.requestQueue`,
 * as long as none of them is empty. New requests are only handled if there is enough free CPU and memory available,
 * using the functionality provided by the `AutoscaledPool` class.
 * Note that all `AutoscaledPool` configuration options can be passed to `options` parameter of the `CheerioCrawler` constructor.
 *
 * If both `requestList` and `requestQueue` are used, the instance first
 * processes URLs from the `requestList` and automatically enqueues all of them to `requestQueue` before it starts
 * their processing. This guarantees that a single URL is not crawled multiple times.
 *
 * Example usage:
 *
 * ```javascript
 * const rp = require('request-promise');
 *
 * // Prepare a list of URLs to crawl
 * const requestList = new Apify.RequestList({
 *   sources: [
 *       { url: 'http://www.example.com/page-1' },
 *       { url: 'http://www.example.com/page-2' },
 *   ],
 * });
 * await requestList.initialize();
 *
 * // Crawl the URLs
 * const crawler = new Apify.CheerioCrawler({
 *     requestList,
 *     handlePageFunction: async ({ $, html, request }) => {
 *
 *         const data = [];
 *
 *         // Do some data extraction from the page with Cheerio.
 *         $('.some-collection').each((index, el) => {
 *             data.push({ title: $(el).find('.some-title').text() });
 *         });
 *
 *         // Save the data to dataset.
 *         await Apify.pushData({
 *             url: request.url,
 *             html,
 *             data,
 *         })
 *     },
 * });
 *
 * await crawler.run();
 * ```
 *
 * @param {Object} options
 * @param {RequestList} [options.requestList]
 *   Static list of URLs to be processed.
 * @param {RequestQueue} [options.requestQueue]
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 * @param {Function} [options.handlePageFunction]
 *   A function that receives three arguments: the Cheerio object `$`, the raw HTML and the `Request` object and does all the document manipulation.
 *   If it returns a promise, it is awaited.
 * @param {Number} [options.handlePageTimeoutSecs=300]
 *   Timeout in which the function passed as `options.handlePageFunction` needs to finish, given in seconds.
 * @param {Function} [options.requestFunction=({ request }) => {
 *      return rp({ // request-promise npm package
 *          url: request.url,
 *          method: request.method,
 *          headers: request.headers,
 *          strictSSL: !this.ignoreSslErrors,
 *      });
 *  }]
 *   Overrides the function that performs the HTTP request to get the raw HTML needed for Cheerio.
 * @param {Boolean} [options.ignoreSslErrors=false]
 *   If set to true, SSL certificate errors will be ignored. This is dependent on using the default
 *   request function. If using a custom request function, user needs to implement this functionality.
 * @param {Function} [options.handleFailedRequestFunction=({ request }) => {
 *      const details = _.pick(request, 'id', 'url', 'method', 'uniqueKey');
 *      log.error('BasicCrawler: Request failed and reached maximum retries', details);]
 *   Function that handles requests that failed more then `option.maxRequestRetries` times.
 * @param {Number} [options.maxRequestRetries=3]
 *   How many times the request is retried if either `requestFunction` or `handlePageFunction` failed.
 * @param {Number} [options.maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @param {Number} [options.maxMemoryMbytes]
 *   Maximum memory available in the system
 *   See `AutoscaledPool` for details.
 * @param {Number} [options.minConcurrency=1]
 *   Minimum number of request to process in parallel.
 *   See `AutoscaledPool` for details.
 * @param {Number} [options.maxConcurrency=1000]
 *   Maximum number of request to process in parallel.
 *   See `AutoscaledPool` for details.
 * @param {Number} [options.minFreeMemoryRatio=0.2]
 *   Minimum ratio of free memory kept in the system.
 *   See `AutoscaledPool` for details.
 * @param {Function} [opts.isFinishedFunction]
 *   By default CheerioCrawler finishes when all the requests have been processed.
 *   You can override this behaviour by providing custom `isFinishedFunction`.
 *   This function that is called every time there are no requests being processed.
 *   If it resolves to `true` then the crawler's run finishes.
 *   See `AutoscaledPool` for details.
 * @param {Boolean} [options.ignoreMainProcess=false]
 *   If set to `true` then the auto-scaling manager does not consider memory consumption
 *   of the main Node.js process when scaling the pool up or down.
 *   This is mainly useful when tasks are running as separate processes (e.g. web browsers).
 *   See `AutoscaledPool` for details.
 */
export default class CheerioCrawler {
    constructor(opts) {
        const {
            requestFunction,
            handlePageFunction,
            handlePageTimeoutSecs,
            ignoreSslErrors,

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
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(handlePageFunction, 'opts.handlePageFunction', 'Function');
        checkParamOrThrow(requestFunction, 'opts.requestFunction', 'Maybe Function');
        checkParamOrThrow(handleFailedRequestFunction, 'opts.handleFailedRequestFunction', 'Maybe Function');

        this.ignoreSslErrors = ignoreSslErrors;

        this.handlePageFunction = handlePageFunction;
        this.requestFunction = requestFunction || this._defaultRequestFunction;
        this.handlePageTimeoutSecs = handlePageTimeoutSecs;

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
    async run() {
        return this.basicCrawler.run();
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @ignore
     */
    async _handleRequestFunction({ request }) {
        const html = await this.requestFunction({ request });
        const $ = cheerio.load(html);
        await Promise.race([
            this.handlePageFunction({ $, html, request }),
            createTimeoutPromise(this.handlePageTimeoutSecs * 1000, 'CheerioCrawler: handlePageFunction timed out.'),
        ]);
    }

    /**
     * Default request function to be used.
     * @ignore
     */
    async _defaultRequestFunction({ request }) {
        return rp({
            url: request.url,
            method: request.method,
            headers: request.headers,
            strictSSL: !this.ignoreSslErrors,
        });
    }
}
