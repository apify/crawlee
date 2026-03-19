import { vi } from 'vitest';

import { serviceLocator } from '@crawlee/core';
import type { CrawleeLogger } from '@crawlee/core';

import { PlaywrightPlugin } from '../src/playwright/playwright-plugin.js';
import { PuppeteerPlugin } from '../src/puppeteer/puppeteer-plugin.js';

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

function createMockBrowser() {
    return {
        newPage: vi.fn().mockResolvedValue({ close: vi.fn(), url: vi.fn(() => 'about:blank') }),
        close: vi.fn().mockResolvedValue(undefined),
        contexts: vi.fn(() => []),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        version: vi.fn(() => '120.0.0'),
        pages: vi.fn(() => []),
        process: vi.fn(() => null),
        userAgent: vi.fn().mockResolvedValue('mock-ua'),
        createBrowserContext: vi.fn(),
        createIncognitoBrowserContext: vi.fn(),
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
        test('defaults to true for remote (connectOverCDP)', () => {
            const lib = createMockPlaywrightLibrary();
            const plugin = new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
            });

            expect(plugin.useIncognitoPages).toBe(true);
        });

        test('defaults to true for remote (connect)', () => {
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

    // --- Warnings -------------------------------------------------------------

    describe('warnings', () => {
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

        test('useIncognitoPages: false + remote CDP → warning about shared state', () => {
            const lib = createMockPlaywrightLibrary();
            new PlaywrightPlugin(lib as any, {
                connectOverCDPOptions: { endpointURL: 'http://remote:9222' },
                useIncognitoPages: false,
            });

            expect(mockLogger.warning).toHaveBeenCalledWith(
                expect.stringContaining('Pages will share cookies and storage'),
            );
        });

        test('useIncognitoPages: false + remote WebSocket → warning about no default context', () => {
            const lib = createMockPlaywrightLibrary();
            new PlaywrightPlugin(lib as any, {
                connectOptions: { wsEndpoint: 'ws://remote:3000' },
                useIncognitoPages: false,
            });

            expect(mockLogger.warning).toHaveBeenCalledWith(
                expect.stringContaining('browserType.connect() returns a browser with no default context'),
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
        test('defaults to true for remote', () => {
            const lib = createMockPuppeteerLibrary();
            const plugin = new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
            });

            expect(plugin.useIncognitoPages).toBe(true);
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

    // --- Warnings -------------------------------------------------------------

    describe('warnings', () => {
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

        test('useIncognitoPages: false + remote → warning logged', () => {
            const lib = createMockPuppeteerLibrary();
            new PuppeteerPlugin(lib as any, {
                connectOverCDPOptions: { browserWSEndpoint: 'ws://remote:9222' },
                useIncognitoPages: false,
            });

            expect(mockLogger.warning).toHaveBeenCalledWith(
                expect.stringContaining('useIncognitoPages is set to false'),
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
