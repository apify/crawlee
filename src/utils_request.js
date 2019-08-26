import contentType from 'content-type';
import * as url from 'url';
import _ from 'underscore';
import httpRequest from '@apify/http-request';

export const FIREFOX_MOBILE_USER_AGENT = 'Mozilla/5.0 (Android; Mobile; rv:14.0) Gecko/14.0 Firefox/14.0';
export const FIREFOX_DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:68.0) Gecko/20100101 Firefox/68.0';

export const REQUEST_AS_BROWSER_DEFAULT_OPTIONS = {
    countryCode: 'US',
    languageCode: 'en',
    headers: {},
    method: 'GET',
    useMobileVersion: false,
    useBrotli: true,
    json: false,
    abortFunction: (res) => {
        const { type } = contentType.parse(res.headers['content-type']);
        return res.statusCode === 406 || type.toLowerCase() !== 'text/html';
    },
    useCaseSensitiveHeaders: true,
    useStream: false,
    proxyUrl: null,
};
/**
 * Sends a HTTP request that looks like a request sent by a web browser,
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
 * @param options.url
 *  URL of the target endpoint. Supports both HTTP and HTTPS schemes.
 * @param [options.method=GET]
 *  HTTP method.
 * @param [options.headers]
 *  Additional HTTP headers to add. It's only recommended to use this option,
 *  with headers that are typically added by websites, such as cookies. Overriding
 *  default browser headers will remove the masking this function provides.
 * @param [options.languageCode=en]
 *  Two-letter ISO 639 language code.
 * @param [options.countryCode=US]
 *  Two-letter ISO 3166 country code.
 * @param [options.isMobile]
 *  If `true`, the function uses User-Agent of a mobile browser.
 * @param [options.abortFunction]
 *  Function accepts `response` object as a single parameter and should return true or false.
 *  If function returns true request gets aborted. This function is passed to the
 *  (@apify/http-request)[https://www.npmjs.com/package/@apify/http-request] NPM package.
 *
 * @return {Promise<http.IncomingMesage|stream.Readable>}
 * @memberOf utils
 * @name requestAsBrowser
 */
export const requestAsBrowser = async (options) => {
    const opts = _.defaults({}, options, REQUEST_AS_BROWSER_DEFAULT_OPTIONS);

    const parsedUrl = url.parse(opts.url);

    const defaultHeaders = {
        Host: parsedUrl.host,
        'User-Agent': opts.useMobileVersion ? FIREFOX_MOBILE_USER_AGENT : FIREFOX_DESKTOP_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': `${opts.languageCode}-${opts.countryCode},${opts.languageCode};q=0.5`,
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
    };
    opts.headers = _.defaults({}, opts.headers, defaultHeaders);
    return httpRequest(opts);
};
