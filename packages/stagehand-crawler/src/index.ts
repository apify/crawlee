/**
 * AI-powered web crawling with Stagehand integration for Crawlee.
 *
 * This package provides {@apilink StagehandCrawler}, which extends {@apilink BrowserCrawler}
 * with natural language browser automation capabilities powered by Browserbase's Stagehand library.
 *
 * ## Key Features
 *
 * - **Natural Language Actions**: Use `page.act()` to perform actions with plain English instructions
 * - **Structured Data Extraction**: Use `page.extract()` with Zod schemas for type-safe data extraction
 * - **Action Discovery**: Use `page.observe()` to get AI-suggested actions
 * - **Autonomous Agents**: Use `page.agent()` for complex multi-step workflows
 * - **Anti-Blocking**: Automatic browser fingerprinting and Cloudflare bypass
 * - **Browserbase Integration**: Optional cloud browser support
 *
 * @example
 * ```typescript
 * import { StagehandCrawler } from '@crawlee/stagehand';
 * import { z } from 'zod';
 *
 * const crawler = new StagehandCrawler({
 *   stagehandOptions: {
 *     env: 'LOCAL',
 *     model: 'openai/gpt-4o',
 *   },
 *   async requestHandler({ page, request, log }) {
 *     log.info(`Processing ${request.url}`);
 *
 *     // Use natural language to interact
 *     await page.act('Click the Products link');
 *
 *     // Extract structured data
 *     const products = await page.extract(
 *       'Get all products',
 *       z.object({
 *         items: z.array(z.object({
 *           name: z.string(),
 *           price: z.number(),
 *         })),
 *       })
 *     );
 *
 *     await Dataset.pushData(products);
 *   },
 * });
 *
 * await crawler.run(['https://example.com']);
 * ```
 *
 * @module @crawlee/stagehand
 */

// Re-export everything from @crawlee/browser for convenience
export * from '@crawlee/browser';

// Export main crawler class
export {
    StagehandCrawler,
    createStagehandRouter,
} from './internals/stagehand-crawler';

// Export types
export type {
    StagehandOptions,
    StagehandPage,
    StagehandCrawlingContext,
    StagehandHook,
    StagehandRequestHandler,
    StagehandGotoOptions,
    StagehandCrawlerOptions,
} from './internals/stagehand-crawler';

export type { StagehandLaunchContext } from './internals/stagehand-launcher';

// Export utilities as namespace
export * as stagehandUtils from './internals/utils/stagehand-utils';
