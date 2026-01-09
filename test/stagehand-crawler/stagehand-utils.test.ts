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

        expect(mockStagehand.act).toHaveBeenCalledWith('Click the button', undefined);
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

        expect(mockStagehand.extract).toHaveBeenCalledWith('Get product info', schema);
        expect(result).toEqual({
            title: 'Test Page',
            price: 42,
        });
    });

    test('should enhance page with observe method', async () => {
        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        expect(typeof enhancedPage.observe).toBe('function');

        const result = await enhancedPage.observe();

        expect(mockStagehand.observe).toHaveBeenCalled();
        expect(result).toEqual([{ selector: '.button', description: 'Click button' }]);
    });

    test('should enhance page with agent method', () => {
        const enhancedPage = enhancePageWithStagehand(mockPage, mockStagehand) as StagehandPage;

        expect(typeof enhancedPage.agent).toBe('function');

        const agent = enhancedPage.agent({ task: 'Find and click submit' });

        expect(mockStagehand.agent).toHaveBeenCalledWith({ task: 'Find and click submit' });
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

        expect(() => enhancedPage.agent({ task: 'test' })).toThrow('Stagehand agent() failed: Agent creation failed');
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

        expect(mockStagehand.act).toHaveBeenCalledWith('Click button', options);
    });
});
