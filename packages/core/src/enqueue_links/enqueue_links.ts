import type { BatchAddRequestsResult, Dictionary } from '@crawlee/types';
import { type RobotsTxtFile } from '@crawlee/utils';
import ow from 'ow';
import { getDomain } from 'tldts';
import type { SetRequired } from 'type-fest';

import type { RequestOptions } from '../request.js';
import { Request } from '../request.js';
import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    RequestProvider,
    RequestQueueOperationOptions,
} from '../storages/request_provider.js';
import type {
    RequestTransform,
    SkippedRequestCallback,
    SkippedRequestReason,
    UrlPatternInput,
    UrlPatternObject,
} from './shared.js';
import {
    applyRequestTransform,
    constructUrlPatternObjects,
    createRequestOptions,
    filterRequestOptionsByPatterns,
} from './shared.js';

export interface EnqueueLinksOptions extends RequestQueueOperationOptions {
    /** Limit the amount of actually enqueued URLs to this number. Useful for testing across the entire crawling scope. */
    limit?: number;

    /** An array of URLs to enqueue. */
    urls?: readonly string[];

    /** A request queue to which the URLs will be enqueued. */
    requestQueue?: RequestProvider;

    /** A CSS selector matching links to be enqueued. */
    selector?: string;

    /** Sets {@apilink Request.userData} for newly enqueued requests. */
    userData?: Dictionary;

    /**
     * Sets {@apilink Request.label} for newly enqueued requests.
     *
     * Can be overwritten by `transformRequestFunction`.
     */
    label?: string;

    /**
     * If set to `true`, tells the crawler to skip navigation and process the request directly.
     * @default false
     */
    skipNavigation?: boolean;

    /**
     * A base URL that will be used to resolve relative URLs when using Cheerio. Ignored when using Puppeteer,
     * since the relative URL resolution is done inside the browser automatically.
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
     * If `include` is an empty array or `undefined`, then the function
     * enqueues the links with the same subdomain.
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
    strategy?: EnqueueStrategy | 'all' | 'same-domain' | 'same-hostname' | 'same-origin';

    /**
     * By default, only the first batch (1000) of found requests will be added to the queue before resolving the call.
     * You can use this option to wait for adding all of them.
     */
    waitForAllRequestsToBeAdded?: boolean;

    /**
     * RobotsTxtFile instance for the current request that triggered the `enqueueLinks`.
     * If provided, disallowed URLs will be ignored.
     */
    robotsTxtFile?: Pick<RobotsTxtFile, 'isAllowed'>;

    /**
     * When a request is skipped for some reason, you can use this callback to act on it.
     * This is currently fired for requests skipped
     * 1. based on robots.txt file,
     * 2. because they don't match enqueueLinks filters,
     * 3. or because the maxRequestsPerCrawl limit has been reached
     */
    onSkippedRequest?: SkippedRequestCallback;
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
export enum EnqueueStrategy {
    /**
     * Matches any URLs found
     */
    All = 'all',

    /**
     * Matches any URLs that have the same hostname.
     * For example, `https://wow.example.com/hello` will be matched for a base url of `https://wow.example.com/`, but
     * `https://example.com/hello` will not be matched.
     *
     * > This strategy will match both `http` and `https` protocols regardless of the base URL protocol.
     */
    SameHostname = 'same-hostname',

    /**
     * Matches any URLs that have the same domain as the base URL.
     * For example, `https://wow.an.example.com` and `https://example.com` will both be matched for a base url of
     * `https://example.com`.
     *
     * > This strategy will match both `http` and `https` protocols regardless of the base URL protocol.
     */
    SameDomain = 'same-domain',

