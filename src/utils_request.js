import * as gotScraping from 'got-scraping';

/* eslint-disable no-unused-vars,import/named,import/order */
import { TimeoutError } from './errors';
import { IncomingMessage } from 'http';
import { Readable, pipeline } from 'stream';

import { promisify } from 'util';
import log from './utils_log';

const pipelinePromise = promisify(pipeline);

/* eslint-enable no-unused-vars,import/named,import/order */
const DEFAULT_HTTP_REQUEST_OPTIONS = {
    json: false,
    stream: false,
    timeoutSecs: 30,
    maxRedirects: 20,
};

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
 * @property {object} [headerGeneratorOptions] - @TODO: proper type import and link
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
export const requestAsBrowser = async (options) => {
    const {
        url,
        method = 'GET',
        headers = {},
        payload, // also body
        proxyUrl,
        languageCode = 'en',
        countryCode = 'US',
        useMobileVersion = false,
        abortFunction,
        ignoreSslErrors = true,
        useInsecureHttpParser = true,
        useHttp2 = false,
        timeoutSecs = 30,
        throwOnHttpErrors = false,
        headerGeneratorOptions,
        stream = false,
        json = false, // @TODO: To responseType json
        decodeBody, // decompress
        ...otherParams
    } = options;

    let requestOptions = {
        ...DEFAULT_HTTP_REQUEST_OPTIONS,
        ...otherParams,
        url,
        method,
        headers,
        body: payload,
        proxyUrl,
        abortFunction,
        insecureHTTPParser: useInsecureHttpParser,
        http2: useHttp2,
        timeout: timeoutSecs * 1000,
        https: {
            rejectUnauthorized: !ignoreSslErrors,
        },
        headerGeneratorOptions,
        throwHttpErrors: throwOnHttpErrors,
        isStream: stream,

    };

    logDeprecatedOptions(options);

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
        requestOptions = gotScraping.mergeOptions(gotScraping.defaults.options, requestOptions, abortRequestOptions);
    }

    if (!headerGeneratorOptions) {
        // Default values for backwards compatibility.
        requestOptions.headerGeneratorOptions = {
            devices: useMobileVersion ? ['mobile'] : ['desktop'],
            locales: [`${languageCode}-${countryCode}`],
        };
    }

    try {
        if (!stream) {
            return await gotScraping(requestOptions);
        }
        const duplexStream = await gotScraping(requestOptions);

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
            throw new TimeoutError(`Request Timed-out after ${requestOptions.timeoutSecs} seconds.`);
        }

        throw e;
    }
};

/**
 *
 * @param {RequestAsBrowserOptions} options
 * @ignore
 */
function logDeprecatedOptions(options) {
    const deprecatedOptions = ['languageCode', 'countryCode', 'useMobileVersion'];

    for (const deprecatedOption of deprecatedOptions) {
        if (options.hasOwnProperty(deprecatedOption)) {
            log.deprecated(`"options.${deprecatedOption}" is deprecated. "options.headerGeneratorOptions" instead.`);
        }
    }
}

function addResponsePropertiesToStream(stream, response) {
    const properties = [
        'statusCode', 'statusMessage', 'headers',
        'complete', 'httpVersion', 'rawHeaders',
        'rawTrailers', 'trailers', 'url',
        'request',
    ];

    properties.forEach((prop) => {
        stream[prop] = response[prop];
    });

    return stream;
}
