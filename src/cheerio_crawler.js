import util from 'util';
import rqst from 'request';
import _ from 'underscore';
import cheerio from 'cheerio';
import contentType from 'content-type';
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
 * <a href="https://www.npmjs.com/package/request" target="_blank">request</a> NPM package.
 * You can use the `requestOptions` parameter to pass additional options to `request`.
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
 *     handlePageFunction: async ({ request, response, html, $ }) => {
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
 * ```
 * {
 *   $: Cheerio, // the Cheerio object with parsed HTML
 *   html: String // the raw HTML of the page
 *   request: Request,
 *   response: Object // An instance of Node's http.IncomingMessage object
 * }
 * ```
 *   With the {@link Request} object representing the URL to crawl.
 *
 *   If the function returns a promise, it is awaited by the crawler.
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
 * @param {Object} [options.requestOptions]
 *   Represents the options passed to
 *   <a href="https://www.npmjs.com/package/request" target="_blank">request</a> to make the HTTP call.
 *   Provided `requestOptions` are added to internal defaults that cannot be overridden to ensure
 *   the operation of `CheerioCrawler` and all its options. If you need more granular control over
 *   your requests, use {@link BasicCrawler}.
 *
 *   The internal defaults include:
 *      - `url`, `method`, `headers`: provided by `requestList` and/or `requestQueue`
 *      - `strictSSL`: use `options.ignoreSslErrors`
 *      - `proxy`: use `options.useApifyProxy` or `options.proxyUrls`
 *
 * @param {Number} [options.handlePageTimeoutSecs=300]
 *   Timeout in which the function passed as `options.handlePageFunction` needs to finish, given in seconds.
 * @param {Number} [options.requestTimeoutSecs=30]
 *   Timeout in which the function passed as `options.requestFunction` needs to finish, given in seconds.
 * @param {Boolean} [options.ignoreSslErrors=false]
 *   If set to true, SSL certificate errors will be ignored. This is dependent on using the default
 *   request function. If using a custom `options.requestFunction`, user needs to implement this functionality.
 * @param {Boolean} [options.useApifyProxy=false]
 *   If set to `true`, `CheerioCrawler` will be configured to use
 *   <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> for all connections.
 *   For more information, see the <a href="https://www.apify.com/docs/proxy" target="_blank">documentation</a>
 * @param {String[]} [options.apifyProxyGroups]
 *   An array of proxy groups to be used
 *   by the <a href="https://www.apify.com/docs/proxy" target="_blank">Apify Proxy</a>.
 *   Only applied if the `useApifyProxy` option is `true`.
 * @param {String} [options.apifyProxySession]
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
 *   A function to handle requests that failed more than `option.maxRequestRetries` times.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request,
 *   error: Error,
 * }
 * ```
 *   where the {@link Request} instance corresponds to the failed request, and the `Error` instance
 *   represents the last error thrown during processing of the request.
 *
 *   See <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L13">source code</a>
 *   for the default implementation of this function.
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
 *
 *   *WARNING:* If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
 *   If you're not sure, just keep the default value and the concurrency will scale up automatically.
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
        if (requestFunction) log.warning('CheerioCrawler: options.requestFunction is deprecated. Use BasicCrawler instead.');
        checkParamOrThrow(requestOptions, 'options.requestOptions', 'Maybe Object');
        checkParamOrThrow(requestTimeoutSecs, 'options.requestTimeoutSecs', 'Number');
        checkParamOrThrow(handlePageTimeoutSecs, 'options.handlePageTimeoutSecs', 'Number');
        checkParamOrThrow(ignoreSslErrors, 'options.ignoreSslErrors', 'Maybe Boolean');
        checkParamOrThrow(useApifyProxy, 'options.useApifyProxy', 'Maybe Boolean');
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
     * Default request function to be used. It performs optimizations
     * on the request such as only downloading the request body if the
     * received content type
     * @ignore
     */
    async _defaultRequestFunction({ request }) {
        return new Promise((resolve, reject) => {
            // Using the streaming API of Request to be able to
            // handle the response based on headers receieved.
            const opts = this._getRequestOptions(request);
            const method = opts.method.toLowerCase();
            rqst[method](opts)
                .on('error', err => reject(err))
                .on('response', async (res) => {
                    // First check what kind of response we received.
                    let cType;
                    try {
                        cType = contentType.parse(res);
                    } catch (err) {
                        res.destroy();
                        // No reason to parse the body if the Content-Type header is invalid.
                        return reject(new Error(`CheerioCrawler: Invalid Content-Type header for URL: ${request.url}`));
                    }

                    const { type, encoding } = cType;

                    // 500 codes are handled as errors, requests will be retried.
                    const status = res.statusCode;
                    if (status >= 500) {
                        let body;
                        try {
                            body = await this._readStreamIntoString(res, encoding);
                        } catch (err) {
                            // Error in reading the body.
                            return reject(err);
                        }
                        // Errors are often sent as JSON, so attempt to parse them,
                        // despite Accept header being set to text/html.
                        if (type === 'application/json') {
                            const errorResponse = JSON.parse(body);
                            let { message } = errorResponse;
                            if (!message) message = util.inspect(errorResponse, { depth: 1, maxArrayLength: 10 });
                            return reject(new Error(`${status} - ${message}`));
                        }
                        // It's not a JSON so it's probably some text. Get the first 100 chars of it.
                        return reject(new Error(`CheerioCrawler: ${status} - Internal Server Error: ${body.substr(0, 100)}`));
                    }

                    // Handle situations where the server explicitly states that
                    // it will not serve the resource as text/html by skipping.
                    if (status === 406) {
                        request.doNotRetry();
                        res.destroy();
                        return reject(new Error(`CheerioCrawler: Resource ${request.url} is not available in HTML format. Skipping resource.`));
                    }

                    // Other 200-499 responses are considered OK, but first check the content type.
                    if (type !== 'text/html') {
                        request.doNotRetry();
                        res.destroy();
                        return reject(new Error(
                            `CheerioCrawler: Resource ${request.url} served Content-Type ${type} instead of text/html. Skipping resource.`,
                        ));
                    }

                    // Content-Type is fine. Read the body and respond.
                    try {
                        res.body = await this._readStreamIntoString(res, encoding);
                        resolve(res);
                    } catch (err) {
                        // Error in reading the body.
                        reject(err);
                    }
                });
        });
    }

    /**
     * Combines the provided `requestOptions` with mandatory (non-overridable) values.
     * @param {Request} request
     * @ignore
     */
    _getRequestOptions(request) {
        const mandatoryRequestOptions = {
            url: request.url,
            method: request.method,
            headers: Object.assign({}, request.headers, { Accept: 'text/html' }),
            strictSSL: !this.ignoreSslErrors,
            proxy: this._getProxyUrl(),
        };
        return Object.assign({}, this.requestOptions, mandatoryRequestOptions);
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
     * Flushes the provided stream into a Buffer and transforms
     * it to a String using the provided encoding or utf-8 as default.
     *
     * @param {stream.Readable} stream
     * @param {String} [encoding]
     * @returns {Promise<String>}
     * @private
     */
    async _readStreamIntoString(stream, encoding) { // eslint-disable-line class-methods-use-this
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream
                .on('data', chunk => chunks.push(chunk))
                .on('error', err => reject(err))
                .on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    resolve(buffer.toString(encoding));
                });
        });
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