    /**
     * Matches any URLs that have the same hostname and protocol.
     * For example, `https://wow.example.com/hello` will be matched for a base url of `https://wow.example.com/`, but
     * `http://wow.example.com/hello` will not be matched.
     *
     * > This strategy will ensure the protocol of the base URL is the same as the protocol of the URL to be enqueued.
     */
    SameOrigin = 'same-origin',
}

/**
 * This function enqueues the urls provided to the {@apilink RequestQueue} provided. If you want to automatically find and enqueue links,
 * you should use the context-aware `enqueueLinks` function provided on the crawler contexts.
 *
 * Optionally, the function allows you to filter the target links' URLs using an array of glob or regexp patterns.
 *
 * **Example usage**
 *
 * ```javascript
 * await enqueueLinks({
 *   urls: aListOfFoundUrls,
 *   requestQueue,
 *   selector: 'a.product-detail',
 *   include: [
 *       'https://www.example.com/handbags/*',
 *       'https://www.example.com/purses/*'
 *   ],
 * });
 * ```
 *
 * @param options All `enqueueLinks()` parameters are passed via an options object.
 * @returns Promise that resolves to {@apilink BatchAddRequestsResult} object.
 */
export async function enqueueLinks(
    options: SetRequired<Omit<EnqueueLinksOptions, 'requestQueue'>, 'urls'> & {
        requestQueue: {
            addRequestsBatched: (
                requests: Request<Dictionary>[],
                options: AddRequestsBatchedOptions,
            ) => Promise<AddRequestsBatchedResult>;
        };
    },
): Promise<BatchAddRequestsResult> {
    if (!options || Object.keys(options).length === 0) {
        throw new RangeError(
            [
                'enqueueLinks() was called without the required options. You can only do that when you use the `crawlingContext.enqueueLinks()` method in request handlers.',
                'Check out our guide on how to use enqueueLinks() here: https://crawlee.dev/js/docs/examples/crawl-relative-links',
            ].join('\n'),
        );
    }

    const urlPatternValidator = ow.any(ow.string, ow.regExp, ow.object.hasKeys('glob'), ow.object.hasKeys('regexp'));

    ow(
        options as any,
        ow.object.exactShape({
            urls: ow.array.ofType(ow.string),
            requestQueue: ow.object.hasKeys('addRequestsBatched'),
            robotsTxtFile: ow.optional.object.hasKeys('isAllowed'),
            onSkippedRequest: ow.optional.function,
            forefront: ow.optional.boolean,
            skipNavigation: ow.optional.boolean,
            limit: ow.optional.number,
            selector: ow.optional.string,
            baseUrl: ow.optional.string,
            userData: ow.optional.object,
            label: ow.optional.string,
            include: ow.optional.array.ofType(urlPatternValidator),
            exclude: ow.optional.array.ofType(urlPatternValidator),
            transformRequestFunction: ow.optional.function,
            strategy: ow.optional.string.oneOf(Object.values(EnqueueStrategy)),
            waitForAllRequestsToBeAdded: ow.optional.boolean,
        }),
    );

    const {
        requestQueue,
        limit,
        urls,
        include,
        exclude,
        transformRequestFunction,
        forefront,
        waitForAllRequestsToBeAdded,
        robotsTxtFile,
        onSkippedRequest,
    } = options;

    const urlExcludePatternObjects: UrlPatternObject[] = exclude?.length ? constructUrlPatternObjects(exclude) : [];
    const urlPatternObjects: UrlPatternObject[] = include?.length ? constructUrlPatternObjects(include) : [];

    if (!urlPatternObjects.length) {
        options.strategy ??= EnqueueStrategy.SameHostname;
    }

    const enqueueStrategyPatterns: UrlPatternObject[] = [];

    if (options.baseUrl) {
        const url = new URL(options.baseUrl);

        switch (options.strategy) {
            case EnqueueStrategy.SameHostname:
                // We need to get the origin of the passed in domain in the event someone sets baseUrl
                // to an url like https://example.com/deep/default/path and one of the found urls is an
                // absolute relative path (/path/to/page)
                enqueueStrategyPatterns.push({ glob: ignoreHttpSchema(`${url.origin}/**`) });
                break;
            case EnqueueStrategy.SameDomain: {
                // Get the actual hostname from the base url
                const baseUrlHostname = getDomain(url.hostname, { mixedInputs: false });

                if (baseUrlHostname) {
                    // We have a hostname, so we can use it to match all links on the page that point to it and any subdomains of it
                    url.hostname = baseUrlHostname;
                    enqueueStrategyPatterns.push(
                        { glob: ignoreHttpSchema(`${url.origin.replace(baseUrlHostname, `*.${baseUrlHostname}`)}/**`) },
                        { glob: ignoreHttpSchema(`${url.origin}/**`) },
                    );
                } else {
                    // We don't have a hostname (can happen for ips for instance), so reproduce the same behavior
                    // as SameDomainAndSubdomain
                    enqueueStrategyPatterns.push({ glob: ignoreHttpSchema(`${url.origin}/**`) });
                }

                break;
            }
            case EnqueueStrategy.SameOrigin: {
                // The same behavior as SameHostname, but respecting the protocol of the URL
                enqueueStrategyPatterns.push({ glob: `${url.origin}/**` });
                break;
            }
            case EnqueueStrategy.All:
            default:
                enqueueStrategyPatterns.push({ glob: `http{s,}://**` });
                break;
        }
    }

    async function reportSkippedRequests(
        skippedRequests: { url: string; skippedReason?: SkippedRequestReason }[],
        reason: SkippedRequestReason,
    ) {
        if (onSkippedRequest && skippedRequests.length > 0) {
            await Promise.all(
                skippedRequests.map((request) => {
                    return onSkippedRequest({
                        url: request.url,
                        reason: request.skippedReason ?? reason,
                    }) as Promise<void>;
                }),
            );
        }
    }

    let requestOptions = createRequestOptions(urls, options);

    if (robotsTxtFile) {
        const skippedRequests: RequestOptions[] = [];

        requestOptions = requestOptions.filter((request) => {
            if (robotsTxtFile.isAllowed(request.url)) {
                return true;
            }

            skippedRequests.push(request);
            return false;
        });

        await reportSkippedRequests(skippedRequests, 'robotsTxt');
    }

    async function createFilteredRequests() {
        const skippedRequests: string[] = [];

        // Step 1: Filter request options by exclude patterns, user include patterns, and strategy patterns.
        let filteredOptions: RequestOptions[];
        if (urlPatternObjects.length === 0) {
            filteredOptions = filterRequestOptionsByPatterns(
                requestOptions,
                enqueueStrategyPatterns.length > 0 ? enqueueStrategyPatterns : undefined,
                urlExcludePatternObjects,
                options.strategy,
                (url) => skippedRequests.push(url),
            );
        } else {
            // Filter by user patterns first (with exclude)
            const afterUserPatterns = filterRequestOptionsByPatterns(
                requestOptions,
                urlPatternObjects,
                urlExcludePatternObjects,
                options.strategy,
                (url) => skippedRequests.push(url),
            );
            // ...then filter by the enqueue links strategy (making this an AND check)
            filteredOptions = filterRequestOptionsByPatterns(
                afterUserPatterns,
                enqueueStrategyPatterns.length > 0 ? enqueueStrategyPatterns : undefined,
                [],
                options.strategy,
                (url) => skippedRequests.push(url),
            );
        }

        await reportSkippedRequests(
            skippedRequests.map((url) => ({ url })),
            'filters',
        );

        // Step 2: Apply transformRequestFunction on request options - it has the highest priority
        if (transformRequestFunction) {
            const skippedByTransform: RequestOptions[] = [];
            filteredOptions = applyRequestTransform(filteredOptions, transformRequestFunction, (r) =>
                skippedByTransform.push(r),
            );
            await reportSkippedRequests(skippedByTransform, 'transform');
        }

        // Step 3: Create Request instances from the final request options
        return filteredOptions.map((opts) => new Request(opts));
    }

    let requests = await createFilteredRequests();

    if (typeof limit === 'number' && limit < requests.length) {
        await reportSkippedRequests(requests.slice(limit), 'enqueueLimit');
        requests = requests.slice(0, limit);
    }

    const { addedRequests } = await requestQueue.addRequestsBatched(requests, {
        forefront,
        waitForAllRequestsToBeAdded,
    });

    return { processedRequests: addedRequests, unprocessedRequests: [] };
}

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
    // Returning undefined here is intentional! If the domains don't match, having no baseUrl in enqueueLinks will cause it to not enqueue anything
    // which is the intended behavior (since we went off domain)
    if (enqueueStrategy === EnqueueStrategy.SameDomain) {
        const originalHostname = getDomain(originalUrlOrigin, { mixedInputs: false })!;
        const finalHostname = getDomain(finalUrlOrigin, { mixedInputs: false })!;

        if (originalHostname === finalHostname) {
            return finalUrlOrigin;
        }

        return undefined;
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
    enqueueStrategy?: EnqueueLinksOptions['strategy'];
    originalRequestUrl: string;
    finalRequestUrl?: string;
}

/**
 * Internal function that changes the enqueue glob patterns to match both http and https
 */
function ignoreHttpSchema(pattern: string): string {
    return pattern.replace(/^(https?):\/\//, 'http{s,}://');
}
