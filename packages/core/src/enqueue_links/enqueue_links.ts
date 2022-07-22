import { getDomain } from 'tldts';
import ow from 'ow';
import log from '@apify/log';
import type { BatchAddRequestsResult, Dictionary } from '@crawlee/types';
import type { GlobInput, PseudoUrlInput, RegExpInput, RequestTransform, UrlPatternObject } from './shared';
import {
    constructGlobObjectsFromGlobs,
    constructRegExpObjectsFromPseudoUrls,
    constructRegExpObjectsFromRegExps,
    createRequestOptions,
    createRequests,
} from './shared';
import type { RequestQueue } from '../storages/request_queue';
import type { RequestOptions } from '../request';

export interface EnqueueLinksOptions {
    /** Limit the amount of actually enqueued URLs to this number. Useful for testing across the entire crawling scope. */
    limit?: number;

    /** An array of URLs to enqueue. */
    urls: string[];

    /** A request queue to which the URLs will be enqueued. */
    requestQueue: RequestQueue;

    /** A CSS selector matching links to be enqueued. */
    selector?: string;

    /** Sets {@link Request.userData} for newly enqueued requests. */
    userData?: Dictionary;

    /** Sets {@link Request.label} for newly enqueued requests. */
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
     * All remaining keys will be used as request options for the corresponding enqueued {@link Request} objects.
     *
     * The matching is always case-insensitive.
     * If you need case-sensitive matching, use `regexps` property directly.
     *
     * If `globs` is an empty array or `undefined`, and `regexps` are also not defined, then the function
     * enqueues the links with the same subdomain.
     */
    globs?: GlobInput[];

    /**
     * An array of regular expressions or plain objects
     * containing regular expressions matching the URLs to be enqueued.
     *
     * The plain objects must include at least the `regexp` property, which holds the regular expression.
     * All remaining keys will be used as request options for the corresponding enqueued {@link Request} objects.
     *
     * If `regexps` is an empty array or `undefined`, and `globs` are also not defined, then the function
     * enqueues the links with the same subdomain.
     */
    regexps?: RegExpInput[];

    /**
     * *NOTE:* In future versions of SDK the options will be removed.
     * Please use `globs` or `regexps` instead.
     *
     * An array of {@link PseudoUrl} strings or plain objects
     * containing {@link PseudoUrl} strings matching the URLs to be enqueued.
     *
     * The plain objects must include at least the `purl` property, which holds the pseudo-URL string.
     * All remaining keys will be used as request options for the corresponding enqueued {@link Request} objects.
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
     * Just before a new {@link Request} is constructed and enqueued to the {@link RequestQueue}, this function can be used
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
     * @default EnqueueStrategy.SameHostname
     */
    strategy?: EnqueueStrategy | 'all' | 'same-domain' | 'same-hostname';
}

export enum EnqueueStrategy {
    /**
     * Matches any URLs found
     */
    All = 'all',

    /**
     * Matches any URLs that have the same hostname.
     * For example, `https://wow.example.com/hello` will be matched for a base url of `https://example.com/`, but
     * `https://example.com/hello` will not be matched.
     */
    SameHostname = 'same-hostname',

    /**
     * Matches any URLs that have the same (sub-)domain as the base URL.
     * For example, `https://wow.an.example.com` and `https://example.com` will both be matched for a base url of
     * `https://example.com`.
     */
    SameDomain = 'same-domain',
}

/**
 * This function enqueues the urls provided to the {@link RequestQueue} provided. If you want to automatically find and enqueue links,
 * you should use the context-aware `enqueueLinks` function provided on the crawler contexts.
 *
 * Optionally, the function allows you to filter the target links' URLs using an array of globs or regular expressions
 * and override settings of the enqueued {@link Request} objects.
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
 * @returns Promise that resolves to {@link BatchAddRequestsResult} object.
 */
export async function enqueueLinks(options: EnqueueLinksOptions): Promise<BatchAddRequestsResult> {
    ow(options, ow.object.exactShape({
        urls: ow.array.ofType(ow.string),
        requestQueue: ow.object.hasKeys('fetchNextRequest', 'addRequest'),
        limit: ow.optional.number,
        selector: ow.optional.string,
        baseUrl: ow.optional.string,
        userData: ow.optional.object,
        label: ow.optional.string,
        pseudoUrls: ow.optional.array.ofType(ow.any(
            ow.string,
            ow.object.hasKeys('purl'),
        )),
        globs: ow.optional.array.ofType(ow.any(
            ow.string,
            ow.object.hasKeys('glob'),
        )),
        regexps: ow.optional.array.ofType(ow.any(
            ow.regExp,
            ow.object.hasKeys('regexp'),
        )),
        transformRequestFunction: ow.optional.function,
        strategy: ow.optional.string.oneOf([
            EnqueueStrategy.All,
            EnqueueStrategy.SameHostname,
            EnqueueStrategy.SameDomain,
        ]),
    }));

    const {
        requestQueue,
        limit,
        urls,
        pseudoUrls,
        globs,
        regexps,
        transformRequestFunction,
    } = options;

    const urlPatternObjects: UrlPatternObject[] = [];

    if (pseudoUrls?.length) {
        log.deprecated('`pseudoUrls` option is deprecated, use `globs` or `regexps` instead');
        urlPatternObjects.push(...constructRegExpObjectsFromPseudoUrls(pseudoUrls));
    }

    if (globs?.length) {
        urlPatternObjects.push(...constructGlobObjectsFromGlobs(globs));
    }

    if (regexps?.length) {
        urlPatternObjects.push(...constructRegExpObjectsFromRegExps(regexps));
    }

    if (!urlPatternObjects.length) {
        options.strategy ??= EnqueueStrategy.SameHostname;
    }

    if (options.baseUrl) {
        const url = new URL(options.baseUrl);

        switch (options.strategy) {
            case EnqueueStrategy.SameHostname:
                // We need to get the origin of the passed in domain in the event someone sets baseUrl
                // to an url like https://example.com/deep/default/path and one of the found urls is an
                // absolute relative path (/path/to/page)
                urlPatternObjects.push({ glob: `${url.origin}/**` });
                break;
            case EnqueueStrategy.SameDomain: {
                // Get the actual hostname from the base url
                const baseUrlHostname = getDomain(url.hostname, { mixedInputs: false });

                if (baseUrlHostname) {
                    // We have a hostname, so we can use it to match all links on the page that point to it and any subdomains of it
                    url.hostname = baseUrlHostname;
                    urlPatternObjects.push(
                        { glob: `${url.origin.replace(baseUrlHostname, `*.${baseUrlHostname}`)}/**` },
                        { glob: `${url.origin}/**` },
                    );
                } else {
                    // We don't have a hostname (can happen for ips for instance), so reproduce the same behavior
                    // as SameDomainAndSubdomain
                    urlPatternObjects.push({ glob: `${url.origin}/**` });
                }

                break;
            }
            case EnqueueStrategy.All:
            default:
                break;
        }
    }

    let requestOptions = createRequestOptions(urls, options);

    if (transformRequestFunction) {
        requestOptions = requestOptions.map((request) => transformRequestFunction(request)).filter((r) => !!r) as RequestOptions[];
    }

    let requests = createRequests(requestOptions, urlPatternObjects);
    if (limit) requests = requests.slice(0, limit);

    return requestQueue.addRequests(requests);
}

/**
 * @internal
 * This method helps resolve the baseUrl that will be used for filtering in {@link enqueueLinks}.
 * - If a user provides a base url, we always return it
 * - If a user specifies {@link EnqueueStrategy.All} strategy, they do not care if the newly found urls are on the original request domain, or a redirected one
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
