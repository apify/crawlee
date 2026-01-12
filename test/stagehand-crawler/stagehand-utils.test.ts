import type { Page } from 'playwright';
import { z } from 'zod';

import type { StagehandPage } from '../../packages/stagehand-crawler/src/internals/stagehand-crawler';
import { enhancePageWithStagehand } from '../../packages/stagehand-crawler/src/internals/utils/stagehand-utils';

describe('enhancePageWithStagehand', () => {
    let mockPage: Page;
    let mockStagehand: any;

    beforeEach(() => {
        // Create a mock Playwright page
        mockPage = {
            goto: vi.fn(),
            url: vi.fn(),
            close: vi.fn(),
        } as any;

        // Create a mock Stagehand instance
        mockStagehand = {
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
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('should enhance page with act method', async () => {
        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        expect(typeof enhancedPage.act).toBe('function');

        const result = await enhancedPage.act('Click the button');

        // Verify act was called with the page option for concurrent page support
        expect(mockStagehand.act).toHaveBeenCalledWith('Click the button', { page: enhancedPage });
        expect(result).toEqual({
            success: true,
            message: 'Action completed',
            actionDescription: 'Clicked button',
            actions: [],
        });
    });

    test('should enhance page with extract method', async () => {
        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        expect(typeof enhancedPage.extract).toBe('function');

        const schema = z.object({
            title: z.string(),
            price: z.number(),
        });

        const result = await enhancedPage.extract('Get product info', schema);

        // Verify extract was called with the page option for concurrent page support
        expect(mockStagehand.extract).toHaveBeenCalledWith('Get product info', schema, { page: enhancedPage });
        expect(result).toEqual({
            title: 'Test Page',
            price: 42,
        });
    });

    test('should enhance page with observe method', async () => {
        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        expect(typeof enhancedPage.observe).toBe('function');

        const result = await enhancedPage.observe();

        // Verify observe was called with the page option for concurrent page support
        expect(mockStagehand.observe).toHaveBeenCalledWith({ page: enhancedPage });
        expect(result).toEqual([{ selector: '.button', description: 'Click button' }]);
    });

    test('should enhance page with agent method', () => {
        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        expect(typeof enhancedPage.agent).toBe('function');

        // AgentConfig uses systemPrompt, model, etc. - task is passed to execute()
        const agent = enhancedPage.agent({ systemPrompt: 'Find and click submit' });

        expect(mockStagehand.agent).toHaveBeenCalledWith({ systemPrompt: 'Find and click submit' });
        expect(agent).toBeDefined();
    });

    test('should handle act errors gracefully', async () => {
        mockStagehand.act = vi.fn().mockRejectedValue(new Error('Action failed'));

        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        await expect(enhancedPage.act('Invalid action')).rejects.toThrow('Stagehand act() failed: Action failed');
    });

    test('should handle extract errors gracefully', async () => {
        mockStagehand.extract = vi.fn().mockRejectedValue(new Error('Extraction failed'));

        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        const schema = z.object({
            title: z.string(),
        });

        await expect(enhancedPage.extract('Get title', schema)).rejects.toThrow(
            'Stagehand extract() failed: Extraction failed',
        );
    });

    test('should handle observe errors gracefully', async () => {
        mockStagehand.observe = vi.fn().mockRejectedValue(new Error('Observation failed'));

        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        await expect(enhancedPage.observe()).rejects.toThrow('Stagehand observe() failed: Observation failed');
    });

    test('should handle agent errors gracefully', () => {
        mockStagehand.agent = vi.fn().mockImplementation(() => {
            throw new Error('Agent creation failed');
        });

        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        expect(() => enhancedPage.agent({ systemPrompt: 'test' })).toThrow(
            'Stagehand agent() failed: Agent creation failed',
        );
    });

    test('should preserve original page methods', () => {
        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        // Original Playwright methods should still be available
        expect(typeof enhancedPage.goto).toBe('function');
        expect(typeof enhancedPage.url).toBe('function');
        expect(typeof enhancedPage.close).toBe('function');
    });

    test('should pass options to act method', async () => {
        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        const options = { timeout: 5000 };
        await enhancedPage.act('Click button', options);

        // Options should be merged with the page option
        expect(mockStagehand.act).toHaveBeenCalledWith('Click button', { timeout: 5000, page: enhancedPage });
    });
});
