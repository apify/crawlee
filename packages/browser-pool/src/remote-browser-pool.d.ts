import type { IBrowserPool, NewPageOptions, PageState } from '@crawlee/types';
import type { BrowserPlugin } from './abstract-classes/browser-plugin.js';
import { BrowserPool } from './browser-pool.js';
import type { BrowserPoolHooks, BrowserPoolOptions } from './browser-pool.js';
import { RemoteBrowserProvider } from './remote-browser-provider.js';
/**
 * The result of resolving a remote browser endpoint: the URL to connect to plus an optional opaque
 * `context` object that is handed back to `release`.
 */
export interface ResolvedRemoteEndpoint {
    /** The browser endpoint URL to connect to. */
    url: string;
    /** Opaque metadata passed back to `release()` — e.g. session IDs, API tokens. */
    context?: Record<string, unknown>;
}
/**
 * A remote browser endpoint: either a static URL string, or a function called once per browser launch
 * that returns a URL (optionally with a `context` for `release`).
 *
 * The function receives the `proxyUrl` resolved by Crawlee's proxy configuration for the launch, so it
 * can forward it to the remote service's proxy API.
 */
export type RemoteBrowserEndpoint = string | ((options?: {
    proxyUrl?: string;
}) => string | ResolvedRemoteEndpoint | Promise<string | ResolvedRemoteEndpoint>);
/**
 * The bridge a {@apilink RemoteBrowserPool} injects into a {@apilink BrowserPlugin} so the plugin can
 * connect to a remote browser without owning any remote-session policy.
 *
 * The plugin only knows how to make the library-specific `connect()` call; everything else — resolving
 * the endpoint, calling the user's `release()`, and guaranteeing release fires at most once — lives in
 * the pool. The plugin calls {@apilink RemoteConnection.resolve|resolve} before connecting, stores the
 * returned `token` on its launch context, and the controller later calls
 * {@apilink RemoteConnection.release|release} with that token when the browser closes.
 */
export interface RemoteConnection {
    /** Resolves the endpoint for a single browser launch. The `token` identifies the session for release. */
    resolve(options?: {
        proxyUrl?: string;
    }): Promise<{
        url: string;
        token: number;
    }>;
    /** Releases the remote session for `token`. Idempotent — safe to call from both `close()` and `kill()`. */
    release(token: number): Promise<void>;
}
/**
 * Per-plugin remote connection parameters, passed to {@apilink BrowserPlugin.useRemoteConnection}.
 * The endpoint is supplied per-launch via {@apilink RemoteConnection}; these are the static connect()
 * parameters (protocol, headers, timeouts, …).
 */
export interface RemoteConnectionParameters {
    /**
     * Playwright only: which protocol to connect with. `'cdp'` uses `connectOverCDP()` (the default),
     * `'playwright'` uses `connect()` (Playwright's own WebSocket protocol). Ignored by Puppeteer.
     */
    protocol?: 'cdp' | 'playwright';
    /** Extra options forwarded to the library `connect()` / `connectOverCDP()` call (endpoint excluded). */
    connectOptions?: Record<string, unknown>;
}
export interface RemoteBrowserPoolOptions {
    /**
     * The browser plugin(s) used to connect to the remote service — e.g. `new PlaywrightPlugin(playwright.chromium)`
     * or `new PuppeteerPlugin(puppeteer)`. The pool configures them for remote connection; do not set a local
     * `launchOptions` on them.
     */
    browserPlugins: BrowserPlugin[];
    /**
     * The remote browser endpoint: a static URL, a function returning one per launch, or a
     * {@apilink RemoteBrowserProvider} instance encapsulating a session create/release lifecycle.
     */
    endpoint: RemoteBrowserEndpoint | RemoteBrowserProvider<any>;
    /**
     * Cleanup callback invoked when a browser closes, crashes, or the pool is destroyed. Receives the
     * `context` returned by a function endpoint. Errors are caught and logged. Ignored when `endpoint`
     * is a {@apilink RemoteBrowserProvider} (its own `release()` is used instead).
     */
    release?: (info: {
        endpoint: string;
        context?: Record<string, unknown>;
    }) => unknown;
    /**
     * Maximum number of remote browsers open at once. When reached, {@apilink RemoteBrowserPool.newPage|newPage}
     * waits for a browser to close before connecting a new one. Set it to your service's concurrent-session limit
     * to avoid `429` errors. Defaults to the {@apilink RemoteBrowserProvider.maxOpenBrowsers|provider's value}, or
     * `Infinity`.
     */
    maxOpenBrowsers?: number;
    /** Static connect() parameters (Playwright protocol selection, headers, timeouts, …). */
    connection?: RemoteConnectionParameters;
    /** Extra {@apilink BrowserPool} options (lifecycle hooks, page limits, fingerprinting, …). */
    browserPoolOptions?: Omit<BrowserPoolOptions, 'browserPlugins'> & BrowserPoolHooks<any, any, any>;
    /** Fallback poll interval (ms) while waiting for a free browser slot. The wait is event-driven; this only bounds it. @default 500 */
    slotPollIntervalMillis?: number;
}
/**
 * The remote-connection configuration a browser crawler accepts on its `remoteBrowser` option: the
 * {@apilink RemoteBrowserPoolOptions} minus the `browserPlugins` (the crawler builds the correct one for its
 * browser, which is what makes this path mismatch-proof) and minus `browserPoolOptions` — tuning the wrapping
 * pool means building the pool yourself, through the `remote*BrowserPool()` factory for your crawler.
 */
