import type { SetRequired } from 'type-fest';
import type { BatchAddRequestsResult, Dictionary } from '@crawlee/types';
import type { GlobInput, PseudoUrlInput, RegExpInput, RequestTransform } from './shared';
import type { RequestQueue, RequestQueueOperationOptions } from '../storages/request_queue';
export interface EnqueueLinksOptions extends RequestQueueOperationOptions {
    /** Limit the amount of actually enqueued URLs to this number. Useful for testing across the entire crawling scope. */
    limit?: number;
    /** An array of URLs to enqueue. */
    urls?: string[];
    /** A request queue to which the URLs will be enqueued. */
    requestQueue?: RequestQueue;
    /** A CSS selector matching links to be enqueued. */
    selector?: string;
    /** Sets {@apilink Request.userData} for newly enqueued requests. */
    userData?: Dictionary;
    /** Sets {@apilink Request.label} for newly enqueued requests. */
    label?: string;
    /**
     * A base URL that will be used to resolve relative URLs when using Cheerio. Ignored when using Puppeteer,
     * since the relative URL resolution is done inside the browser automatically.
     */
    baseUrl?: string;
    /**
     * An array of glob pattern strings or plain objects
     * containing glob pattern strings matching the URLs to be enqueued.
     *
     * The plain objects must include at least the `glob` property, which holds the glob pattern string.
     * All remaining keys will be used as request options for the corresponding enqueued {@apilink Request} objects.
     *
     * The matching is always case-insensitive.
     * If you need case-sensitive matching, use `regexps` property directly.
     *
     * If `globs` is an empty array or `undefined`, and `regexps` are also not defined, then the function
     * enqueues the links with the same subdomain.
     */
    globs?: GlobInput[];
    /**
     * An array of glob pattern strings, regexp patterns or plain objects
     * containing patterns matching URLs that will **never** be enqueued.
     *
     * The plain objects must include either the `glob` property or the `regexp` property.
     * All remaining keys will be used as request options for the corresponding enqueued {@apilink Request} objects.
     *
     * Glob matching is always case-insensitive.
     * If you need case-sensitive matching, provide a regexp.
     */
    exclude?: (GlobInput | RegExpInput)[];
    /**
     * An array of regular expressions or plain objects
     * containing regular expressions matching the URLs to be enqueued.
     *
     * The plain objects must include at least the `regexp` property, which holds the regular expression.
     * All remaining keys will be used as request options for the corresponding enqueued {@apilink Request} objects.
     *
     * If `regexps` is an empty array or `undefined`, and `globs` are also not defined, then the function
     * enqueues the links with the same subdomain.
     */
    regexps?: RegExpInput[];
    /**
     * *NOTE:* In future versions of SDK the options will be removed.
     * Please use `globs` or `regexps` instead.
     *
     * An array of {@apilink PseudoUrl} strings or plain objects
     * containing {@apilink PseudoUrl} strings matching the URLs to be enqueued.
     *
     * The plain objects must include at least the `purl` property, which holds the pseudo-URL string.
     * All remaining keys will be used as request options for the corresponding enqueued {@apilink Request} objects.
     *
     * With a pseudo-URL string, the matching is always case-insensitive.
     * If you need case-sensitive matching, use `regexps` property directly.
     *
     * If `pseudoUrls` is an empty array or `undefined`, then the function
     * enqueues the links with the same subdomain.
     *
     * @deprecated prefer using `globs` or `regexps` instead
     */
    pseudoUrls?: PseudoUrlInput[];
    /**
     * Just before a new {@apilink Request} is constructed and enqueued to the {@apilink RequestQueue}, this function can be used
     * to remove it or modify its contents such as `userData`, `payload` or, most importantly `uniqueKey`. This is useful
     * when you need to enqueue multiple `Requests` to the queue that share the same URL, but differ in methods or payloads,
     * or to dynamically update or create `userData`.
     *
     * For example: by adding `keepUrlFragment: true` to the `request` object, URL fragments will not be removed
     * when `uniqueKey` is computed.
     *
     * **Example:**
     * ```javascript
     * {
     *     transformRequestFunction: (request) => {
     *         request.userData.foo = 'bar';
     *         request.keepUrlFragment = true;
     *         return request;
     *     }
     * }
     * ```
     *
     * Note that `transformRequestFunction` has a priority over request options
     * specified in `globs`, `regexps`, or `pseudoUrls` objects,
     * and thus some options could be over-written by `transformRequestFunction`.
     */
    transformRequestFunction?: RequestTransform;
    /**
     * The strategy to use when enqueueing the urls.
     *
     * Depending on the strategy you select, we will only check certain parts of the URLs found. Here is a diagram of each URL part and their name:
     *
     * ```md
     * Protocol          Domain
     * ┌────┐          ┌─────────┐
     * https://example.crawlee.dev/...
     * │       └─────────────────┤
     * │             Hostname    │
     * │                         │
     * └─────────────────────────┘
     *          Origin
     *```
     *
     * @default EnqueueStrategy.SameHostname
     */
    strategy?: EnqueueStrategy | 'all' | 'same-domain' | 'same-hostname' | 'same-origin';
}
/**
 * The different enqueueing strategies available.
 *
 * Depending on the strategy you select, we will only check certain parts of the URLs found. Here is a diagram of each URL part and their name:
 *
 * ```md
 * Protocol          Domain
 * ┌────┐          ┌─────────┐
 * https://example.crawlee.dev/...
 * │       └─────────────────┤
 * │             Hostname    │
 * │                         │
 * └─────────────────────────┘
 *          Origin
 *```
 *
 * - The `Protocol` is usually `http` or `https`
 * - The `Domain` represents the path without any possible subdomains to a website. For example, `crawlee.dev` is the domain of `https://example.crawlee.dev/`
 * - The `Hostname` is the full path to a website, including any subdomains. For example, `example.crawlee.dev` is the hostname of `https://example.crawlee.dev/`
 * - The `Origin` is the combination of the `Protocol` and `Hostname`. For example, `https://example.crawlee.dev` is the origin of `https://example.crawlee.dev/`
 */
