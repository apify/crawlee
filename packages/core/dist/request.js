"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Request = exports.RequestState = void 0;
const tslib_1 = require("tslib");
const utilities_1 = require("@apify/utilities");
const node_crypto_1 = tslib_1.__importDefault(require("node:crypto"));
const ow_1 = tslib_1.__importStar(require("ow"));
const node_util_1 = tslib_1.__importDefault(require("node:util"));
const log_1 = require("./log");
const typedefs_1 = require("./typedefs");
// new properties on the Request object breaks serialization
const log = log_1.log.child({ prefix: 'Request' });
const requestOptionalPredicates = {
    id: ow_1.default.optional.string,
    loadedUrl: ow_1.default.optional.string.url,
    uniqueKey: ow_1.default.optional.string,
    method: ow_1.default.optional.string,
    payload: ow_1.default.optional.any(ow_1.default.string, ow_1.default.buffer),
    noRetry: ow_1.default.optional.boolean,
    retryCount: ow_1.default.optional.number,
    errorMessages: ow_1.default.optional.array.ofType(ow_1.default.string),
    headers: ow_1.default.optional.object,
    userData: ow_1.default.optional.object,
    label: ow_1.default.optional.string,
    handledAt: ow_1.default.optional.any(ow_1.default.string.date, ow_1.default.date),
    keepUrlFragment: ow_1.default.optional.boolean,
    useExtendedUniqueKey: ow_1.default.optional.boolean,
    skipNavigation: ow_1.default.optional.boolean,
    state: ow_1.default.optional.number.greaterThanOrEqual(0).lessThanOrEqual(6),
};
var RequestState;
(function (RequestState) {
    RequestState[RequestState["UNPROCESSED"] = 0] = "UNPROCESSED";
    RequestState[RequestState["BEFORE_NAV"] = 1] = "BEFORE_NAV";
    RequestState[RequestState["AFTER_NAV"] = 2] = "AFTER_NAV";
    RequestState[RequestState["REQUEST_HANDLER"] = 3] = "REQUEST_HANDLER";
    RequestState[RequestState["DONE"] = 4] = "DONE";
    RequestState[RequestState["ERROR_HANDLER"] = 5] = "ERROR_HANDLER";
    RequestState[RequestState["ERROR"] = 6] = "ERROR";
})(RequestState = exports.RequestState || (exports.RequestState = {}));
/**
 * Represents a URL to be crawled, optionally including HTTP method, headers, payload and other metadata.
 * The `Request` object also stores information about errors that occurred during processing of the request.
 *
 * Each `Request` instance has the `uniqueKey` property, which can be either specified
 * manually in the constructor or generated automatically from the URL. Two requests with the same `uniqueKey`
 * are considered as pointing to the same web resource. This behavior applies to all Crawlee classes,
 * such as {@apilink RequestList}, {@apilink RequestQueue}, {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler}.
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
class Request {
    /**
     * `Request` parameters including the URL, HTTP method and headers, and others.
     */
    constructor(options) {
        /** Request ID */
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** URL of the web page to crawl. */
        Object.defineProperty(this, "url", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * An actually loaded URL after redirects, if present. HTTP redirects are guaranteed
         * to be included.
         *
         * When using {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler}, meta tag and JavaScript redirects may,
         * or may not be included, depending on their nature. This generally means that redirects,
         * which happen immediately will most likely be included, but delayed redirects will not.
         */
        Object.defineProperty(this, "loadedUrl", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * A unique key identifying the request.
         * Two requests with the same `uniqueKey` are considered as pointing to the same URL.
         */
        Object.defineProperty(this, "uniqueKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** HTTP method, e.g. `GET` or `POST`. */
        Object.defineProperty(this, "method", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** HTTP request payload, e.g. for POST requests. */
        Object.defineProperty(this, "payload", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** The `true` value indicates that the request will not be automatically retried on error. */
        Object.defineProperty(this, "noRetry", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** Indicates the number of times the crawling of the request has been retried on error. */
        Object.defineProperty(this, "retryCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** An array of error messages from request processing. */
        Object.defineProperty(this, "errorMessages", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** Object with HTTP headers. Key is header name, value is the value. */
        Object.defineProperty(this, "headers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** Private store for the custom user data assigned to the request. */
        Object.defineProperty(this, "_userData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        /** Custom user data assigned to the request. */
        Object.defineProperty(this, "userData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        /**
         * ISO datetime string that indicates the time when the request has been processed.
         * Is `null` if the request has not been crawled yet.
         */
        Object.defineProperty(this, "handledAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        (0, ow_1.default)(options, 'RequestOptions', ow_1.default.object);
        (0, ow_1.default)(options.url, 'RequestOptions.url', ow_1.default.string);
        // 'ow' validation is slow, because it checks all predicates
        // even if the validated object has only 1 property.
        // This custom validation loop iterates only over existing
        // properties and speeds up the validation cca 3-fold.
        // See https://github.com/sindresorhus/ow/issues/193
        (0, typedefs_1.keys)(options).forEach((prop) => {
            const predicate = requestOptionalPredicates[prop];
            const value = options[prop];
            if (predicate) {
                (0, ow_1.default)(value, `RequestOptions.${prop}`, predicate);
                // 'url' is checked above because it's not optional
            }
            else if (prop !== 'url') {
                const msg = `Did not expect property \`${prop}\` to exist, got \`${value}\` in object \`RequestOptions\``;
                throw new ow_1.ArgumentError(msg, this.constructor);
            }
        });
        const { id, url, loadedUrl, uniqueKey, payload, noRetry = false, retryCount = 0, errorMessages = [], headers = {}, userData = {}, label, handledAt, keepUrlFragment = false, useExtendedUniqueKey = false, skipNavigation, } = options;
        let { method = 'GET', } = options;
        method = method.toUpperCase();
        if (method === 'GET' && payload)
            throw new Error('Request with GET method cannot have a payload.');
        this.id = id;
        this.url = url;
        this.loadedUrl = loadedUrl;
        this.uniqueKey = uniqueKey || this._computeUniqueKey({ url, method, payload, keepUrlFragment, useExtendedUniqueKey });
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
        Object.defineProperties(this, {
            _userData: {
                value: { __crawlee: {}, ...userData },
                enumerable: false,
                writable: true,
            },
            userData: {
                get: () => this._userData,
                set: (value) => {
                    Object.defineProperties(value, {
                        __crawlee: {
                            value: this._userData.__crawlee,
                            enumerable: false,
                            writable: true,
                        },
                        toJSON: {
                            value: () => {
                                if (Object.keys(this._userData.__crawlee).length > 0) {
                                    return ({
                                        ...this._userData,
                                        __crawlee: this._userData.__crawlee,
                                    });
                                }
                                return this._userData;
                            },
                            enumerable: false,
                            writable: true,
                        },
                    });
                    this._userData = value;
                },
                enumerable: true,
            },
        });
        // reassign userData to ensure internal `__crawlee` object is non-enumerable
        this.userData = userData;
        if (skipNavigation != null)
            this.skipNavigation = skipNavigation;
    }
    /** Tells the crawler processing this request to skip the navigation and process the request directly. */
    get skipNavigation() {
        return this.userData.__crawlee?.skipNavigation ?? false;
    }
    /** Tells the crawler processing this request to skip the navigation and process the request directly. */
    set skipNavigation(value) {
        if (!this.userData.__crawlee)
            this.userData.__crawlee = { skipNavigation: value };
        else
            this.userData.__crawlee.skipNavigation = value;
    }
    /** shortcut for getting `request.userData.label` */
    get label() {
        return this.userData.label;
    }
    /** shortcut for setting `request.userData.label` */
    set label(value) {
        this.userData.label = value;
    }
    /** Describes the request's current lifecycle state. */
    get state() {
        return this.userData.__crawlee?.state ?? RequestState.UNPROCESSED;
    }
    /** Describes the request's current lifecycle state. */
    set state(value) {
        if (!this.userData.__crawlee)
            this.userData.__crawlee = { state: value };
        else
            this.userData.__crawlee.state = value;
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
                    // .stack includes the message
                    : errorOrMessage.stack;
            }
            else if (Reflect.has(Object(errorOrMessage), 'message')) {
                message = Reflect.get(Object(errorOrMessage), 'message');
            }
            else if (errorOrMessage.toString() !== '[object Object]') {
                message = errorOrMessage.toString();
            }
            else {
                try {
                    message = node_util_1.default.inspect(errorOrMessage);
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
    _computeUniqueKey({ url, method, payload, keepUrlFragment, useExtendedUniqueKey }) {
        const normalizedMethod = method.toUpperCase();
        const normalizedUrl = (0, utilities_1.normalizeUrl)(url, keepUrlFragment) || url; // It returns null when url is invalid, causing weird errors.
        if (!useExtendedUniqueKey) {
            if (normalizedMethod !== 'GET' && payload) {
                // Using log.deprecated to log only once. We should add log.once or some such.
                log.deprecated(`We've encountered a ${normalizedMethod} Request with a payload. `
                    + 'This is fine. Just letting you know that if your requests point to the same URL '
                    + 'and differ only in method and payload, you should see the "useExtendedUniqueKey" option of Request constructor.');
            }
            return normalizedUrl;
        }
        const payloadHash = payload ? this._hashPayload(payload) : '';
        return `${normalizedMethod}(${payloadHash}):${normalizedUrl}`;
    }
    _hashPayload(payload) {
        return node_crypto_1.default
            .createHash('sha256')
            .update(payload)
            .digest('base64')
            .replace(/[+/=]/g, '')
            .substring(0, 8);
    }
}
exports.Request = Request;
//# sourceMappingURL=request.js.map