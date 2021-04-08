import * as gotScraping from 'got-scraping';
import ow from 'ow';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';
import { TimeoutError } from './errors';
import log from './utils_log';

/* eslint-disable no-unused-vars,import/named,import/order */
import { IncomingMessage } from 'http';
/* eslint-enable no-unused-vars,import/named,import/order */

const pipelinePromise = promisify(pipeline);

/**
 * @typedef {(IncomingMessage & Readable & { body: string })} RequestAsBrowserResult
 */

/**
 * @typedef RequestAsBrowserOptions
 * @property {string} url
 *  URL of the target endpoint. Supports both HTTP and HTTPS schemes.
 * @property {string} [method="GET"]
 *  HTTP method.
 * @property {Object<string, string>} [headers]
 *  Additional HTTP headers to add. It's only recommended to use this option,
 *  with headers that are typically added by websites, such as cookies. Overriding
 *  default browser headers will remove the masking this function provides.
 * @property {string} [proxyUrl]
 *  An HTTP proxy to be passed down to the HTTP request. Supports proxy authentication with Basic Auth.
 * @property {object} [headerGeneratorOptions]
 *  Configuration to be used for generating correct browser headers.
 *  See the [`header-generator`](https://github.com/apify/header-generator) library.
 * @property {string} [languageCode=en]
 *  Two-letter ISO 639 language code.
 * @property {string} [countryCode=US]
 *  Two-letter ISO 3166 country code.
 * @property {boolean} [useMobileVersion]
 *  If `true`, the function uses User-Agent of a mobile browser.
 * @property {boolean} [ignoreSslErrors=true]
 *  If set to true, SSL/TLS certificate errors will be ignored.
 * @property {boolean} [useInsecureHttpParser=true]
 *  Node.js' HTTP parser is stricter than parsers used by web browsers, which prevents scraping of websites
 *  whose servers do not comply with HTTP specs, either by accident or due to some anti-scraping protections,
 *  causing e.g. the `invalid header value char` error. The `useInsecureHttpParser` option forces
 *  the HTTP parser to ignore certain errors which lets you scrape such websites.
 *  However, it will also open your application to some security vulnerabilities,
 *  although the risk should be negligible as these vulnerabilities mainly relate to server applications, not clients.
 *  Learn more in this [blog post](https://snyk.io/blog/node-js-release-fixes-a-critical-http-security-vulnerability/).
 * @property {AbortFunction} [abortFunction]
 *  Function accepts `response` object as a single parameter and should return true or false.
 *  If function returns true request gets aborted. This function is passed to the
 *  [@apify/http-request](https://www.npmjs.com/package/@apify/http-request) NPM package.
 * @property {boolean} [useHttp2=false]
 *  If set to true, it will additionally accept HTTP2 requests.
 *  It will choose either HTTP/1.1 or HTTP/2 depending on the ALPN protocol.
 */

/**
 * @callback AbortFunction
 * @param {IncomingMessage} response
 * @returns {boolean}
 */

/**
 * **IMPORTANT:** This function uses an insecure version of HTTP parser by default
 * and also ignores SSL/TLS errors. This is very useful in scraping, because it allows bypassing
 * certain anti-scraping walls, but it also exposes some vulnerability. For other than scraping
 * scenarios, please set `useInsecureHttpParser: false` and `ignoreSslErrors: false`.
 *
 * Sends a HTTP request that looks like a request sent by a web browser,
 * fully emulating browser's HTTP headers.
 *
 * This function is useful for web scraping of websites that send the full HTML in the first response.
 * Thanks to this function, the target web server has no simple way to find out the request
 * hasn't been sent by a full web browser. Using a headless browser for such requests
 * is an order of magnitude more resource-intensive than this function.
 * By default it aborts all requests that returns 406 status codes or non-HTML content-types.
 * You can override this behavior by passing custom `abortFunction`.
 *
 * Currently, the function sends requests the same way as Firefox web browser does.
 * In the future, it might add support for other browsers too.
 *
 * Internally, the function uses `httpRequest` function from the [@apify/http-request](https://github.com/apify/http-request)
 * NPM package to perform the request.
 * All `options` not recognized by this function are passed to it,
 * so see it for more details.
 *
 * **Example usage:**
 * ```js
 * const Apify = require('apify');
 *
 * const { utils: { requestAsBrowser } } = Apify;
 *
 * ...
 *
 * const response = await requestAsBrowser({ url: 'https://www.example.com/' });
 *
 * const html = response.body;
 * const status = response.statusCode;
 * const contentType = response.headers['content-type'];
 * ```
 *
 * @param {RequestAsBrowserOptions} options All `requestAsBrowser` configuration options.
 *
 * @return {Promise<RequestAsBrowserResult>} This will typically be a
 * [Node.js HTTP response stream](https://nodejs.org/api/http.html#http_class_http_incomingmessage),
 * however, if returned from the cache it will be a [response-like object](https://github.com/lukechilds/responselike) which behaves in the same way.
 * @memberOf utils
 * @name requestAsBrowser
 * @function
 */
