import { vi } from 'vitest';

import { serviceLocator } from '@crawlee/core';
import type { CrawleeLogger } from '@crawlee/core';

import { EventEmitter } from 'node:events';

import { BROWSER_CONTROLLER_EVENTS, BROWSER_POOL_EVENTS } from '../src/events.js';
import { PlaywrightPlugin } from '../src/playwright/playwright-plugin.js';
import type { RemoteConnection } from '../src/remote-browser-pool.js';
import { RemoteBrowserPool } from '../src/remote-browser-pool.js';
import { RemoteBrowserProvider } from '../src/remote-browser-provider.js';

function createMockLogger(): CrawleeLogger {
    const logger: any = {
        child: vi.fn(() => logger),
        error: vi.fn(),
        exception: vi.fn(),
        softFail: vi.fn(),
        warning: vi.fn(),
        warningOnce: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        perf: vi.fn(),
        deprecated: vi.fn(),
        getOptions: vi.fn(() => ({})),
        setOptions: vi.fn(),
        setLevel: vi.fn(),
        getLevel: vi.fn(),
    };
    return logger;
}

function createPlugin() {
    const library: any = {
        launch: vi.fn(),
        connect: vi.fn(),
        connectOverCDP: vi.fn(),
        name: vi.fn(() => 'chromium'),
    };
    return new PlaywrightPlugin(library);
}

/** Extracts the pool's internal session registry so tests can drive endpoint resolution / release directly. */
function getConnection(pool: RemoteBrowserPool): RemoteConnection {
    return (pool as any).registry;
}

beforeEach(() => {
    serviceLocator.setLogger(createMockLogger());
});

describe('RemoteBrowserPool — plugin wiring', () => {
    it('rejects plugins that have no remote variant', () => {
        expect(() => new RemoteBrowserPool({ browserPlugins: [{} as any], endpoint: 'wss://remote:9222' })).toThrow(
            /supports only PlaywrightPlugin and PuppeteerPlugin/,
        );
    });
});

describe('RemoteBrowserPool — endpoint resolution', () => {
    it('resolves a static string endpoint', async () => {
        const pool = new RemoteBrowserPool({ browserPlugins: [createPlugin()], endpoint: 'wss://remote:9222' });

        const { url, token } = await getConnection(pool).resolve();

        expect(url).toBe('wss://remote:9222');
        expect(typeof token).toBe('number');
        await pool.destroy();
    });

    it('resolves a function endpoint and forwards proxyUrl', async () => {
        const endpoint = vi.fn(() => 'wss://dynamic:9222');
        const pool = new RemoteBrowserPool({ browserPlugins: [createPlugin()], endpoint });

        const { url } = await getConnection(pool).resolve({ proxyUrl: 'http://proxy:8080' });

        expect(url).toBe('wss://dynamic:9222');
        expect(endpoint).toHaveBeenCalledWith({ proxyUrl: 'http://proxy:8080' });
        await pool.destroy();
    });

    it('throws when an endpoint resolves to an empty string', async () => {
        const pool = new RemoteBrowserPool({ browserPlugins: [createPlugin()], endpoint: () => '' });

        await expect(getConnection(pool).resolve()).rejects.toThrow(/empty string/);
        await pool.destroy();
    });

    it('throws when a function endpoint returns an object without a url', async () => {
        const pool = new RemoteBrowserPool({ browserPlugins: [createPlugin()], endpoint: () => ({}) as any });

        await expect(getConnection(pool).resolve()).rejects.toThrow(/non-empty 'url'/);
        await pool.destroy();
    });
});

describe('RemoteBrowserPool — release lifecycle', () => {
    it('calls release with the context from a function endpoint, exactly once', async () => {
        const release = vi.fn();
        const pool = new RemoteBrowserPool({
            browserPlugins: [createPlugin()],
            endpoint: () => ({ url: 'wss://remote:9222', context: { id: 'sess-1' } }),
            release,
        });

        const { token } = await getConnection(pool).resolve();
        await getConnection(pool).release(token);
        await getConnection(pool).release(token); // second call must be a no-op (close()+kill())

        expect(release).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledWith({ endpoint: 'wss://remote:9222', context: { id: 'sess-1' } });
        await pool.destroy();
    });

    it('releases a browser session when its controller closes', async () => {
        const release = vi.fn();
        const pool = new RemoteBrowserPool({
            browserPlugins: [createPlugin()],
            endpoint: 'wss://remote:9222',
            release,
        });

        const { token } = await getConnection(pool).resolve();

        // Mimic the inner pool launching a controller, then that controller closing.
        const controller: any = new EventEmitter();
        controller.launchContext = { _remoteToken: token };
        pool.browserPool.emit(BROWSER_POOL_EVENTS.BROWSER_LAUNCHED, controller);
        controller.emit(BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED, controller);

        expect(release).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledWith({ endpoint: 'wss://remote:9222', context: undefined });
        await pool.destroy();
    });

    it('releases all still-open sessions on destroy()', async () => {
        const release = vi.fn();
        const pool = new RemoteBrowserPool({
            browserPlugins: [createPlugin()],
            endpoint: 'wss://remote:9222',
            release,
        });

        await getConnection(pool).resolve();
        await getConnection(pool).resolve();

        await pool.destroy();

        expect(release).toHaveBeenCalledTimes(2);
    });

    it('swallows errors thrown by release()', async () => {
        const release = vi.fn(() => {
            throw new Error('release boom');
        });
        const pool = new RemoteBrowserPool({
            browserPlugins: [createPlugin()],
            endpoint: 'wss://remote:9222',
            release,
        });

        const { token } = await getConnection(pool).resolve();
        await expect(getConnection(pool).release(token)).resolves.toBeUndefined();
        await pool.destroy();
    });
});

