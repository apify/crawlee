import type { BinaryLike } from 'node:crypto';
import crypto from 'node:crypto';
import util from 'node:util';

import type { Dictionary } from '@crawlee/types';
import type { BasePredicate } from 'ow';
import ow from 'ow';

import { normalizeUrl } from '@apify/utilities';

import type { EnqueueLinksOptions } from './enqueue_links/enqueue_links';
import { log as defaultLog } from './log';
import type { AllowedHttpMethods } from './typedefs';
import { keys } from './typedefs';

// new properties on the Request object breaks serialization
const log = defaultLog.child({ prefix: 'Request' });

const requestOptionalPredicates = {
    id: ow.optional.string,
    loadedUrl: ow.optional.string.url,
    uniqueKey: ow.optional.string,
    method: ow.optional.string,
    payload: ow.optional.any(ow.string, ow.uint8Array),
    noRetry: ow.optional.boolean,
    retryCount: ow.optional.number,
    sessionRotationCount: ow.optional.number,
    maxRetries: ow.optional.number,
    errorMessages: ow.optional.array.ofType(ow.string),
    headers: ow.optional.object,
    userData: ow.optional.object,
    label: ow.optional.string,
    handledAt: ow.optional.any(ow.string.date, ow.date),
    keepUrlFragment: ow.optional.boolean,
    useExtendedUniqueKey: ow.optional.boolean,
    skipNavigation: ow.optional.boolean,
    state: ow.optional.number.greaterThanOrEqual(0).lessThanOrEqual(6),
};

export enum RequestState {
    UNPROCESSED,
    BEFORE_NAV,
    AFTER_NAV,
    REQUEST_HANDLER,
    DONE,
    ERROR_HANDLER,
    ERROR,
    SKIPPED,
}

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
export class Request<UserData extends Dictionary = Dictionary> {
    /** Request ID */
    id?: string;

    /** URL of the web page to crawl. */
    url: string;

    /**
     * An actually loaded URL after redirects, if present. HTTP redirects are guaranteed
     * to be included.
     *
     * When using {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler}, meta tag and JavaScript redirects may,
     * or may not be included, depending on their nature. This generally means that redirects,
     * which happen immediately will most likely be included, but delayed redirects will not.
     */
    loadedUrl?: string;

    /**
     * A unique key identifying the request.
     * Two requests with the same `uniqueKey` are considered as pointing to the same URL.
     */
    uniqueKey: string;

    /** HTTP method, e.g. `GET` or `POST`. */
    method: AllowedHttpMethods;

    /** HTTP request payload, e.g. for POST requests. */
    payload?: string;

    /** The `true` value indicates that the request will not be automatically retried on error. */
    noRetry: boolean;

    /** Indicates the number of times the crawling of the request has been retried on error. */
    retryCount: number;

    /** An array of error messages from request processing. */
    errorMessages: string[];

    /** Object with HTTP headers. Key is header name, value is the value. */
    headers?: Record<string, string>;

    /** Private store for the custom user data assigned to the request. */
    private _userData: Record<string, any> = {};

    /** Custom user data assigned to the request. */
    userData: UserData = {} as UserData;

    /**
     * ISO datetime string that indicates the time when the request has been processed.
     * Is `null` if the request has not been crawled yet.
     */
    handledAt?: string;

