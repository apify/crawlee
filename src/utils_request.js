
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
 * @param [options.headers={}]
 *  HTTP headers.
 *  Note that the function generates several headers itself, unless
 *  they are defined in the `headers` parameter, in which case the function leaves them untouched.
 *  For example, even if you define `{ 'Content-Type': null }`, the function doesn't override
 *  the 'Content-Type' header and the request contains none.
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
 * @param [options.gzip=false]
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
 * @param [options.abort]
 *  A function that determines whether the request should be aborted. It is called when the server
 *  responds with the HTTP headers, but before the actual data is downloaded.
 *  The function receives a single argument - an instance of Node's
 *  [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_incomingmessage)
 *  class and it should return `true` if request should be aborted, or `false` otherwise.
 *
 *  @return {{ response, body }}
 *   Returns an object with two properties: `response` is the instance of
 *   Node's [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_incomingmessage) class,
 *   `body` is a `String`, `Buffer` or `Object`, depending on the `encoding` and `json` options.
 */
export const requestBetter = async (options) => {
    // TODO: Implement this
    // TODO: You can use a lot of the code from CheerioCrawler that does abort()
    console.dir(options);
    throw new Error('Not implemented yet');
};

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
 * @return {{ response, body }}
 *  Returns an object with two properties: `response` is the instance of
 *  Node's [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_incomingmessage) class,
 *  `body` is a `String`, `Buffer` or `Object`, depending on the `encoding` and `json` options.
 */
export const requestLikeBrowser = (options) => {
    // TODO: Implement this
    // TODO: This function should use requestBetter(),
    //  perhaps we could pass unknown options to the parent function
    console.dir(options);
    throw new Error('Not implemented yet');

    /* HERE'S SAMPLE CODE YOU CAN USE FOR START

    const gzip = Promise.promisify(zlib.gzip, { context: zlib });
    const gunzip = Promise.promisify(zlib.gunzip, { context: zlib });
    const deflate = Promise.promisify(zlib.deflate, { context: zlib });

    const reqOpts = {
        url,
        // Emulate Firefox HTTP headers
        // TODO: We should move this to apify-js or apify-shared-js
        headers: {
            Host: parsedUrlModified.host,
            'User-Agent': useMobileVersion ? FIREFOX_MOBILE_USER_AGENT : FIREFOX_DESKTOP_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*' + '/' + '*;q=0.8',
            'Accept-Language': languageCode ? `${languageCode}-${countryCode},${languageCode};q=0.5` : '*', // TODO: get this from country !
            'Accept-Encoding': 'gzip, deflate, br',
            DNT: '1',
            Connection: 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        },
        // Return response as raw Buffer
        encoding: null,
    };

    const result = await utils.requestPromised(reqOpts, false);
    let body;

    try {
        // eslint-disable-next-line prefer-destructuring
        body = result.body;

        // Decode response body
        const contentEncoding = result.response.headers['content-encoding'];
        switch (contentEncoding) {
            case 'br':
                body = await brotli.decompress(body);
                break;
            case 'gzip':
                body = await gunzip(body);
                break;
            case 'deflate':
                body = await deflate(body);
                break;
            case 'identity':
            case null:
            case undefined:
                break;
            default:
                throw new Error(`Received unexpected Content-Encoding: ${contentEncoding}`);
        }
        body = body.toString('utf8');

        const { statusCode } = result;
        if (statusCode !== 200) {
            throw new Error(`Received HTTP error response status ${statusCode}`);
        }

        const contentType = result.response.headers['content-type'];
        if (contentType !== 'text/html; charset=UTF-8') {
            throw new Error(`Received unexpected Content-Type: ${contentType}`);
        }

        if (!body) throw new Error('The response body is empty'); */
};
