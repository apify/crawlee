import crypto from 'node:crypto';
import util from 'node:util';
import { z } from 'zod';
import { cryptoRandomObjectId, normalizeUrl } from '@apify/utilities';
import { serviceLocator } from './service_locator.js';
import { keys } from './typedefs.js';
import { parseArgument, schemas } from './validators.js';
const dateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid input: expected a date string',
});
export var RequestState;
(function (RequestState) {
    RequestState[RequestState["UNPROCESSED"] = 0] = "UNPROCESSED";
    RequestState[RequestState["BEFORE_NAV"] = 1] = "BEFORE_NAV";
    RequestState[RequestState["AFTER_NAV"] = 2] = "AFTER_NAV";
    RequestState[RequestState["REQUEST_HANDLER"] = 3] = "REQUEST_HANDLER";
    RequestState[RequestState["DONE"] = 4] = "DONE";
    RequestState[RequestState["ERROR_HANDLER"] = 5] = "ERROR_HANDLER";
    RequestState[RequestState["ERROR"] = 6] = "ERROR";
    RequestState[RequestState["SKIPPED"] = 7] = "SKIPPED";
})(RequestState || (RequestState = {}));
const requestUrlSchema = z.object({ url: z.string() });
// new properties on the Request object breaks serialization
const requestOptionalSchemaShapes = {
    id: z.string().optional(),
    loadedUrl: z.url().optional(),
    uniqueKey: z.string().optional(),
    method: z.string().optional(),
    payload: z.union([z.string(), z.instanceof(Uint8Array)]).optional(),
    noRetry: z.boolean().optional(),
    retryCount: schemas.anyNumber.optional(),
    sessionId: z.string().optional(),
    maxRetries: schemas.anyNumber.optional(),
    errorMessages: schemas.arrayOf(z.string(), 'strings').optional(),
    headers: z.looseObject({}).optional(),
    userData: z.looseObject({}).optional(),
    label: z.string().optional(),
    handledAt: z.union([dateString, z.date()]).optional(),
    keepUrlFragment: z.boolean().optional(),
    useExtendedUniqueKey: z.boolean().optional(),
    alwaysEnqueue: z.boolean().optional(),
    skipNavigation: z.boolean().optional(),
    crawlDepth: schemas.anyNumber
        .refine((value) => value >= 0, 'Expected a number greater than or equal to 0')
        .optional(),
    state: z.enum(RequestState).optional(),
};
// Each schema is wrapped in a single-key object so validation errors carry the property name.
const requestOptionalSchemas = Object.fromEntries(Object.entries(requestOptionalSchemaShapes).map(([key, schema]) => [key, z.object({ [key]: schema })]));
/**
 * Represents a URL to be crawled, optionally including HTTP method, headers, payload and other metadata.
 * The `Request` object also stores information about errors that occurred during processing of the request.
 *
 * Each `Request` instance has the `uniqueKey` property, which can be either specified
 * manually in the constructor or generated automatically from the URL. Two requests with the same `uniqueKey`
 * are considered as pointing to the same web resource. This behavior applies to all Crawlee classes,
 * such as {@apilink RequestList}, {@apilink RequestQueue}, {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler}.
 *
 * > To access and examine the actual request sent over http, with all autofilled headers you can access
 * `response.request` object from the request handler
 *
 * Example use:
 *
 * ```javascript
 * const request = new Request({
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
 * @category Sources
 */