    /**
     * `Request` parameters including the URL, HTTP method and headers, and others.
     */
    constructor(options: RequestOptions<UserData>) {
        ow(options, 'RequestOptions', ow.object);
        ow(options.url, 'RequestOptions.url', ow.string);
        // 'ow' validation is slow, because it checks all predicates
        // even if the validated object has only 1 property.
        // This custom validation loop iterates only over existing
        // properties and speeds up the validation cca 3-fold.
        // See https://github.com/sindresorhus/ow/issues/193
        keys(options).forEach((prop) => {
            // skip url, because it is validated above
            if (prop === 'url') {
                return;
            }

            const predicate = requestOptionalPredicates[prop as keyof typeof requestOptionalPredicates];
            const value = options[prop];
            if (predicate) {
                ow(value, `RequestOptions.${prop}`, predicate as BasePredicate);
            }
        });

        const {
            id,
            url,
            loadedUrl,
            uniqueKey,
            payload,
            noRetry = false,
            retryCount = 0,
            sessionRotationCount = 0,
            maxRetries,
            errorMessages = [],
            headers = {},
            userData = {},
            label,
            handledAt,
            keepUrlFragment = false,
            useExtendedUniqueKey = false,
            skipNavigation,
            enqueueStrategy,
        } = options as RequestOptions & {
            loadedUrl?: string;
            retryCount?: number;
            sessionRotationCount?: number;
            errorMessages?: string[];
            handledAt?: string | Date;
        };

        let { method = 'GET' } = options;

        method = method.toUpperCase() as AllowedHttpMethods;

        if (method === 'GET' && payload) throw new Error('Request with GET method cannot have a payload.');

        this.id = id;
        this.url = url;
        this.loadedUrl = loadedUrl;
        this.uniqueKey =
            uniqueKey || Request.computeUniqueKey({ url, method, payload, keepUrlFragment, useExtendedUniqueKey });
        this.method = method;
        this.payload = payload;
        this.noRetry = noRetry;
        this.retryCount = retryCount;
        this.sessionRotationCount = sessionRotationCount;
        this.errorMessages = [...errorMessages];
        this.headers = { ...headers };
        this.handledAt = (handledAt as unknown) instanceof Date ? (handledAt as Date).toISOString() : handledAt!;

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
                set: (value: Record<string, any>) => {
                    Object.defineProperties(value, {
                        __crawlee: {
                            value: this._userData.__crawlee,
                            enumerable: false,
                            writable: true,
                        },
                        toJSON: {
                            value: () => {
                                if (Object.keys(this._userData.__crawlee).length > 0) {
                                    return {
                                        ...this._userData,
                                        __crawlee: this._userData.__crawlee,
                                    };
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

        if (skipNavigation != null) this.skipNavigation = skipNavigation;
        if (maxRetries != null) this.maxRetries = maxRetries;

        // If it's already set, don't override it (for instance when fetching from storage)
        if (enqueueStrategy) {
            this.enqueueStrategy ??= enqueueStrategy;
        }
    }

    /** Tells the crawler processing this request to skip the navigation and process the request directly. */
    get skipNavigation(): boolean {
        return this.userData.__crawlee?.skipNavigation ?? false;
    }

    /** Tells the crawler processing this request to skip the navigation and process the request directly. */
    set skipNavigation(value: boolean) {
        if (!this.userData.__crawlee) {
            (this.userData as Dictionary).__crawlee = { skipNavigation: value };
        } else {
            this.userData.__crawlee.skipNavigation = value;
        }
    }

    /** Indicates the number of times the crawling of the request has rotated the session due to a session or a proxy error. */
    get sessionRotationCount(): number {
        return this.userData.__crawlee?.sessionRotationCount ?? 0;
    }

    /** Indicates the number of times the crawling of the request has rotated the session due to a session or a proxy error. */
    set sessionRotationCount(value: number) {
        if (!this.userData.__crawlee) {
            (this.userData as Dictionary).__crawlee = { sessionRotationCount: value };
        } else {
            this.userData.__crawlee.sessionRotationCount = value;
        }
    }

    /** shortcut for getting `request.userData.label` */
    get label(): string | undefined {
        return this.userData.label;
    }

    /** shortcut for setting `request.userData.label` */
    set label(value: string | undefined) {
        (this.userData as Dictionary).label = value;
    }

    /** Maximum number of retries for this request. Allows to override the global `maxRequestRetries` option of `BasicCrawler`. */
    get maxRetries(): number | undefined {
        return this.userData.__crawlee?.maxRetries;
    }

    /** Maximum number of retries for this request. Allows to override the global `maxRequestRetries` option of `BasicCrawler`. */
    set maxRetries(value: number | undefined) {
        if (!this.userData.__crawlee) {
            (this.userData as Dictionary).__crawlee = { maxRetries: value };
        } else {
            this.userData.__crawlee.maxRetries = value;
        }
    }

    /** Describes the request's current lifecycle state. */
    get state(): RequestState {
        return this.userData.__crawlee?.state ?? RequestState.UNPROCESSED;
    }

    /** Describes the request's current lifecycle state. */
    set state(value: RequestState) {
        if (!this.userData.__crawlee) {
            (this.userData as Dictionary).__crawlee = { state: value };
        } else {
            this.userData.__crawlee.state = value;
        }
    }

    private get enqueueStrategy(): EnqueueLinksOptions['strategy'] | undefined {
        return this.userData.__crawlee?.enqueueStrategy;
    }

    private set enqueueStrategy(value: EnqueueLinksOptions['strategy']) {
        if (!this.userData.__crawlee) {
            (this.userData as Dictionary).__crawlee = { enqueueStrategy: value };
        } else {
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
    pushErrorMessage(errorOrMessage: unknown, options: PushErrorMessageOptions = {}): void {
        const { omitStack } = options;
        let message;
        const type = typeof errorOrMessage;
        if (type === 'object') {
            if (!errorOrMessage) {
                message = 'null';
            } else if (errorOrMessage instanceof Error) {
                message = omitStack
                    ? errorOrMessage.message
                    : // .stack includes the message
                      errorOrMessage.stack;
            } else if (Reflect.has(Object(errorOrMessage), 'message')) {
                message = Reflect.get(Object(errorOrMessage), 'message');
            } else if ((errorOrMessage as string).toString() !== '[object Object]') {
                message = (errorOrMessage as string).toString();
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
            message = (errorOrMessage as string).toString();
        }

        this.errorMessages.push(message);
    }

    // TODO: only for better BC, remove in v4
    protected _computeUniqueKey(options: ComputeUniqueKeyOptions) {
        return Request.computeUniqueKey(options);
    }

    // TODO: only for better BC, remove in v4
    protected _hashPayload(payload: BinaryLike): string {
        return Request.hashPayload(payload);
    }

    /** @internal */
    static computeUniqueKey({
        url,
        method = 'GET',
        payload,
        keepUrlFragment = false,
        useExtendedUniqueKey = false,
    }: ComputeUniqueKeyOptions) {
        const normalizedMethod = method.toUpperCase();
        const normalizedUrl = normalizeUrl(url, keepUrlFragment) || url; // It returns null when url is invalid, causing weird errors.
        if (!useExtendedUniqueKey) {
            if (normalizedMethod !== 'GET' && payload) {
                // Using log.deprecated to log only once. We should add log.once or some such.
                log.deprecated(
                    `We've encountered a ${normalizedMethod} Request with a payload. ` +
                        'This is fine. Just letting you know that if your requests point to the same URL ' +
                        'and differ only in method and payload, you should see the "useExtendedUniqueKey" option of Request constructor.',
                );
            }
            return normalizedUrl;
        }
        const payloadHash = payload ? Request.hashPayload(payload) : '';
        return `${normalizedMethod}(${payloadHash}):${normalizedUrl}`;
    }

    /** @internal */
    static hashPayload(payload: BinaryLike): string {
        return crypto.createHash('sha256').update(payload).digest('base64').replace(/[+/=]/g, '').substring(0, 8);
    }
}

/**
 * Specifies required and optional fields for constructing a {@apilink Request}.
 */
export interface RequestOptions<UserData extends Dictionary = Dictionary> {
    /** URL of the web page to crawl. It must be a non-empty string. */
    url: string;

    /**
     * A unique key identifying the request.
     * Two requests with the same `uniqueKey` are considered as pointing to the same URL.
     *
     * If `uniqueKey` is not provided, then it is automatically generated by normalizing the URL.
     * For example, the URL of `HTTP://www.EXAMPLE.com/something/` will produce the `uniqueKey`
     * of `http://www.example.com/something`.
     *
     * The `keepUrlFragment` option determines whether URL hash fragment is included in the `uniqueKey` or not.
     *
     * The `useExtendedUniqueKey` options determines whether method and payload are included in the `uniqueKey`,
     * producing a `uniqueKey` in the following format: `METHOD(payloadHash):normalizedUrl`. This is useful
     * when requests point to the same URL, but with different methods and payloads. For example: form submits.
     *
     * Pass an arbitrary non-empty text value to the `uniqueKey` property
     * to override the default behavior and specify which URLs shall be considered equal.
     */
    uniqueKey?: string;

    /** @default 'GET' */
    method?: AllowedHttpMethods | Lowercase<AllowedHttpMethods>;

    /** HTTP request payload, e.g. for POST requests. */
    payload?: string;

    /**
     * HTTP headers in the following format:
     * ```
     * {
     *     Accept: 'text/html',
     *     'Content-Type': 'application/json'
     * }
     * ```
     */
    headers?: Record<string, string>;

    /**
     * Custom user data assigned to the request. Use this to save any request related data to the
     * request's scope, keeping them accessible on retries, failures etc.
     */
    userData?: UserData;

    /**
     * Shortcut for setting `userData: { label: '...' }`.
     */
    label?: string;

    /**
     * If `false` then the hash part of a URL is removed when computing the `uniqueKey` property.
     * For example, this causes the `http://www.example.com#foo` and `http://www.example.com#bar` URLs
     * to have the same `uniqueKey` of `http://www.example.com` and thus the URLs are considered equal.
     * Note that this option only has an effect if `uniqueKey` is not set.
     * @default false
     */
    keepUrlFragment?: boolean;

    /**
     * If `true` then the `uniqueKey` is computed not only from the URL, but also from the method and payload
     * properties. This is useful when making requests to the same URL that are differentiated by method
     * or payload, such as form submit navigations in browsers.
     * @default false
     */
    useExtendedUniqueKey?: boolean;

    /**
     * The `true` value indicates that the request will not be automatically retried on error.
     * @default false
     */
    noRetry?: boolean;

    /**
     * If set to `true` then the crawler processing this request evaluates
     * the `requestHandler` immediately without prior browser navigation.
     * @default false
     */
    skipNavigation?: boolean;

    /**
     * Maximum number of retries for this request. Allows to override the global `maxRequestRetries` option of `BasicCrawler`.
     */
    maxRetries?: number;

    /** @internal */
    id?: string;

    /** @internal */
    handledAt?: string;

    /** @internal */
    lockExpiresAt?: Date;

    /** @internal */
    enqueueStrategy?: EnqueueLinksOptions['strategy'];
}

export interface PushErrorMessageOptions {
    /**
     * Only push the error message without stack trace when true.
     * @default false
     */
    omitStack?: boolean;
}

interface ComputeUniqueKeyOptions {
    url: string;
    method: AllowedHttpMethods;
    payload?: string | Buffer;
    keepUrlFragment?: boolean;
    useExtendedUniqueKey?: boolean;
}

export type Source = (Partial<RequestOptions> & { requestsFromUrl?: string; regex?: RegExp }) | Request;

/** @internal */
export interface InternalSource {
    requestsFromUrl: string;
    regex?: RegExp;
}
