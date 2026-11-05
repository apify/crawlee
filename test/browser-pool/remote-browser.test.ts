import { setImmediate as flush } from 'node:timers/promises';

import { vi } from 'vitest';

import { serviceLocator } from '@crawlee/core';
import type { CrawleeLogger } from '@crawlee/core';

import { BrowserPool } from '../../packages/browser-pool/src/browser-pool.js';
import { BROWSER_POOL_EVENTS } from '../../packages/browser-pool/src/events.js';
import { PlaywrightPlugin } from '../../packages/browser-pool/src/playwright/playwright-plugin.js';
import { RemotePlaywrightPlugin } from '../../packages/browser-pool/src/playwright/remote-playwright-plugin.js';
import { RemotePuppeteerPlugin } from '../../packages/browser-pool/src/puppeteer/remote-puppeteer-plugin.js';
import type {
    RemoteBrowserEndpoint,
    ResolvedRemoteEndpoint,
} from '../../packages/browser-pool/src/remote-browser-plugin.js';
import { RemoteBrowserProvider } from '../../packages/browser-pool/src/remote-browser-provider.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockPage() {
    return {
        close: vi.fn().mockResolvedValue(undefined),
        url: vi.fn(() => 'about:blank'),
        on: vi.fn(),
        once: vi.fn(),
    };
}

/** A fake browser whose `disconnected` listeners can be fired via `disconnect()`. */
function createMockBrowser() {
    const page = createMockPage();
    const mockContext = {
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        once: vi.fn(),
    };
    const listeners: Record<string, (() => void)[]> = {};
    return {
        newPage: vi.fn().mockResolvedValue(createMockPage()),
        close: vi.fn().mockResolvedValue(undefined),
        contexts: vi.fn(() => [mockContext]),
        on: vi.fn((event: string, cb: () => void) => (listeners[event] ??= []).push(cb)),
        off: vi.fn(),
        once: vi.fn(),
        version: vi.fn(() => '120.0.0'),
        pages: vi.fn(() => []),
        process: vi.fn(() => null),
        userAgent: vi.fn().mockResolvedValue('mock-ua'),
        createBrowserContext: vi.fn().mockResolvedValue(mockContext),
        createIncognitoBrowserContext: vi.fn().mockResolvedValue(mockContext),
        disconnect: () => listeners.disconnected?.forEach((cb) => cb()),
    };
}

function createMockPlaywrightLibrary(browser = createMockBrowser()) {
    return {
        launch: vi.fn().mockResolvedValue(browser),
        connect: vi.fn().mockResolvedValue(browser),
        connectOverCDP: vi.fn().mockResolvedValue(browser),
        name: vi.fn(() => 'chromium'),
        launchPersistentContext: vi.fn().mockResolvedValue(browser),
    };
}

function createMockPuppeteerLibrary(browser = createMockBrowser()) {
    return {
        launch: vi.fn().mockResolvedValue(browser),
        connect: vi.fn().mockResolvedValue(browser),
        product: 'chrome',
    };
}

