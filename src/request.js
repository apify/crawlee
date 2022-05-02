import { normalizeUrl } from '@apify/utilities';
import crypto from 'crypto';
import ow, { ArgumentError } from 'ow';
import util from 'util';
import defaultLog from './utils_log';

// new properties on the Request object breaks serialization
const log = defaultLog.child({ prefix: 'Request' });

export function hashPayload(payload) {
    return crypto
        .createHash('sha256')
        .update(payload)
        .digest('base64')
        .replace(/(\+|\/|=)/g, '')
        .substr(0, 8);
}

const requestOptionalPredicates = {
    id: ow.optional.string,
    loadedUrl: ow.optional.string.url,
    uniqueKey: ow.optional.string,
    method: ow.optional.string,
    payload: ow.optional.any(ow.string, ow.buffer),
    noRetry: ow.optional.boolean,
    retryCount: ow.optional.number,
    errorMessages: ow.optional.array.ofType(ow.string),
    headers: ow.optional.object,
    userData: ow.optional.object,
    handledAt: ow.optional.any(ow.string.date, ow.date),
    keepUrlFragment: ow.optional.boolean,
    useExtendedUniqueKey: ow.optional.boolean,
};

/**
 * Represents a URL to be crawled, optionally including HTTP method, headers, payload and other metadata.
 * The `Request` object also stores information about errors that occurred during processing of the request.
 *
 * Each `Request` instance has the `uniqueKey` property, which can be either specified
 * manually in the constructor or generated automatically from the URL. Two requests with the same `uniqueKey`
 * are considered as pointing to the same web resource. This behavior applies to all Apify SDK classes,
 * such as {@link RequestList}, {@link RequestQueue}, {@link PuppeteerCrawler} or {@link PlaywrightCrawler}.
 *
 * Example use:
 *
 * ```javascript
 * const request = new Apify.Request({
 *     url: 'http://www.example.com',
 *     headers: { Accept: 'application/json' },
 * });
 *
 * ...
 *
 * request.userData.foo = 'bar';
 * request.pushErrorMessage(new Error('Request failed!'));
 *
 * ...
 *
 * const foo = request.userData.foo;
 * ```
 *
 * @property {string} id
 *   Request ID
 * @property {string} url
 *   URL of the web page to crawl.
 * @property {string} loadedUrl
 *   An actually loaded URL after redirects, if present. HTTP redirects are guaranteed
 *   to be included.
 *
 *   When using {@link PuppeteerCrawler} or {@link PlaywrightCrawler}, meta tag and JavaScript redirects may,
 *   or may not be included, depending on their nature. This generally means that redirects,
 *   which happen immediately will most likely be included, but delayed redirects will not.
 * @property {string} uniqueKey
 *   A unique key identifying the request.
 *   Two requests with the same `uniqueKey` are considered as pointing to the same URL.
 * @property {string} method
 *   HTTP method, e.g. `GET` or `POST`.
 * @property {(string|Buffer)} payload
 *   HTTP request payload, e.g. for POST requests.
 * @property {boolean} noRetry
 *   The `true` value indicates that the request will not be automatically retried on error.
 * @property {number} retryCount
 *   Indicates the number of times the crawling of the request has been retried on error.
 * @property {string[]} errorMessages
 *   An array of error messages from request processing.
 * @property {Object<string, string>} headers
 *   Object with HTTP headers. Key is header name, value is the value.
 * @property {Object<string, *>} userData
 *   Custom user data assigned to the request.
 * @property {Date} handledAt
 *   Indicates the time when the request has been processed.
 *   Is `null` if the request has not been crawled yet.
 */
class Request {
    /**
     * @param {RequestOptions} options
     * `Request` parameters including the URL, HTTP method and headers, and others.
     */
    constructor(options) {
        ow(options, 'RequestOptions', ow.object);
        ow(options.url, 'RequestOptions.url', ow.string.url);
        // 'ow' validation is slow, because it checks all predicates
        // even if the validated object has only 1 property.
        // This custom validation loop iterates only over existing
        // properties and speeds up the validation cca 3-fold.
        // See https://github.com/sindresorhus/ow/issues/193
        Object.keys(options).forEach((prop) => {
            const predicate = requestOptionalPredicates[prop];
            const value = options[prop];
            if (predicate) {
                ow(value, `RequestOptions.${prop}`, predicate);
                // 'url' is checked above because it's not optional
            } else if (prop !== 'url') {
                const msg = `Did not expect property \`${prop}\` to exist, got \`${value}\` in object \`RequestOptions\``;
                throw new ArgumentError(msg, this.constructor);
            }
        });

        const {
            id,
            url,
            loadedUrl,
            uniqueKey,
            method = 'GET',
            payload,
            noRetry = false,
            retryCount = 0,
            errorMessages = [],
            headers = {},
            userData = {},
            handledAt,
            keepUrlFragment = false,
            useExtendedUniqueKey = false,
        } = options;

        if (method === 'GET' && payload) throw new Error('Request with GET method cannot have a payload.');

        this.id = id;
        this.url = url;
        this.loadedUrl = loadedUrl;
        this.uniqueKey = uniqueKey || this._computeUniqueKey({ url, method, payload, keepUrlFragment, useExtendedUniqueKey });
        this.method = method;
        this.payload = payload;
        this.noRetry = noRetry;
        this.retryCount = retryCount;
        this.errorMessages = [...errorMessages];
        // @property are ignored when reassigning, needs to enforced set again,
        // otherwise the type will be {}
        /** @type {Object<string, string>} */
        this.headers = { ...headers };
        /** @type {Object<string, any>} */
        this.userData = { ...userData };
        // Requests received from API will have ISOString dates,
        // but we want to have a Date instance.
        this.handledAt = typeof handledAt === 'string'
            ? new Date(handledAt)
            : handledAt;
    }

