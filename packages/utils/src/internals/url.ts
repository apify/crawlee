import { getDomain } from 'tldts';

export type SearchParams = string | URLSearchParams | Record<string, string | number | boolean | null | undefined>;

/**
 * The enqueue strategy values used to decide whether a target URL is eligible relative to an origin URL.
 *
 * These mirror the string values of the `EnqueueStrategy` enum from `@crawlee/core`. The strategy
 * matching lives here (in the lower-level `@crawlee/utils` package) so that the sitemap and `robots.txt`
 * helpers can apply it without depending on `@crawlee/core`.
 */
export type EnqueueStrategyValue = 'all' | 'same-hostname' | 'same-domain' | 'same-origin';

/** Reusable suffix for log messages explaining why a non-`http(s)` URL was rejected. */
export const UNSUPPORTED_SCHEME_MESSAGE = 'unsupported URL scheme (only http and https are allowed)';

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

function toUrl(value: string | URL): URL | null {
    if (value instanceof URL) {
        return value;
    }

    try {
        return new URL(value);
    } catch {
        return null;
    }
}

/**
 * Check whether `target` matches `origin` under the given enqueue `strategy`. The URL scheme is not
 * considered here (use {@apilink filterUrl} for the combined scheme + strategy check).
 */
export function matchesEnqueueStrategy(strategy: EnqueueStrategyValue, target: URL, origin: URL): boolean {
    switch (strategy) {
        case 'all':
            return true;
        case 'same-hostname':
            return target.hostname === origin.hostname;
        case 'same-domain': {
            const originDomain = getDomain(origin.hostname, { mixedInputs: false });

            if (originDomain) {
                return originDomain === getDomain(target.hostname, { mixedInputs: false });
            }

            // No registrable domain (e.g. an IP address), fall back to comparing origins.
            return target.origin === origin.origin;
        }
        case 'same-origin':
            return target.origin === origin.origin;
        default:
            return false;
    }
}

/**
 * Check whether `target` is eligible to be enqueued under `strategy` relative to `origin`.
 *
 * Combines the two checks every enqueue site needs: the URL must use a supported scheme (`http` or
 * `https`), and it must match `strategy` relative to `origin`. Callers that need to distinguish a
 * scheme rejection from a strategy mismatch can compare the returned reason against
 * {@apilink UNSUPPORTED_SCHEME_MESSAGE}.
 *
 * @param target The URL being evaluated.
 * @param origin The reference URL the target is compared against.
 * @param strategy The enqueue strategy to apply.
 * @returns `{ allowed: true }` if `target` is eligible, otherwise `{ allowed: false, reason }` where
 *   `reason` is a human-readable rejection message suitable for log output.
 */
export function filterUrl(
    target: string | URL,
    origin: string | URL,
    strategy: EnqueueStrategyValue,
): { allowed: boolean; reason?: string } {
    const targetUrl = toUrl(target);

    if (targetUrl === null || !ALLOWED_SCHEMES.has(targetUrl.protocol)) {
        return { allowed: false, reason: UNSUPPORTED_SCHEME_MESSAGE };
    }

    const originUrl = toUrl(origin);

    if (originUrl === null || !matchesEnqueueStrategy(strategy, targetUrl, originUrl)) {
        return { allowed: false, reason: `does not match enqueue strategy '${strategy}'` };
    }

    return { allowed: true };
}

/**
 * Appends search (query string) parameters to a URL, replacing the original value (if any).
 *
 * @param url The URL to append to.
 * @param searchParams The search parameters to be appended.
 * @internal
 */
export function applySearchParams(url: URL, searchParams: SearchParams | undefined): void {
    if (searchParams === undefined) {
        return;
    }

    if (typeof searchParams === 'string') {
        url.search = searchParams;
        return;
    }

    let newSearchParams: URLSearchParams;

    if (searchParams instanceof URLSearchParams) {
        newSearchParams = searchParams;
    } else {
        newSearchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(searchParams)) {
            if (value === undefined) {
                newSearchParams.delete(key);
            } else if (value === null) {
                newSearchParams.append(key, '');
            } else {
                newSearchParams.append(key, value as string);
            }
        }
    }

    url.search = newSearchParams.toString();
}
