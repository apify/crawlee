import type { IBrowserPool, NewPageOptions, PageState } from '@crawlee/types';

import type { BrowserPool } from './browser-pool.js';
import { BROWSER_POOL_EVENTS } from './events.js';

export interface RemoteBrowserPoolOptions {
    /**
     * The underlying {@apilink BrowserPool} that performs the actual remote connections. Configure it
     * with a single plugin set up for a remote connection (`remoteBrowser`, `connectOptions`, or
     * `connectOverCDPOptions`).
     */
    browserPool: BrowserPool;
    /**
     * Maximum number of remote browsers that may be open at the same time. When the limit is reached,
     * {@apilink RemoteBrowserPool.newPage|newPage} waits until a browser closes (or an existing one frees
     * a page slot) before opening a new page. Set this to your remote service's concurrent-session limit
     * to avoid `429` errors.
     *
     * When omitted, the wrapped pool's own `maxOpenBrowsers` is used (defaults to `Infinity`, i.e. no limit).
     */
    maxOpenBrowsers?: number;
    /**
     * Fallback poll interval, in milliseconds, used while waiting for a free browser slot. The wait is
     * primarily event-driven (it wakes on browser/page close), so this only bounds how long it can sleep
     * if no event fires.
     *
     * @default 500
     */
    slotPollIntervalMillis?: number;
}

/**
 * An {@apilink IBrowserPool} implementation for remote browser services.
 *
 * It wraps a {@apilink BrowserPool} configured for a remote connection and adds the one piece the plain
 * pool cannot enforce on its own: a {@apilink RemoteBrowserPoolOptions.maxOpenBrowsers|concurrency limit}
 * on open remote browsers. {@apilink RemoteBrowserPool.newPage|newPage} blocks until a slot is free instead
 * of letting the crawler overshoot the remote service's session quota.
 *
 * The remote-session lifecycle (connecting via `endpoint()` and calling `release()` on close) is owned by
 * the wrapped pool's plugin and its `remoteBrowser` configuration — this class only governs *when* new
 * pages may open.
 *
 * Pass an instance as the `browserPool` option of a browser crawler:
 *
 * ```typescript
 * import { BrowserPool, PlaywrightPlugin, RemoteBrowserPool } from '@crawlee/browser-pool';
 * import playwright from 'playwright';
 *
 * const browserPool = new RemoteBrowserPool({
 *     browserPool: new BrowserPool({
 *         browserPlugins: [
 *             new PlaywrightPlugin(playwright.chromium, {
 *                 remoteBrowser: { endpoint: 'wss://production-sfo.browserless.io?token=xxx' },
 *             }),
 *         ],
 *     }),
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

    /**
     * The wrapped pool viewed through the {@apilink IBrowserPool} contract it implements. Used for
     * page delegation because the bare `BrowserPool` type widens its page type to `never`.
     */
    private readonly pool: IBrowserPool<Page>;

    private readonly slotPollIntervalMillis: number;

    constructor(options: RemoteBrowserPoolOptions) {
        const { browserPool, maxOpenBrowsers, slotPollIntervalMillis = 500 } = options;

        this.browserPool = browserPool;
        this.pool = browserPool as unknown as IBrowserPool<Page>;
        this.slotPollIntervalMillis = slotPollIntervalMillis;

        if (maxOpenBrowsers !== undefined) {
            this.browserPool.maxOpenBrowsers = maxOpenBrowsers;
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
     * Opens a new page, waiting first until the {@apilink RemoteBrowserPoolOptions.maxOpenBrowsers|browser
     * limit} allows it. A page can open immediately when either a new browser slot is free or an already
     * active browser still has room for another page.
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

    /** Closes all browsers and tears down the wrapped pool. */
    async destroy(): Promise<void> {
        await this.browserPool.destroy();
    }

    /**
     * Resolves once the wrapped pool can serve another page without exceeding `maxOpenBrowsers`. The check
     * is best-effort: concurrent `newPage` calls may briefly overshoot the limit, mirroring the advisory
     * nature of the crawler-level throttle this replaces.
     */
    private async _waitForFreeSlot(): Promise<void> {
        while (!this.browserPool.hasFreeBrowserSlot() && !this.browserPool.hasActiveBrowserWithFreeCapacity()) {
            await this._waitForCapacityChange();
        }
    }

    /** Resolves on the next browser-retired / page-closed event, or after `slotPollIntervalMillis`. */
    private async _waitForCapacityChange(): Promise<void> {
        await new Promise<void>((resolve) => {
            const done = () => {
                clearTimeout(timer);
                this.browserPool.off(BROWSER_POOL_EVENTS.BROWSER_RETIRED, done);
                this.browserPool.off(BROWSER_POOL_EVENTS.PAGE_CLOSED, done);
                resolve();
            };

            const timer = setTimeout(done, this.slotPollIntervalMillis);
            timer.unref?.();
            this.browserPool.once(BROWSER_POOL_EVENTS.BROWSER_RETIRED, done);
            this.browserPool.once(BROWSER_POOL_EVENTS.PAGE_CLOSED, done);
        });
    }
}