    /**
     * Stores information about an error that occurred during processing of this request.
     *
     * You should always use Error instances when throwing errors in JavaScript.
     *
     * Nevertheless, to improve the debugging experience when using third party libraries
     * that may not always throw an Error instance, the function performs a type
     * inspection of the passed argument and attempts to extract as much information
     * as possible, since just throwing a bad type error makes any debugging rather difficult.
     *
     * @param {(Error|string)} errorOrMessage Error object or error message to be stored in the request.
     * @param {object} [options]
     * @param {boolean} [options.omitStack=false] Only push the error message without stack trace when true.
     */
    pushErrorMessage(errorOrMessage, options = {}) {
        const { omitStack } = options;
        let message;
        const type = typeof errorOrMessage;
        if (type === 'object') {
            if (!errorOrMessage) {
                message = 'null';
            } else if (errorOrMessage instanceof Error) {
                message = omitStack
                    ? errorOrMessage.message
                    // .stack includes the message
                    : errorOrMessage.stack;
            } else if (errorOrMessage.message) {
                message = errorOrMessage.message;
            } else if (errorOrMessage.toString() !== '[object Object]') {
                message = errorOrMessage.toString();
            } else {
                try {
                    message = util.inspect(errorOrMessage);
                } catch (err) {
                    message = 'Unable to extract any message from the received object.';
                }
            }
        } else if (type === 'undefined') {
            message = 'undefined';
        } else {
            message = errorOrMessage.toString();
        }

        this.errorMessages.push(message);
    }

    /**
     * @ignore
     * @protected
     * @internal
     */
    _computeUniqueKey({ url, method, payload, keepUrlFragment, useExtendedUniqueKey }) {
        const normalizedMethod = method.toUpperCase();
        const normalizedUrl = normalizeUrl(url, keepUrlFragment) || url; // It returns null when url is invalid, causing weird errors.
        if (!useExtendedUniqueKey) {
            if (normalizedMethod !== 'GET' && payload) {
                // Using log.deprecated to log only once. We should add log.once or some such.
                log.deprecated(`We've encountered a ${normalizedMethod} Request with a payload. `
                    + 'This is fine. Just letting you know that if your requests point to the same URL '
                    + 'and differ only in method and payload, you should see the "useExtendedUniqueKey" option of Request constructor.');
            }
            return normalizedUrl;
        }
        const payloadHash = payload ? hashPayload(payload) : '';
        return `${normalizedMethod}(${payloadHash}):${normalizedUrl}`;
    }
}

export default Request;

/**
 * Specifies required and optional fields for constructing a {@link Request}.
 *
 * @typedef RequestOptions
 * @property {string} url URL of the web page to crawl. It must be a non-empty string.
 * @property {string} [uniqueKey] A unique key identifying the request.
 *   Two requests with the same `uniqueKey` are considered as pointing to the same URL.
 *
 *   If `uniqueKey` is not provided, then it is automatically generated by normalizing the URL.
 *   For example, the URL of `HTTP://www.EXAMPLE.com/something/` will produce the `uniqueKey`
 *   of `http://www.example.com/something`.
 *
 *   The `keepUrlFragment` option determines whether URL hash fragment is included in the `uniqueKey` or not.
 *
 *   The `useExtendedUniqueKey` options determines whether method and payload are included in the `uniqueKey`,
 *   producing a `uniqueKey` in the following format: `METHOD(payloadHash):normalizedUrl`. This is useful
 *   when requests point to the same URL, but with different methods and payloads. For example: form submits.
 *
 *   Pass an arbitrary non-empty text value to the `uniqueKey` property
 *   to override the default behavior and specify which URLs shall be considered equal.
 * @property {string} [method='GET']
 * @property {(string|Buffer)} [payload]
 *   HTTP request payload, e.g. for POST requests.
 * @property {Object<string,string>} [headers]
 *   HTTP headers in the following format:
 *   ```
 *   {
 *       Accept: 'text/html',
 *       'Content-Type': 'application/json'
 *   }
 *   ```
 * @property {Object<string,*>} [userData]
 *   Custom user data assigned to the request. Use this to save any request related data to the
 *   request's scope, keeping them accessible on retries, failures etc.
 * @property {boolean} [keepUrlFragment=false]
 *   If `false` then the hash part of a URL is removed when computing the `uniqueKey` property.
 *   For example, this causes the `http://www.example.com#foo` and `http://www.example.com#bar` URLs
 *   to have the same `uniqueKey` of `http://www.example.com` and thus the URLs are considered equal.
 *   Note that this option only has an effect if `uniqueKey` is not set.
 * @property {boolean} [useExtendedUniqueKey=false]
 *   If `true` then the `uniqueKey` is computed not only from the URL, but also from the method and payload
 *   properties. This is useful when making requests to the same URL that are differentiated by method
 *   or payload, such as form submit navigations in browsers.
 */