export type CrawlerRemoteBrowserOptions = Omit<RemoteBrowserPoolOptions, 'browserPlugins' | 'browserPoolOptions'>;
/**
 * An {@apilink IBrowserPool} implementation for remote browser services.
 *
 * Unlike configuring a remote browser through a crawler's `launchContext`, this pool is the single owner
 * of all remote-session concerns:
 * - **endpoint resolution** — static URL, per-launch function, or {@apilink RemoteBrowserProvider};
 * - **release lifecycle** — `release()` fires exactly once per session on close/crash/teardown (no leaks,
 *   no double-release);
 * - **concurrency** — {@apilink RemoteBrowserPoolOptions.maxOpenBrowsers|maxOpenBrowsers} is enforced inside
 *   {@apilink RemoteBrowserPool.newPage|newPage}, which waits for a free slot rather than overshooting.
 *
 * The wrapped {@apilink BrowserPool} and its plugin only perform the library-specific `connect()` call.
 *
 * Pass an instance as the crawler's `browserPool` option:
 *
 * ```typescript
 * import { PlaywrightPlugin, RemoteBrowserPool } from '@crawlee/browser-pool';
 * import { PlaywrightCrawler } from 'crawlee';
 * import playwright from 'playwright';
 *
 * const browserPool = new RemoteBrowserPool({
 *     browserPlugins: [new PlaywrightPlugin(playwright.chromium)],
 *     endpoint: 'wss://production-sfo.browserless.io?token=xxx',
 *     maxOpenBrowsers: 2,
 * });
 *
 * const crawler = new PlaywrightCrawler({ browserPool });
 * ```
 *
 * @category Browser management
 */
export declare class RemoteBrowserPool<Page = unknown> implements IBrowserPool<Page> {
    #private;
    /** The wrapped pool that performs the remote connections and serves pages. */
    readonly browserPool: BrowserPool;
    constructor(options: RemoteBrowserPoolOptions);
    /** Maximum number of remote browsers that may be open at the same time. */
    get maxOpenBrowsers(): number;
    set maxOpenBrowsers(value: number);
    /**
     * Opens a new page, waiting first until {@apilink RemoteBrowserPoolOptions.maxOpenBrowsers|maxOpenBrowsers}
     * allows it (either a new browser slot is free, or an active browser still has page capacity).
     */
    newPage(options?: NewPageOptions): Promise<Page>;
    closePage(page: Page, options?: {
        error?: Error;
    }): Promise<void>;
    extractPageState(page: Page): Promise<PageState>;
    injectPageState(page: Page, state: PageState): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
    /** Closes all browsers, releases any still-open remote sessions, and tears down the wrapped pool. */
    destroy(): Promise<void>;
    /** Resolves once the wrapped pool can serve another page without exceeding `maxOpenBrowsers`. */
    private waitForFreeSlot;
    /**
     * Resolves on the next browser-retired / page-closed event, or after `slotPollIntervalMillis`. All
     * concurrently-waiting `newPage` calls share a single promise (and a single pair of event listeners)
     * per tick, so a fleet of saturated callers doesn't fan out into N listener pairs on the pool.
     */
    private nextCapacityChange;
}
