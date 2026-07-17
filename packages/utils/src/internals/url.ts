import { getDomain } from 'tldts';

export type SearchParams = string | URLSearchParams | Record<string, string | number | boolean | null | undefined>;

/** Enqueue strategy values, mirroring the `EnqueueStrategy` enum from `@crawlee/core` (which `@crawlee/utils` can't import). */
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

/** Strip a trailing dot so `example.com.` equals `example.com`. */
function normalizeHostname(hostname: string): string {
    return hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
}

/**
 * Check whether `target` matches `origin` under the given enqueue `strategy`. The URL scheme is not
 * considered here (use {@apilink filterUrl} for the combined scheme + strategy check).
 *
 * Reimplements the `EnqueueStrategy` semantics of `@crawlee/core` (which matches via glob patterns in
 * `packages/core/src/enqueue_links/enqueue_links.ts` and can't be imported from here) as a boolean
 * predicate — keep the two in sync when changing either.
 */
export function matchesEnqueueStrategy(strategy: EnqueueStrategyValue, target: URL, origin: URL): boolean {
    switch (strategy) {
        case 'all':
            return true;
        case 'same-hostname':
            return normalizeHostname(target.hostname) === normalizeHostname(origin.hostname);
        case 'same-domain': {
            const originDomain = getDomain(origin.hostname, { mixedInputs: false });

            if (originDomain) {
                return originDomain === getDomain(target.hostname, { mixedInputs: false });
            }

            // No registrable domain (e.g. an IP address), fall back to comparing origins.
            return target.origin === origin.origin;
        }
        case 'same-origin':
            // Compare scheme/host/port directly so a trailing-dot host is normalized.
            return (
                target.protocol === origin.protocol &&
                normalizeHostname(target.hostname) === normalizeHostname(origin.hostname) &&
                target.port === origin.port
            );
        default:
            throw new Error(`Unknown enqueue strategy '${strategy satisfies never}'.`);
    }
}

/**
 * Check whether `target` may be enqueued under `strategy` relative to `origin`: it must use an `http(s)`
 * scheme and match the strategy. On rejection, `reason` is a human-readable message for log output.
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

    if (originUrl === null) {
        return { allowed: false, reason: 'invalid origin URL' };
    }

    if (!matchesEnqueueStrategy(strategy, targetUrl, originUrl)) {
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