function createMockLogger(): CrawleeLogger & { warning: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> } {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockLogger: ReturnType<typeof createMockLogger>;

beforeEach(() => {
    mockLogger = createMockLogger();
    serviceLocator.setLogger(mockLogger);
});

describe('RemotePlaywrightPlugin', () => {
    it('forces incognito pages on and marks the launch context remote', () => {
        const plugin = new RemotePlaywrightPlugin(createMockPlaywrightLibrary() as any, {
            endpoint: 'wss://remote:9222',
            useIncognitoPages: false,
        });

        expect(plugin.useIncognitoPages).toBe(true);
        expect(plugin.createLaunchContext().isRemote).toBe(true);
    });

    it('connects via connectOverCDP by default and skips a local launch', async () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new RemotePlaywrightPlugin(lib as any, {
            endpoint: 'http://remote:9222',
            connectOptions: { timeout: 5000 },
        });

        await plugin.launch();

        expect(lib.connectOverCDP).toHaveBeenCalledWith('http://remote:9222', { timeout: 5000 });
        expect(lib.connect).not.toHaveBeenCalled();
        expect(lib.launch).not.toHaveBeenCalled();
    });

    it("connects via connect() when protocol is 'playwright'", async () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new RemotePlaywrightPlugin(lib as any, { endpoint: 'ws://remote:3000', protocol: 'playwright' });

        await plugin.launch();

        expect(lib.connect).toHaveBeenCalledWith('ws://remote:3000', {});
        expect(lib.connectOverCDP).not.toHaveBeenCalled();
    });

    it('passes the launch proxy URL to a function endpoint and releases with its context on disconnect', async () => {
        const browser = createMockBrowser();
        const lib = createMockPlaywrightLibrary(browser);
        const endpoint = vi.fn(async () => ({ url: 'wss://remote:9222', context: { id: 'sess-1' } }));
        const release = vi.fn();
        const plugin = new RemotePlaywrightPlugin(lib as any, { endpoint, release });

        await plugin.launch(plugin.createLaunchContext({ proxyUrl: 'http://proxy:8080' }));
        expect(endpoint).toHaveBeenCalledWith({ proxyUrl: 'http://proxy:8080' });
        expect(release).not.toHaveBeenCalled();

        browser.disconnect();
        browser.disconnect();
        await flush();
        expect(release).toHaveBeenCalledExactlyOnceWith({ endpoint: 'wss://remote:9222', context: { id: 'sess-1' } });
    });

    it('releases the session and throws BrowserLaunchError when connect fails', async () => {
        const lib = createMockPlaywrightLibrary();
        lib.connectOverCDP.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const release = vi.fn();
        const plugin = new RemotePlaywrightPlugin(lib as any, { endpoint: 'wss://remote:9222', release });

        await expect(plugin.launch()).rejects.toThrow(/Failed to connect to remote browser/);
        expect(release).toHaveBeenCalledExactlyOnceWith({ endpoint: 'wss://remote:9222', context: undefined });
    });

    it.each<[string, RemoteBrowserEndpoint, RegExp]>([
        ['an empty string', () => '', /empty string/],
        ['an object without url', () => ({}) as ResolvedRemoteEndpoint, /non-empty 'url'/],
        [
            'a throwing function',
            async () => {
                throw new Error('no session');
            },
            /no session/,
        ],
    ])('throws BrowserLaunchError without connecting when the endpoint resolves to %s', async (_, endpoint, cause) => {
        const lib = createMockPlaywrightLibrary();
        const release = vi.fn();
        const plugin = new RemotePlaywrightPlugin(lib as any, { endpoint, release });

        await expect(plugin.launch()).rejects.toMatchObject({
            message: expect.stringMatching(/resolve the remote browser endpoint/),
            cause: expect.objectContaining({ message: expect.stringMatching(cause) }),
        });
        expect(lib.connectOverCDP).not.toHaveBeenCalled();
        expect(release).not.toHaveBeenCalled();
    });

    it('a release() failure is logged, not thrown', async () => {
        const browser = createMockBrowser();
        const lib = createMockPlaywrightLibrary(browser);
        const plugin = new RemotePlaywrightPlugin(lib as any, {
            endpoint: 'wss://remote:9222',
            release: async () => {
                throw new Error('boom');
            },
        });

        await plugin.launch();
        browser.disconnect();
        await flush();

        expect(mockLogger.warning).toHaveBeenCalledWith('Remote browser release() failed.', { error: 'boom' });
    });

    it('uses a RemoteBrowserProvider for connect and release', async () => {
        class TestProvider extends RemoteBrowserProvider<{ id: string }> {
            connect = vi.fn(async () => ({ url: 'wss://provider:9222', context: { id: 'sess-1' } }));
            override release = vi.fn(async () => {});
        }
        const provider = new TestProvider();
        const browser = createMockBrowser();
        const lib = createMockPlaywrightLibrary(browser);
        const plugin = new RemotePlaywrightPlugin(lib as any, { endpoint: provider });

        await plugin.launch(plugin.createLaunchContext({ proxyUrl: 'http://proxy:8080' }));
        expect(provider.connect).toHaveBeenCalledWith({ proxyUrl: 'http://proxy:8080' });
        expect(lib.connectOverCDP).toHaveBeenCalledWith('wss://provider:9222', {});

        browser.disconnect();
        await flush();
        expect(provider.release).toHaveBeenCalledExactlyOnceWith({ id: 'sess-1' });
    });

    it('a plain PlaywrightPlugin launches locally', async () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new PlaywrightPlugin(lib as any);

        await plugin.launch(plugin.createLaunchContext());

        expect(lib.launch).toHaveBeenCalledTimes(1);
        expect(lib.connect).not.toHaveBeenCalled();
        expect(lib.connectOverCDP).not.toHaveBeenCalled();
        expect(plugin.createLaunchContext().isRemote).toBe(false);
    });
});

