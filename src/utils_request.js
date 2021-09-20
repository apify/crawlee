import { gotScraping } from 'got-scraping';
import ow from 'ow';
import log from './utils_log';

/* eslint-disable no-unused-vars,import/named,import/order */
import { IncomingMessage } from 'http';
/* eslint-enable no-unused-vars,import/named,import/order */

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
 *  Function accepts `response` object as a single parameter and should return `true` or `false`.
 *  If function returns true, request gets aborted.
 * @property {boolean} [useHttp2=true]
 *  If set to false, it will prevent use of HTTP2 requests. This is strongly discouraged. Websites
 *  expect HTTP2 connections, because browsers use HTTP2 by default. It will automatically downgrade
 *  to HTTP/1.1 for websites that do not support HTTP2. For Node 10 this option is always set to `false`
 *  because Node 10 does not support HTTP2 very well. Upgrade to Node 12 for better performance.
 * @property {object} [sessionToken]
 *  A unique object used to generate browser headers. By default, new headers are generated on every call.
 *  Set this option to make these headers persistent.
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
 * fully emulating browser's HTTP headers. It uses HTTP2 by default for Node 12+.
 *
 * This function is useful for web scraping of websites that send the full HTML in the first response.
 * Thanks to this function, the target web server has no simple way to find out the request
 * hasn't been sent by a human's web browser. Using a headless browser for such requests
 * is an order of magnitude more resource-intensive than this function.
 *
 * The function emulates the Chrome and Firefox web browsers. If you want more control
 * over the browsers and their versions, use the `headerGeneratorOptions` property.
 * You can find more info in the readme of the [`header-generator`](https://github.com/apify/header-generator) library.
 *
 * Internally, the function uses the [`got-scraping`](https://github.com/apify/got-scraping) library to perform the request.
 * All `options` not recognized by this function are passed to it so see it for more details.
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
 * @return {Promise<RequestAsBrowserResult>} The result can be various objects, but it will always be like a
 * [Node.js HTTP response stream](https://nodejs.org/api/http.html#http_class_http_incomingmessage)
 * with a 'body' property for the parsed response body, unless the 'stream' option is used.
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
        timeoutSecs: ow.optional.number,
        throwOnHttpErrors: ow.optional.boolean,
        headerGeneratorOptions: ow.optional.object,
        stream: ow.optional.boolean,
        decodeBody: ow.optional.boolean,
        sessionToken: ow.optional.object,
    }));

    ow(options, 'RequestAsBrowserOptions', ow.object.validate((opts) => ({
        validator: areBodyOptionsCompatible(opts),
        message: (label) => `The 'payload', 'body', 'json' and 'form' options of ${label} are mutually exclusive.`,
    })));

    // We created the `got-scraping` package which replaced underlying @apify/http-request.
    // At the same time, we want users to be able to use requestAsBrowser without breaking changes.
    // So we do a lot of property mapping here, to make sure that everything works as expected.
    // TODO Update this with SDK v3 and use `got-scraping` API directly.
    const {
        payload, // alias for body to allow direct passing of our Request objects
        json,
        headerGeneratorOptions,
        languageCode = 'en',
        countryCode = 'US',
        useMobileVersion = false,
        abortFunction = () => false,
        ignoreSslErrors = true,
        useInsecureHttpParser = true,
        useHttp2 = true,
        timeoutSecs = 30,
        throwOnHttpErrors = false,
        stream = false,
        decodeBody = true,
        forceUrlEncoding, // TODO remove in v3. It's not used, but we keep it here to prevent validation errors in got.
        ...gotParams
    } = options;

    const gotScrapingOptions = {
        insecureHTTPParser: useInsecureHttpParser,
        http2: useHttp2,
        timeout: { request: timeoutSecs * 1000 },
        throwHttpErrors: throwOnHttpErrors,
        isStream: stream,
        decompress: decodeBody,
        // We overwrite the above arguments because we want to give the official
        // got interface a priority over our requestAsBrowser one.
        // E.g. { isStream: false, stream: true } should produce { isStream: false }.
        ...gotParams,
        https: {
            ...gotParams.https,
            rejectUnauthorized: !ignoreSslErrors,
        },
    };

    // Encode the URL if necessary
    gotScrapingOptions.url = fixUrl(gotScrapingOptions.url);

    // Order is important
    normalizePayloadOption(payload, gotScrapingOptions);
    normalizeJsonOption(json, gotScrapingOptions);
    ensureCorrectHttp2Headers(gotScrapingOptions);
    maybeAddAbortHook(abortFunction, gotScrapingOptions);
    if (!headerGeneratorOptions) {
        // Values that respect old requestAsBrowser user-agents and settings
        gotScrapingOptions.headerGeneratorOptions = {
            devices: useMobileVersion ? ['mobile'] : ['desktop'],
            locales: [`${languageCode}-${countryCode}`],
        };
    } else {
        gotScrapingOptions.headerGeneratorOptions = headerGeneratorOptions;
    }

    // Return the promise directly
    if (!gotScrapingOptions.isStream) {
        return gotScraping(gotScrapingOptions);
    }

    // abortFunction must be handled separately for streams :(
    const duplexStream = gotScraping(gotScrapingOptions);

    ensureRequestIsDispatched(duplexStream, gotScrapingOptions);

    return new Promise((resolve, reject) => {
        duplexStream
            .on('error', reject)
            .on('response', (res) => {
                try {
                    const shouldAbort = abortFunction(res);
                    if (shouldAbort) {
                        const err = new Error(`Request for ${gotScrapingOptions.url} aborted due to abortFunction.`);
                        duplexStream.destroy(err);
                        return reject(err);
                    }
                } catch (e) {
                    duplexStream.destroy(e);
                    return reject(e);
                }

                addResponsePropertiesToStream(duplexStream, res);

                return resolve(duplexStream);
            });
    });
};

