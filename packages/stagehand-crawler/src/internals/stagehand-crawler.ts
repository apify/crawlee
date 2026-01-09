import type {
    BrowserCrawlerOptions,
    BrowserCrawlingContext,
    BrowserHook,
    BrowserRequestHandler,
    GetUserDataFromRequest,
    LoadedContext,
    RouterRoutes,
} from '@crawlee/browser';
import { BrowserCrawler, Configuration, Router } from '@crawlee/browser';
import type { Dictionary } from '@crawlee/types';
import ow from 'ow';
import type { LaunchOptions, Page, Response } from 'playwright';
import type { z } from 'zod';

import type { StagehandController } from './stagehand-controller';
import type { StagehandLaunchContext } from './stagehand-launcher';
import { StagehandLauncher } from './stagehand-launcher';
import type { StagehandPlugin } from './stagehand-plugin';
import { enhancePageWithStagehand } from './utils/stagehand-utils';

/**
 * Stagehand-specific configuration options.
 */
export interface StagehandOptions {
    /**
     * Environment to run Stagehand in.
     * - `'LOCAL'`: Use local browser (default)
     * - `'BROWSERBASE'`: Use Browserbase cloud browsers
     * @default 'LOCAL'
     */
    env?: 'LOCAL' | 'BROWSERBASE';

    /**
     * Browserbase API key (required when env is 'BROWSERBASE').
     * Can also be set via STAGEHAND_API_KEY environment variable.
     */
    apiKey?: string;

    /**
     * Browserbase project ID (required when env is 'BROWSERBASE').
     * Can also be set via STAGEHAND_PROJECT_ID environment variable.
     */
    projectId?: string;

    /**
     * AI model to use for act(), extract(), observe() operations.
     * Can be a string like "openai/gpt-4o" or a detailed ModelConfig object.
     * Can also be set via STAGEHAND_MODEL environment variable.
     * @default 'openai/gpt-4o'
     * @example "openai/gpt-4o"
     * @example "anthropic/claude-3-5-sonnet-20241022"
     */
    model?: string | any; // ModelConfig type from Stagehand

    /**
     * Logging verbosity level.
     * - 0: Minimal logging
     * - 1: Standard logging
     * - 2: Debug logging
     * @default 0
     */
    verbose?: number;

    /**
     * Enable automatic error recovery for failed AI operations.
     * @default true
     */
    selfHeal?: boolean;

    /**
     * Time to wait for DOM to stabilize before performing AI operations (ms).
     * @default 30000
     */
    domSettleTimeout?: number;

    /**
     * Custom LLM client for AI operations.
     */
    llmClient?: any; // LLMClient type from Stagehand

    /**
     * Custom system prompt for AI operations.
     */
    systemPrompt?: string;

    /**
     * Enable logging of AI inference details to file for debugging.
     * @default false
     */
    logInferenceToFile?: boolean;

    /**
     * Cache directory for observation caching to improve performance.
     */
    cacheDir?: string;
}

/**
 * Enhanced Playwright Page with Stagehand AI methods.
 */
export interface StagehandPage extends Page {
    /**
     * Perform an action on the page using natural language.
     *
     * @param instruction - Natural language instruction for the action
     * @param options - Optional configuration for the action
     * @returns Promise that resolves when the action is complete
     *
     * @example
     * ```typescript
     * await page.act('Click the login button');
     * await page.act('Fill in email with test@example.com');
     * await page.act('Scroll down to load more items');
     * ```
     */
    act(instruction: string, options?: any): Promise<void>;

    /**
     * Extract structured data from the page using natural language and a Zod schema.
     *
     * @param instruction - Natural language description of what to extract
     * @param schema - Zod schema defining the structure of the data
     * @returns Promise that resolves with the extracted data matching the schema
     *
     * @example
     * ```typescript
     * const data = await page.extract(
     *   'Get product title and price',
     *   z.object({
     *     title: z.string(),
     *     price: z.number(),
     *   })
     * );
     * ```
     */
    extract<T>(instruction: string, schema: z.ZodSchema<T>): Promise<T>;

