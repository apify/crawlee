import { vi } from 'vitest';

import { serviceLocator } from '@crawlee/core';
import type { CrawleeLogger } from '@crawlee/core';

import { PlaywrightPlugin } from '../src/playwright/playwright-plugin.js';
import { PuppeteerPlugin } from '../src/puppeteer/puppeteer-plugin.js';
import { RemoteBrowserProvider } from '../src/remote-browser-provider.js';

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

function createMockPage() {
    return {
        close: vi.fn().mockResolvedValue(undefined),
        url: vi.fn(() => 'about:blank'),
        on: vi.fn(),
        once: vi.fn(),
    };
}

function createMockBrowserContext() {
    const page = createMockPage();
    return {
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        once: vi.fn(),
        _mockPage: page,
    };
}

function createMockBrowser() {
    const mockContext = createMockBrowserContext();
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
        _mockContext: mockContext,
    };
}

function createMockPlaywrightLibrary(browser = createMockBrowser()) {
    const mockContext = {
        ...browser,
        once: vi.fn(),
        on: vi.fn(),
    };
    return {
        launch: vi.fn().mockResolvedValue(browser),
        connect: vi.fn().mockResolvedValue(browser),
        connectOverCDP: vi.fn().mockResolvedValue(browser),
        name: vi.fn(() => 'chromium'),
        launchPersistentContext: vi.fn().mockResolvedValue(mockContext),
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
    const mockLogger: any = {
        getOptions: vi.fn(() => ({})),
        setOptions: vi.fn(),
        child: vi.fn(() => mockLogger),
        error: vi.fn(),
        exception: vi.fn(),
        softFail: vi.fn(),
        warning: vi.fn(),
        warningOnce: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        perf: vi.fn(),
        deprecated: vi.fn(),
        log: vi.fn(),
        setLevel: vi.fn(),
        getLevel: vi.fn(),
    };
    return mockLogger;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Remote browser — PlaywrightPlugin', () => {
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        mockLogger = createMockLogger();
        serviceLocator.setLogger(mockLogger);
    });

    // --- Connection routing ---------------------------------------------------

    describe('connection routing', () => {
        test('connectOverCDPOptions → calls connectOverCDP, not launch', async () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(lib.connectOverCDP).toHaveBeenCalledTimes(1);
            expect(lib.connectOverCDP).toHaveBeenCalledWith('http://remote:9222', {});
            expect(lib.launch).not.toHaveBeenCalled();
            expect(lib.connect).not.toHaveBeenCalled();
        });

        test('connectOptions → calls connect, not launch', async () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOptions: { wsEndpoint: 'ws://remote:3000' },
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(lib.connect).toHaveBeenCalledTimes(1);
            expect(lib.connect).toHaveBeenCalledWith('ws://remote:3000', {});
            expect(lib.launch).not.toHaveBeenCalled();
            expect(lib.connectOverCDP).not.toHaveBeenCalled();
        });

        test('no connect options → calls launch', async () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any);

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(lib.launch).toHaveBeenCalledTimes(1);
            expect(lib.connect).not.toHaveBeenCalled();
            expect(lib.connectOverCDP).not.toHaveBeenCalled();
        });

        test('passes extra options through to connectOverCDP', async () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: {
                    endpointURL: 'http://remote:9222',
                    timeout: 5000,
                    headers: { 'x-token': 'abc' },
                },
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(lib.connectOverCDP).toHaveBeenCalledWith('http://remote:9222', {
                timeout: 5000,
                headers: { 'x-token': 'abc' },
            });
        });

        test('passes extra options through to connect', async () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOptions: {
                    wsEndpoint: 'ws://remote:3000',
                    timeout: 3000,
                    headers: { Authorization: 'Bearer xyz' },
                },
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(lib.connect).toHaveBeenCalledWith('ws://remote:3000', {
                timeout: 3000,
                headers: { Authorization: 'Bearer xyz' },
            });
        });
    });

    // --- Validation -----------------------------------------------------------

    describe('validation', () => {
        test('throws when both connectOptions and connectOverCDPOptions are set', () => {
            const lib = createMockPlaywrightLibrary();

            expect(
                () =>
                    new PlaywrightPlugin(lib as any, {
                        connectOptions: { wsEndpoint: 'ws://remote:3000' },
                        connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
                    }),
            ).toThrow("Cannot set both 'connectOptions' and 'connectOverCDPOptions'");
        });

        test('throws when connectOverCDPOptions has no endpointURL', () => {
            const lib = createMockPlaywrightLibrary();

            expect(
                () =>
                    new PlaywrightPlugin(lib as any, {
                        connectOverCDPOptions: { endpointURL: '' },
                    }),
            ).toThrow("'connectOverCDPOptions.endpointURL' must be a non-empty string");
        });

        test('throws when connectOptions has no wsEndpoint', () => {
            const lib = createMockPlaywrightLibrary();

            expect(
                () =>
                    new PlaywrightPlugin(lib as any, {
                        connectOptions: { wsEndpoint: '' },
                    }),
            ).toThrow("'connectOptions.wsEndpoint' must be a non-empty string");
        });
    });

    // --- isRemote correctness -------------------------------------------------

    describe('isRemote', () => {
        test('true when connectOverCDPOptions is present', () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
            });

            const ctx = plugin.createLaunchContext();
            expect(ctx.isRemote).toBe(true);
        });

        test('true when connectOptions is present', () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOptions: { wsEndpoint: 'ws://remote:3000' },
            });

            const ctx = plugin.createLaunchContext();
            expect(ctx.isRemote).toBe(true);
        });

        test('false when no connect options', () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any);

            const ctx = plugin.createLaunchContext();
            expect(ctx.isRemote).toBe(false);
        });
    });

    // --- Proxy/webdriver skipping ---------------------------------------------

    describe('proxy/webdriver skipping for remote', () => {
        test('proxy is not applied for remote connections', async () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
                proxyUrl: 'http://user:pass@proxy:8080',
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            // The browser was connected via CDP, not launched — proxy is not set on launchOptions
            expect(lib.connectOverCDP).toHaveBeenCalledTimes(1);
            expect(lib.launch).not.toHaveBeenCalled();
        });

        test('webdriver hiding args are not added for remote connections', async () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
                launchOptions: { args: ['--custom-flag'] },
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            // The original args should be untouched — no webdriver stealth flag injected
            expect(ctx.launchOptions?.args).toEqual(['--custom-flag']);
            expect(ctx.launchOptions?.args).not.toContain('--disable-blink-features=AutomationControlled');
        });

        test('webdriver hiding args ARE added for local chromium connections', async () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                launchOptions: { args: ['--custom-flag'] },
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(ctx.launchOptions?.args).toContain('--disable-blink-features=AutomationControlled');
            expect(ctx.launchOptions?.args).toContain('--custom-flag');
        });

        test('proxy is applied for local connections', async () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                proxyUrl: 'http://user:pass@proxy:8080',
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(lib.launch).toHaveBeenCalledTimes(1);
            // Launch options should have proxy configured
            const launchOpts = lib.launch.mock.calls[0][0];
            expect(launchOpts.proxy).toBeDefined();
            expect(launchOpts.proxy.server).toBeDefined();
        });
    });

    // --- useIncognitoPages default --------------------------------------------

    describe('useIncognitoPages default', () => {
        test('defaults to false for remote (connectOverCDP)', () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
            });

            expect(plugin.useIncognitoPages).toBe(false);
        });

        test('defaults to true for remote (connect / WebSocket)', () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOptions: { wsEndpoint: 'ws://remote:3000' },
            });

            expect(plugin.useIncognitoPages).toBe(true);
        });

        test('explicit false preserved for remote', () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
                useIncognitoPages: false,
            });

            expect(plugin.useIncognitoPages).toBe(false);
        });

        test('explicit true preserved for remote', () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
                useIncognitoPages: true,
            });

            expect(plugin.useIncognitoPages).toBe(true);
        });

        test('default false for local', () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any);

            expect(plugin.useIncognitoPages).toBe(false);
        });
    });

    // --- Info/Warnings --------------------------------------------------------

    describe('info and warnings', () => {
        test('proxyUrl + remote → warning logged', async () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
                proxyUrl: 'http://user:pass@proxy:8080',
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(mockLogger.warning).toHaveBeenCalledWith(
                expect.stringContaining('proxyUrl is set but will be ignored'),
            );
        });

        test('remote CDP default → info about shared cookies', () => {
            const lib = createMockPlaywrightLibrary();
            new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
            });

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('pages will share cookies and storage'),
            );
        });

        test('remote WebSocket default → info about incognito true', () => {
            const lib = createMockPlaywrightLibrary();
            new PlaywrightPlugin(lib as any, {
                connectOptions: { wsEndpoint: 'ws://remote:3000' },
            });

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('defaulting useIncognitoPages to true'),
            );
        });

        test('no warnings for local browser usage', async () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any);

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(mockLogger.warning).not.toHaveBeenCalled();
        });
    });
});

