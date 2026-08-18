"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StagehandCrawler = void 0;
exports.createStagehandRouter = createStagehandRouter;
const browser_1 = require("@crawlee/browser");
const internal_1 = require("@crawlee/utils/internal");
const zod_1 = require("zod");
const stagehand_browser_pool_1 = require("./stagehand-browser-pool");
const stagehand_utils_1 = require("./utils/stagehand-utils");
/**
 * StagehandCrawler provides AI-powered web crawling using Browserbase's Stagehand library.
 *
 * It extends {@apilink BrowserCrawler} and adds natural language interaction capabilities:
 * - `page.act()` - Perform actions using natural language
 * - `page.extract()` - Extract structured data with AI
 * - `page.observe()` - Get AI-suggested actions
 * - `page.agent()` - Create autonomous agents for complex workflows
 *
 * The crawler automatically applies anti-blocking features including browser fingerprinting,
 * making it suitable for crawling sites with bot protection like Cloudflare.
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
 *     verbose: 1,
 *   },
 *   maxConcurrency: 3,
 *   async requestHandler({ page, request, log }) {
 *     log.info(`Crawling ${request.url}`);
 *
 *     // Use AI to interact with the page
 *     await page.act('Click the Products link');
 *     await page.act('Scroll to load more items');
 *
 *     // Extract structured data
 *     const products = await page.extract(
 *       'Get all product names and prices',
 *       z.object({
 *         items: z.array(z.object({
 *           name: z.string(),
 *           price: z.number(),
 *         })),
 *       })
 *     );
 *
 *     log.info(`Found ${products.items.length} products`);
 *   },
 * });
 *
 * await crawler.run(['https://example.com']);
 * ```
 */
class StagehandCrawler extends browser_1.BrowserCrawler {
    /**
     * @internal
     */
    static optionsShape = {
        ...browser_1.BrowserCrawler.optionsShape,
        stagehandOptions: internal_1.schemas.anyObject.optional(),
        headless: zod_1.z.boolean().optional(),
    };
    /** @internal */
    static optionsSchema = zod_1.z.strictObject(StagehandCrawler.optionsShape);
    /**
     * Creates a new instance of StagehandCrawler.
     *
     * @param options - Crawler configuration options
     */
    constructor(options = {}) {
        const parsedOptions = (0, internal_1.parseArgument)(options, StagehandCrawler.optionsSchema, 'StagehandCrawlerOptions');
        const { stagehandOptions, launchContext, headless, configuration, contextPipelineBuilder, ...browserCrawlerOptions } = parsedOptions;
        if (options.browserPool) {
            // The raw options, not the parsed ones: `launchContext` has a default, so by now it is always set.
            (0, browser_1.assertBrowserPoolNotConfigured)(new.target.name, {
                launchContext: options.launchContext,
                stagehandOptions: options.stagehandOptions,
                headless: options.headless,
            });
        }
        super({
            ...browserCrawlerOptions,
            launchContext,
            configuration,
            // The pool serves plain Playwright pages - a page only becomes a `StagehandPage` further down the
            // pipeline, once `setUpStagehand` enhances it - so its page type is narrower than the crawler's.
            browserPoolBuilder: (remoteBrowser) => (remoteBrowser
                ? (0, stagehand_browser_pool_1.remoteStagehandBrowserPool)({
                    ...remoteBrowser,
                    launchContext,
                    stagehandOptions,
                    headless,
                    configuration,
                })
                : (0, stagehand_browser_pool_1.stagehandBrowserPool)({
                    launchContext,
                    stagehandOptions,
                    headless,
                    configuration,
                })),
            contextPipelineBuilder: contextPipelineBuilder ?? (() => this.buildContextPipeline()),
        });
    }
    buildContextPipeline() {
        return super.buildContextPipeline().compose({ action: this.setUpStagehand.bind(this) });
    }
    /**
     * Resolves the {@apilink StagehandController} that owns the given page, or
     * `undefined` when the pool does not expose controllers (e.g. a custom
     * {@apilink IBrowserPool} implementation).
     *
     * Stagehand needs direct controller access to reach the `Stagehand`
     * instance bound to the page's browser, which is why it reaches past the
     * {@apilink IBrowserPool} abstraction here.
     */
    getBrowserControllerByPage(page) {
        if ('getBrowserControllerByPage' in this.browserPool) {
            return this.browserPool.getBrowserControllerByPage(page);
        }
        return undefined;
    }
    /**
     * Enhance the page with Stagehand AI methods.
     */
    async setUpStagehand(crawlingContext) {
        const controller = this.getBrowserControllerByPage(crawlingContext.page);
        if (!controller) {
            throw new Error('Could not resolve StagehandController for page — is the browser pool configured correctly?');
        }
        const stagehand = controller.getStagehand();
        return {
            stagehand,
            page: (0, stagehand_utils_1.enhancePageWithStagehand)(crawlingContext.page, stagehand),
        };
    }
    /**
     * Navigation handler for Stagehand crawler.
     * Uses standard Playwright navigation.
     */
    async navigationHandler(crawlingContext, gotoOptions) {
        // Use standard page.goto for navigation
        return crawlingContext.page.goto(crawlingContext.request.url, gotoOptions);
    }
}
exports.StagehandCrawler = StagehandCrawler;
function createStagehandRouter(routesOrSchemas) {
    return browser_1.Router.create(routesOrSchemas);
}