    /**
     * Observe the page and get AI-suggested actions.
     *
     * @returns Promise that resolves with available actions on the page
     *
     * @example
     * ```typescript
     * const suggestions = await page.observe();
     * console.log('Available actions:', suggestions);
     * ```
     */
    observe(): Promise<any>; // ActionSuggestions type from Stagehand

    /**
     * Create an autonomous agent for multi-step workflows.
     *
     * @param config - Configuration for the agent
     * @returns Agent instance that can execute complex workflows
     *
     * @example
     * ```typescript
     * const agent = page.agent({ task: 'Find and add cheapest laptop to cart' });
     * await agent.execute();
     * ```
     */
    agent(config?: any): any; // AgentInstance type from Stagehand
}

/**
 * Crawling context for StagehandCrawler with enhanced page object.
 */
export interface StagehandCrawlingContext<UserData extends Dictionary = Dictionary>
    extends BrowserCrawlingContext<StagehandCrawler, StagehandPage, Response, StagehandController, UserData> {
    /**
     * Enhanced Playwright page with Stagehand AI methods.
     * Use page.act(), page.extract(), page.observe(), page.agent() for AI-powered operations.
     */
    page: StagehandPage;

    /**
     * Stagehand instance for advanced control.
     * Usually you don't need to access this directly - use the enhanced page methods instead.
     */
    stagehand: any;
}

/**
 * Hook function for StagehandCrawler.
 */
export interface StagehandHook extends BrowserHook<StagehandCrawlingContext, StagehandGotoOptions> {}

/**
 * Request handler for StagehandCrawler.
 */
export interface StagehandRequestHandler extends BrowserRequestHandler<LoadedContext<StagehandCrawlingContext>> {}

/**
 * Goto options for StagehandCrawler navigation.
 */
export type StagehandGotoOptions = Dictionary & Parameters<Page['goto']>[1];

/**
 * Options for StagehandCrawler.
 */
export interface StagehandCrawlerOptions
    extends BrowserCrawlerOptions<StagehandCrawlingContext, { browserPlugins: [StagehandPlugin] }> {
    /**
     * Stagehand-specific configuration options.
     * These options configure the AI behavior and Browserbase integration.
     */
    stagehandOptions?: StagehandOptions;

    /**
     * Launch context with Stagehand-specific options.
     */
    launchContext?: StagehandLaunchContext;

    /**
     * Function that is called to process each request.
     *
     * The function receives the {@apilink StagehandCrawlingContext} as an argument, where:
     * - `request` is an instance of the {@apilink Request} object with details about the URL to open, HTTP method etc.
     * - `page` is an enhanced Playwright [`Page`](https://playwright.dev/docs/api/class-page) with AI methods
     * - `browserController` is an instance of {@apilink StagehandController}
     * - `response` is the main resource response as returned by `page.goto(request.url)`
     * - `stagehand` is the Stagehand instance for advanced control
     *
     * The page object is enhanced with AI-powered methods:
     * - `page.act(instruction)` - Perform actions using natural language
     * - `page.extract(instruction, schema)` - Extract structured data
     * - `page.observe()` - Get AI-suggested actions
     * - `page.agent(config)` - Create autonomous agents
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     *
     * @example
     * ```typescript
     * async requestHandler({ request, page, log }) {
     *   log.info(`Processing ${request.url}`);
     *
     *   // Use AI-powered actions
     *   await page.act('Click the Products menu');
     *
     *   // Extract structured data
     *   const products = await page.extract(
     *     'Get all products',
     *     z.object({
     *       items: z.array(z.object({
     *         name: z.string(),
     *         price: z.number(),
     *       })),
     *     })
     *   );
     *
     *   // Mix with standard Playwright methods
     *   await page.screenshot({ path: 'products.png' });
     * }
     * ```
     */
    requestHandler?: StagehandRequestHandler;

    /**
     * Function called when request handling fails after all retries.
     */
    failedRequestHandler?: StagehandRequestHandler;

    /**
     * Async functions that are sequentially evaluated before the navigation.
     */
    preNavigationHooks?: StagehandHook[];

    /**
     * Async functions that are sequentially evaluated after the navigation.
     */
    postNavigationHooks?: StagehandHook[];
}

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
 *     model: 'openai/gpt-4o',
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
export class StagehandCrawler extends BrowserCrawler<
    { browserPlugins: [StagehandPlugin] },
    LaunchOptions,
    StagehandCrawlingContext
