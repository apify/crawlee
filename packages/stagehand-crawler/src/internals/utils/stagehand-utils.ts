import type { Page } from 'playwright';

import type { StagehandPage } from '../stagehand-crawler';

/**
 * Enhances a Playwright Page with Stagehand AI methods.
 * Adds page.act(), page.extract(), page.observe(), and page.agent() methods.
 *
 * @param page - The Playwright page to enhance
 * @param stagehand - The Stagehand instance to bind methods from
 * @returns The enhanced page with AI methods
 *
 * @example
 * ```typescript
 * const enhancedPage = enhancePageWithStagehand(page, stagehand);
 * await enhancedPage.act('Click the button');
 * const data = await enhancedPage.extract('Get title', schema);
 * ```
 *
 * @ignore
 */
export function enhancePageWithStagehand(page: Page, stagehand: any): StagehandPage {
    // Cast to any to add properties
    const enhancedPage = page as any;

    /**
     * Perform an action on the page using natural language.
     */
    enhancedPage.act = async (instruction: string, options?: any) => {
        try {
            return await stagehand.act(instruction, options);
        } catch (error) {
            throw new Error(`Stagehand act() failed: ${error instanceof Error ? error.message : String(error)}`, {
                cause: error,
            });
        }
    };

    /**
     * Extract structured data from the page using natural language and a Zod schema.
     */
    enhancedPage.extract = async (instruction: string, schema: any) => {
        try {
            return await stagehand.extract(instruction, schema);
        } catch (error) {
            throw new Error(`Stagehand extract() failed: ${error instanceof Error ? error.message : String(error)}`, {
                cause: error,
            });
        }
    };

    /**
     * Observe the page and get AI-suggested actions.
     */
    enhancedPage.observe = async () => {
        try {
            return await stagehand.observe();
        } catch (error) {
            throw new Error(`Stagehand observe() failed: ${error instanceof Error ? error.message : String(error)}`, {
                cause: error,
            });
        }
    };

    /**
     * Create an autonomous agent for multi-step workflows.
     */
    enhancedPage.agent = (config?: any) => {
        try {
            return stagehand.agent(config);
        } catch (error) {
            throw new Error(`Stagehand agent() failed: ${error instanceof Error ? error.message : String(error)}`, {
                cause: error,
            });
        }
    };

    return enhancedPage as StagehandPage;
}