describe('RemotePuppeteerPlugin', () => {
    it('connects via connect() with the resolved endpoint and skips a local launch', async () => {
        const lib = createMockPuppeteerLibrary();
        const plugin = new RemotePuppeteerPlugin(lib as any, {
            endpoint: 'ws://remote:9222',
            connectOptions: { protocolTimeout: 1000 },
        });

        await plugin.launch();

        expect(lib.connect).toHaveBeenCalledWith({ protocolTimeout: 1000, browserWSEndpoint: 'ws://remote:9222' });
        expect(lib.launch).not.toHaveBeenCalled();
        expect(plugin.createLaunchContext().isRemote).toBe(true);
    });

    it('releases the session and throws BrowserLaunchError when connect fails', async () => {
        const lib = createMockPuppeteerLibrary();
        lib.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const release = vi.fn();
        const plugin = new RemotePuppeteerPlugin(lib as any, { endpoint: 'wss://remote:9222', release });

        await expect(plugin.launch()).rejects.toThrow(/Failed to connect to remote browser/);
        expect(release).toHaveBeenCalledOnce();
    });
});

describe('BrowserPool maxOpenBrowsers', () => {
    /** Short-circuits the launch so tests only observe *when* the pool tries to launch. */
    function createPool() {
        const plugin = new PlaywrightPlugin(createMockPlaywrightLibrary() as any);
        const launch = vi.spyOn(plugin, 'launch').mockRejectedValue(new Error('stop here'));
        return { pool: new BrowserPool({ browserPlugins: [plugin], maxOpenBrowsers: 1 }), launch };
    }

    it('newPage waits while at capacity, then launches once a browser is retired', async () => {
        const { pool, launch } = createPool();
        let atCapacity = true;
        pool.hasFreeBrowserSlot = vi.fn(() => !atCapacity);

        const pagePromise = pool.newPage();
        await flush();
        expect(launch).not.toHaveBeenCalled();

        atCapacity = false;
        pool.emit(BROWSER_POOL_EVENTS.BROWSER_RETIRED, {} as any);

        await expect(pagePromise).rejects.toThrow('stop here');
        expect(launch).toHaveBeenCalledOnce();
        await pool.destroy();
    });

    it('a single freed slot lets exactly one waiter launch', async () => {
        const { pool, launch } = createPool();
        let freeSlots = 0;
        pool.hasFreeBrowserSlot = vi.fn(() => freeSlots-- > 0);

        const first = pool.newPage();
        const second = pool.newPage();
        await flush();

        freeSlots = 1;
        pool.emit(BROWSER_POOL_EVENTS.BROWSER_RETIRED, {} as any);

        await expect(first).rejects.toThrow('stop here');
        await flush();
        expect(launch).toHaveBeenCalledOnce();

        second.catch(() => {});
        await pool.destroy();
    });
});
