/* eslint-disable class-methods-use-this */

import util from 'util';
import zlib from 'zlib';
import rqst from 'request';
import _ from 'underscore';
import cheerio from 'cheerio';
import contentType from 'content-type';
import htmlparser from 'htmlparser2';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import BasicCrawler from './basic_crawler';
import { addTimeoutToPromise } from '../utils';
import { getApifyProxyUrl } from '../actor';
import { BASIC_CRAWLER_TIMEOUT_MULTIPLIER } from '../constants';

const DEFAULT_OPTIONS = {
    requestTimeoutSecs: 30,
    handlePageTimeoutSecs: 60,
    handleFailedRequestFunction: ({ request }) => {
        const details = _.pick(request, 'id', 'url', 'method', 'uniqueKey');

        log.error('CheerioCrawler: Request failed and reached maximum retries', details);
    },
    ignoreSslErrors: false,
    useApifyProxy: false,
    autoscaledPoolOptions: {
        snapshotterOptions: {
            eventLoopSnapshotIntervalSecs: 2,
            maxBlockedMillis: 100,
        },
        systemStatusOptions: {
            maxEventLoopOverloadedRatio: 0.7,
        },
    },
};

/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests and
 * <a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a> HTML parser.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `CheerioCrawler` uses raw HTTP requests to download web pages,
 * it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
 * to display the content, you might need to use {@link PuppeteerCrawler} instead,
 * because it loads the pages using full-featured headless Chrome browser.
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
 *   html: String // the raw HTML of the page, lazy loaded only when used
 *   request: Request,
 *   response: Object // An instance of Node's http.IncomingMessage object,
 *   autoscaledPool: AutoscaledPool
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
 *   the operation of `CheerioCrawler` and all its options. Headers will not be merged,
 *   use {@link RequestList} and/or {@link RequestQueue} to initialize your {@link Request} with the
 *   correct headers or use `options.prepareRequestFunction` to modify your {@link Request} dynamically.
 *   If you need more granular control over your requests, use {@link BasicCrawler}.
 *
 *   The mandatory internal defaults that **CANNOT BE OVERRIDDEN** by `requestOptions`:
 *   ```
 *   {
 *       url,       // Provided by RequestList and/or RequestQueue
 *       method,    // Provided by RequestList and/or RequestQueue
 *       headers,   // Provided by RequestList and/or RequestQueue
 *       payload,   // Provided by RequestList and/or RequestQueue
 *       strictSSL, // Use options.ignoreSslErrors
 *       proxy,     // Use options.useApifyProxy or options.proxyUrls
 *   }
 *   ```
 * @param {Function} [options.prepareRequestFunction]
 *   A function that executes before the HTTP request is made to the target resource.
 *   This function is suitable for setting dynamic properties such as cookies to the {@link Request}.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request
 * }
 * ```
 *   where the {@link Request} instance corresponds to the initialized request.
 *
 *   The function should modify the properties of the passed {@link Request} instance
 *   in place because there are already earlier references to it. Making a copy and returning it from
 *   this function is therefore not supported, because it would create inconsistencies where
 *   different parts of SDK would have access to a different {@link Request} instance.
 *
 * @param {Number} [options.handlePageTimeoutSecs=60]
 *   Timeout in which the function passed as `options.handlePageFunction` needs to finish, given in seconds.
 * @param {Number} [options.requestTimeoutSecs=30]
 *   Timeout in which the HTTP request to the resource needs to finish, given in seconds.
 * @param {Boolean} [options.ignoreSslErrors=false]
 *   If set to true, SSL certificate errors will be ignored. This is dependent on using the default
 *   request function. If using a custom `options.requestFunction`, user needs to implement this functionality.
 * @param {Boolean} [options.useApifyProxy=false]
 *   If set to `true`, `CheerioCrawler` will be configured to use
 *   <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> for all connections.
 *   For more information, see the <a href="https://apify.com/docs/proxy" target="_blank">documentation</a>
 * @param {String[]} [options.apifyProxyGroups]
 *   An array of proxy groups to be used
 *   by the <a href="https://apify.com/docs/proxy" target="_blank">Apify Proxy</a>.
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
 *   are provided by `CheerioCrawler` and cannot be overridden. Reasonable {@link Snapshotter}
 *   and {@link SystemStatus} defaults are provided to account for the fact that `cheerio`
 *   parses HTML synchronously and therefore blocks the event loop.
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
            prepareRequestFunction,
        } = _.defaults({}, options, DEFAULT_OPTIONS);

        checkParamOrThrow(handlePageFunction, 'options.handlePageFunction', 'Function');
        checkParamOrThrow(requestOptions, 'options.requestOptions', 'Maybe Object');
        checkParamOrThrow(requestTimeoutSecs, 'options.requestTimeoutSecs', 'Number');
        checkParamOrThrow(handlePageTimeoutSecs, 'options.handlePageTimeoutSecs', 'Number');
        checkParamOrThrow(ignoreSslErrors, 'options.ignoreSslErrors', 'Maybe Boolean');
        checkParamOrThrow(useApifyProxy, 'options.useApifyProxy', 'Maybe Boolean');
        checkParamOrThrow(apifyProxyGroups, 'options.apifyProxyGroups', 'Maybe [String]');
        checkParamOrThrow(apifyProxySession, 'options.apifyProxySession', 'Maybe String');
        checkParamOrThrow(proxyUrls, 'options.proxyUrls', 'Maybe [String]');
        checkParamOrThrow(prepareRequestFunction, 'options.prepareRequestFunction', 'Maybe Function');
        // Enforce valid proxy configuration
        if (proxyUrls && !proxyUrls.length) throw new Error('Parameter "options.proxyUrls" of type Array must not be empty');
        if (useApifyProxy && proxyUrls) throw new Error('Cannot combine "options.useApifyProxy" with "options.proxyUrls"!');

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
        this.prepareRequestFunction = prepareRequestFunction;

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
            minConcurrency,
            maxConcurrency,
            autoscaledPoolOptions,
        });

        // See the _suppressTunnelAgentAssertError function.
        this.tunnelAgentExceptionListener = null;
        this.isRunningPromise = null;
    }

    /**
     * Runs the crawler. Returns promise that gets resolved once all the requests got processed.
     *
     * @return {Promise}
     */
    async run() {
        if (this.isRunningPromise) return this.isRunningPromise;

        this._suppressTunnelAgentAssertError();
        this.isRunningPromise = this.basicCrawler.run();
        await this.isRunningPromise;
        process.removeListener('uncaughtException', this.tunnelAgentExceptionListener);
        this.tunnelAgentExceptionListener = null;
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @ignore
     */
    async _handleRequestFunction({ request, autoscaledPool }) {
        if (this.prepareRequestFunction) await this.prepareRequestFunction({ request });
        const { dom, response } = await addTimeoutToPromise(
            this._requestFunction({ request }),
            this.requestTimeoutMillis,
            'CheerioCrawler: requestFunction timed out.',
        );

        request.loadedUrl = response.request.uri.href;

        const $ = cheerio.load(dom);
        const context = {
            $,
            // Using a getter here not to break the original API
            // and lazy load the HTML only when needed.
            get html() {
                return $.html({ decodeEntities: false });
            },
            request,
            response,
            autoscaledPool,
        };
        return addTimeoutToPromise(
            this.handlePageFunction(context),
            this.handlePageTimeoutMillis,
            'CheerioCrawler: handlePageFunction timed out.',
        );
    }

    /**
     * Function to make the HTTP request. It performs optimizations
     * on the request such as only downloading the request body if the
     * received content type matches text/html.
     * @ignore
     */
    async _requestFunction({ request }) {
        return new Promise((resolve, reject) => {
            // Using the streaming API of Request to be able to
            // handle the response based on headers receieved.
            const opts = this._getRequestOptions(request);
            const method = opts.method.toLowerCase();
            rqst[method](opts)
                .on('error', err => reject(err))
                .on('response', async (response) => {
                    // First check what kind of response we received.
                    let cType;
                    try {
                        cType = contentType.parse(response);
                    } catch (err) {
                        response.destroy();
                        // No reason to parse the body if the Content-Type header is invalid.
                        return reject(new Error(`CheerioCrawler: Invalid Content-Type header for URL: ${request.url}`));
                    }

                    const { type, encoding } = cType;

                    // 500 codes are handled as errors, requests will be retried.
                    const status = response.statusCode;
                    if (status >= 500) {
                        let body;
                        try {
                            body = await this._stringifyResponseBody(this._decompressResponse(response), encoding);
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
                        response.destroy();
                        return reject(new Error(`CheerioCrawler: Resource ${request.url} is not available in HTML format. Skipping resource.`));
                    }

                    // Other 200-499 responses are considered OK, but first check the content type.
                    if (type !== 'text/html') {
                        request.doNotRetry();
                        response.destroy();
                        return reject(new Error(
                            `CheerioCrawler: Resource ${request.url} served Content-Type ${type} instead of text/html. Skipping resource.`,
                        ));
                    }

                    // Content-Type is fine. Read the body and respond.
                    try {
                        const dom = await this._parseHtmlToDom(this._decompressResponse(response));
                        resolve({ dom, response });
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
            headers: Object.assign({}, request.headers, {
                Accept: 'text/html',
                'Accept-Encoding': 'gzip, deflate',
            }),
            strictSSL: !this.ignoreSslErrors,
            proxy: this._getProxyUrl(),
        };

        if (/PATCH|POST|PUT/.test(request.method)) mandatoryRequestOptions.body = request.payload;

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
     * @param {http.IncomingMessage} response
     * @param {String} [encoding]
     * @private
     */
    async _stringifyResponseBody(response, encoding) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            response
                .on('data', chunk => chunks.push(chunk))
                .on('error', reject)
                .on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    resolve(buffer.toString(encoding));
                });
        });
    }


    async _parseHtmlToDom(response) {
        return new Promise((resolve, reject) => {
            const domHandler = new htmlparser.DomHandler((err, dom) => {
                if (err) reject(err);
                else resolve(dom);
            });
            const parser = new htmlparser.Parser(domHandler, { decodeEntities: true });
            response.on('error', reject).pipe(parser);
        });
    }

    /**
     * If the stream data is compressed, decompresses it using
     * the Content-Encoding header.
     *
     * @param {http.IncomingMessage} response
     * @return {http.IncomingMessage}
     * @private
     */
    _decompressResponse(response) {
        const compression = response.headers['content-encoding'];
        if (!compression) return response;
        let decompressor;
        if (compression === 'gzip') decompressor = zlib.createGunzip();
        else if (compression === 'deflate') decompressor = zlib.createInflate();
        else throw new Error(`CheerioCrawler: Invalid Content-Encoding header. Expected gzip or deflate, but received: ${compression}`);
        return response.pipe(decompressor);
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
        this.tunnelAgentExceptionListener = (err) => {
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
        };
        process.on('uncaughtException', this.tunnelAgentExceptionListener);
    }
}

export default CheerioCrawler;