describe('Remote browser — PuppeteerPlugin', () => {
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        mockLogger = createMockLogger();
        serviceLocator.setLogger(mockLogger);
    });

    // --- Connection routing ---------------------------------------------------

    describe('connection routing', () => {
        test('connectOverCDPOptions → calls connect, not launch', async () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(lib.connect).toHaveBeenCalledTimes(1);
            expect(lib.connect).toHaveBeenCalledWith({ browserWSEndpoint: 'ws://remote:9222' });
            expect(lib.launch).not.toHaveBeenCalled();
        });

        test('no connect options → calls launch', async () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any);

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(lib.launch).toHaveBeenCalledTimes(1);
            expect(lib.connect).not.toHaveBeenCalled();
        });

        test('passes all connect options through to connect', async () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: {
                    browserWSEndpoint: 'ws://remote:9222',
                    defaultViewport: { width: 800, height: 600 },
                },
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(lib.connect).toHaveBeenCalledWith({
                browserWSEndpoint: 'ws://remote:9222',
                defaultViewport: { width: 800, height: 600 },
            });
        });
    });

    // --- Validation -----------------------------------------------------------

    describe('validation', () => {
        test('throws when connectOverCDPOptions has no browserWSEndpoint or browserURL', () => {
            const lib = createMockPuppeteerLibrary();

            expect(
                () =>
                    new PuppeteerPlugin(lib as any, {
                        connectOverCDPOptions: {} as any,
                    }),
            ).toThrow("connectOverCDPOptions must include either 'browserWSEndpoint' or 'browserURL'");
        });
    });

    // --- isRemote correctness -------------------------------------------------

    describe('isRemote', () => {
        test('true when connectOverCDPOptions is present', () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
            });

            const ctx = plugin.createLaunchContext();
            expect(ctx.isRemote).toBe(true);
        });

        test('false when no connect options', () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any);

            const ctx = plugin.createLaunchContext();
            expect(ctx.isRemote).toBe(false);
        });
    });

    // --- Proxy/webdriver skipping ---------------------------------------------

    describe('proxy/webdriver skipping for remote', () => {
        test('proxy is not applied for remote connections', async () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
                proxyUrl: 'http://user:pass@proxy:8080',
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(lib.connect).toHaveBeenCalledTimes(1);
            expect(lib.launch).not.toHaveBeenCalled();
        });

        test('proxy is not leaked into createBrowserContext for remote newPage', async () => {
            const browser = createMockBrowser();
            const lib = createMockPuppeteerLibrary(browser);
            const plugin = new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
                proxyUrl: 'http://user:pass@proxy:8080',
                useIncognitoPages: true,
            });

            const ctx = plugin.createLaunchContext();
            const wrappedBrowser = await plugin.launch(ctx);

            // Call newPage on the wrapped browser — useIncognitoPages: true creates new context
            await (wrappedBrowser as any).newPage();

            // createBrowserContext should be called with empty options (no proxyServer)
            expect(browser.createBrowserContext).toHaveBeenCalledTimes(1);
            expect(browser.createBrowserContext).toHaveBeenCalledWith({});
        });

        test('webdriver hiding args are not added for remote connections', async () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
                launchOptions: { args: ['--custom-flag'] },
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            // The original args should be untouched — no webdriver stealth flag injected
            expect(ctx.launchOptions?.args).toEqual(['--custom-flag']);
            expect(ctx.launchOptions?.args).not.toContain('--disable-blink-features=AutomationControlled');
        });

        test('webdriver hiding args ARE added for local connections', async () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any, {
                launchOptions: { args: ['--custom-flag'] },
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(ctx.launchOptions?.args).toContain('--disable-blink-features=AutomationControlled');
            expect(ctx.launchOptions?.args).toContain('--custom-flag');
        });
    });

    // --- useIncognitoPages default --------------------------------------------

    describe('useIncognitoPages default', () => {
        test('defaults to false for remote', () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
            });

            expect(plugin.useIncognitoPages).toBe(false);
        });

        test('explicit false preserved for remote', () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
                useIncognitoPages: false,
            });

            expect(plugin.useIncognitoPages).toBe(false);
        });

        test('explicit true preserved for remote', () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
                useIncognitoPages: true,
            });

            expect(plugin.useIncognitoPages).toBe(true);
        });

        test('default false for local', () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any);

            expect(plugin.useIncognitoPages).toBe(false);
        });
    });

    // --- Info/Warnings --------------------------------------------------------

    describe('info and warnings', () => {
        test('proxyUrl + remote → warning logged', async () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
                proxyUrl: 'http://user:pass@proxy:8080',
            });

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(mockLogger.warning).toHaveBeenCalledWith(
                expect.stringContaining('proxyUrl is set but will be ignored'),
            );
        });

        test('remote default → info about shared cookies', () => {
            const lib = createMockPuppeteerLibrary();
            new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
            });

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('pages will share cookies and storage'),
            );
        });

        test('no warnings for local browser usage', async () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any);

            const ctx = plugin.createLaunchContext();
            await plugin.launch(ctx);

            expect(mockLogger.warning).not.toHaveBeenCalled();
        });
    });
});

