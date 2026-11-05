import type { Dictionary } from '@crawlee/types';
import { EnqueueStrategy } from '@crawlee/utils';
import { getDomain } from 'tldts';

import type { EnqueueStrategyOption, RequestQueueOperationOptions } from '@crawlee/core';

import type { RequestTransform, SkippedRequestCallback, UrlPatternInput } from './shared.js';

/**
 * Options shared by the `extractLinks()` context helper across crawler types.
 */
export interface ExtractLinksOptions {
    /** A CSS selector matching links to be extracted. */
    selector?: string;

    /**
     * A base URL that will be used to resolve relative URLs when using Cheerio. Ignored when using Puppeteer,
     * since the relative URL resolution is done inside the browser automatically.
     */
    baseUrl?: string;
}

/**
 * Options accepted by the `enqueueUrls()` context helper exposed by `BasicCrawler`.
 */
export interface EnqueueUrlsOptions extends RequestQueueOperationOptions {
    /** Limit the amount of actually enqueued URLs to this number. Useful for testing across the entire crawling scope. */
    limit?: number;

    /** Sets {@apilink Request.userData} for newly enqueued requests. */
    userData?: Dictionary;

    /**
     * Sets {@apilink Request.label} for newly enqueued requests.
     *
     * Can be overwritten by `transformRequestFunction`.
     */
    label?: string;

    /** Sets {@apilink Request.sessionId} for newly enqueued requests. */
    sessionId?: string;

    /**
     * If set to `true`, tells the crawler to skip navigation and process the request directly.
     * @default false
     */
    skipNavigation?: boolean;

    /**
     * A base URL that will be used to resolve relative URLs.
     */
    baseUrl?: string;

    /**
     * An array of URL patterns that URLs must match to be enqueued.
     *
     * Accepts glob pattern strings, `{ glob: string }` objects, `RegExp` instances, or `{ regexp: RegExp }` objects.
     *
     * Glob matching is always case-insensitive.
     * If you need case-sensitive matching, use a `RegExp`.
     *
     * The patterns are combined with the {@apilink EnqueueUrlsOptions.strategy|`strategy`} using AND logic - a URL
     * must match at least one `include` pattern **and** satisfy the strategy to be enqueued. To match URLs across
     * hostnames, pass an explicit {@apilink EnqueueStrategy.All} strategy.
     *
     * If `undefined`, the links are enqueued based on the {@apilink EnqueueUrlsOptions.strategy|`strategy`} alone.
     * Passing an empty array is not allowed.
     */
    include?: readonly UrlPatternInput[];

    /**
     * An array of URL patterns. Matching URLs will **not** be enqueued.
     *
     * Accepts glob pattern strings, `{ glob: string }` objects, `RegExp` instances, or `{ regexp: RegExp }` objects.
     *
     * Glob matching is always case-insensitive.
     * If you need case-sensitive matching, use a `RegExp`.
     */
    exclude?: readonly UrlPatternInput[];

    /**
     * After request options are filtered by `include`/`exclude` patterns, this function can be used
     * to remove them or modify their contents such as `userData`, `payload` or, most importantly `uniqueKey`. This is useful
     * when you need to enqueue multiple `Requests` to the queue that share the same URL, but differ in methods or payloads,
     * or to dynamically update or create `userData`.
     *
     * For example: by adding `keepUrlFragment: true` to the request options, URL fragments will not be removed
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
     * Note that `transformRequestFunction` has the highest priority and can overwrite
     * the global `label` option.
     *
     * The function receives a {@apilink RequestOptions} object and can return either:
     * - The modified {@apilink RequestOptions} object
     * - `'unchanged'` to keep the original options as-is
     * - A falsy value or `'skip'` to exclude the request from the queue
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
    strategy?: EnqueueStrategyOption;

    /**
     * By default, only the first batch (1000) of found requests will be added to the queue before resolving the call.
     * You can use this option to wait for adding all of them.
     */
    waitForAllRequestsToBeAdded?: boolean;

    /**
     * When a request is skipped for some reason, you can use this callback to act on it.
     * This is currently fired for requests skipped
     * 1. based on robots.txt file,
     * 2. because they don't match enqueueLinks filters,
     * 3. or because the maxRequestsPerCrawl limit has been reached
     */
    onSkippedRequest?: SkippedRequestCallback;
}

/** The combined options accepted by a crawler context's `enqueueLinks()` helper: `extractLinks()` + `enqueueUrls()`. */
export type EnqueueLinksOptions = ExtractLinksOptions & EnqueueUrlsOptions;

/**
 * @internal
 * This method helps resolve the baseUrl that will be used for filtering in {@apilink enqueueLinks}.
 * - If a user provides a base url, we always return it
 * - If a user specifies {@apilink EnqueueStrategy.All} strategy, they do not care if the newly found urls are on the original
 *   request domain, or a redirected one
 * - In all other cases, we return the domain of the original request as that's the one we need to use for filtering
 */
export function resolveBaseUrlForEnqueueLinksFiltering({
    enqueueStrategy,
    finalRequestUrl,
    originalRequestUrl,
    userProvidedBaseUrl,
}: ResolveBaseUrl) {
    // User provided base url takes priority
    if (userProvidedBaseUrl) {
        return userProvidedBaseUrl;
    }

    const originalUrlOrigin = new URL(originalRequestUrl).origin;
    const finalUrlOrigin = new URL(finalRequestUrl ?? originalRequestUrl).origin;

    // We can assume users want to go off the domain in this case
    if (enqueueStrategy === EnqueueStrategy.All) {
        return finalUrlOrigin;
    }

    // If the user wants to ensure the same domain is accessed, regardless of subdomains, we check to ensure the domains match
    // If they don't (we went off domain via a redirect), we keep filtering against the original domain - returning undefined would disable the filtering entirely
    if (enqueueStrategy === EnqueueStrategy.SameDomain) {
        const originalHostname = getDomain(originalUrlOrigin, { mixedInputs: false })!;
        const finalHostname = getDomain(finalUrlOrigin, { mixedInputs: false })!;

        if (originalHostname === finalHostname) {
            return finalUrlOrigin;
        }

        return originalUrlOrigin;
    }

    // Always enqueue urls that are from the same origin in all other cases, as the filtering happens on the original request url, even if there was a redirect
    // before actually finding the urls
    return originalUrlOrigin;
}

/**
 * @internal
 */
export interface ResolveBaseUrl {
    userProvidedBaseUrl?: string;
    enqueueStrategy?: EnqueueStrategyOption;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}