export const requestAsBrowser = async (options = {}) => {
    logDeprecatedOptions(options);
    ow(options, 'RequestAsBrowserOptions', ow.object.partialShape({
        payload: ow.optional.any(ow.string, ow.buffer),
        proxyUrl: ow.optional.string.url,
        languageCode: ow.optional.string.length(2),
        countryCode: ow.optional.string.length(2),
        useMobileVersion: ow.optional.boolean,
        abortFunction: ow.optional.function,
        ignoreSslErrors: ow.optional.boolean,
        useInsecureHttpParser: ow.optional.boolean,
        useHttp2: ow.optional.boolean,
        timeoutSecs: ow.optional.boolean,
        throwOnHttpErrors: ow.optional.boolean,
        headerGeneratorOptions: ow.optional.object,
        stream: ow.optional.boolean,
        decodeBody: ow.optional.boolean,
        // json, @TODO: To responseType json
    }));

    // We created the `got-scraping` package which replaced underlying @apify/http-request.
    // At the same time, we want users to be able to use requestAsBrowser without breaking changes.
    // So we do a lot of property mapping here, to make sure that everything works as expected.
    // TODO Update this with SDK v2 and use `got-scraping` API directly.
    const {
        payload, // alias for body to allow direct passing of our Request objects
        proxyUrl,
        languageCode = 'en',
        countryCode = 'US',
        useMobileVersion = false,
        abortFunction = () => false,
        ignoreSslErrors = true,
        useInsecureHttpParser = true,
        useHttp2 = true, // TODO delete connection header
        timeoutSecs = 30,
        throwOnHttpErrors = false,
        headerGeneratorOptions,
        stream = false,
        json, // @TODO: To responseType json
        decodeBody, // decompress
        ...gotParams
    } = options;

    let gotScrapingOptions = {
        proxyUrl,
        insecureHTTPParser: useInsecureHttpParser,
        http2: useHttp2,
        timeout: timeoutSecs * 1000,
        headerGeneratorOptions,
        throwHttpErrors: throwOnHttpErrors,
        isStream: stream,
        // Overwrite old
        ...gotParams,
    };

    if (useHttp2) {
        delete gotScrapingOptions.headers?.connection;
        delete gotScrapingOptions.headers?.Connection;
        delete gotScrapingOptions.headers?.host;
        delete gotScrapingOptions.headers?.Host;
    }

    if (gotScrapingOptions.https) {
        gotScrapingOptions.https.rejectUnauthorized = !ignoreSslErrors;
    } else {
        gotScrapingOptions.https = { rejectUnauthorized: !ignoreSslErrors };
    }

    if (abortFunction && !stream) {
        const abortRequestOptions = {
            hooks: {
                afterResponse: [
                    (response) => {
                        const shouldAbort = abortFunction(response);

                        if (shouldAbort) {
                            throw new Error(`Request for ${url} aborted due to abortFunction`, response);
                        }

                        return response;
                    },
                ],
            },
        };
        gotScrapingOptions = gotScraping.mergeOptions(gotScraping.defaults.options, gotScrapingOptions, abortRequestOptions);
    }

    if (!headerGeneratorOptions) {
        // Default values for backwards compatibility.
        gotScrapingOptions.headerGeneratorOptions = {
            devices: useMobileVersion ? ['mobile'] : ['desktop'],
            locales: [`${languageCode}-${countryCode}`],
        };
    }

    try {
        if (!stream) {
            return await gotScraping(gotScrapingOptions);
        }
        const duplexStream = await gotScraping(gotScrapingOptions);

        if (payload) {
            await pipelinePromise(
                Readable.from([payload]),
                duplexStream,
            );
        }

        return await new Promise((resolve, reject) => duplexStream
            .on('error', reject)
            .on('response', (res) => {
                try {
                    const shouldAbort = abortFunction && abortFunction(res);

                    if (shouldAbort) {
                        duplexStream.destroy();
                        return reject(new Error(`Request for ${url} aborted due to abortFunction`, res));
                    }
                } catch (e) {
                    duplexStream.destroy();
                    return reject(e);
                }
                // Add response props
                addResponsePropertiesToStream(duplexStream, res);

                return resolve(duplexStream);
            }));
    } catch (e) {
        if (e instanceof gotScraping.TimeoutError) {
            throw new TimeoutError(`Request Timed-out after ${gotScrapingOptions.timeoutSecs} seconds.`);
        }

        throw e;
    }
};

/**
 * got-scraping uses 'body', but we also support 'payload' from {@link Request}.
 * got.stream() also doesn't send a request until at least an empty body is provided.
 * @param {RequestAsBrowserOptions} options
 * @ignore
 * @private
 */
function getNormalizedBody(options) {
    const { stream, body, payload } = options;
}

/**
 *
 * @param {RequestAsBrowserOptions} options
 * @ignore
 * @private
 */
function logDeprecatedOptions(options) {
    const deprecatedOptions = ['languageCode', 'countryCode', 'useMobileVersion'];

    for (const deprecatedOption of deprecatedOptions) {
        if (options.hasOwnProperty(deprecatedOption)) {
            log.deprecated(`"options.${deprecatedOption}" is deprecated. "options.headerGeneratorOptions" instead.`);
        }
    }
}

/**
 * The stream object returned from got does not have the below properties.
 * At the same time, you can't read data directly from the response stream,
 * because they won't get emitted unless you also read from the primary
 * got stream. To be able to work with only one stream, we move the expected props
 * from the response stream to the got stream.
 * @param {GotStream} stream
 * @param {http.IncomingMessage} response
 * @return {GotStream}
 * @ignore
 * @private
 */
function addResponsePropertiesToStream(stream, response) {
    const properties = [
        'statusCode', 'statusMessage', 'headers',
        'complete', 'httpVersion', 'rawHeaders',
        'rawTrailers', 'trailers', 'url',
        'request',
    ];

    properties.forEach((prop) => {
        if (stream[prop] === undefined) {
            stream[prop] = response[prop];
        }
    });

    return stream;
}