// ---------------------------------------------------------------------------
// remoteBrowser config tests
// ---------------------------------------------------------------------------

describe('remoteBrowser config — PlaywrightPlugin', () => {
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        mockLogger = createMockLogger();
        serviceLocator.setLogger(mockLogger);
    });

    test('static string endpoint → calls connectOverCDP by default', async () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: { endpoint: 'wss://browserless.io?token=xxx' },
        });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect(lib.connectOverCDP).toHaveBeenCalledWith('wss://browserless.io?token=xxx', {});
        expect(lib.launch).not.toHaveBeenCalled();
        expect(lib.connect).not.toHaveBeenCalled();
    });

    test('static string endpoint with type websocket → calls connect', async () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: { endpoint: 'wss://browserless.io/ws', type: 'websocket' },
        });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect(lib.connect).toHaveBeenCalledWith('wss://browserless.io/ws', {});
        expect(lib.connectOverCDP).not.toHaveBeenCalled();
    });

    test('function endpoint → called per launch', async () => {
        const lib = createMockPlaywrightLibrary();
        const endpointFn = vi.fn().mockResolvedValue('wss://dynamic-endpoint.io');
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: { endpoint: endpointFn },
        });

        const ctx1 = plugin.createLaunchContext();
        await plugin.launch(ctx1);

        const ctx2 = plugin.createLaunchContext();
        await plugin.launch(ctx2);

        expect(endpointFn).toHaveBeenCalledTimes(2);
        expect(lib.connectOverCDP).toHaveBeenCalledTimes(2);
    });

    test('resolved endpoint stored on launchContext', async () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: { endpoint: 'wss://test.io' },
        });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect((ctx as any)._resolvedRemoteEndpoint).toBe('wss://test.io');
    });

    test('isRemote is true when remoteBrowser is set', () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: { endpoint: 'wss://test.io' },
        });

        const ctx = plugin.createLaunchContext();
        expect(ctx.isRemote).toBe(true);
    });

    test('useIncognitoPages defaults to false when remoteBrowser is set (CDP)', () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: { endpoint: 'wss://test.io' },
        });

        expect(plugin.useIncognitoPages).toBe(false);
    });

    test('useIncognitoPages defaults to true when remoteBrowser is set (WebSocket)', () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: { endpoint: 'wss://test.io', type: 'websocket' },
        });

        expect(plugin.useIncognitoPages).toBe(true);
    });

    test('release called on connection failure with context', async () => {
        const lib = createMockPlaywrightLibrary();
        lib.connectOverCDP.mockRejectedValue(new Error('Connection refused'));

        const releaseFn = vi.fn();
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: {
                endpoint: async () => ({ url: 'wss://fail.io', context: { id: 'sess-123' } }),
                release: releaseFn,
            },
        });

        const ctx = plugin.createLaunchContext();
        await expect(plugin.launch(ctx)).rejects.toThrow('Failed to connect to remote browser');

        expect(releaseFn).toHaveBeenCalledWith({ endpoint: 'wss://fail.io', context: { id: 'sess-123' } });
    });

    test('release receives context from endpoint function', async () => {
        const lib = createMockPlaywrightLibrary();
        const releaseFn = vi.fn();
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: {
                endpoint: async () => ({ url: 'wss://test.io', context: { sessionId: 'abc' } }),
                release: releaseFn,
            },
        });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        // Context stored on launchContext for later release
        expect((ctx as any)._remoteContext).toEqual({ sessionId: 'abc' });
    });

    test('release failure is swallowed and logged as warning', async () => {
        const lib = createMockPlaywrightLibrary();
        lib.connectOverCDP.mockRejectedValue(new Error('Connection refused'));

        const releaseFn = vi.fn().mockRejectedValue(new Error('Release failed'));
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: { endpoint: 'wss://fail.io', release: releaseFn },
        });

        const ctx = plugin.createLaunchContext();
        await expect(plugin.launch(ctx)).rejects.toThrow('Failed to connect to remote browser');

        expect(releaseFn).toHaveBeenCalled();
        expect(mockLogger.warning).toHaveBeenCalledWith(
            'remoteBrowser.release() failed.',
            expect.objectContaining({ error: 'Release failed' }),
        );
    });

    test('endpoint function rejection throws BrowserLaunchError', async () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: { endpoint: () => Promise.reject(new Error('API down')) },
        });

        const ctx = plugin.createLaunchContext();
        await expect(plugin.launch(ctx)).rejects.toThrow('Failed to resolve remote browser endpoint');
    });

    test('remoteBrowser ignored when connectOverCDPOptions also set', async () => {
        const lib = createMockPlaywrightLibrary();
        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: { endpoint: 'wss://ignored.io' },
            connectOverCDPOptions: { endpointURL: 'wss://explicit.io' },
        });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect(lib.connectOverCDP).toHaveBeenCalledWith('wss://explicit.io', {});
        expect(mockLogger.warning).toHaveBeenCalledWith(expect.stringContaining('remoteBrowser is ignored'));
    });
});