/**
 * Fixes malformed URIs. Takes ~13s per 1M executions.
 * @example fixUrl('https://example.com/%cf') => 'https://example.com/%EF%BF%BD'
 * @example fixUrl('https://example.com/%xx') => 'https://example.com/%25xx'
 * @example fixUrl('https://example.com/%0fexample%cc%0f') => 'https://example.com/%0Fexample%EF%BF%BD%0F'
 * @see https://tc39.es/ecma262/multipage/global-object.html#sec-decodeuri-encodeduri
 * @param {string} url
 * @private
 */
function fixUrl(url) {
    const hexChars = '0123456789abcdefABCDEF';
    let chunks = '';

    let index = url.indexOf('%');
    while (index !== -1 && index < url.length) {
        const start = index;

        do {
            const buffer = url.slice(index + 1, index + 3);

            if (hexChars.indexOf(buffer[0]) !== -1 && hexChars.indexOf(buffer[1]) !== -1) {
                chunks += buffer;

                index += 3;
            } else {
                chunks += '25'; // %

                index += 1;
                break;
            }
        } while (url[index] === '%');

        if (chunks.length) {
            const encoded = encodeURI(Buffer.from(chunks, 'hex').toString());
            url = `${url.slice(0, start)}${encoded}${url.slice(index)}`;

            index = start + encoded.length;
            chunks = '';
        }

        index = url.indexOf('%', index);
    }

    return url;
}

/**
 * `got` has a `body` option and 2 helpers, `json` and `form`, to provide specific bodies.
 * Those options are mutually exclusive. `requestAsBrowser` also supports `payload` as
 * an alias of `body`. It must be exclusive as well.
 * @param {RequestAsBrowserOptions} requestAsBrowserOptions
 * @return {boolean}
 * @private
 * @ignore
 */
function areBodyOptionsCompatible(requestAsBrowserOptions) {
    const { payload, json, body, form } = requestAsBrowserOptions;
    // A boolean is old requestAsBrowser interface and not a real "body"
    // See the normalizeJsonOption function.
    const jsonBody = typeof json === 'boolean' ? undefined : json;

    const possibleOpts = [payload, jsonBody, body, form];
    const usedOpts = possibleOpts.filter((opt) => opt !== undefined);

    // Only a single option out of the 4 can be used.
    return usedOpts.length <= 1;
}

/**
 * got-scraping uses 'body', but we also support 'payload' from {@link Request}.
 * @param {string|Buffer} payload
 * @param {GotScrapingOptions} gotScrapingOptions
 * @ignore
 * @private
 */
function normalizePayloadOption(payload, gotScrapingOptions) {
    if (payload !== undefined) gotScrapingOptions.body = payload;
}

/**
 * `json` is a boolean flag in `requestAsBrowser`, but a `body` alias that
 * adds a 'content-type: application/json' header in got. To stay backwards
 * compatible we need to figure out which option the user provided.
 * @param {*} json
 * @param {GotScrapingOptions} gotScrapingOptions
 * @ignore
 * @private
 */
function normalizeJsonOption(json, gotScrapingOptions) {
    // If it's a boolean, then it's the old requestAsBrowser API.
    // If it's true, it means the user expects a JSON response.
    const deprecationMessage = `"options.json" of type: Boolean is deprecated.`
        + 'If you expect a JSON response, use "options.responseType = \'json\'"'
        + 'Use "options.json" with a plain object to provide a JSON body.';
    if (json === true) {
        log.deprecated(deprecationMessage);
        gotScrapingOptions.responseType = 'json';
        gotScrapingOptions.https.ciphers = undefined;
    } else if (json === false) {
        log.deprecated(deprecationMessage);
        // Do nothing, it means the user expects something else than JSON.
    } else {
        // If it's something else, we let `got` handle it as a request body.
        gotScrapingOptions.json = json;
    }
}

