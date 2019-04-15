import rqst from 'request';
import contentType from 'content-type';
import util from 'util';
import zlib from 'zlib';
import * as url from 'url';
import { decompressStream } from 'iltorb';
import _ from 'underscore';
import log from 'apify-shared/log';

const FIREFOX_MOBILE_USER_AGENT = 'Mozilla/5.0 (Android 9.0; Mobile; rv:66.0) Gecko/66.0 Firefox/66.0';
const FIREFOX_DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/605.1.15 (KHTML, like Gecko)'
    + ' Version/11.1.1 Safari/605.1.15';

const REQUEST_EXTENDED_DEFAULT_OPTIONS = {
    json: false,
    gzip: true,
    maxRedirects: 10,
    followRedirect: true,
    removeRefererHeader: false,
    headers: {},
    method: 'GET',
    throwOnHttpError: false,
    abortFunction: () => false,
};

const REQUEST_LIKE_BROWSER_DEFAULT_OPTIONS = {
    countryCode: 'US',
    languageCode: 'en',
    headers: {},
    method: 'GET',
    useMobileVersion: false,
};
const TRUNCATED_ERROR_CHARS = 100;

let tunnelAgentExceptionListener;
/**
 * Sends a HTTP request and returns the response.
 * The function has similar functionality and options as the [request](https://www.npmjs.com/package/request) NPM package,
 * but it brings several additional improvements and fixes:
 *
 * - It support not only Gzip compression, but also Brotli and Deflate. To activate this feature,
 *   simply add `Accept-Encoding: gzip, deflate, br` to `options.headers` (or a combination).
 * - Enables abortion of the request based on the response headers, before the data is downloaded.
 *   See `options.abort` parameter.
 * - SSL connections over proxy do not leak sockets in CLOSE_WAIT state (https://github.com/request/request/issues/2440)
 * - Gzip implementation doesn't fail (https://github.com/apifytech/apify-js/issues/266)
 * - There is no tunnel-agent AssertionError (https://github.com/request/tunnel-agent/issues/20)
 *
 * NOTE: Most of the options below are simply copied from NPM request. Perhaps we don't need to copy
 * them here and can just pass them down. Well, we can decide later.
 *
 * @param options.url
 *  URL of the target endpoint. Supports both HTTP and HTTPS schemes.
 * @param [options.method=GET]
 *  HTTP method.
 * @param [options.headers={}]
 *  HTTP headers.
 *  Note that the function generates several headers itself, unless
 *  they are defined in the `headers` parameter, in which case the function leaves them untouched.
 *  For example, even if you define `{ 'Content-Length': null }`, the function doesn't define
 *  the 'Content-Length' header and the request will not contain it (due to the `null` value).
 * @param [options.body]
 *  HTTP payload for PATCH, POST and PUT requests. Must be a `Buffer` or `String`.
 * @param [options.followRedirect=true]
 *  Follow HTTP 3xx responses as redirects (default: true).
 *  OPTIONALLY: This property can also be implemented as function which gets response object as
 *  a single argument and should return `true` if redirects should continue or `false` otherwise.
 * @param [options.maxRedirects=10]
 *  The maximum number of redirects to follow.
 * @param [options.removeRefererHeader=false]
 *  Removes the referer header when a redirect happens.
 *  If `true`, referer header set in the initial request is preserved during redirect chain.
 * @param [options.encoding]
 *  Encoding to be used on `setEncoding` of response data.
 *  If `null`, the body is returned as a `Buffer`.
 *  Anything else (including the default value of undefined) will be passed as the encoding parameter to `toString()`,
 *  (meaning this is effectively utf8 by default).
 *  (Note: if you expect binary data, you should set encoding: null.)
 * @param [options.gzip=true]
 *  If `true`, the function adds an `Accept-Encoding: gzip` header to request compressed content encodings from the server
 *  (if not already present) and decode supported content encodings in the response.
 *  Note that you can achieve the same effect by adding the `Accept-Encoding: gzip` header directly to `options.headers`,
 *  similarly as `deflate` as `br` encodings.
 * @param [options.json=false]
 *  Sets body to JSON representation of value and adds `Content-type: application/json` header.
 *  Additionally, parses the response body as JSON, i.e. the `body` property of the returned object
 *  is the result of `JSON.parse()`. Throws an error if response cannot be parsed as JSON.
 * @param [options.timeout]
 *  Integer containing the number of milliseconds to wait for a server to send
 *  response headers (and start the response body) before aborting the request.
 *  Note that if the underlying TCP connection cannot be established, the OS-wide
 *  TCP connection timeout will overrule the timeout option (the default in Linux can be anywhere from 20-120 seconds).
 * @param [options.proxy]
 *  An HTTP proxy to be used. Supports proxy authentication with Basic Auth.
 * @param [options.strictSSL=true]
 *  If `true`, requires SSL/TLS certificates to be valid.
 * @param [options.abortFunction]
 *  A function that determines whether the request should be aborted. It is called when the server
 *  responds with the HTTP headers, but before the actual data is downloaded.
 *  The function receives a single argument - an instance of Node's
 *  [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_incomingmessage)
 *  class and it should return `true` if request should be aborted, or `false` otherwise.
 * @param [options.throwOnHttpError=false]
 *  If set to true function throws and error on 4XX and 5XX response codes.
 * @return {{ response, body }}
 *  Returns an object with two properties: `response` is the instance of
 *  Node's [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_incomingmessage) class,
 *  `body` is a `String`, `Buffer` or `Object`, depending on the `encoding` and `json` options.
 */