class CrawleeRequest {
    /** Request ID */
    id;
    /** URL of the web page to crawl. */
    url;
    /**
     * An actually loaded URL after redirects, if present. HTTP redirects are guaranteed
     * to be included.
     *
     * When using {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler}, meta tag and JavaScript redirects may,
     * or may not be included, depending on their nature. This generally means that redirects,
     * which happen immediately will most likely be included, but delayed redirects will not.
     */
    loadedUrl;
    /**
     * A unique key identifying the request.
     * Two requests with the same `uniqueKey` are considered as pointing to the same URL.
     */
    uniqueKey;
    /** HTTP method, e.g. `GET` or `POST`. */
    method;
    /** HTTP request payload, e.g. for POST requests. */
    payload;
    /** The `true` value indicates that the request will not be automatically retried on error. */
    noRetry;
    /** Indicates the number of times the crawling of the request has been retried on error. */
    retryCount;
    /** An array of error messages from request processing. */
    errorMessages;
    /** Object with HTTP headers. Key is header name, value is the value. */
    headers;
    /** Private store for the custom user data assigned to the request. */
    #userData = {};
    /**
     * Custom user data assigned to the request.
     *
     * All data stored in `userData` must be JSON-serializable.
     * Storing non-serializable values (e.g. functions, symbols) may result in unexpected results.
     */
    userData = {};
    /**
     * ISO datetime string that indicates the time when the request has been processed.
     * Is `null` if the request has not been crawled yet.
     */
    handledAt;
    /**
     * `Request` parameters including the URL, HTTP method and headers, and others.
     */
    constructor(options) {
        // A bare URL is a common slip — point at the object form instead of a generic type error.
        if (typeof options === 'string') {
            throw new TypeError(`\`Request\` options must be an object, got the string '${options}'. ` +
                'Did you mean `new Request({ url })`?');
        }
        parseArgument(options, schemas.anyObject, 'RequestOptions');
        parseArgument(options, requestUrlSchema, 'RequestOptions');
        // Full-shape validation is slow, because it checks all predicates
        // even if the validated object has only 1 property.
        // This custom validation loop iterates only over existing
        // properties and speeds up the validation cca 3-fold.
        keys(options).forEach((prop) => {
            // skip url, because it is validated above
            if (prop === 'url') {
                return;
            }
            const schema = requestOptionalSchemas[prop];
            const value = options[prop];
            if (schema) {
                parseArgument({ [prop]: value }, schema, 'RequestOptions');
            }
        });
        const { id, url, loadedUrl, uniqueKey, payload, noRetry = false, retryCount = 0, sessionId, maxRetries, errorMessages = [], headers = {}, userData = {}, label, handledAt, keepUrlFragment = false, useExtendedUniqueKey = false, alwaysEnqueue = false, skipNavigation, enqueueStrategy, crawlDepth, } = options;
        let { method = 'GET' } = options;
        method = method.toUpperCase();
        if (method === 'GET' && payload)
            throw new Error('Request with GET method cannot have a payload.');
        if (uniqueKey && alwaysEnqueue) {
            throw new Error('`alwaysEnqueue` cannot be used together with a custom `uniqueKey`.');
        }
        this.id = id;
        this.url = url;
        this.loadedUrl = loadedUrl;
        this.uniqueKey =
            uniqueKey ||
                CrawleeRequest.computeUniqueKey({
                    url,
                    method,
                    payload,
                    keepUrlFragment,
                    useExtendedUniqueKey,
                    alwaysEnqueue,
                });
        this.method = method;
        this.payload = payload;
        this.noRetry = noRetry;
        this.retryCount = retryCount;
        this.errorMessages = [...errorMessages];
        this.headers = { ...headers };
        this.handledAt = handledAt instanceof Date ? handledAt.toISOString() : handledAt;
        if (label) {
            userData.label = label;
        }
        // Read `__crawlee` explicitly - on a `userData` coming from another Request instance the
        // bag is non-enumerable, so the spread alone would silently drop the internal state
        // (e.g. `skipNavigation`) when a request is re-wrapped after a storage round trip.
        this.#userData = { __crawlee: userData.__crawlee ?? {}, ...userData };
        // `userData` must stay an enumerable own accessor — serialization in the storages relies on it
        Object.defineProperties(this, {
            userData: {
                get: () => this.#userData,
                set: (value) => {
                    Object.defineProperties(value, {
                        __crawlee: {
                            value: this.#userData.__crawlee,
                            enumerable: false,
                            writable: true,
                        },
                        toJSON: {
                            value: () => {
                                if (Object.keys(this.#userData.__crawlee).length > 0) {
                                    return {
                                        ...this.#userData,
                                        __crawlee: this.#userData.__crawlee,
                                    };
                                }
                                return this.#userData;
                            },
                            enumerable: false,
                            writable: true,
                        },
                    });
                    this.#userData = value;
                },
                enumerable: true,
            },
        });
        // reassign userData to ensure internal `__crawlee` object is non-enumerable
        this.userData = userData;
        if (skipNavigation != null)
            this.skipNavigation = skipNavigation;
        if (maxRetries != null)
            this.maxRetries = maxRetries;
        if (crawlDepth != null)
            this.userData.__crawlee.crawlDepth ??= crawlDepth;
        if (sessionId)
            this.sessionId = sessionId;
        // If it's already set, don't override it (for instance when fetching from storage)
        if (enqueueStrategy) {
            this.enqueueStrategy ??= enqueueStrategy;
        }
    }
    /**
     * Converts the Crawlee Request object to a `fetch` API Request object.
     * @returns The native `fetch` API Request object.
     */
    intoFetchAPIRequest() {
        return new Request(this.url, {
            method: this.method,
            headers: this.headers,
            body: this.payload,
        });
    }
    /**
     * Tells the crawler processing this request to skip the navigation and process the request directly.
     *
     * When this is set to `true`, the crawling context will not contain the results of the navigation
     * (e.g. `response`, `body`, `contentType`, `$` or `request.loadedUrl`).
     * Accessing these properties will throw a {@apilink NavigationSkippedError} at runtime.
     */
    get skipNavigation() {
        return this.userData.__crawlee?.skipNavigation ?? false;
    }
    /**
     * Tells the crawler processing this request to skip the navigation and process the request directly.
     *
     * When this is set to `true`, the crawling context will not contain the results of the navigation
     * (e.g. `response`, `body`, `contentType`, `$` or `request.loadedUrl`).
     * Accessing these properties will throw a {@apilink NavigationSkippedError} at runtime.
     */
    set skipNavigation(value) {
        if (!this.userData.__crawlee) {
            this.userData.__crawlee = { skipNavigation: value };
        }
        else {
            this.userData.__crawlee.skipNavigation = value;
        }
    }
    /**
     * Depth of the request in the current crawl tree.
     * Note that this is dependent on the crawler setup and might produce unexpected results when used with multiple crawlers.
     */
    get crawlDepth() {
        return this.userData.__crawlee?.crawlDepth ?? 0;
    }
    /**
     * Depth of the request in the current crawl tree.
     * Note that this is dependent on the crawler setup and might produce unexpected results when used with multiple crawlers.
     */
    set crawlDepth(value) {
        this.userData.__crawlee ??= {};
        this.userData.__crawlee.crawlDepth = value;
    }
    /** ID of a session to use for this request. When set, the crawler will fetch this session from the session pool instead of creating a new one. */
    get sessionId() {
        return this.userData.__crawlee?.sessionId;
    }
    set sessionId(value) {
        this.userData.__crawlee ??= {};
        this.userData.__crawlee.sessionId = value;
    }
    /** shortcut for getting `request.userData.label` */
    get label() {
        return this.userData.label;
    }
    /** shortcut for setting `request.userData.label` */
    set label(value) {
        this.userData.label = value;
    }
    /** Maximum number of retries for this request. Allows to override the global `maxRequestRetries` option of `BasicCrawler`. */
    get maxRetries() {
        return this.userData.__crawlee?.maxRetries;
    }
    /** Maximum number of retries for this request. Allows to override the global `maxRequestRetries` option of `BasicCrawler`. */
    set maxRetries(value) {
        if (!this.userData.__crawlee) {
            this.userData.__crawlee = { maxRetries: value };
        }
        else {
            this.userData.__crawlee.maxRetries = value;
        }
    }
    /** Describes the request's current lifecycle state. */
    get state() {
        return this.userData.__crawlee?.state ?? RequestState.UNPROCESSED;
    }
    /** Describes the request's current lifecycle state. */
    set state(value) {
        if (!this.userData.__crawlee) {
            this.userData.__crawlee = { state: value };
        }
        else {
            this.userData.__crawlee.state = value;
        }
    }
    /**
     * Reason for skipping this request.
     */
    get skippedReason() {
        return this.userData.__crawlee?.skippedReason;
    }
    /**
     * Reason for skipping this request.
     */
    set skippedReason(value) {
        if (!this.userData.__crawlee) {
            this.userData.__crawlee = { skippedReason: value };
        }
        else {
            this.userData.__crawlee.skippedReason = value;
        }
    }
    get enqueueStrategy() {
        return this.userData.__crawlee?.enqueueStrategy;
    }
    set enqueueStrategy(value) {
        if (!this.userData.__crawlee) {
            this.userData.__crawlee = { enqueueStrategy: value };
        }
        else {
            this.userData.__crawlee.enqueueStrategy = value;
        }
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
     * @param errorOrMessage Error object or error message to be stored in the request.
     * @param [options]
     */
    pushErrorMessage(errorOrMessage, options = {}) {
        const { omitStack } = options;
        let message;
        const type = typeof errorOrMessage;
        if (type === 'object') {
            if (!errorOrMessage) {
                message = 'null';
            }
            else if (errorOrMessage instanceof Error) {
                message = omitStack
                    ? errorOrMessage.message
                    : // .stack includes the message
                        errorOrMessage.stack;
            }
            else if (Reflect.has(Object(errorOrMessage), 'message')) {
                message = Reflect.get(Object(errorOrMessage), 'message');
            }
            else if (errorOrMessage.toString() !== '[object Object]') {
                message = errorOrMessage.toString();
            }
            else {
                try {
                    message = util.inspect(errorOrMessage);
                }
                catch (err) {
                    message = 'Unable to extract any message from the received object.';
                }
            }
        }
        else if (type === 'undefined') {
            message = 'undefined';
        }
        else {
            message = errorOrMessage.toString();
        }
        this.errorMessages.push(message);
    }
    /** @internal */
    static computeUniqueKey({ url, method = 'GET', payload, keepUrlFragment = false, useExtendedUniqueKey = false, alwaysEnqueue = false, }) {
        const normalizedMethod = method.toUpperCase();
        const normalizedUrl = normalizeUrl(url, keepUrlFragment) || url; // It returns null when url is invalid, causing weird errors.
        let uniqueKey;
        if (!useExtendedUniqueKey) {
            if (normalizedMethod !== 'GET' && payload) {
                serviceLocator
                    .getLogger()
                    .warningOnce(`We've encountered a ${normalizedMethod} Request with a payload. ` +
                    'This is fine. Just letting you know that if your requests point to the same URL ' +
                    'and differ only in method and payload, you should see the "useExtendedUniqueKey" option of Request constructor.');
            }
            uniqueKey = normalizedUrl;
        }
        else {
            const payloadHash = payload ? CrawleeRequest.hashPayload(payload) : '';
            uniqueKey = `${normalizedMethod}|${payloadHash}|${normalizedUrl}`;
        }
        if (alwaysEnqueue) {
            uniqueKey = `${cryptoRandomObjectId(17)}|${uniqueKey}`;
        }
        return uniqueKey;
    }
    /** @internal */
    static hashPayload(payload) {
        return crypto.createHash('sha256').update(payload).digest('base64').replace(/[+/=]/g, '').substring(0, 8);
    }
}
export { CrawleeRequest as Request };
