import { URL } from 'url';
import httpRequest from '@apify/http-request';
import errors from '@apify/http-request/src/errors';
import { TimeoutError } from './errors';

export const FIREFOX_MOBILE_USER_AGENT = 'Mozilla/5.0 (Android; Mobile; rv:14.0) Gecko/14.0 Firefox/14.0';
export const FIREFOX_DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:68.0) Gecko/20100101 Firefox/68.0';


const DEFAULT_HTTP_REQUEST_OPTIONS = {
    useBrotli: true,
    json: false,
    useCaseSensitiveHeaders: true,
    stream: false,
    timeoutSecs: 30,
};

/**
 * @typedef {Object} RequestAsBrowserOptions
 * @property {String} url
 *  URL of the target endpoint. Supports both HTTP and HTTPS schemes.
 * @property {String} [method=GET]
 *  HTTP method.
 * @property {Object} [headers]
 *  Additional HTTP headers to add. It's only recommended to use this option,
 *  with headers that are typically added by websites, such as cookies. Overriding
 *  default browser headers will remove the masking this function provides.
 * @property {String} [proxyUrl]
 *  An HTTP proxy to be passed down to the HTTP request. Supports proxy authentication with Basic Auth.
 * @property {String} [languageCode=en]
 *  Two-letter ISO 639 language code.
 * @property {String} [countryCode=US]
 *  Two-letter ISO 3166 country code.
 * @property {Boolean} [useMobileVersion]
 *  If `true`, the function uses User-Agent of a mobile browser.
 * @property {Function} [abortFunction]
 *  Function accepts `response` object as a single parameter and should return true or false.
 *  If function returns true request gets aborted. This function is passed to the
 *  [@apify/http-request](https://www.npmjs.com/package/@apify/http-request) NPM package.
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
 */

/**
 * **IMPORTANT:** This function uses an insecure version of HTTP parser by default
 * and also ignores SSL/TLS errors. This is very useful in scraping, because it allows bypassing
 * certain anti-scraping walls, but it also exposes some vulnerability. For other than scraping
 * scenarios, please set `useInsecureHttpParser: false` and `ignoreSslErrors: false`.
 *
 * Sends an HTTP request that looks like a request sent by a web browser,
 * fully emulating browser's HTTP headers.
 *
 * This function is useful for web scraping of websites that send the full HTML in the first response.
 * Thanks to this function, the target web server has no simple way to find out the request
 * hasn't been sent by a full web browser. Using a headless browser for such requests
 * is an order of magnitude more resource-intensive than this function.
 * By default tt aborts all requests that returns 406 status codes or non-HTML content-types.
 * You can override this behavior by passing custom `abortFunction`.
 *
 * Currently, the function sends requests the same way as Firefox web browser does.
 * In the future, it might add support for other browsers too.
 *
 * Internally, the function uses httpRequest function from the [@apify/httpRequest](https://github.com/apifytech/http-request)
 * NPM package to perform the request.
 * All `options` not recognized by this function are passed to it,
 * so see it for more details.
 *
 * @param {RequestAsBrowserOptions} options All `requestAsBrowser` configuration options.
 *
 * @return {Promise<http.IncomingMessage|stream.Readable>} This will typically be a
 * [Node.js HTTP response stream](https://nodejs.org/api/http.html#http_class_http_incomingmessage),
 * however, if returned from the cache it will be a [response-like object](https://github.com/lukechilds/responselike) which behaves in the same way.
 * @memberOf utils
 * @name requestAsBrowser
 */
export const requestAsBrowser = async (options) => {
    const {
        url,
        method = 'GET',
        headers = {},
        proxyUrl,
        languageCode = 'en',
        countryCode = 'US',
        useMobileVersion = false,
        abortFunction,
        ignoreSslErrors = true,
        useInsecureHttpParser = true,
        ...otherParams
    } = options;

    const parsedUrl = new URL(url);

    const defaultHeaders = {
        Host: parsedUrl.host,
        'User-Agent': useMobileVersion ? FIREFOX_MOBILE_USER_AGENT : FIREFOX_DESKTOP_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': `${languageCode}-${countryCode},${languageCode};q=0.5`,
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
    };

    const requestOpts = {
        ...DEFAULT_HTTP_REQUEST_OPTIONS,
        ...otherParams,
        url,
        method,
        // Users can provide headers in lowercase so we need to make sure
        // that their values are applied, but names are kept upper-case.
        headers: mergeHeaders(headers, defaultHeaders),
        proxyUrl,
        abortFunction,
        ignoreSslErrors,
        insecureHTTPParser: useInsecureHttpParser,
    };

    try {
        return await httpRequest(requestOpts);
    } catch (e) {
        if (e instanceof errors.TimeoutError) {
            throw new TimeoutError(`Request Timed-out after ${requestOpts.timeoutSecs} seconds.`);
        }

        throw e;
    }
};

function mergeHeaders(userHeaders, defaultHeaders) {
    const headers = { ...defaultHeaders, ...userHeaders };
    Object.keys(headers).forEach((key) => {
        const lowerCaseKey = key.toLowerCase();
        const keyIsNotLowerCase = key !== lowerCaseKey;
        // eslint-disable-next-line
        if (keyIsNotLowerCase && headers.hasOwnProperty(lowerCaseKey)) {
            headers[key] = headers[lowerCaseKey];
            delete headers[lowerCaseKey];
        }
    });
    return headers;
}
