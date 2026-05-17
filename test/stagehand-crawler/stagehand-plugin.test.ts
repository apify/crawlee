import playwright from 'playwright';

import { StagehandPlugin } from '../../packages/stagehand-crawler/src/internals/stagehand-plugin';

// Mock Stagehand
vi.mock('@browserbasehq/stagehand', () => {
    return {
        Stagehand: vi.fn().mockImplementation((config: any) => {
            return {
                init: vi.fn().mockResolvedValue(undefined),
                close: vi.fn().mockResolvedValue(undefined),
                connectURL: vi.fn().mockReturnValue('ws://localhost:9222/devtools/browser'),
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

    test('should create controller', () => {
        const plugin = new StagehandPlugin(playwright.chromium, {
            stagehandOptions: {
                env: 'LOCAL',
            },
        });

        const controller = plugin.createController();

        expect(controller).toBeDefined();
    });
});
