import { serviceLocator } from '@crawlee/core';
import { BrowserPool } from './browser-pool.js';
import { BROWSER_CONTROLLER_EVENTS, BROWSER_POOL_EVENTS } from './events.js';
import { RemoteBrowserProvider } from './remote-browser-provider.js';
/**
 * Owns the lifecycle of remote browser sessions for a single {@apilink RemoteBrowserPool}: endpoint
 * resolution, the user's `release()` callback, and a release-at-most-once guarantee. Implements
 * {@apilink RemoteConnection} so it can be injected into a plugin.
 */
class RemoteSessionRegistry {
    #sessions = new Map();
    #nextToken = 0;
    #endpoint;
    #onRelease;
    #log;
    constructor(endpoint, onRelease, log) {
        this.#endpoint = endpoint;
        this.#onRelease = onRelease;
        this.#log = log;
    }
    async resolve(options) {
        const resolved = typeof this.#endpoint === 'function' ? await this.#endpoint(options) : this.#endpoint;
        let result;
        if (typeof resolved === 'string') {
            if (!resolved)
                throw new Error('Remote browser endpoint resolved to an empty string.');
            result = { url: resolved };
        }
        else if (!resolved?.url) {
            throw new Error("Remote browser endpoint() must return a URL string or an object with a non-empty 'url'.");
        }
        else {
            result = resolved;
        }
        const token = this.#nextToken++;
        this.#sessions.set(token, { url: result.url, context: result.context, released: false });
        return { url: result.url, token };
    }
    async release(token) {
        const session = this.#sessions.get(token);
        // Release at most once per session — guards a close()/teardown race (the `released` flag is set
        // synchronously before the awaited onRelease, so releaseAll() can't double-fire an in-flight release).
        if (!session || session.released)
            return;
        session.released = true;
        try {
            await this.#onRelease?.({ endpoint: session.url, context: session.context });
        }
        catch (err) {
            this.#log.warning('Remote browser release() failed.', { error: err?.message });
        }
        finally {
            this.#sessions.delete(token);
        }
    }
    /** Releases every session that is still open. Called on pool teardown so no remote session leaks. */
    async releaseAll() {
        await Promise.all([...this.#sessions.keys()].map(async (token) => this.release(token)));
    }
}
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
export class RemoteBrowserPool {
    /** The wrapped pool that performs the remote connections and serves pages. */
    browserPool;
    /** The wrapped pool viewed through the {@apilink IBrowserPool} contract (the bare type widens pages to `never`). */
    #pool;
    #registry;
    #slotPollIntervalMillis;
    #log;
    /** Shared by all `newPage` callers waiting for a free slot, so they don't each register their own listeners. */
    #capacityChange;
    constructor(options) {
        const { browserPlugins, endpoint, release, maxOpenBrowsers, connection = {}, browserPoolOptions = {}, slotPollIntervalMillis = 500, } = options;
        this.#log = serviceLocator.getLogger().child({ prefix: 'RemoteBrowserPool' });
        this.#slotPollIntervalMillis = slotPollIntervalMillis;
        // A RemoteBrowserProvider carries its own endpoint, release, and maxOpenBrowsers.
        const provider = endpoint instanceof RemoteBrowserProvider ? endpoint : undefined;
        const resolvedEndpoint = provider
            ? (opts) => provider.connect(opts)
            : endpoint;
        const resolvedRelease = provider
            ? ({ context }) => provider.release(context)
            : release;
        const resolvedMax = maxOpenBrowsers ?? provider?.maxOpenBrowsers;
        this.#registry = new RemoteSessionRegistry(resolvedEndpoint, resolvedRelease, this.#log);
        // Wire every plugin for remote connection.
        for (const plugin of browserPlugins) {
            plugin.useRemoteConnection(this.#registry, connection);
        }
        this.browserPool = new BrowserPool({ ...browserPoolOptions, browserPlugins });
        this.#pool = this.browserPool;
        // Release a browser's remote session once it closes. The registry dedupes (close() schedules a delayed
        // kill(), so BROWSER_CLOSED can fire twice), and destroy()'s releaseAll() backstops any that never close.
        this.browserPool.on(BROWSER_POOL_EVENTS.BROWSER_LAUNCHED, (controller) => {
            controller.once(BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED, () => {
                const token = controller.launchContext.remoteToken;
                if (token !== undefined)
                    void this.#registry.release(token);
            });
        });
        if (resolvedMax !== undefined) {
            this.browserPool.maxOpenBrowsers = resolvedMax;
        }
    }
    /** Maximum number of remote browsers that may be open at the same time. */
    get maxOpenBrowsers() {
        return this.browserPool.maxOpenBrowsers;
    }
    set maxOpenBrowsers(value) {
        this.browserPool.maxOpenBrowsers = value;
    }
    /**
     * Opens a new page, waiting first until {@apilink RemoteBrowserPoolOptions.maxOpenBrowsers|maxOpenBrowsers}
     * allows it (either a new browser slot is free, or an active browser still has page capacity).
     */
    async newPage(options) {
        await this.waitForFreeSlot();
        return this.#pool.newPage(options);
    }
    async closePage(page, options) {
        return this.#pool.closePage(page, options);
    }
    async extractPageState(page) {
        return this.#pool.extractPageState(page);
    }
    async injectPageState(page, state) {
        return this.#pool.injectPageState(page, state);
    }
    async [Symbol.asyncDispose]() {
        await this.destroy();
    }
    /** Closes all browsers, releases any still-open remote sessions, and tears down the wrapped pool. */
    async destroy() {
        await this.browserPool.destroy();
        // Backstop: release any sessions whose browser never emitted a close (e.g. dropped on teardown).
        await this.#registry.releaseAll();
    }
    /** Resolves once the wrapped pool can serve another page without exceeding `maxOpenBrowsers`. */
    async waitForFreeSlot() {
        while (!this.browserPool.hasFreeBrowserSlot() && !this.browserPool.hasActiveBrowserWithFreeCapacity()) {
            await this.nextCapacityChange();
        }
    }
    /**
     * Resolves on the next browser-retired / page-closed event, or after `slotPollIntervalMillis`. All
     * concurrently-waiting `newPage` calls share a single promise (and a single pair of event listeners)
     * per tick, so a fleet of saturated callers doesn't fan out into N listener pairs on the pool.
     */
    nextCapacityChange() {
        this.#capacityChange ??= new Promise((resolve) => {
            const done = () => {
                clearTimeout(timer);
                this.browserPool.off(BROWSER_POOL_EVENTS.BROWSER_RETIRED, done);
                this.browserPool.off(BROWSER_POOL_EVENTS.PAGE_CLOSED, done);
                this.#capacityChange = undefined;
                resolve();
            };
            const timer = setTimeout(done, this.#slotPollIntervalMillis);
            timer.unref?.();
            this.browserPool.once(BROWSER_POOL_EVENTS.BROWSER_RETIRED, done);
            this.browserPool.once(BROWSER_POOL_EVENTS.PAGE_CLOSED, done);
        });
        return this.#capacityChange;
    }
}
