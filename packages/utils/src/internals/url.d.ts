import type { SearchParams } from '@crawlee/types';
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
/** Reusable suffix for log messages explaining why a non-`http(s)` URL was rejected. */
export declare const UNSUPPORTED_SCHEME_MESSAGE = "unsupported URL scheme (only http and https are allowed)";
/**
 * Check whether `target` matches `origin` under the given enqueue `strategy`. The URL scheme is not
 * considered here (use {@apilink filterUrl} for the combined scheme + strategy check).
 *
 * The `enqueueLinks` implementation in `@crawlee/core` matches the same strategies via glob patterns
 * (see `packages/core/src/enqueue_links/enqueue_links.ts`) — keep the two in sync when changing either.
 */
export declare function matchesEnqueueStrategy(strategy: EnqueueStrategy | `${EnqueueStrategy}`, target: URL, origin: URL): boolean;
/**
 * Check whether `target` may be enqueued under `strategy` relative to `origin`: it must use an `http(s)`
 * scheme and match the strategy. On rejection, `reason` is a human-readable message for log output.
 */
export declare function filterUrl(target: string | URL, origin: string | URL, strategy: EnqueueStrategy | `${EnqueueStrategy}`): {
    allowed: boolean;
    reason?: string;
};
/**
 * Appends search (query string) parameters to a URL, replacing the original value (if any).
 *
 * @param url The URL to append to.
 * @param searchParams The search parameters to be appended.
 * @internal
 */
export declare function applySearchParams(url: URL, searchParams: SearchParams | undefined): void;