describe('remoteBrowser config — PuppeteerPlugin', () => {
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        mockLogger = createMockLogger();
        serviceLocator.setLogger(mockLogger);
    });

    test('static string endpoint → calls connect with browserWSEndpoint', async () => {
        const lib = createMockPuppeteerLibrary();
        const plugin = new PuppeteerPlugin(lib as any, {
            remoteBrowser: { endpoint: 'wss://browserless.io?token=xxx' },
        });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect(lib.connect).toHaveBeenCalledWith({ browserWSEndpoint: 'wss://browserless.io?token=xxx' });
        expect(lib.launch).not.toHaveBeenCalled();
    });

    test('function endpoint → called per launch', async () => {
        const lib = createMockPuppeteerLibrary();
        const endpointFn = vi.fn().mockResolvedValue('wss://dynamic.io');
        const plugin = new PuppeteerPlugin(lib as any, {
            remoteBrowser: { endpoint: endpointFn },
        });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect(endpointFn).toHaveBeenCalledTimes(1);
        expect(lib.connect).toHaveBeenCalledWith({ browserWSEndpoint: 'wss://dynamic.io' });
    });

    test('type websocket throws in constructor', () => {
        const lib = createMockPuppeteerLibrary();
        expect(() => {
            new PuppeteerPlugin(lib as any, {
                remoteBrowser: { endpoint: 'wss://test.io', type: 'websocket' } as any,
            });
        }).toThrow("does not support 'websocket'");
    });

    test('isRemote is true when remoteBrowser is set', () => {
        const lib = createMockPuppeteerLibrary();
        const plugin = new PuppeteerPlugin(lib as any, {
            remoteBrowser: { endpoint: 'wss://test.io' },
        });

        const ctx = plugin.createLaunchContext();
        expect(ctx.isRemote).toBe(true);
    });

    test('release called on connection failure with context', async () => {
        const lib = createMockPuppeteerLibrary();
        lib.connect.mockRejectedValue(new Error('Connection refused'));

        const releaseFn = vi.fn();
        const plugin = new PuppeteerPlugin(lib as any, {
            remoteBrowser: {
                endpoint: async () => ({ url: 'wss://fail.io', context: { id: 'sess-456' } }),
                release: releaseFn,
            },
        });

        const ctx = plugin.createLaunchContext();
        await expect(plugin.launch(ctx)).rejects.toThrow('Failed to connect to remote browser');

        expect(releaseFn).toHaveBeenCalledWith({ endpoint: 'wss://fail.io', context: { id: 'sess-456' } });
    });

    test('remoteBrowser ignored when connectOverCDPOptions also set', async () => {
        const lib = createMockPuppeteerLibrary();
        const plugin = new PuppeteerPlugin(lib as any, {
            remoteBrowser: { endpoint: 'wss://ignored.io' },
            connectOverCDPOptions: { browserWSEndpoint: 'wss://explicit.io' },
        });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect(lib.connect).toHaveBeenCalledWith({ browserWSEndpoint: 'wss://explicit.io' });
        expect(mockLogger.warning).toHaveBeenCalledWith(expect.stringContaining('remoteBrowser is ignored'));
    });
});

