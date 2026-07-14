import { type CrawleeLogger, serviceLocator } from '@crawlee/core';
import type { IBrowserPool, NewPageOptions, PageState } from '@crawlee/types';

import type { BrowserController } from './abstract-classes/browser-controller.js';
import type { BrowserPlugin } from './abstract-classes/browser-plugin.js';
import { BrowserPool } from './browser-pool.js';
import type { BrowserPoolHooks, BrowserPoolOptions } from './browser-pool.js';
import { BROWSER_CONTROLLER_EVENTS, BROWSER_POOL_EVENTS } from './events.js';
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
export type RemoteBrowserEndpoint =
    | string
    | ((options?: { proxyUrl?: string }) => string | ResolvedRemoteEndpoint | Promise<string | ResolvedRemoteEndpoint>);

/**
 * The bridge a {@apilink RemoteBrowserPool} injects into a {@apilink BrowserPlugin} so the plugin can
 * connect to a remote browser without owning any remote-session policy.
 *
 * The plugin only knows how to make the library-specific `connect()` call; everything else — resolving
 * the endpoint, calling the user's `release()`, and guaranteeing release fires at most once — lives in
 * the pool. The plugin calls {@apilink RemoteConnection.resolve|resolve} before connecting, stores the
 * returned `token` on its launch context, and the controller later calls
 * {@apilink RemoteConnection.release|release} with that token when the browser closes.
 *
 * @internal
 */
export interface RemoteConnection {
    /** Resolves the endpoint for a single browser launch. The `token` identifies the session for release. */
    resolve(options?: { proxyUrl?: string }): Promise<{ url: string; token: number }>;
    /** Releases the remote session for `token`. Idempotent — safe to call from both `close()` and `kill()`. */
    release(token: number): Promise<void>;
}

/**
 * Owns the lifecycle of remote browser sessions for a single {@apilink RemoteBrowserPool}: endpoint
 * resolution, the user's `release()` callback, and a release-at-most-once guarantee. Implements
 * {@apilink RemoteConnection} so it can be injected into a plugin.
 */
class RemoteSessionRegistry implements RemoteConnection {
    private readonly sessions = new Map<
        number,
        { url: string; context?: Record<string, unknown>; released: boolean }
    >();
    private nextToken = 0;

    constructor(
        private readonly endpoint: RemoteBrowserEndpoint,
        private readonly onRelease:
            | ((info: { endpoint: string; context?: Record<string, unknown> }) => unknown)
            | undefined,
        private readonly log: CrawleeLogger,
    ) {}

    async resolve(options?: { proxyUrl?: string }): Promise<{ url: string; token: number }> {
        const resolved = typeof this.endpoint === 'function' ? await this.endpoint(options) : this.endpoint;

        let result: ResolvedRemoteEndpoint;
        if (typeof resolved === 'string') {
            if (!resolved) throw new Error('Remote browser endpoint resolved to an empty string.');
            result = { url: resolved };
        } else if (!resolved?.url) {
            throw new Error("Remote browser endpoint() must return a URL string or an object with a non-empty 'url'.");
        } else {
            result = resolved;
        }

        const token = this.nextToken++;
        this.sessions.set(token, { url: result.url, context: result.context, released: false });
        return { url: result.url, token };
    }

    async release(token: number): Promise<void> {
        const session = this.sessions.get(token);
        // Release at most once per session — guards a close()/teardown race (the `released` flag is set
        // synchronously before the awaited onRelease, so releaseAll() can't double-fire an in-flight release).
        if (!session || session.released) return;
        session.released = true;

        try {
            await this.onRelease?.({ endpoint: session.url, context: session.context });
        } catch (err) {
            this.log.warning('Remote browser release() failed.', { error: (err as Error)?.message });
        } finally {
            this.sessions.delete(token);
        }
    }

