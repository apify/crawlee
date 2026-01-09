import { z } from 'zod';

import { createStagehandRouter, StagehandCrawler } from '../../packages/stagehand-crawler/src';

// Mock Stagehand to avoid actual browser launches and API calls
vi.mock('@browserbasehq/stagehand', () => {
    return {
        Stagehand: vi.fn().mockImplementation(() => {
            let mockBrowser: any;
            return {
                init: vi.fn().mockResolvedValue(undefined),
                close: vi.fn().mockResolvedValue(undefined),
                connectURL: vi.fn().mockReturnValue('ws://localhost:9222/devtools/browser'),
                act: vi.fn().mockResolvedValue({
                    success: true,
                    message: 'Action completed',
                    actionDescription: 'Clicked button',
                    actions: [],
                }),
                extract: vi.fn().mockResolvedValue({
                    title: 'Test Page',
                    price: 42,
                }),
                observe: vi.fn().mockResolvedValue([{ selector: '.button', description: 'Click button' }]),
                agent: vi.fn().mockReturnValue({
                    execute: vi.fn().mockResolvedValue({
                        success: true,
                        steps: [],
                    }),
                }),
                context: {
                    browser: vi.fn(() => mockBrowser),
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
            connectOverCDP: vi.fn().mockImplementation(async () => {
                // Return a mock browser
                return {
                    newContext: vi.fn().mockResolvedValue({
                        newPage: vi.fn().mockResolvedValue({
                            goto: vi.fn().mockResolvedValue(null),
                            close: vi.fn().mockResolvedValue(undefined),
                            url: vi.fn().mockReturnValue('https://example.com'),
                            context: vi.fn().mockReturnValue({
                                cookies: vi.fn().mockResolvedValue([]),
                                addCookies: vi.fn().mockResolvedValue(undefined),
                            }),
                        }),
                        close: vi.fn().mockResolvedValue(undefined),
                    }),
                    close: vi.fn().mockResolvedValue(undefined),
                    contexts: vi.fn().mockReturnValue([]),
                    isConnected: vi.fn().mockReturnValue(true),
                };
            }),
        },
    };
});

describe('StagehandCrawler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('should create crawler with default options', () => {
        const crawler = new StagehandCrawler({
            stagehandOptions: {
                env: 'LOCAL',
            },
        });

        expect(crawler).toBeDefined();
    });

    test('should create crawler with Stagehand options', () => {
        const crawler = new StagehandCrawler({
            stagehandOptions: {
                env: 'LOCAL',
                model: 'openai/gpt-4o',
                verbose: 1,
                selfHeal: true,
            },
        });

        expect(crawler).toBeDefined();
    });

    test('should create crawler with Browserbase options', () => {
        const crawler = new StagehandCrawler({
            stagehandOptions: {
                env: 'BROWSERBASE',
                apiKey: 'test-key',
                projectId: 'test-project',
            },
        });

        expect(crawler).toBeDefined();
    });

    test.skip('should enhance page with AI methods', async () => {
        // This test is skipped because it requires a full browser launch
        // and we're mocking Stagehand
        let enhancedPage: any;

        const crawler = new StagehandCrawler({
            stagehandOptions: {
                env: 'LOCAL',
            },
            maxRequestsPerCrawl: 1,
            requestHandler: async ({ page }) => {
                enhancedPage = page;
                // Verify AI methods are available
                expect(typeof page.act).toBe('function');
                expect(typeof page.extract).toBe('function');
                expect(typeof page.observe).toBe('function');
                expect(typeof page.agent).toBe('function');
            },
        });

        await crawler.run(['https://example.com']);
    });
});

describe('createStagehandRouter', () => {
    test('should create router', () => {
        const router = createStagehandRouter();

        expect(router).toBeDefined();
        expect(typeof router.addHandler).toBe('function');
        expect(typeof router.addDefaultHandler).toBe('function');
    });

    test('should add handlers to router', () => {
        const router = createStagehandRouter();

        router.addHandler('product', async ({ page, log }) => {
            log.info('Processing product');
        });

        router.addDefaultHandler(async ({ page, enqueueLinks }) => {
            await enqueueLinks();
        });

        expect(router).toBeDefined();
    });
});
