import { z } from 'zod';

import { createStagehandRouter, StagehandCrawler } from '../../packages/stagehand-crawler/src';
import { enhancePageWithStagehand } from '../../packages/stagehand-crawler/src/internals/utils/stagehand-utils';

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
                model: 'openai/gpt-4.1-mini',
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

describe('enhancePageWithStagehand', () => {
    test('should add AI methods to page', () => {
        const mockPage = {} as any;
        const mockStagehand = {
            act: vi.fn(),
            extract: vi.fn(),
            observe: vi.fn(),
            agent: vi.fn(),
        } as any;

        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand);

        expect(typeof enhancedPage.act).toBe('function');
        expect(typeof enhancedPage.extract).toBe('function');
        expect(typeof enhancedPage.observe).toBe('function');
        expect(typeof enhancedPage.agent).toBe('function');
    });

    test('act() should forward to stagehand with page option', async () => {
        const mockPage = { url: () => 'https://example.com' } as any;
        const mockStagehand = {
            act: vi.fn().mockResolvedValue({ success: true, message: 'Done', actions: [] }),
            extract: vi.fn(),
            observe: vi.fn(),
            agent: vi.fn(),
        } as any;

        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand);
        await enhancedPage.act('Click the button');

        expect(mockStagehand.act).toHaveBeenCalledWith('Click the button', { page: mockPage });
    });

    test('act() should pass additional options', async () => {
        const mockPage = {} as any;
        const mockStagehand = {
            act: vi.fn().mockResolvedValue({ success: true, message: 'Done', actions: [] }),
            extract: vi.fn(),
            observe: vi.fn(),
            agent: vi.fn(),
        } as any;

        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand);
        await enhancedPage.act('Click the button', { timeout: 5000 });

        expect(mockStagehand.act).toHaveBeenCalledWith('Click the button', {
            page: mockPage,
            timeout: 5000,
        });
    });

    test('extract() should forward to stagehand with page option', async () => {
        const mockPage = {} as any;
        const mockStagehand = {
            act: vi.fn(),
            extract: vi.fn().mockResolvedValue({ title: 'Test', price: 42 }),
            observe: vi.fn(),
            agent: vi.fn(),
        } as any;

        const schema = z.object({ title: z.string(), price: z.number() });
        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand);
        const result = await enhancedPage.extract('Get product info', schema);

        expect(mockStagehand.extract).toHaveBeenCalledWith('Get product info', schema, { page: mockPage });
        expect(result).toEqual({ title: 'Test', price: 42 });
    });

    test('observe() should forward to stagehand with page option', async () => {
        const mockPage = {} as any;
        const mockActions = [{ action: 'click', element: 'Button', selector: '.btn' }];
        const mockStagehand = {
            act: vi.fn(),
            extract: vi.fn(),
            observe: vi.fn().mockResolvedValue(mockActions),
            agent: vi.fn(),
        } as any;

        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand);
        const result = await enhancedPage.observe();

        expect(mockStagehand.observe).toHaveBeenCalledWith({ page: mockPage });
        expect(result).toEqual(mockActions);
    });

    test('agent() should forward to stagehand', () => {
        const mockPage = {} as any;
        const mockAgentInstance = { execute: vi.fn() };
        const mockStagehand = {
            act: vi.fn(),
            extract: vi.fn(),
            observe: vi.fn(),
            agent: vi.fn().mockReturnValue(mockAgentInstance),
        } as any;

        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand);
        const agent = enhancedPage.agent({ model: 'gpt-4.1-mini' });

        expect(mockStagehand.agent).toHaveBeenCalledWith({ model: 'gpt-4.1-mini' });
        expect(agent).toBe(mockAgentInstance);
    });

    test('act() should wrap errors', async () => {
        const mockPage = {} as any;
        const mockStagehand = {
            act: vi.fn().mockRejectedValue(new Error('LLM API error')),
            extract: vi.fn(),
            observe: vi.fn(),
            agent: vi.fn(),
        } as any;

        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand);

        await expect(enhancedPage.act('Click button')).rejects.toThrow('Stagehand act() failed: LLM API error');
    });

    test('extract() should wrap errors', async () => {
        const mockPage = {} as any;
        const mockStagehand = {
            act: vi.fn(),
            extract: vi.fn().mockRejectedValue(new Error('Schema validation failed')),
            observe: vi.fn(),
            agent: vi.fn(),
        } as any;

        const schema = z.object({ title: z.string() });
        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand);

        await expect(enhancedPage.extract('Get data', schema)).rejects.toThrow(
            'Stagehand extract() failed: Schema validation failed',
        );
    });
});
