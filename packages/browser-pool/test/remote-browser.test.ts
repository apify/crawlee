import { vi } from 'vitest';

import { serviceLocator } from '@crawlee/core';
import type { CrawleeLogger } from '@crawlee/core';

import { PlaywrightPlugin } from '../src/playwright/playwright-plugin.js';
import { RemotePlaywrightPlugin } from '../src/playwright/remote-playwright-plugin.js';
import { PuppeteerPlugin } from '../src/puppeteer/puppeteer-plugin.js';
import { RemotePuppeteerPlugin } from '../src/puppeteer/remote-puppeteer-plugin.js';
import type { RemoteConnection } from '../src/remote-browser-pool.js';

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

function createMockBrowser() {
    const page = createMockPage();
    const mockContext = {
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        once: vi.fn(),
    };
    return {
        newPage: vi.fn().mockResolvedValue(createMockPage()),
        close: vi.fn().mockResolvedValue(undefined),
        contexts: vi.fn(() => [mockContext]),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        version: vi.fn(() => '120.0.0'),
        pages: vi.fn(() => []),
        process: vi.fn(() => null),
        userAgent: vi.fn().mockResolvedValue('mock-ua'),
        createBrowserContext: vi.fn().mockResolvedValue(mockContext),
        createIncognitoBrowserContext: vi.fn().mockResolvedValue(mockContext),
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

/** A fake {@link RemoteConnection} that resolves to a fixed URL and records release() calls. */
function createConnection(
    url = 'wss://remote:9222',
    context?: Record<string, unknown>,
): RemoteConnection & {
    resolve: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
} {
    return {
        resolve: vi.fn(async (_options?: { proxyUrl?: string }) => ({ url, token: 42, context })),
        release: vi.fn(async () => {}),
    } as any;
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
    function createRemotePlugin(
        lib = createMockPlaywrightLibrary(),
        connection: RemoteConnection = createConnection(),
        parameters = {},
        pluginOptions = {},
    ) {
        return new RemotePlaywrightPlugin(new PlaywrightPlugin(lib as any, pluginOptions), connection, parameters);
    }

    it('forces incognito pages on and marks the launch context remote', () => {
        const plugin = createRemotePlugin(undefined, undefined, {}, { useIncognitoPages: false });

        expect(plugin.useIncognitoPages).toBe(true);
        expect(plugin.createLaunchContext().isRemote).toBe(true);
    });

    it('connects via connectOverCDP by default and skips a local launch', async () => {
        const lib = createMockPlaywrightLibrary();
        const connection = createConnection('http://remote:9222');
        const plugin = createRemotePlugin(lib, connection, { connectOptions: { timeout: 5000 } });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect(connection.resolve).toHaveBeenCalledTimes(1);
        expect(lib.connectOverCDP).toHaveBeenCalledWith('http://remote:9222', { timeout: 5000 });
        expect(lib.connect).not.toHaveBeenCalled();
        expect(lib.launch).not.toHaveBeenCalled();
        expect(ctx._remoteToken).toBe(42);
    });

    it("connects via connect() when protocol is 'playwright'", async () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = createRemotePlugin(lib, createConnection('ws://remote:3000'), { protocol: 'playwright' });

        await plugin.launch(plugin.createLaunchContext());

        expect(lib.connect).toHaveBeenCalledWith('ws://remote:3000', {});
        expect(lib.connectOverCDP).not.toHaveBeenCalled();
    });

    it('releases the session and throws BrowserLaunchError when connect fails', async () => {
        const lib = createMockPlaywrightLibrary();
        lib.connectOverCDP.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const connection = createConnection();
        const plugin = createRemotePlugin(lib, connection);

        await expect(plugin.launch(plugin.createLaunchContext())).rejects.toThrow(
            /Failed to connect to remote browser/,
        );
        expect(connection.release).toHaveBeenCalledWith(42);
    });

    it('throws BrowserLaunchError (without connecting) when endpoint resolution fails', async () => {
        const lib = createMockPlaywrightLibrary();
        const connection = createConnection();
        connection.resolve.mockRejectedValueOnce(new Error('no session'));
        const plugin = createRemotePlugin(lib, connection);

        await expect(plugin.launch(plugin.createLaunchContext())).rejects.toThrow(
            /resolve the remote browser endpoint/,
        );
        expect(lib.connectOverCDP).not.toHaveBeenCalled();
        expect(connection.release).not.toHaveBeenCalled();
    });

    it('a plain plugin (no remote connection) launches locally', async () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new PlaywrightPlugin(lib as any);

        await plugin.launch(plugin.createLaunchContext());

        expect(lib.launch).toHaveBeenCalledTimes(1);
        expect(lib.connect).not.toHaveBeenCalled();
        expect(lib.connectOverCDP).not.toHaveBeenCalled();
    });
});

describe('RemotePuppeteerPlugin', () => {
    function createRemotePlugin(lib = createMockPuppeteerLibrary(), connection = createConnection(), parameters = {}) {
        return new RemotePuppeteerPlugin(new PuppeteerPlugin(lib as any), connection, parameters);
    }

    it('connects via connect() with the resolved endpoint and skips a local launch', async () => {
        const lib = createMockPuppeteerLibrary();
        const connection = createConnection('ws://remote:9222');
        const plugin = createRemotePlugin(lib, connection, { connectOptions: { protocolTimeout: 1000 } });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect(connection.resolve).toHaveBeenCalledTimes(1);
        expect(lib.connect).toHaveBeenCalledWith({ protocolTimeout: 1000, browserWSEndpoint: 'ws://remote:9222' });
        expect(lib.launch).not.toHaveBeenCalled();
        expect(ctx._remoteToken).toBe(42);
    });

    it('releases the session and throws BrowserLaunchError when connect fails', async () => {
        const lib = createMockPuppeteerLibrary();
        lib.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const connection = createConnection();
        const plugin = createRemotePlugin(lib, connection);

        await expect(plugin.launch(plugin.createLaunchContext())).rejects.toThrow(
            /Failed to connect to remote browser/,
        );
        expect(connection.release).toHaveBeenCalledWith(42);
    });

    it('marks the launch context remote', () => {
        const plugin = createRemotePlugin();

        expect(plugin.createLaunchContext().isRemote).toBe(true);
    });
});