describe('RemoteBrowserPool — RemoteBrowserProvider endpoint', () => {
    class TestProvider extends RemoteBrowserProvider<{ id: string }> {
        override maxOpenBrowsers = 3;
        connect = vi.fn(async () => ({ url: 'wss://provider:9222', context: { id: 'sess-1' } }));
        override release = vi.fn(async () => {});
    }

    it('wires connect/release and adopts the provider maxOpenBrowsers', async () => {
        const provider = new TestProvider();
        const pool = new RemoteBrowserPool({ browserPlugins: [createPlugin()], endpoint: provider });

        expect(pool.maxOpenBrowsers).toBe(3);

        const { url, token } = await getConnection(pool).resolve({ proxyUrl: 'http://proxy:8080' });
        expect(url).toBe('wss://provider:9222');
        expect(provider.connect).toHaveBeenCalledWith({ proxyUrl: 'http://proxy:8080' });

        await getConnection(pool).release(token);
        expect(provider.release).toHaveBeenCalledWith({ id: 'sess-1' });
        await pool.destroy();
    });

    it('an explicit maxOpenBrowsers overrides the provider value', async () => {
        const pool = new RemoteBrowserPool({
            browserPlugins: [createPlugin()],
            endpoint: new TestProvider(),
            maxOpenBrowsers: 7,
        });

        expect(pool.maxOpenBrowsers).toBe(7);
        await pool.destroy();
    });
});

describe('RemoteBrowserPool — maxOpenBrowsers throttle', () => {
    it('proxies maxOpenBrowsers to the wrapped pool', async () => {
        const pool = new RemoteBrowserPool({
            browserPlugins: [createPlugin()],
            endpoint: 'wss://remote:9222',
            maxOpenBrowsers: 2,
        });

        expect(pool.browserPool.maxOpenBrowsers).toBe(2);
        pool.maxOpenBrowsers = 5;
        expect(pool.browserPool.maxOpenBrowsers).toBe(5);
        await pool.destroy();
    });

    it('opens immediately when a browser slot is free', async () => {
        const pool = new RemoteBrowserPool({
            browserPlugins: [createPlugin()],
            endpoint: 'wss://remote:9222',
            maxOpenBrowsers: 2,
        });

        pool.browserPool.hasFreeBrowserSlot = vi.fn(() => true);
        pool.browserPool.hasActiveBrowserWithFreeCapacity = vi.fn(() => false);
        const newPage = vi.fn(async () => ({ id: 'p' }));
        (pool.browserPool as any).newPage = newPage;

        await pool.newPage({ id: 'p' });
        expect(newPage).toHaveBeenCalledOnce();
        await pool.destroy();
    });

    it('waits while at capacity, then opens once a browser is retired', async () => {
        const pool = new RemoteBrowserPool({
            browserPlugins: [createPlugin()],
            endpoint: 'wss://remote:9222',
            maxOpenBrowsers: 1,
            slotPollIntervalMillis: 50,
        });

        let atCapacity = true;
        pool.browserPool.hasFreeBrowserSlot = vi.fn(() => !atCapacity);
        pool.browserPool.hasActiveBrowserWithFreeCapacity = vi.fn(() => false);
        const newPage = vi.fn(async () => ({ id: 'p' }));
        (pool.browserPool as any).newPage = newPage;

        const pagePromise = pool.newPage();
        await new Promise((r) => setTimeout(r, 20));
        expect(newPage).not.toHaveBeenCalled();

        atCapacity = false;
        pool.browserPool.emit(BROWSER_POOL_EVENTS.BROWSER_RETIRED, {} as any);

        await pagePromise;
        expect(newPage).toHaveBeenCalledOnce();
        await pool.destroy();
    });
});