export declare enum EnqueueStrategy {
    /**
     * Matches any URLs found
     */
    All = "all",
    /**
     * Matches any URLs that have the same hostname.
     * For example, `https://wow.example.com/hello` will be matched for a base url of `https://wow.example.com/`, but
     * `https://example.com/hello` will not be matched.
     *
     * > This strategy will match both `http` and `https` protocols regardless of the base URL protocol.
     */
    SameHostname = "same-hostname",
    /**
     * Matches any URLs that have the same domain as the base URL.
     * For example, `https://wow.an.example.com` and `https://example.com` will both be matched for a base url of
     * `https://example.com`.
     *
     * > This strategy will match both `http` and `https` protocols regardless of the base URL protocol.
     */
    SameDomain = "same-domain",
    /**
     * Matches any URLs that have the same hostname and protocol.
     * For example, `https://wow.example.com/hello` will be matched for a base url of `https://wow.example.com/`, but
     * `http://wow.example.com/hello` will not be matched.
     *
     * > This strategy will ensure the protocol of the base URL is the same as the protocol of the URL to be enqueued.
     */
    SameOrigin = "same-origin"
}
/**
 * This function enqueues the urls provided to the {@apilink RequestQueue} provided. If you want to automatically find and enqueue links,
 * you should use the context-aware `enqueueLinks` function provided on the crawler contexts.
 *
 * Optionally, the function allows you to filter the target links' URLs using an array of globs or regular expressions
 * and override settings of the enqueued {@apilink Request} objects.
 *
 * **Example usage**
 *
 * ```javascript
 * await enqueueLinks({
 *   urls: aListOfFoundUrls,
 *   requestQueue,
 *   selector: 'a.product-detail',
 *   globs: [
 *       'https://www.example.com/handbags/*',
 *       'https://www.example.com/purses/*'
 *   ],
 * });
 * ```
 *
 * @param options All `enqueueLinks()` parameters are passed via an options object.
 * @returns Promise that resolves to {@apilink BatchAddRequestsResult} object.
 */
export declare function enqueueLinks(options: SetRequired<EnqueueLinksOptions, 'requestQueue' | 'urls'>): Promise<BatchAddRequestsResult>;
/**
 * @internal
 * This method helps resolve the baseUrl that will be used for filtering in {@apilink enqueueLinks}.
 * - If a user provides a base url, we always return it
 * - If a user specifies {@apilink EnqueueStrategy.All} strategy, they do not care if the newly found urls are on the original
 *   request domain, or a redirected one
 * - In all other cases, we return the domain of the original request as that's the one we need to use for filtering
 */
export declare function resolveBaseUrlForEnqueueLinksFiltering({ enqueueStrategy, finalRequestUrl, originalRequestUrl, userProvidedBaseUrl, }: ResolveBaseUrl): string | undefined;
/**
 * @internal
 */
export interface ResolveBaseUrl {
    userProvidedBaseUrl?: string;
    enqueueStrategy?: EnqueueLinksOptions['strategy'];
    originalRequestUrl: string;
    finalRequestUrl?: string;
}
//# sourceMappingURL=enqueue_links.d.ts.map