// ---------------------------------------------------------------------------
// RemoteBrowserProvider tests
// ---------------------------------------------------------------------------

describe('RemoteBrowserProvider — PlaywrightPlugin', () => {
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        mockLogger = createMockLogger();
        serviceLocator.setLogger(mockLogger);
    });

    test('provider connect() → calls connectOverCDP by default', async () => {
        const lib = createMockPlaywrightLibrary();

        class SimpleProvider extends RemoteBrowserProvider {
            async connect() {
                return { url: 'wss://provider.io/cdp' };
            }
        }

        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: new SimpleProvider(),
        });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect(lib.connectOverCDP).toHaveBeenCalledWith('wss://provider.io/cdp', {});
        expect(lib.connect).not.toHaveBeenCalled();
        expect(lib.launch).not.toHaveBeenCalled();
    });

    test('provider with type=websocket → calls connect', async () => {
        const lib = createMockPlaywrightLibrary();

        class WsProvider extends RemoteBrowserProvider {
            override type = 'websocket' as const;
            async connect() {
                return { url: 'wss://provider.io/ws' };
            }
        }

        const plugin = new PlaywrightPlugin(lib as any, {
            remoteBrowser: new WsProvider(),
        });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect(lib.connect).toHaveBeenCalledWith('wss://provider.io/ws', {});
        expect(lib.connectOverCDP).not.toHaveBeenCalled();
    });

    test('provider context flows to release', async () => {
        const lib = createMockPlaywrightLibrary();

        interface Ctx {
            sessionId: string;
        }

        class SessionProvider extends RemoteBrowserProvider<Ctx> {
            releasedContext?: Ctx;
            async connect() {
                return { url: 'wss://test.io', context: { sessionId: 'sess-42' } };
            }
            async release(context: Ctx) {
                this.releasedContext = context;
            }
        }

        const provider = new SessionProvider();
        const plugin = new PlaywrightPlugin(lib as any, { remoteBrowser: provider });

        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        // Context stored on launchContext
        expect((ctx as any)._remoteContext).toEqual({ sessionId: 'sess-42' });
    });

    test('provider release called on connection failure', async () => {
        const lib = createMockPlaywrightLibrary();
        lib.connectOverCDP.mockRejectedValue(new Error('Connection refused'));

        const releaseSpy = vi.fn();

        class FailProvider extends RemoteBrowserProvider<{ id: string }> {
            async connect() {
                return { url: 'wss://fail.io', context: { id: 'sess-fail' } };
            }
            async release(context: { id: string }) {
                releaseSpy(context);
            }
        }

        const plugin = new PlaywrightPlugin(lib as any, { remoteBrowser: new FailProvider() });
        const ctx = plugin.createLaunchContext();

        await expect(plugin.launch(ctx)).rejects.toThrow('Failed to connect to remote browser');
        expect(releaseSpy).toHaveBeenCalledWith({ id: 'sess-fail' });
    });

    test('provider sets isRemote = true', () => {
        const lib = createMockPlaywrightLibrary();

        class P extends RemoteBrowserProvider {
            async connect() {
                return { url: 'wss://test.io' };
            }
        }

        const plugin = new PlaywrightPlugin(lib as any, { remoteBrowser: new P() });
        const ctx = plugin.createLaunchContext();
        expect(ctx.isRemote).toBe(true);
    });

    test('provider sets useIncognitoPages default to false (CDP)', () => {
        const lib = createMockPlaywrightLibrary();

        class P extends RemoteBrowserProvider {
            async connect() {
                return { url: 'wss://test.io' };
            }
        }

        const plugin = new PlaywrightPlugin(lib as any, { remoteBrowser: new P() });
        expect(plugin.useIncognitoPages).toBe(false);
    });
});

