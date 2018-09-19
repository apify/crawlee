import rp from 'request-promise';
import _ from 'underscore';
import cheerio from 'cheerio';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import BasicCrawler from './basic_crawler';
import { createTimeoutPromise } from './utils';

const DEFAULT_OPTIONS = {
    requestTimeoutSecs: 30,
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
 * using the functionality provided by the `AutoscaledPool` class. See <a href="#AutoscaledPool">AutoscaledPool documentation</a>.
 *
 * All `AutoscaledPool` configuration options can be passed to the `autoscaledPoolOptions` parameter
 * of the `CheerioCrawler` constructor. The `minConcurrency` and `maxConcurrency` options are available directly.
 *
 * If both `requestList` and `requestQueue` are used, the instance first
 * processes URLs from the `requestList` and automatically enqueues all of them to `requestQueue` before it starts
 * their processing. This guarantees that a single URL is not crawled multiple times.
 *
 * Example usage:
 *
 * ```javascript
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
 * @param {Function} options.handlePageFunction
 *   A function that receives three arguments: the Cheerio object `$`, the raw HTML and the `Request` object and does all the document manipulation.
 *   If it returns a promise, it is awaited.
 *
 * @param {Function} [options.requestFunction]
 *   Overrides the function that performs the HTTP request to get the raw HTML needed for Cheerio.
 *   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L246">GitHub</a> for default behavior.
 * @param {RequestList} [options.requestList]
 *   Static list of URLs to be processed.
 * @param {RequestQueue} [options.requestQueue]
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 * @param {Number} [options.handlePageTimeoutSecs=300]
 *   Timeout in which the function passed as `options.handlePageFunction` needs to finish, given in seconds.
 * @param {Number} [options.requestTimeoutSecs=30]
 *   Timeout in which the function passed as `options.requestFunction` needs to finish, given in seconds.
 * @param {Boolean} [options.ignoreSslErrors=false]
 *   If set to true, SSL certificate errors will be ignored. This is dependent on using the default
 *   request function. If using a custom request function, user needs to implement this functionality.
 * @param {Function} [options.handleFailedRequestFunction]
 *   Function that handles requests that failed more then `option.maxRequestRetries` times.
 *   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L12">GitHub</a> for default behavior.
 * @param {Number} [options.maxRequestRetries=3]
 *   How many times the request is retried if either `requestFunction` or `handlePageFunction` failed.
 * @param {Number} [options.maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @param {Object} [options.autoscaledPoolOptions]
 *   Configures the AutoscaledPool. See <a href="#AutoscaledPool">AutoscaledPool documentation</a>.
 * @param {Object} [options.minConcurrency]
 *   Sets the minimal concurrency (parallelism) for the crawl. Shorthand to the AutoscaledPool option.
 * @param {Object} [options.maxConcurrency]
 *   Sets the maximal concurrency (parallelism) for the crawl. Shorthand to the AutoscaledPool option.
 */
export default class CheerioCrawler {
    constructor(opts = {}) {
        const {
            requestFunction,
            handlePageFunction,
            requestTimeoutSecs,
            handlePageTimeoutSecs,
            ignoreSslErrors,

            // Autoscaled pool shorthands
            minConcurrency,
            maxConcurrency,

            // Basic crawler options
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleFailedRequestFunction,
            autoscaledPoolOptions,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(handlePageFunction, 'opts.handlePageFunction', 'Function');
        checkParamOrThrow(requestFunction, 'opts.requestFunction', 'Maybe Function');
        checkParamOrThrow(requestTimeoutSecs, 'opts.requestTimeoutSecs', 'Number');
        checkParamOrThrow(handlePageTimeoutSecs, 'opts.handlePageTimeoutSecs', 'Number');
        checkParamOrThrow(ignoreSslErrors, 'opts.ignoreSslErrors', 'Boolean');

        this.ignoreSslErrors = ignoreSslErrors;

        this.requestFunction = async ({ request }) => {
            if (!this.isRunning) throw new Error('CheerioCrawler is stopped.');

            return requestFunction
                ? requestFunction({ request })
                : this._defaultRequestFunction({ request });
        };
        this.handlePageFunction = handlePageFunction;
        this.handlePageTimeoutMillis = handlePageTimeoutSecs * 1000;
        this.requestTimeoutMillis = requestTimeoutSecs * 1000;

        this.basicCrawler = new BasicCrawler({
            // Basic crawler options.
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
            handleFailedRequestFunction,

            // Autoscaled pool options.
            minConcurrency,
            maxConcurrency,
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

        this.isRunning = true;
        this.rejectOnAbortPromise = new Promise((r, reject) => { this.rejectOnAbort = reject; });
        try {
            this.isRunningPromise = this.basicCrawler.run();
            await this.isRunningPromise;
            this.isRunning = false;
        } catch (err) {
            this.isRunning = false; // Doing this before rejecting to make sure it's set when error handlers fire.
            this.rejectOnAbort(err);
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
        this.rejectOnAbort(new Error('CheerioCrawler: .abort() function has been called. Aborting the crawler.'));
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @ignore
     */
    async _handleRequestFunction({ request }) {
        if (!this.isRunning) throw new Error('CheerioCrawler is stopped.');

        // rejectOnAbortPromise rejects when .abort() is called or BasicCrawler throws.
        // All running pages are therefore terminated with an error to be reclaimed and retried.
        const html = await Promise.race([
            this.requestFunction({ request }),
            createTimeoutPromise(this.requestTimeoutMillis, 'CheerioCrawler: requestFunction timed out.'),
            this.rejectOnAbortPromise,
        ]);
        const $ = cheerio.load(html);
        await Promise.race([
            this.handlePageFunction({ $, html, request }),
            createTimeoutPromise(this.handlePageTimeoutMillis, 'CheerioCrawler: handlePageFunction timed out.'),
            this.rejectOnAbortPromise,
        ]);
    }

    /**
     * Default request function to be used.
     * @ignore
     */
    async _defaultRequestFunction({ request }) {
        if (!this.isRunning) throw new Error('CheerioCrawler is stopped.');

        return Promise.race([
            rp({
                url: request.url,
                method: request.method,
                headers: request.headers,
                strictSSL: !this.ignoreSslErrors,
            }),
            this.rejectOnAbortPromise,
        ]);
    }
}
