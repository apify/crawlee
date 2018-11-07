import rp from 'request-promise';
import _ from 'underscore';
import cheerio from 'cheerio';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import BasicCrawler from './basic_crawler';
import { createTimeoutPromise } from './utils';
import { getApifyProxyUrl } from './actor';

const DEFAULT_OPTIONS = {
    requestTimeoutSecs: 30,
    handlePageTimeoutSecs: 300,
    handleFailedRequestFunction: ({ request }) => {
        const details = _.pick(request, 'id', 'url', 'method', 'uniqueKey');

        log.error('CheerioCrawler: Request failed and reached maximum retries', details);
    },
    ignoreSslErrors: false,
    useApifyProxy: false,
};

/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests and
 * <a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a> HTML parser.
 *
 * `CheerioCrawler` downloads each URL using a plain HTTP request,
 * parses the HTML content using <a href="https://www.npmjs.com/package/cheerio" target="_blank">Cheerio</a>
 * and then invokes the user-provided [`handlePageFunction()`](#new_CheerioCrawler_new) to extract page data
 * using a <a href="https://jquery.com/" target="_blank">jQuery</a>-like interface to the parsed HTML DOM.
 *
 * The source URLs are represented using {@link Request} objects that are fed from
 * {@link RequestList} or {@link RequestQueue} instances provided by the [`requestList`](#new_CheerioCrawler_new)
 * or [`requestQueue`](#new_CheerioCrawler_new) constructor options, respectively.
 *
 * If both [`requestList`](#new_CheerioCrawler_new) and [`requestQueue`](#new_CheerioCrawler_new) are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * By default, `CheerioCrawler` downloads HTML using the
 * <a href="https://www.npmjs.com/package/request-promise" target="_blank">request-promise</a> NPM package.
 * You can override this behavior by setting the `requestFunction` option. If you want to keep `request-promise`,
 * but use different than default options, use the `requestOptions` parameter.
 *
 * New requests are only dispatched when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the `autoscaledPoolOptions`
 * parameter of the `CheerioCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPool} options are available directly in the `CheerioCrawler` constructor.
 *
 * **Example usage:**
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
 * @param {Object} options All `CheerioCrawler` parameters are passed
 *   via an options object with the following keys:
 * @param {Function} options.handlePageFunction
 *   User-provided function that performs the logic of the crawler. It is called for each page
 *   loaded and parsed by the crawler.
 *
 *   The function receives the following object as an argument:
 *   ```
 *   {
 *       $: Cheerio, // the Cheerio object with parsed HTML
 *       html: String // the raw HTML of the page
 *       request: Request,
 *       response: Object // a response object with properties such as the HTTP status code
 *   }
 *   ```
 *   With the {@link Request} object representing the URL to crawl.
 *   If the function returns a promise, it is awaited.
 * @param {RequestList} options.requestList
 *   Static list of URLs to be processed.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @param {RequestQueue} options.requestQueue
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @param {Function} [options.requestFunction]
 *   Overrides the default function that performs the HTTP request to get the raw HTML needed for Cheerio.
 *   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L264">GitHub</a> for default behavior.
 * @param {Object} [options.requestOptions]
 *   Represents the options passed to the `requestFunction`, which are essentially the options passed to
 *   <a href="https://www.npmjs.com/package/request-promise" target="_blank">request-promise</a> to make the HTTP call.
 *   Provided `requestOptions` are merged with defaults so if you only need to add a parameter, there's no need to duplicate
 *   the whole object.
 * @param {Number} [options.handlePageTimeoutSecs=300]
 *   Timeout in which the function passed as `options.handlePageFunction` needs to finish, given in seconds.
 * @param {Number} [options.requestTimeoutSecs=30]
 *   Timeout in which the function passed as `options.requestFunction` needs to finish, given in seconds.
 * @param {Boolean} [options.ignoreSslErrors=false]
 *   If set to true, SSL certificate errors will be ignored. This is dependent on using the default
 *   request function. If using a custom `options.requestFunction`, user needs to implement this functionality.
 * @param {Boolean} [useApifyProxy=false]
 *   If set to `true`, `CheerioCrawler` will be configured to use
 *   <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> for all connections.
 *   For more information, see the <a href="https://www.apify.com/docs/proxy" target="_blank">documentation</a>
 * @param {String[]} [apifyProxyGroups]
 *   An array of proxy groups to be used
 *   by the <a href="https://www.apify.com/docs/proxy" target="_blank">Apify Proxy</a>.
 *   Only applied if the `useApifyProxy` option is `true`.
 * @param {String} [apifyProxySession]
 *   Apify Proxy session identifier to be used with requests made by `CheerioCrawler`.
 *   All HTTP requests going through the proxy with the same session identifier
 *   will use the same target proxy server (i.e. the same IP address).
 *   The identifier can only contain the following characters: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
 *   Only applied if the `useApifyProxy` option is `true`.
 * @param {String[]} [options.proxyUrls]
 *   An array of custom proxy URLs to be used by the `CheerioCrawler` instance.
 *   The provided custom proxies' order will be randomized and the resulting list rotated.
 *   Custom proxies are not compatible with Apify Proxy and an attempt to use both
 *   configuration options will cause an error to be thrown on startup.
 * @param {Function} [options.handleFailedRequestFunction]
 *   Function that handles requests that failed more then `option.maxRequestRetries` times.
 *   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L13">GitHub</a> for default behavior.
 * @param {Number} [options.maxRequestRetries=3]
 *   Indicates how many times the request is retried if either `requestFunction` or `handlePageFunction` fails.
 * @param {Number} [options.maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @param {Object} [options.autoscaledPoolOptions]
 *   Custom options passed to the underlying {@link AutoscaledPool} constructor.
 *   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options
 *   are provided by `CheerioCrawler` and cannot be overridden.
 * @param {Object} [options.minConcurrency=1]
 *   Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 * @param {Object} [options.maxConcurrency=1000]
 *   Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 */
class CheerioCrawler {
    constructor(options = {}) {
        const {
            requestFunction,
            requestOptions,
            handlePageFunction,
            requestTimeoutSecs,
            handlePageTimeoutSecs,
            ignoreSslErrors,
            useApifyProxy,
            apifyProxyGroups,
            apifyProxySession,
            proxyUrls,

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
        } = _.defaults({}, options, DEFAULT_OPTIONS);

        checkParamOrThrow(handlePageFunction, 'options.handlePageFunction', 'Function');
        checkParamOrThrow(requestFunction, 'options.requestFunction', 'Maybe Function');
        checkParamOrThrow(requestOptions, 'options.requestOptions', 'Maybe Object');
        checkParamOrThrow(requestTimeoutSecs, 'options.requestTimeoutSecs', 'Number');
        checkParamOrThrow(handlePageTimeoutSecs, 'options.handlePageTimeoutSecs', 'Number');
        checkParamOrThrow(ignoreSslErrors, 'options.ignoreSslErrors', 'Boolean');
        checkParamOrThrow(useApifyProxy, 'options.useApifyProxy', 'Boolean');
        checkParamOrThrow(apifyProxyGroups, 'options.apifyProxyGroups', 'Maybe [String]');
        checkParamOrThrow(apifyProxySession, 'options.apifyProxySession', 'Maybe String');
        checkParamOrThrow(proxyUrls, 'options.proxyUrls', 'Maybe [String]');
        // Enforce valid proxy configuration
        if (proxyUrls && !proxyUrls.length) throw new Error('Parameter "options.proxyUrls" of type Array must not be empty');
        if (useApifyProxy && proxyUrls) throw new Error('Cannot combine "options.useApifyProxy" with "options.proxyUrls"!');

        this.requestFunction = async ({ request }) => {
            if (!this.isRunning) throw new Error('CheerioCrawler is stopped.');
            const rfPromise = requestFunction
                ? requestFunction({ request })
                : this._defaultRequestFunction({ request });

            // Return the response of requestFunction or throw.
            return Promise.race([
                rfPromise,
                this.rejectOnAbortPromise,
            ]);
        };
        this.requestOptions = requestOptions;
        this.handlePageFunction = handlePageFunction;
        this.handlePageTimeoutMillis = handlePageTimeoutSecs * 1000;
        this.requestTimeoutMillis = requestTimeoutSecs * 1000;
        this.ignoreSslErrors = ignoreSslErrors;
        this.useApifyProxy = useApifyProxy;
        this.apifyProxyGroups = apifyProxyGroups;
        this.apifyProxySession = apifyProxySession;
        this.proxyUrls = _.shuffle(proxyUrls);
        this.lastUsedProxyUrlIndex = 0;

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

        // See the _suppressTunnelAgentAssertError function.
        this.tunnelAgentExceptionListener = null;
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
        this._suppressTunnelAgentAssertError();
        try {
            this.isRunningPromise = this.basicCrawler.run();
            await this.isRunningPromise;
            this.isRunning = false;
            process.removeListener('uncaughtException', this.tunnelAgentExceptionListener);
            this.tunnelAgentExceptionListener = null;
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

        const rfPromise = this.requestFunction({ request });
        // rejectOnAbortPromise rejects when .abort() is called or BasicCrawler throws.
        // All running pages are therefore terminated with an error to be reclaimed and retried.
        const response = await Promise.race([
            rfPromise,
            createTimeoutPromise(this.requestTimeoutMillis, 'CheerioCrawler: requestFunction timed out.'),
            this.rejectOnAbortPromise,
        ]);

        let html;
        if (typeof response === 'string') html = response;
        else if (typeof response === 'object' && typeof response.body === 'string') html = response.body;
        else throw new Error('CheerioCrawler: requestFunction returned neither string, nor an object with a body property of type string.');

        const $ = cheerio.load(html);
        await Promise.race([
            this.handlePageFunction({ $, html, request, response }),
            createTimeoutPromise(this.handlePageTimeoutMillis, 'CheerioCrawler: handlePageFunction timed out.'),
            this.rejectOnAbortPromise,
        ]);
    }

    /**
     * Default request function to be used.
     * @ignore
     */
    async _defaultRequestFunction({ request }) {
        return rp(this._getRequestOptions(request));
    }

    /**
     * Combines the provided `requestOptions` with default values.
     * @param {Request} request
     * @ignore
     */
    _getRequestOptions(request) {
        const defaultRequestOptions = {
            url: request.url,
            method: request.method,
            headers: request.headers,
            strictSSL: !this.ignoreSslErrors,
            resolveWithFullResponse: true,
            simple: false,
            proxy: this._getProxyUrl(),
        };
        return _.defaults({}, this.requestOptions, defaultRequestOptions);
    }

    /**
     * Enables the use of a proxy by returning a proxy URL
     * based on configured options or null if no proxy is used.
     * @ignore
     */
    _getProxyUrl() {
        if (this.useApifyProxy) {
            return getApifyProxyUrl({
                groups: this.apifyProxyGroups,
                session: this.apifyProxySession,
                groupsParamName: 'options.apifyProxyGroups',
                sessionParamName: 'options.apifyProxySession',
            });
        }
        if (this.proxyUrls) {
            return this.proxyUrls[this.lastUsedProxyUrlIndex++ % this.proxyUrls.length];
        }
        return null;
    }

    /**
     * The handler this function attaches overcomes a long standing bug in
     * the tunnel-agent NPM package that is used by the Request package internally.
     * The package throws an assertion error in a callback scope that cannot be
     * caught by conventional means and shuts down the running process.
     * @ignore
     */
    _suppressTunnelAgentAssertError() {
        // Only set the handler if it's not already set.
        if (this.tunnelAgentExceptionListener) return;
        this.tunnelAgentExceptionListener = process.on('uncaughtException', (err) => {
            try {
                const code = err.code === 'ERR_ASSERTION';
                const name = err.name === 'AssertionError [ERR_ASSERTION]';
                const operator = err.operator === '==';
                const value = err.expected === 0;
                const stack = err.stack.includes('/tunnel-agent/index.js');
                // If this passes, we can be reasonably sure that it's
                // the right error from tunnel-agent.
                if (code && name && operator && value && stack) {
                    log.error('CheerioCrawler: Tunnel-Agent assertion error intercepted. The affected request will timeout.');
                    return;
                }
            } catch (caughtError) {
                // Catch any exception resulting from the duck-typing
                // check. It only means that the error is not the one
                // we're looking for.
            }
            // Rethrow the original error if it's not a match.
            throw err;
        });
    }
}

export default CheerioCrawler;