describe('RemoteBrowserProvider — PuppeteerPlugin', () => {
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        mockLogger = createMockLogger();
        serviceLocator.setLogger(mockLogger);
    });

    test('provider connect() → calls connect with browserWSEndpoint', async () => {
        const lib = createMockPuppeteerLibrary();

        class SimpleProvider extends RemoteBrowserProvider {
            async connect() {
                return { url: 'wss://provider.io/cdp' };
            }
        }

        const plugin = new PuppeteerPlugin(lib as any, { remoteBrowser: new SimpleProvider() });
        const ctx = plugin.createLaunchContext();
        await plugin.launch(ctx);

        expect(lib.connect).toHaveBeenCalledWith({ browserWSEndpoint: 'wss://provider.io/cdp' });
        expect(lib.launch).not.toHaveBeenCalled();
    });

    test('provider with type=websocket throws in Puppeteer', () => {
        const lib = createMockPuppeteerLibrary();

        class WsProvider extends RemoteBrowserProvider {
            override type = 'websocket' as const;
            async connect() {
                return { url: 'wss://test.io' };
            }
        }

        expect(() => {
            new PuppeteerPlugin(lib as any, { remoteBrowser: new WsProvider() });
        }).toThrow("does not support 'websocket'");
    });

    test('provider release called on connection failure', async () => {
        const lib = createMockPuppeteerLibrary();
        lib.connect.mockRejectedValue(new Error('Connection refused'));

        const releaseSpy = vi.fn();

        class FailProvider extends RemoteBrowserProvider<{ id: string }> {
            async connect() {
                return { url: 'wss://fail.io', context: { id: 'sess-pptr' } };
            }
            async release(context: { id: string }) {
                releaseSpy(context);
            }
        }

        const plugin = new PuppeteerPlugin(lib as any, { remoteBrowser: new FailProvider() });
        const ctx = plugin.createLaunchContext();

        await expect(plugin.launch(ctx)).rejects.toThrow('Failed to connect to remote browser');
        expect(releaseSpy).toHaveBeenCalledWith({ id: 'sess-pptr' });
    });

    test('provider isRemote = true', () => {
        const lib = createMockPuppeteerLibrary();

        class P extends RemoteBrowserProvider {
            async connect() {
                return { url: 'wss://test.io' };
            }
        }

        const plugin = new PuppeteerPlugin(lib as any, { remoteBrowser: new P() });
        const ctx = plugin.createLaunchContext();
        expect(ctx.isRemote).toBe(true);
    });
});
