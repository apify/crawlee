import type { BaseHttpClient as BaseHttpClientInterface, CookieJar, CrawleeLogger, SendRequestOptions, SessionFingerprint } from '@crawlee/types';
/**
 * Per-request options handed to a concrete client's `fetch` implementation.
 */
export interface CustomFetchOptions {
    /**
     * Effective proxy URL for this request. `sendRequest` populates this from
     * the explicit `SendRequestOptions.proxyUrl` override when set, falling back
     * to `session.proxyInfo.url`.
     */
    proxyUrl?: string;
    /**
     * Effective cookie jar for this request. `sendRequest` populates this from
     * the explicit `SendRequestOptions.cookieJar` override when set, falling
     * back to `session.cookieJar` (or a fresh jar when neither is provided).
     */
    cookieJar?: CookieJar;
    /**
     * Hints about which browser-like setup this request should be impersonating —
     * `browser`, `platform`, `device`, and an opaque `details` slot for richer
     * payloads (e.g. a full browser fingerprint from `fingerprint-generator`).
     * These are *suggestions*, not requirements: each client applies what it can
     * (e.g. impit maps `browser` to its impersonation profile) and ignores the
     * rest on a best-effort basis. Sourced from `SendRequestOptions.session.fingerprint`.
     */
    fingerprint?: SessionFingerprint;
    /**
     * When `true`, TLS certificate errors should be ignored for this request.
     * Set when `SendRequestOptions.ignoreTlsErrors` is passed (e.g. from the
     * `ignoreTlsErrors` crawler option) or when the session's proxy is a MITM
     * proxy (`session.proxyInfo.ignoreTlsErrors`). Best-effort: clients that
     * cannot disable TLS verification ignore it.
     */
    ignoreTlsErrors?: boolean;
}
/**
 * Base HTTP client that provides fetch-like `sendRequest` with Crawlee-managed
 * behaviors (redirect handling, proxy and cookie handling). Concrete clients
 * implement only the low-level network call in `fetch`.
 */
export declare abstract class BaseHttpClient implements BaseHttpClientInterface {
    #private;
    constructor(options?: {
        logger?: CrawleeLogger;
    });
    /**
     * Perform the raw network request and return a single Response without any
     * automatic redirect following or special error handling.
     */
    protected abstract fetch(input: Request, init?: RequestInit & CustomFetchOptions): Promise<Response>;
    private applyCookies;
    private setCookies;
    private resolveRequestContext;
    private createAbortSignal;
    private isRedirect;
    private buildRedirectRequest;
    /**
     * Public fetch-like method that handles redirects and uses provided proxy and cookie jar.
     */
    sendRequest(initialRequest: Request, options?: SendRequestOptions): Promise<Response>;
}
