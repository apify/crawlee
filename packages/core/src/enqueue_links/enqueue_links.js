import { EnqueueStrategy } from '@crawlee/utils';
import { getDomain } from 'tldts';
export { EnqueueStrategy };
/**
 * @internal
 * This method helps resolve the baseUrl that will be used for filtering in {@apilink enqueueLinks}.
 * - If a user provides a base url, we always return it
 * - If a user specifies {@apilink EnqueueStrategy.All} strategy, they do not care if the newly found urls are on the original
 *   request domain, or a redirected one
 * - In all other cases, we return the domain of the original request as that's the one we need to use for filtering
 */
export function resolveBaseUrlForEnqueueLinksFiltering({ enqueueStrategy, finalRequestUrl, originalRequestUrl, userProvidedBaseUrl, }) {
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
        const originalHostname = getDomain(originalUrlOrigin, { mixedInputs: false });
        const finalHostname = getDomain(finalUrlOrigin, { mixedInputs: false });
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
 * Builds the glob patterns a URL must match to satisfy the given enqueue `strategy`, anchored at `baseUrl`.
 */
export function buildEnqueueStrategyPatterns(baseUrl, strategy) {
    const url = new URL(baseUrl);
    switch (strategy) {
        case EnqueueStrategy.SameHostname:
            // We need to get the origin of the passed in domain in the event someone sets baseUrl
            // to an url like https://example.com/deep/default/path and one of the found urls is an
            // absolute relative path (/path/to/page)
            return [{ glob: ignoreHttpSchema(`${url.origin}/**`) }];
        case EnqueueStrategy.SameDomain: {
            // Get the actual hostname from the base url
            const baseUrlHostname = getDomain(url.hostname, { mixedInputs: false });
            if (baseUrlHostname) {
                // We have a hostname, so we can use it to match all links on the page that point to it and any subdomains of it
                url.hostname = baseUrlHostname;
                return [
                    { glob: ignoreHttpSchema(`${url.origin.replace(baseUrlHostname, `*.${baseUrlHostname}`)}/**`) },
                    { glob: ignoreHttpSchema(`${url.origin}/**`) },
                ];
            }
            // We don't have a hostname (can happen for ips for instance), so reproduce the same behavior
            // as SameDomainAndSubdomain
            return [{ glob: ignoreHttpSchema(`${url.origin}/**`) }];
        }
        case EnqueueStrategy.SameOrigin:
            // The same behavior as SameHostname, but respecting the protocol of the URL
            return [{ glob: `${url.origin}/**` }];
        case EnqueueStrategy.All:
        default:
            return [{ glob: `http{s,}://**` }];
    }
}
/**
 * Internal function that changes the enqueue glob patterns to match both http and https
 */
function ignoreHttpSchema(pattern) {
    return pattern.replace(/^(https?):\/\//, 'http{s,}://');
}