> {
    protected static override optionsShape = {
        ...BrowserCrawler.optionsShape,
        stagehandOptions: ow.optional.object,
        browserPoolOptions: ow.optional.object,
    };

    /**
     * Creates a new instance of StagehandCrawler.
     *
     * @param options - Crawler configuration options
     */
    constructor(
        options: StagehandCrawlerOptions = {},
        override readonly config = Configuration.getGlobalConfig(),
    ) {
        const {
            stagehandOptions = {},
            launchContext = {},
            browserPoolOptions = {},
            ...browserCrawlerOptions
        } = options;

        // Validate options
        ow(options, 'StagehandCrawlerOptions', ow.object.exactShape(StagehandCrawler.optionsShape));

        // Create launcher with Stagehand plugin
        const launcher = new StagehandLauncher(
            {
                ...launchContext,
                stagehandOptions,
            },
            config,
        );

        // Initialize BrowserCrawler with Stagehand plugin and fingerprinting enabled
        super(
            {
                ...browserCrawlerOptions,
                launchContext,
                browserPoolOptions: {
                    ...browserPoolOptions,
                    browserPlugins: [launcher.createBrowserPlugin()],
                    // Enable fingerprinting by default for anti-blocking
                    useFingerprints: browserPoolOptions.useFingerprints ?? true,
                },
            },
            config,
        );
    }

    /**
     * Overrides the request handler to enhance the page with Stagehand AI methods.
     */
    protected override async _runRequestHandler(crawlingContext: StagehandCrawlingContext): Promise<void> {
        // Get Stagehand instance from controller
        const stagehand = (crawlingContext.browserController as StagehandController).getStagehand();
        crawlingContext.stagehand = stagehand;

        // Enhance page with AI methods (page.act(), page.extract(), etc.)
        crawlingContext.page = enhancePageWithStagehand(crawlingContext.page, stagehand) as StagehandPage;

        // Call parent request handler
        await super._runRequestHandler(crawlingContext);
    }

    /**
     * Navigation handler for Stagehand crawler.
     * Uses standard Playwright navigation.
     */
    protected override async _navigationHandler(
        crawlingContext: StagehandCrawlingContext,
        gotoOptions: StagehandGotoOptions,
    ): Promise<Response | null> {
        // Use standard page.goto for navigation
        return crawlingContext.page.goto(crawlingContext.request.url, gotoOptions);
    }
}

/**
 * Creates a new router for StagehandCrawler with type-safe route handlers.
 *
 * @param options - Router options
 * @returns Configured router instance
 *
 * @example
 * ```typescript
 * const router = createStagehandRouter();
 *
 * router.addHandler('product', async ({ page, request, log }) => {
 *   log.info(`Processing product: ${request.url}`);
 *   const data = await page.extract('Get product info', schema);
 * });
 *
 * router.addDefaultHandler(async ({ page, enqueueLinks }) => {
 *   await enqueueLinks({ globs: ['https://example.com/products/*'] });
 * });
 *
 * const crawler = new StagehandCrawler({
 *   requestHandler: router,
 * });
 * ```
 */
export function createStagehandRouter<
    Context extends StagehandCrawlingContext = StagehandCrawlingContext,
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, UserData>) {
    return Router.create<Context>(routes);
}
