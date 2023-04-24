"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveBaseUrlForEnqueueLinksFiltering = exports.enqueueLinks = exports.EnqueueStrategy = void 0;
const tslib_1 = require("tslib");
const tldts_1 = require("tldts");
const ow_1 = tslib_1.__importDefault(require("ow"));
const log_1 = tslib_1.__importDefault(require("@apify/log"));
const shared_1 = require("./shared");
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
var EnqueueStrategy;
(function (EnqueueStrategy) {
    /**
     * Matches any URLs found
     */
    EnqueueStrategy["All"] = "all";
    /**
     * Matches any URLs that have the same hostname.
     * For example, `https://wow.example.com/hello` will be matched for a base url of `https://wow.example.com/`, but
     * `https://example.com/hello` will not be matched.
     *
     * > This strategy will match both `http` and `https` protocols regardless of the base URL protocol.
     */
    EnqueueStrategy["SameHostname"] = "same-hostname";
    /**
     * Matches any URLs that have the same domain as the base URL.
     * For example, `https://wow.an.example.com` and `https://example.com` will both be matched for a base url of
     * `https://example.com`.
     *
     * > This strategy will match both `http` and `https` protocols regardless of the base URL protocol.
     */
    EnqueueStrategy["SameDomain"] = "same-domain";
    /**
     * Matches any URLs that have the same hostname and protocol.
     * For example, `https://wow.example.com/hello` will be matched for a base url of `https://wow.example.com/`, but
     * `http://wow.example.com/hello` will not be matched.
     *
     * > This strategy will ensure the protocol of the base URL is the same as the protocol of the URL to be enqueued.
     */
    EnqueueStrategy["SameOrigin"] = "same-origin";
})(EnqueueStrategy = exports.EnqueueStrategy || (exports.EnqueueStrategy = {}));
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
async function enqueueLinks(options) {
    if (!options || Object.keys(options).length === 0) {
        throw new RangeError([
            // eslint-disable-next-line max-len
            'enqueueLinks() was called without the required options. You can only do that when you use the `crawlingContext.enqueueLinks()` method in request handlers.',
            'Check out our guide on how to use enqueueLinks() here: https://crawlee.dev/docs/examples/crawl-relative-links',
        ].join('\n'));
    }
    (0, ow_1.default)(options, ow_1.default.object.exactShape({
        urls: ow_1.default.array.ofType(ow_1.default.string),
        requestQueue: ow_1.default.object.hasKeys('fetchNextRequest', 'addRequest'),
        forefront: ow_1.default.optional.boolean,
        limit: ow_1.default.optional.number,
        selector: ow_1.default.optional.string,
        baseUrl: ow_1.default.optional.string,
        userData: ow_1.default.optional.object,
        label: ow_1.default.optional.string,
        pseudoUrls: ow_1.default.optional.array.ofType(ow_1.default.any(ow_1.default.string, ow_1.default.object.hasKeys('purl'))),
        globs: ow_1.default.optional.array.ofType(ow_1.default.any(ow_1.default.string, ow_1.default.object.hasKeys('glob'))),
        exclude: ow_1.default.optional.array.ofType(ow_1.default.any(ow_1.default.string, ow_1.default.regExp, ow_1.default.object.hasKeys('glob'), ow_1.default.object.hasKeys('regexp'))),
        regexps: ow_1.default.optional.array.ofType(ow_1.default.any(ow_1.default.regExp, ow_1.default.object.hasKeys('regexp'))),
        transformRequestFunction: ow_1.default.optional.function,
        strategy: ow_1.default.optional.string.oneOf(Object.values(EnqueueStrategy)),
    }));
    const { requestQueue, limit, urls, pseudoUrls, exclude, globs, regexps, transformRequestFunction, forefront, } = options;
    const urlExcludePatternObjects = [];
    const urlPatternObjects = [];
    if (exclude?.length) {
        for (const excl of exclude) {
            if (typeof excl === 'string' || 'glob' in excl) {
                urlExcludePatternObjects.push(...(0, shared_1.constructGlobObjectsFromGlobs)([excl]));
            }
            else if (excl instanceof RegExp || 'regexp' in excl) {
                urlExcludePatternObjects.push(...(0, shared_1.constructRegExpObjectsFromRegExps)([excl]));
            }
        }
    }
    if (pseudoUrls?.length) {
        log_1.default.deprecated('`pseudoUrls` option is deprecated, use `globs` or `regexps` instead');
        urlPatternObjects.push(...(0, shared_1.constructRegExpObjectsFromPseudoUrls)(pseudoUrls));
    }
    if (globs?.length) {
        urlPatternObjects.push(...(0, shared_1.constructGlobObjectsFromGlobs)(globs));
    }
    if (regexps?.length) {
        urlPatternObjects.push(...(0, shared_1.constructRegExpObjectsFromRegExps)(regexps));
    }
    if (!urlPatternObjects.length) {
        options.strategy ?? (options.strategy = EnqueueStrategy.SameHostname);
    }
    const enqueueStrategyPatterns = [];
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
                const baseUrlHostname = (0, tldts_1.getDomain)(url.hostname, { mixedInputs: false });
                if (baseUrlHostname) {
                    // We have a hostname, so we can use it to match all links on the page that point to it and any subdomains of it
                    url.hostname = baseUrlHostname;
                    enqueueStrategyPatterns.push({ glob: ignoreHttpSchema(`${url.origin.replace(baseUrlHostname, `*.${baseUrlHostname}`)}/**`) }, { glob: ignoreHttpSchema(`${url.origin}/**`) });
                }
                else {
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
                break;
        }
    }
    let requestOptions = (0, shared_1.createRequestOptions)(urls, options);
    if (transformRequestFunction) {
        requestOptions = requestOptions.map((request) => transformRequestFunction(request)).filter((r) => !!r);
    }
    function createFilteredRequests() {
        // No user provided patterns means we can skip an extra filtering step
        if (urlPatternObjects.length === 0) {
            return (0, shared_1.createRequests)(requestOptions, enqueueStrategyPatterns, urlExcludePatternObjects);
        }
        // Generate requests based on the user patterns first
        const generatedRequestsFromUserFilters = (0, shared_1.createRequests)(requestOptions, urlPatternObjects, urlExcludePatternObjects);
        // ...then filter them by the enqueue links strategy (making this an AND check)
        return (0, shared_1.filterRequestsByPatterns)(generatedRequestsFromUserFilters, enqueueStrategyPatterns);
    }
    let requests = createFilteredRequests();
    if (limit)
        requests = requests.slice(0, limit);
    return requestQueue.addRequests(requests, { forefront });
}
exports.enqueueLinks = enqueueLinks;
/**
 * @internal
 * This method helps resolve the baseUrl that will be used for filtering in {@apilink enqueueLinks}.
 * - If a user provides a base url, we always return it
 * - If a user specifies {@apilink EnqueueStrategy.All} strategy, they do not care if the newly found urls are on the original
 *   request domain, or a redirected one
 * - In all other cases, we return the domain of the original request as that's the one we need to use for filtering
 */
function resolveBaseUrlForEnqueueLinksFiltering({ enqueueStrategy, finalRequestUrl, originalRequestUrl, userProvidedBaseUrl, }) {
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
        const originalHostname = (0, tldts_1.getDomain)(originalUrlOrigin, { mixedInputs: false });
        const finalHostname = (0, tldts_1.getDomain)(finalUrlOrigin, { mixedInputs: false });
        if (originalHostname === finalHostname) {
            return finalUrlOrigin;
        }
        return undefined;
    }
    // Always enqueue urls that are from the same origin in all other cases, as the filtering happens on the original request url, even if there was a redirect
    // before actually finding the urls
    return originalUrlOrigin;
}
exports.resolveBaseUrlForEnqueueLinksFiltering = resolveBaseUrlForEnqueueLinksFiltering;
/**
 * Internal function that changes the enqueue globs to match both http and https
 */
function ignoreHttpSchema(pattern) {
    return pattern.replace(/^(https?):\/\//, 'http{s,}://');
}
//# sourceMappingURL=enqueue_links.js.map