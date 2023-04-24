/// <reference types="node" />
/// <reference types="node" />
import type { Dictionary } from '@crawlee/types';
import type { BinaryLike } from 'node:crypto';
import type { AllowedHttpMethods } from './typedefs';
export declare enum RequestState {
    UNPROCESSED = 0,
    BEFORE_NAV = 1,
    AFTER_NAV = 2,
    REQUEST_HANDLER = 3,
    DONE = 4,
    ERROR_HANDLER = 5,
    ERROR = 6
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
export declare class Request<UserData extends Dictionary = Dictionary> {
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
    private _userData;
    /** Custom user data assigned to the request. */
    userData: UserData;
    /**
     * ISO datetime string that indicates the time when the request has been processed.
     * Is `null` if the request has not been crawled yet.
     */
    handledAt?: string;
    /**
     * `Request` parameters including the URL, HTTP method and headers, and others.
     */
    constructor(options: RequestOptions);
    /** Tells the crawler processing this request to skip the navigation and process the request directly. */
    get skipNavigation(): boolean;
    /** Tells the crawler processing this request to skip the navigation and process the request directly. */
    set skipNavigation(value: boolean);
    /** shortcut for getting `request.userData.label` */
    get label(): string | undefined;
    /** shortcut for setting `request.userData.label` */
    set label(value: string | undefined);
    /** Describes the request's current lifecycle state. */
    get state(): RequestState;
    /** Describes the request's current lifecycle state. */
    set state(value: RequestState);
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
    pushErrorMessage(errorOrMessage: unknown, options?: PushErrorMessageOptions): void;
    protected _computeUniqueKey({ url, method, payload, keepUrlFragment, useExtendedUniqueKey }: ComputeUniqueKeyOptions): string;
    protected _hashPayload(payload: BinaryLike): string;
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
    /** @internal */
    id?: string;
    /** @internal */
    handledAt?: string;
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
export {};
//# sourceMappingURL=request.d.ts.map