/**
 * 'connection' and 'host' headers are forbidden when using HTTP2. We delete
 * them from user-provided headers because we switched the default from HTTP1 to 2.
 * @param {GotScrapingOptions} gotScrapingOptions
 * @ignore
 * @private
 */
function ensureCorrectHttp2Headers(gotScrapingOptions) {
    if (gotScrapingOptions.http2 && gotScrapingOptions.headers) {
        gotScrapingOptions.headers = { ...gotScrapingOptions.headers };

        // eslint-disable-next-line no-restricted-syntax, guard-for-in
        for (const key in gotScrapingOptions.headers) {
            const lkey = key.toLowerCase();

            if (lkey === 'connection' || lkey === 'host') {
                delete gotScrapingOptions.headers[key];
            }
        }
    }
}

/**
 * `abortFunction` is an old `requestAsBrowser` interface for aborting requests before
 * the response body is read to save bandwidth.
 * @param {function} abortFunction
 * @param {GotScrapingOptions} gotScrapingOptions
 * @ignore
 * @private
 */
function maybeAddAbortHook(abortFunction, gotScrapingOptions) {
    // Stream aborting must be handled on the response object because `got`
    // does not execute `afterResponse` hooks for streams :(
    if (gotScrapingOptions.isStream) return;

    const abortHook = (response) => {
        const shouldAbort = abortFunction(response);
        if (shouldAbort) {
            throw new Error(`Request for ${gotScrapingOptions.url} aborted due to abortFunction.`);
        }
        return response;
    };

    const { hooks } = gotScrapingOptions;
    const fixedHooks = {
        ...hooks,
        afterResponse: [
            ...((hooks && hooks.afterResponse) || []),
            abortHook,
        ],
    };

    gotScrapingOptions.hooks = fixedHooks;
}

/**
 * 'got' will not dispatch non-GET request stream until a body is provided.
 * @param {stream.Duplex} duplexStream
 * @param {GotScrapingOptions} gotScrapingOptions
 */
function ensureRequestIsDispatched(duplexStream, gotScrapingOptions) {
    const { method } = gotScrapingOptions;
    const bodyIsEmpty = gotScrapingOptions.body === undefined
        && gotScrapingOptions.json === undefined
        && gotScrapingOptions.form === undefined;

    if (method && method.toLowerCase() !== 'get' && bodyIsEmpty) {
        duplexStream.end();
    }
}

/**
 * @param {RequestAsBrowserOptions} options
 * @ignore
 * @private
 */
function logDeprecatedOptions(options) {
    const deprecatedOptions = [
        // 'json' is handled in the JSON handler, because it has a conflict of types
        ['languageCode', 'headerGeneratorOptions.locales'],
        ['countryCode', 'headerGeneratorOptions.locales'],
        ['useMobileVersion', 'headerGeneratorOptions.devices'],
        ['payload', 'body'],
        ['useHttp2', 'http2'],
        ['stream', 'isStream'],
        ['decodeBody', 'decompress'],
        ['throwOnHttpErrors', 'throwHttpErrors'],
        ['timeoutSecs', 'timeout.request'],
        ['ignoreSslErrors', 'https.rejectUnauthorized'],
        ['abortFunction'], // custom message below
    ];

    for (const [deprecatedOption, newOption] of deprecatedOptions) {
        if (options[deprecatedOption] !== undefined) {
            // This will log only for the first property thanks to log.deprecated logging only once.
            const initialMessage = 'requestAsBrowser internal implementation has been replaced with the got-scraping module. '
                + 'To make the switch without breaking changes, we mapped all existing options to the got-scraping options. '
                + 'This mapping will be removed in SDK v3 and we advise you to update your code using the hints below: ';
            log.deprecated(initialMessage);

            if (deprecatedOption === 'abortFunction') {
                log.deprecated(`"options.${deprecatedOption}" is deprecated.`
                    + 'Use a request cancellation process appropriate for your request type.'
                    + 'Either a Stream or a Promise. See Got documentation for more info: https://github.com/sindresorhus/got');
            } else {
                log.deprecated(`"options.${deprecatedOption}" is deprecated. Use "options.${newOption}" instead.`);
            }
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

    response.on('end', () => {
        Object.assign(stream.rawTrailers, response.rawTrailers);
        Object.assign(stream.trailers, response.trailers);

        stream.complete = response.complete;
    });

    for (const prop of properties) {
        if (!(prop in stream)) {
            stream[prop] = response[prop];
        }
    }

    return stream;
}
