import { Stagehand } from '@browserbasehq/stagehand';
import playwright, { chromium } from 'playwright';

import { StagehandLauncher } from '../../packages/stagehand-crawler/src/internals/stagehand-launcher.js';
import { StagehandPlugin } from '../../packages/stagehand-crawler/src/internals/stagehand-plugin.js';

// Mock Stagehand
vi.mock('@browserbasehq/stagehand', () => {
    return {
        Stagehand: vi.fn().mockImplementation(function (config: any) {
            return {
                init: vi.fn().mockResolvedValue(undefined),
                close: vi.fn().mockResolvedValue(undefined),
                connectURL: vi
                    .fn()
                    .mockReturnValue(
                        config.localBrowserLaunchOptions?.cdpUrl ?? 'ws://localhost:9222/devtools/browser',
                    ),
                context: {
                    browser: vi.fn(() => null),
                },
            };
        }),
    };
});

// Mock Playwright's connectOverCDP
vi.mock('playwright', async () => {
    const actual = await vi.importActual('playwright');
    return {
        ...actual,
        chromium: {
            ...(actual as any).chromium,
            connectOverCDP: vi.fn().mockResolvedValue({
                close: vi.fn().mockResolvedValue(undefined),
                contexts: vi.fn().mockReturnValue([]),
                isConnected: vi.fn().mockReturnValue(true),
                on: vi.fn(),
            }),
        },
    };
});

describe('StagehandPlugin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('should create plugin with default options', () => {
        const plugin = new StagehandPlugin(playwright.chromium, {
            stagehandOptions: {
                env: 'LOCAL',
            },
        });

        expect(plugin).toBeDefined();
        expect(plugin.name).toBe('StagehandPlugin');
    });

    test('should create plugin with Stagehand options', () => {
        const plugin = new StagehandPlugin(playwright.chromium, {
            stagehandOptions: {
                env: 'LOCAL',
                model: 'openai/gpt-4.1-mini',
                verbose: 1,
            },
        });

        expect(plugin).toBeDefined();
    });

    test('should create plugin with Browserbase options', () => {
        const plugin = new StagehandPlugin(playwright.chromium, {
            stagehandOptions: {
                env: 'BROWSERBASE',
                apiKey: 'test-key',
                projectId: 'test-project',
            },
        });

        expect(plugin).toBeDefined();
    });

    test('should create launch context', () => {
        const plugin = new StagehandPlugin(playwright.chromium, {
            stagehandOptions: {
                env: 'LOCAL',
            },
        });

        const launchContext = plugin.createLaunchContext();

        expect(launchContext).toBeDefined();
        expect(launchContext.browserPlugin).toBe(plugin);
    });

    test.each([
        ['socks5://user:pass@proxy.example.com:1080', 'socks5://proxy.example.com:1080'],
        ['socks://user:pass@proxy.example.com:1080', 'socks://proxy.example.com:1080'],
        ['http://user:pass@proxy.example.com:8080', 'http://proxy.example.com:8080'],
    ])('addProxyToLaunchOptions should set correct server for %s', async (proxyUrl, expectedServer) => {
        const plugin = new StagehandPlugin(playwright.chromium, {
            stagehandOptions: {
                env: 'LOCAL',
            },
        });
        const context = plugin.createLaunchContext({ proxyUrl });
        await (plugin as any).addProxyToLaunchOptions(context);
        expect(context.launchOptions!.proxy!.server).toEqual(expectedServer);
    });

    test('should create controller', () => {
        const plugin = new StagehandPlugin(playwright.chromium, {
            stagehandOptions: {
                env: 'LOCAL',
            },
        });

        const controller = plugin.createController();

        expect(controller).toBeDefined();
    });

    test.each([undefined, 'LOCAL'] as const)('forwards a static CDP URL with env %s', async (env) => {
        const cdpUrl = 'ws://remote.example:9222/devtools/browser';
        const launcher = new StagehandLauncher({
            launchOptions: { cdpUrl },
            stagehandOptions: { env },
        });

        await launcher.launch();

        expect(Stagehand).toHaveBeenCalledWith(
            expect.objectContaining({
                env: 'LOCAL',
                localBrowserLaunchOptions: expect.objectContaining({ cdpUrl }),
            }),
        );
        expect(chromium.connectOverCDP).toHaveBeenCalledWith(cdpUrl);
    });

    test('preserves local launch options when no CDP URL is supplied', async () => {
        const launcher = new StagehandLauncher({ launchOptions: { headless: false } });

        await launcher.launch();

        expect(Stagehand).toHaveBeenCalledWith(
            expect.objectContaining({
                localBrowserLaunchOptions: expect.objectContaining({ headless: false }),
            }),
        );
        expect(chromium.connectOverCDP).toHaveBeenCalledWith('ws://localhost:9222/devtools/browser');
    });

    test('does not pass local launch options to Browserbase', async () => {
        const launcher = new StagehandLauncher({
            launchOptions: { cdpUrl: 'ws://remote.example:9222/devtools/browser' },
            stagehandOptions: { env: 'BROWSERBASE' },
        });

        await launcher.launch();

        expect(Stagehand).toHaveBeenCalledWith(
            expect.objectContaining({ env: 'BROWSERBASE', localBrowserLaunchOptions: undefined }),
        );
        expect(chromium.connectOverCDP).toHaveBeenCalledWith('ws://localhost:9222/devtools/browser');
    });
});
