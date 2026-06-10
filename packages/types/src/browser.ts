import type { ISession } from './session.js';
import type { Dictionary } from './utility-types.js';

export interface Cookie {
    /**
     * Cookie name.
     */
    name: string;
    /**
     * Cookie value.
     */
    value: string;
    /**
     * The request-URI to associate with the setting of the cookie. This value can affect the
     * default domain, path, source port, and source scheme values of the created cookie.
     */
    url?: string;
    /**
     * Cookie domain.
     */
    domain?: string;
    /**
     * Cookie path.
     */
    path?: string;
    /**
     * True if cookie is secure.
     */
    secure?: boolean;
    /**
     * True if cookie is http-only.
     */
    httpOnly?: boolean;
    /**
     * Cookie SameSite type.
     */
    sameSite?: 'Strict' | 'Lax' | 'None';
    /**
     * Cookie expiration date, session cookie if not set
     */
    expires?: number;
    /**
     * Cookie Priority.
     */
    priority?: 'Low' | 'Medium' | 'High';
    /**
     * True if cookie is SameParty.
     */
    sameParty?: boolean;
    /**
     * Cookie source scheme type.
     */
    sourceScheme?: 'Unset' | 'NonSecure' | 'Secure';
    /**
     * Cookie source port. Valid values are `-1` or `1-65535`, `-1` indicates an unspecified port.
     * An unspecified port value allows protocol clients to emulate legacy cookie scope for the port.
     * This is a temporary ability and it will be removed in the future.
     */
    sourcePort?: number;
}

export interface BrowserLikeResponse {
    url(): string;
    headers(): Dictionary<string | string[]>;
}

/**
 * A snapshot of the relevant state of a page, as extracted by
 * {@apilink IBrowserPool.extractPageState}.
 */
export interface PageState {
    /**
     * Cookies currently set in the page's browsing context.
     */
    cookies: Cookie[];
}

/**
 * Options accepted by {@apilink IBrowserPool.newPage}.
 */
export interface NewPageOptions {
    /**
     * Assign a custom ID to the page. If you don't provide one, a random string
     * ID is generated.
     */
    id?: string;
    /**
     * The crawling session that will use the returned page.
     *
     * The pool derives proxy configuration from the session's {@apilink
     * ProxyInfo|proxy} (including TLS-error handling) — there are intentionally
     * no standalone `proxyUrl` / `ignoreTlsErrors` options; configure them
     * through the session instead.
     *
     * Session injection is **best-effort**: the pool may use the session's
     * {@apilink ProxyInfo|proxy}, cookies, or fingerprint data to configure the
     * page or the underlying browser, but none of this is guaranteed. Different
     * pool implementations (or pool configurations such as `useIncognitoPages`)
     * may support different subsets of session properties — or ignore them
     * entirely.
     *
     * The crawler is still responsible for deterministic session setup (e.g.
     * injecting cookies into the page before navigation) that must happen
     * regardless of pool implementation.
     */
    session?: ISession;
}

/**
 * Minimal contract that any object passed to a browser crawler as its `browserPool`
 * option must satisfy.
 *
 * Lifecycle (`destroy`) is the responsibility of whoever owns the pool — since a
 * user-supplied pool is never owned by the crawler, the crawler never tears it
 * down.
 *
 * Implement this interface to plug a custom page-provisioning strategy into any
 * Crawlee browser crawler — for example a remote browser farm, a session-aware
 * pool that pins pages to fingerprints differently, or a thin wrapper around the
 * built-in `BrowserPool`.
 *
 * @category Browser management
 */
export interface IBrowserPool<Page = unknown> {
    /**
     * Opens a new page. The pool decides which browser to use, launching a new
     * one if needed.
     */
    newPage(options?: NewPageOptions): Promise<Page>;

    /**
     * Signals the pool that the caller is done with the page. The pool is
     * responsible for closing the page and performing any necessary cleanup
     * (e.g. retiring the underlying browser when a session has gone bad).
     *
     * @param page The page to release back to the pool.
     * @param options.error If the page is being released because of an error,
     *   pass the error here. In particular, if the error is a
     *   {@apilink SessionError}, implementations should treat it as a signal
     *   to purge all state associated with the session (e.g. discard any
     *   browser that served the page).
     */
    closePage(page: Page, options?: { error?: Error }): Promise<void>;

    /**
     * Extracts the relevant state from a page so the caller can persist it —
     * for example, back-propagating cookies into the crawling {@apilink
     * ISession|session}.
     *
     * @param page The page to read state from.
     */
    extractPageState(page: Page): Promise<PageState>;

    /**
     * Injects state (currently just cookies) into a page. This is the
     * counterpart to {@apilink IBrowserPool.extractPageState} and lets the
     * caller set up a page — for example, seeding it with the crawling
     * {@apilink ISession|session}'s cookies before navigation.
     *
     * As with {@apilink IBrowserPool.newPage}, the caller decides *what* state
     * to inject, while the pool decides *how*.
     *
     * Isolation between pages is **best-effort**: depending on the pool
     * implementation and its configuration, multiple pages may share a browsing
     * context, so injected state (such as cookies) can bleed across pages
     * served by the same underlying browser.
     *
     * @param page The page to inject state into.
     * @param state The state to inject.
     */
    injectPageState(page: Page, state: PageState): Promise<void>;
}