export const requestExtended = async (options) => {
    suppressTunnelAgentAssertError();

    return new Promise((resolve, reject) => {
        const opts = _.defaults({}, options, REQUEST_EXTENDED_DEFAULT_OPTIONS);

        const {
            abortFunction,
            throwOnHttpError,
        } = opts;
        const method = opts.method.toLowerCase();

        // Using the streaming API of Request to be able to
        const request = rqst[method](opts);
        request
            .on('error', err => reject(err))
            .on('response', async (res) => {
                let shouldAbort;

                try {
                    shouldAbort = abortFunction(res);
                } catch (e) {
                    reject(e);
                }

                if (shouldAbort) {
                    request.abort();
                    res.destroy();

                    return reject(new Error(`utils.requestBetter: Request for ${opts.url} aborted due to abortFunction`));
                }

                let cType;
                try {
                    cType = contentType.parse(res);
                } catch (err) {
                    res.destroy();
                    // No reason to parse the body if the Content-Type header is invalid.
                    return reject(new Error(`utils.requestBetter: Invalid Content-Type header for URL: ${request.url}`));
                }

                const { encoding } = cType;

                // 5XX and 4XX codes are handled as errors, requests will be retried.
                const status = res.statusCode;

                if (status >= 400 && throwOnHttpError) {
                    const error = await getMoreErrorInfo(res, cType);
                    return reject(error);
                }

                // Content-Type is fine. Read the body and respond.
                try {
                    res.body = await readStreamIntoString(res, encoding);
                    resolve(res);
                } catch (err) {
                    // Error in reading the body.
                    reject(err);
                }
            });
    });
};

/**
 * Gets more info about the error.
 * Errors are often sent as JSON, so attempt to parse them, despite Accept header being set to something different.
 * @param {http.IncomingMessage} response
 * @param {Object} cType
 * @param {String} cType.type
 * @param {String} cType.encoding
 * @returns {Promise<Error>}
 */
async function getMoreErrorInfo(response, cType) {
    const { type, encoding } = cType;
    const { status } = response;
    let body;
    try {
        body = await readStreamIntoString(response, encoding);
    } catch (err) {
        // Error in reading the body.
        return err;
    }

    if (type === 'application/json') {
        let errorResponse;
        let message;
        try {
            errorResponse = JSON.parse(body);
            message = errorResponse.message; // eslint-disable-line
            if (!message) {
                message = util.inspect(errorResponse, {
                    depth: 1,
                    maxArrayLength: 10,
                });
            }
        } catch (e) {
            message = `${body.substr(0, TRUNCATED_ERROR_CHARS)}...`;
        }

        return new Error(`${status} - ${message}`);
    }
    // It's not a JSON so it's probably some text. Get the first 100 chars of it.
    return new Error(`utils.requestBetter: ${status} - Internal Server Error: ${body.substr(0, TRUNCATED_ERROR_CHARS)}...`);
}

/**
 * Flushes the provided stream into a Buffer and transforms
 * it to a String using the provided encoding or utf-8 as default.
 *
 *
 * @param {http.IncomingMessage} response
 * @param {String} [encoding]
 * @returns {Promise<String>}
 * @private
 */