    /** Releases every session that is still open. Called on pool teardown so no remote session leaks. */
    async releaseAll(): Promise<void> {
        await Promise.all([...this.sessions.keys()].map(async (token) => this.release(token)));
    }
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
    release?: (info: { endpoint: string; context?: Record<string, unknown> }) => unknown;
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
 * The remote-connection configuration a browser crawler accepts on its `remoteBrowser` option. It is the
 * {@apilink RemoteBrowserPoolOptions} a user supplies *minus* the parts the crawler provides itself — the
 * `browserPlugins` (the crawler builds the correct one for its browser) and `browserPoolOptions` (taken from
 * the crawler's own `browserPoolOptions`). This is what makes the crawler path both terse and mismatch-proof.
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
export class RemoteBrowserPool<Page = unknown> implements IBrowserPool<Page> {
    /** The wrapped pool that performs the remote connections and serves pages. */
    readonly browserPool: BrowserPool;

    /** The wrapped pool viewed through the {@apilink IBrowserPool} contract (the bare type widens pages to `never`). */
    private readonly pool: IBrowserPool<Page>;

    private readonly registry: RemoteSessionRegistry;
    private readonly slotPollIntervalMillis: number;
    private readonly log: CrawleeLogger;

    /** Shared by all `newPage` callers waiting for a free slot, so they don't each register their own listeners. */
    private _capacityChange?: Promise<void>;

    constructor(options: RemoteBrowserPoolOptions) {
        const {
            browserPlugins,
            endpoint,
            release,
            maxOpenBrowsers,
            connection = {},
            browserPoolOptions = {},
            slotPollIntervalMillis = 500,
        } = options;

        this.log = serviceLocator.getLogger().child({ prefix: 'RemoteBrowserPool' });
        this.slotPollIntervalMillis = slotPollIntervalMillis;

        // A RemoteBrowserProvider carries its own endpoint, release, and maxOpenBrowsers.
        const provider = endpoint instanceof RemoteBrowserProvider ? endpoint : undefined;
        const resolvedEndpoint: RemoteBrowserEndpoint = provider
            ? (opts) => provider.connect(opts)
            : (endpoint as RemoteBrowserEndpoint);
        const resolvedRelease = provider
            ? ({ context }: { context?: Record<string, unknown> }) => provider.release(context as any)
            : release;
        const resolvedMax = maxOpenBrowsers ?? provider?.maxOpenBrowsers;

        this.registry = new RemoteSessionRegistry(resolvedEndpoint, resolvedRelease, this.log);

        // Wire every plugin for remote connection.
        for (const plugin of browserPlugins) {
            plugin.useRemoteConnection(this.registry, connection);
        }

        this.browserPool = new BrowserPool({ ...browserPoolOptions, browserPlugins }) as unknown as BrowserPool;
        this.pool = this.browserPool as unknown as IBrowserPool<Page>;

        // Release a browser's remote session once it closes. The registry dedupes (close() schedules a delayed
        // kill(), so BROWSER_CLOSED can fire twice), and destroy()'s releaseAll() backstops any that never close.
        this.browserPool.on(BROWSER_POOL_EVENTS.BROWSER_LAUNCHED, (controller: BrowserController) => {
            controller.once(BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED, () => {
                const token = controller.launchContext._remoteToken;
                if (token !== undefined) void this.registry.release(token);
            });
        });

        if (resolvedMax !== undefined) {
            this.browserPool.maxOpenBrowsers = resolvedMax;
        }
    }

    /** Maximum number of remote browsers that may be open at the same time. */
    get maxOpenBrowsers(): number {
        return this.browserPool.maxOpenBrowsers;
    }

    set maxOpenBrowsers(value: number) {
        this.browserPool.maxOpenBrowsers = value;
    }

    /**
     * Opens a new page, waiting first until {@apilink RemoteBrowserPoolOptions.maxOpenBrowsers|maxOpenBrowsers}
     * allows it (either a new browser slot is free, or an active browser still has page capacity).
     */
    async newPage(options?: NewPageOptions): Promise<Page> {
        await this._waitForFreeSlot();
        return this.pool.newPage(options);
    }

    async closePage(page: Page, options?: { error?: Error }): Promise<void> {
        return this.pool.closePage(page, options);
    }

    async extractPageState(page: Page): Promise<PageState> {
        return this.pool.extractPageState(page);
    }

    async injectPageState(page: Page, state: PageState): Promise<void> {
        return this.pool.injectPageState(page, state);
    }

    /** Closes all browsers, releases any still-open remote sessions, and tears down the wrapped pool. */
    async destroy(): Promise<void> {
        await this.browserPool.destroy();
        // Backstop: release any sessions whose browser never emitted a close (e.g. dropped on teardown).
        await this.registry.releaseAll();
    }

    /** Resolves once the wrapped pool can serve another page without exceeding `maxOpenBrowsers`. */
    private async _waitForFreeSlot(): Promise<void> {
        while (!this.browserPool.hasFreeBrowserSlot() && !this.browserPool.hasActiveBrowserWithFreeCapacity()) {
            await this._nextCapacityChange();
        }
    }

    /**
     * Resolves on the next browser-retired / page-closed event, or after `slotPollIntervalMillis`. All
     * concurrently-waiting `newPage` calls share a single promise (and a single pair of event listeners)
     * per tick, so a fleet of saturated callers doesn't fan out into N listener pairs on the pool.
     */
    private _nextCapacityChange(): Promise<void> {
        this._capacityChange ??= new Promise<void>((resolve) => {
            const done = () => {
                clearTimeout(timer);
                this.browserPool.off(BROWSER_POOL_EVENTS.BROWSER_RETIRED, done);
                this.browserPool.off(BROWSER_POOL_EVENTS.PAGE_CLOSED, done);
                this._capacityChange = undefined;
                resolve();
            };

            const timer = setTimeout(done, this.slotPollIntervalMillis);
            timer.unref?.();
            this.browserPool.once(BROWSER_POOL_EVENTS.BROWSER_RETIRED, done);
            this.browserPool.once(BROWSER_POOL_EVENTS.PAGE_CLOSED, done);
        });

        return this._capacityChange;
    }
}
