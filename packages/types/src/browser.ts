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
 * The subset of the browser-pool `LaunchContext` that {@apilink IBrowserController} exposes
 * to crawler internals and request handlers. Other fields are only available on the
 * concrete `LaunchContext` class from `@crawlee/browser-pool`.
 */
export interface IBrowserLaunchContext {
    /**
     * The proxy URL the browser was launched with, if any.
     */
    proxyUrl?: string;
    /**
     * The fingerprint applied to the browser, if fingerprinting is enabled.
     * Typed as `unknown` here to avoid pulling fingerprint-generator types into
     * `@crawlee/types`; cast to the concrete `LaunchContext` if you need the
     * structured shape.
     */
    fingerprint?: unknown;
    /**
     * `true` if each page in this browser uses its own context.
     */
    useIncognitoPages?: boolean;
    /**
     * The actual options the browser was launched with, after pre-launch hooks.
     */
    launchOptions?: Dictionary | undefined;
}

/**
 * The user-facing contract of a browser controller exposed on the crawling context as
 * `browserController`.
 *
 * Coordination with the pool (page-counting, `activate`, `assignBrowser`, lifecycle
 * promises, …) is intentionally **not** part of this contract.
 *
 * @category Browser management
 */
export interface IBrowserController<Page = unknown> {
    /**
     * A stable identifier for this controller instance. Useful for tracking
     * which browser served which request.
     */
    readonly id: string;

    /**
     * The configuration the underlying browser was launched with — proxy URL,
     * fingerprint, session, launcher-specific options, etc.
     */
    readonly launchContext: IBrowserLaunchContext;

    /**
     * The raw browser handle from the underlying automation library
     * (Puppeteer `Browser`, Playwright `Browser`/`BrowserContext`, …).
     * Escape hatch for things the controller does not expose directly.
     */
    readonly browser: unknown;

    /**
     * Reads cookies for the given page.
     */
    getCookies(page: Page): Promise<Cookie[]>;

    /**
     * Writes cookies for the given page.
     */
    setCookies(page: Page, cookies: Cookie[]): Promise<void>;

    /**
     * Gracefully closes the browser this controller owns. After this resolves,
     * the controller is no longer usable.
     */
    close(): Promise<void>;
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
     * Proxy URL to use for the page (and the launching browser, if a new one
     * needs to be started).
     */
    proxyUrl?: string;
    /**
     * Disable TLS certificate verification for MITM proxies.
     * Applied both when launching a new browser and when creating a page in an
     * existing one.
     */
    ignoreTlsErrors?: boolean;
}

/**
 * Minimal contract that any object passed to a browser crawler as its `browserPool`
 * option must satisfy.
 *
 * The crawler only depends on three methods of the built-in `BrowserPool`: opening a
 * page for a request, resolving the controller behind a page, and retiring a
 * controller when its session has gone bad. Lifecycle (`destroy`) is the
 * responsibility of whoever owns the pool — since a user-supplied pool is never
 * owned by the crawler, the crawler never tears it down.
 *
 * Implement this interface to plug a custom page-provisioning strategy into any
 * Crawlee browser crawler — for example a remote browser farm, a session-aware pool
 * that pins pages to fingerprints differently, or a thin wrapper around the built-in
 * `BrowserPool`.
 *
 * @category Browser management
 */
export interface IBrowserPool<Controller extends IBrowserController = IBrowserController, Page = unknown> {
    /**
     * Opens a new page. The pool decides which browser to use, launching a new
     * one if needed.
     */
    newPage(options?: NewPageOptions): Promise<Page>;

    /**
     * Returns the controller that owns the given page, or `undefined` if the
     * browser is gone.
     */
    getBrowserControllerByPage(page: Page): Controller | undefined;

    /**
     * Retires the controller — its browser is closed after all remaining pages
     * close. Used by the crawler when a session backing the controller becomes
     * unusable, so its state can't leak across sessions.
     */
    retireBrowserController(controller: Controller): void;
}