async function readStreamIntoString(response, encoding) { // eslint-disable-line class-methods-use-this
    const stream = decompress(response);

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
 * Gets decompressed response from
 * If the stream data is compressed, decompresses it using the Content-Encoding header.
 * @param {http.IncomingMessage} response
 * @returns {http.IncomingMessage|Stream} - Decompressed response
 */
function decompress(response) {
    const compression = response.headers['content-encoding'];
    let stream = response;
    if (compression) {
        let decompressor;
        switch (compression) {
        case 'gzip':
            decompressor = zlib.createGunzip();
            break;
        case 'deflate':
            decompressor = zlib.createInflate();
            break;
        case 'br':
            decompressor = decompressStream();
            break;
        case undefined:
            break;
        default:
            throw new Error(`requestBetter: Invalid Content-Encoding header. Expected gzip, deflate or br, but received: ${compression}`);
        }
        stream = response.pipe(decompressor);
    }
    return stream;
}

/**
 * Sends a HTTP request that looks like a request sent by a web browser,
 * fully emulating browser's HTTP headers.
 *
 * This function is useful for web scraping of websites that send the full HTML in the first response.
 * Thanks to this function, the target web server has no simple way to find out the request
 * hasn't been sent by a full web browser. Using a headless browser for such requests
 * is an order of magnitude more resource-intensive than this function.
 *
 * Currently, the function sends requests the same way as Firefox web browser does.
 * In the future, it might add support for other browsers too.
 *
 * Internally, the function uses `requestBetter()` function to perform the request.
 * All `options` not recognized by this function are passed to it,
 * so see it for more details.
 *
 * @param options.url
 *  URL of the target endpoint. Supports both HTTP and HTTPS schemes.
 * @param [options.method=GET]
 *  HTTP method.
 * @param [options.headers={}]
 *  Additional HTTP headers to add. It's recommended not to use this option,
 *  because it can ruin the signature of the web browser. TODO: Maybe let's remove this completely?
 * @param [options.languageCode=en]
 *  Two-letter ISO 639 language code.
 * @param [options.countryCode=US]
 *  Two-letter ISO 3166 country code.
 * @param [options.isMobile]
 *  If `true`, the function uses User-Agent of a mobile browser.
 *
 * @return {response}
 *  Returns an object with two properties: `response` is the instance of
 *  Node's [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_incomingmessage) class
 */
export const requestLikeBrowser = async (options) => {
    const opts = _.defaults({}, options, REQUEST_LIKE_BROWSER_DEFAULT_OPTIONS);

    const parsedUrl = url.parse(opts.url);
    const abortFunction = (res) => {
        const { type } = contentType.parse(res.headers['content-type']);
        return res.statusCode === 406 || type.toLowerCase() !== 'text/html';
    };

    const browserHeaders = {
        Host: parsedUrl.host,
        'User-Agent': opts.useMobileVersion ? FIREFOX_MOBILE_USER_AGENT : FIREFOX_DESKTOP_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': `${opts.languageCode}-${opts.countryCode},${opts.languageCode};q=0.5`,
        'Accept-Encoding': 'gzip, deflate, br',
        DNT: '1',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    };
    opts.headers = _.defaults({}, opts.headers, browserHeaders);
    opts.abortFunction = abortFunction;

    return requestExtended(opts);
};

/**
 * The handler this function attaches overcomes a long standing bug in
 * the tunnel-agent NPM package that is used by the Request package internally.
 * The package throws an assertion error in a callback scope that cannot be
 * caught by conventional means and shuts down the running process.
 * @ignore
 */
function suppressTunnelAgentAssertError() {
    // Only set the handler if it's not already set.
    if (tunnelAgentExceptionListener) return;
    tunnelAgentExceptionListener = (err) => {
        try {
            const code = err.code === 'ERR_ASSERTION';
            const name = err.name === 'AssertionError [ERR_ASSERTION]';
            const operator = err.operator === '==';
            const value = err.expected === 0;
            const stack = err.stack.includes('/tunnel-agent/index.js');
            // If this passes, we can be reasonably sure that it's
            // the right error from tunnel-agent.
            if (code && name && operator && value && stack) {
                log.error('utils.requestExtended: Tunnel-Agent assertion error intercepted.');
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
    process.on('uncaughtException', tunnelAgentExceptionListener);
}
