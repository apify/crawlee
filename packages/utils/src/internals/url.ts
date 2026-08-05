import { getDomain } from 'tldts';

export type SearchParams = string | URLSearchParams | Record<string, string | number | boolean | null | undefined>;

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
 * The `enqueueLinks` implementation in `@crawlee/core` matches the same strategies via glob patterns
 * (see `packages/core/src/enqueue_links/enqueue_links.ts`) — keep the two in sync when changing either.
 */
export function matchesEnqueueStrategy(
    strategy: EnqueueStrategy | `${EnqueueStrategy}`,
    target: URL,
    origin: URL,
): boolean {
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
    strategy: EnqueueStrategy | `${EnqueueStrategy}`,
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
