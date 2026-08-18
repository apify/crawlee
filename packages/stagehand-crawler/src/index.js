"use strict";
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
 *     model: 'openai/gpt-4.1-mini',
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.stagehandUtils = exports.remoteStagehandBrowserPool = exports.stagehandBrowserPool = exports.createStagehandRouter = exports.StagehandCrawler = void 0;
const tslib_1 = require("tslib");
// Re-export everything from @crawlee/browser for convenience
tslib_1.__exportStar(require("@crawlee/browser"), exports);
// Export main crawler class
var stagehand_crawler_1 = require("./internals/stagehand-crawler");
Object.defineProperty(exports, "StagehandCrawler", { enumerable: true, get: function () { return stagehand_crawler_1.StagehandCrawler; } });
Object.defineProperty(exports, "createStagehandRouter", { enumerable: true, get: function () { return stagehand_crawler_1.createStagehandRouter; } });
// Export the browser pool factories, which are how a pool with non-default options reaches the crawler
var stagehand_browser_pool_1 = require("./internals/stagehand-browser-pool");
Object.defineProperty(exports, "stagehandBrowserPool", { enumerable: true, get: function () { return stagehand_browser_pool_1.stagehandBrowserPool; } });
Object.defineProperty(exports, "remoteStagehandBrowserPool", { enumerable: true, get: function () { return stagehand_browser_pool_1.remoteStagehandBrowserPool; } });
// Export utilities as namespace
exports.stagehandUtils = tslib_1.__importStar(require("./internals/utils/stagehand-utils"));
