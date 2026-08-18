import type { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from 'playwright';
import type { StagehandPage } from '../stagehand-crawler';
/**
 * Enhances a Playwright Page with Stagehand AI methods.
 * Adds page.act(), page.extract(), page.observe(), and page.agent() methods.
 *
 * The key feature is that each AI method passes the specific page to Stagehand,
 * allowing multiple pages to use AI operations concurrently without interference.
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
export declare function enhancePageWithStagehand(page: Page, stagehand: Stagehand): StagehandPage;
