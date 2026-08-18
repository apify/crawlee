import type { Action, ActOptions, ActResult, AgentConfig, ExtractOptions, LLMClient, ModelConfiguration, NonStreamingAgentInstance, ObserveOptions, Stagehand, StreamingAgentInstance } from '@browserbasehq/stagehand';
import type { BrowserCrawlerOptions, BrowserCrawlingContext, BrowserHook, ContextPipeline, CrawlingContext, GetUserDataFromRequest, LoadedContext, RequestHandler, RouterHandler, RouterRoutes, RouteSchemas, RoutesFromSchemas } from '@crawlee/browser';
import { BrowserCrawler } from '@crawlee/browser';
import type { Dictionary } from '@crawlee/types';
import type { LaunchOptions, Page, Response } from 'playwright';
import { z } from 'zod';
import type { StagehandLaunchContext } from './stagehand-launcher';
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
     * API key - interpreted based on the `env` setting:
     * - When `env: 'LOCAL'`: LLM provider API key (OpenAI, Anthropic, or Google)
     * - When `env: 'BROWSERBASE'`: Browserbase API key
     *
     * For LOCAL env, can also be set via environment variables:
     * - OpenAI: `OPENAI_API_KEY`
     * - Anthropic: `ANTHROPIC_API_KEY`
     * - Google: `GOOGLE_API_KEY`
     *
     * @example
     * ```typescript
     * // Local with OpenAI
     * stagehandOptions: {
     *   env: 'LOCAL',
     *   model: 'openai/gpt-4.1-mini',
     *   apiKey: 'your-api-key',
     * }
     *
     * // Browserbase cloud
     * stagehandOptions: {
     *   env: 'BROWSERBASE',
     *   apiKey: 'your-browserbase-api-key',
     *   projectId: 'proj-...',
     * }
     * ```
     */
    apiKey?: string;
    /**
     * Browserbase project ID (required when env is 'BROWSERBASE').
     */
    projectId?: string;
    /**
     * AI model to use for act(), extract(), observe() operations.
     * Can be a string like "openai/gpt-4.1-mini" or a detailed ModelConfiguration object.
     * @default 'openai/gpt-4.1-mini'
     * @example "openai/gpt-4.1-mini"
     * @example "anthropic/claude-sonnet-4-20250514"
     */
    model?: ModelConfiguration;
    /**
     * Logging verbosity level.
     * - 0: Minimal logging
     * - 1: Standard logging
     * - 2: Debug logging
     * @default 0
     */
    verbose?: 0 | 1 | 2;
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
    llmClient?: LLMClient;
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
     * @returns Promise that resolves with the action result
     *
     * @example
     * ```typescript
     * await page.act('Click the login button');
     * await page.act('Fill in email with test@example.com');
     * await page.act('Scroll down to load more items');
     * ```
     */
    act(instruction: string, options?: Omit<ActOptions, 'page'>): Promise<ActResult>;
    /**
     * Extract structured data from the page using natural language and a Zod schema.
     *
     * @param instruction - Natural language description of what to extract
     * @param schema - Zod schema defining the structure of the data
     * @param options - Optional configuration for the extraction
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
    extract<T>(instruction: string, schema: z.ZodType<T>, options?: Omit<ExtractOptions, 'page'>): Promise<T>;
    /**
     * Observe the page and get AI-suggested actions.
     *
     * @param options - Optional configuration for the observation
     * @returns Promise that resolves with available actions on the page
     *
     * @example
     * ```typescript
     * const suggestions = await page.observe();
     * console.log('Available actions:', suggestions);
     * ```
     */
    observe(options?: Omit<ObserveOptions, 'page'>): Promise<Action[]>;
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
    agent(config: AgentConfig & {
        stream: true;
    }): StreamingAgentInstance;
    agent(config?: AgentConfig & {
        stream?: false;
    }): NonStreamingAgentInstance;
}
/**
 * Crawling context for StagehandCrawler with enhanced page object.
 */
/**
 * Goto options for StagehandCrawler navigation.
 */
export type StagehandGotoOptions = NonNullable<Parameters<Page['goto']>[1]>;
export interface StagehandCrawlingContext<UserData extends Dictionary = any> extends BrowserCrawlingContext<StagehandPage, Response, UserData, StagehandGotoOptions> {
    /**
     * Enhanced Playwright page with Stagehand AI methods.
     * Use page.act(), page.extract(), page.observe(), page.agent() for AI-powered operations.
     */
    page: StagehandPage;
    /**
     * Stagehand instance for advanced control.
     * Usually you don't need to access this directly - use the enhanced page methods instead.
     */
    stagehand: Stagehand;
}
/**
 * Hook function for StagehandCrawler.
 */
export type StagehandHook<UserData extends Dictionary = any> = BrowserHook<StagehandCrawlingContext<UserData>>;
/**
 * Request handler for StagehandCrawler.
 */
export interface StagehandRequestHandler extends RequestHandler<LoadedContext<StagehandCrawlingContext>> {
}
/**
 * Options for StagehandCrawler.
 */
export interface StagehandCrawlerOptions<ContextExtension = Dictionary<never>, ExtendedContext extends StagehandCrawlingContext = StagehandCrawlingContext & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<StagehandCrawlingContext['request']>>, StatisticStateExtension extends object = {}> extends BrowserCrawlerOptions<StagehandPage, Response, StagehandCrawlingContext, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
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
     * Whether to run browser in headless mode. Defaults to `true`.
     * Can be also set via {@apilink Configuration}.
     */
    headless?: boolean;
    /**
     * Function that is called to process each request.
     *
     * The function receives the {@apilink StagehandCrawlingContext} as an argument, where:
     * - `request` is an instance of the {@apilink Request} object with details about the URL to open, HTTP method etc.
     * - `page` is an enhanced Playwright [`Page`](https://playwright.dev/docs/api/class-page) with AI methods
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
    requestHandler?: RouterHandler<ExtendedContext, Routes> | RequestHandler<ExtendedContext>;
    /**
     * Async functions that are sequentially evaluated before the navigation.
     */
    preNavigationHooks?: BrowserHook<StagehandCrawlingContext<GetUserDataFromRequest<ExtendedContext['request']>>, ContextExtension>[];
    /**
     * Async functions that are sequentially evaluated after the navigation.
     */
    postNavigationHooks?: BrowserHook<StagehandCrawlingContext<GetUserDataFromRequest<ExtendedContext['request']>>, ContextExtension>[];
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
export declare class StagehandCrawler<ContextExtension = Dictionary<never>, ExtendedContext extends StagehandCrawlingContext = StagehandCrawlingContext & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<StagehandCrawlingContext['request']>>, StatisticStateExtension extends object = {}> extends BrowserCrawler<StagehandPage, Response, LaunchOptions, StagehandCrawlingContext, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    /**
     * @internal
     */
    protected static optionsShape: {
        stagehandOptions: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        headless: z.ZodOptional<z.ZodBoolean>;
        navigationTimeoutSecs: z.ZodDefault<z.ZodCustom<number, number>>;
        preNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        postNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        launchContext: z.ZodDefault<z.ZodCustom<Dictionary, Dictionary>>;
        browserPool: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        browserPoolBuilder: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        remoteBrowser: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        saveResponseCookies: z.ZodDefault<z.ZodBoolean>;
        proxyConfiguration: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        ignoreIframes: z.ZodDefault<z.ZodBoolean>;
        ignoreShadowRoots: z.ZodDefault<z.ZodBoolean>;
        contextPipelineBuilder: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        extendContext: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        requestList: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestQueue: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestManager: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        requestHandlerTimeoutSecs: z.ZodOptional<z.ZodCustom<number, number>>;
        errorHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        failedRequestHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        maxRequestRetries: z.ZodDefault<z.ZodCustom<number, number>>;
        sameDomainDelaySecs: z.ZodDefault<z.ZodCustom<number, number>>;
        maxRequestsPerCrawl: z.ZodOptional<z.ZodCustom<number, number>>;
        maxCrawlDepth: z.ZodOptional<z.ZodCustom<number, number>>;
        taskLoopOptions: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        concurrencySystem: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        sessionPool: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        statusMessageLoggingInterval: z.ZodDefault<z.ZodCustom<number, number>>;
        statusMessageCallback: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        additionalHttpErrorStatusCodes: z.ZodDefault<z.ZodArray<z.ZodCustom<number, number>>>;
        ignoreHttpErrorStatusCodes: z.ZodDefault<z.ZodArray<z.ZodCustom<number, number>>>;
        blockedStatusCodes: z.ZodOptional<z.ZodArray<z.ZodCustom<number, number>>>;
        retryOnBlocked: z.ZodDefault<z.ZodBoolean>;
        respectRobotsTxtFile: z.ZodDefault<z.ZodUnion<readonly [z.ZodBoolean, z.ZodCustom<Dictionary, Dictionary>]>>;
        transactionalStorage: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodObject<{
            requestQueue: z.ZodOptional<z.ZodEnum<{
                deferred: "deferred";
                writeThrough: "writeThrough";
            }>>;
        }, z.core.$strict>]>>;
        onSkippedRequest: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        httpClient: z.ZodOptional<z.ZodCustom<import("@crawlee/http-client").BaseHttpClient, import("@crawlee/http-client").BaseHttpClient>>;
        configuration: z.ZodOptional<z.ZodCustom<import("@crawlee/browser").Configuration, import("@crawlee/browser").Configuration>>;
        storageBackend: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        eventManager: z.ZodOptional<z.ZodCustom<import("@crawlee/browser").EventManager, import("@crawlee/browser").EventManager>>;
        logger: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        minConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxRequestsPerMinute: z.ZodOptional<z.ZodCustom<number, number>>;
        keepAlive: z.ZodOptional<z.ZodBoolean>;
        statistics: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        id: z.ZodOptional<z.ZodString>;
    };
    /** @internal */
    protected static optionsSchema: z.ZodObject<{
        stagehandOptions: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        headless: z.ZodOptional<z.ZodBoolean>;
        navigationTimeoutSecs: z.ZodDefault<z.ZodCustom<number, number>>;
        preNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        postNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        launchContext: z.ZodDefault<z.ZodCustom<Dictionary, Dictionary>>;
        browserPool: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        browserPoolBuilder: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        remoteBrowser: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        saveResponseCookies: z.ZodDefault<z.ZodBoolean>;
        proxyConfiguration: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        ignoreIframes: z.ZodDefault<z.ZodBoolean>;
        ignoreShadowRoots: z.ZodDefault<z.ZodBoolean>;
        contextPipelineBuilder: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        extendContext: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        requestList: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestQueue: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestManager: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        requestHandlerTimeoutSecs: z.ZodOptional<z.ZodCustom<number, number>>;
        errorHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        failedRequestHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        maxRequestRetries: z.ZodDefault<z.ZodCustom<number, number>>;
        sameDomainDelaySecs: z.ZodDefault<z.ZodCustom<number, number>>;
        maxRequestsPerCrawl: z.ZodOptional<z.ZodCustom<number, number>>;
        maxCrawlDepth: z.ZodOptional<z.ZodCustom<number, number>>;
        taskLoopOptions: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        concurrencySystem: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        sessionPool: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        statusMessageLoggingInterval: z.ZodDefault<z.ZodCustom<number, number>>;
        statusMessageCallback: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        additionalHttpErrorStatusCodes: z.ZodDefault<z.ZodArray<z.ZodCustom<number, number>>>;
        ignoreHttpErrorStatusCodes: z.ZodDefault<z.ZodArray<z.ZodCustom<number, number>>>;
        blockedStatusCodes: z.ZodOptional<z.ZodArray<z.ZodCustom<number, number>>>;
        retryOnBlocked: z.ZodDefault<z.ZodBoolean>;
        respectRobotsTxtFile: z.ZodDefault<z.ZodUnion<readonly [z.ZodBoolean, z.ZodCustom<Dictionary, Dictionary>]>>;
        transactionalStorage: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodObject<{
            requestQueue: z.ZodOptional<z.ZodEnum<{
                deferred: "deferred";
                writeThrough: "writeThrough";
            }>>;
        }, z.core.$strict>]>>;
        onSkippedRequest: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        httpClient: z.ZodOptional<z.ZodCustom<import("@crawlee/http-client").BaseHttpClient, import("@crawlee/http-client").BaseHttpClient>>;
        configuration: z.ZodOptional<z.ZodCustom<import("@crawlee/browser").Configuration, import("@crawlee/browser").Configuration>>;
        storageBackend: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        eventManager: z.ZodOptional<z.ZodCustom<import("@crawlee/browser").EventManager, import("@crawlee/browser").EventManager>>;
        logger: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        minConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxRequestsPerMinute: z.ZodOptional<z.ZodCustom<number, number>>;
        keepAlive: z.ZodOptional<z.ZodBoolean>;
        statistics: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        id: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    /**
     * Creates a new instance of StagehandCrawler.
     *
     * @param options - Crawler configuration options
     */
    constructor(options?: StagehandCrawlerOptions<ContextExtension, ExtendedContext, Routes, StatisticStateExtension>);
    protected buildContextPipeline(): ContextPipeline<CrawlingContext, StagehandCrawlingContext>;
    /**
     * Resolves the {@apilink StagehandController} that owns the given page, or
     * `undefined` when the pool does not expose controllers (e.g. a custom
     * {@apilink IBrowserPool} implementation).
     *
     * Stagehand needs direct controller access to reach the `Stagehand`
     * instance bound to the page's browser, which is why it reaches past the
     * {@apilink IBrowserPool} abstraction here.
     */
    private getBrowserControllerByPage;
    /**
     * Enhance the page with Stagehand AI methods.
     */
    private setUpStagehand;
    /**
     * Navigation handler for Stagehand crawler.
     * Uses standard Playwright navigation.
     */
    protected navigationHandler(crawlingContext: StagehandCrawlingContext, gotoOptions: StagehandGotoOptions): Promise<Response | null>;
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
 *   await enqueueLinks({ include: ['https://example.com/products/*'] });
 * });
 *
 * const crawler = new StagehandCrawler({
 *   requestHandler: router,
 * });
 * ```
 */
export declare function createStagehandRouter<Context extends StagehandCrawlingContext = StagehandCrawlingContext, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export declare function createStagehandRouter<Context extends StagehandCrawlingContext = StagehandCrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
export declare function createStagehandRouter<Context extends StagehandCrawlingContext = StagehandCrawlingContext, const Schemas extends RouteSchemas = RouteSchemas>(schemas: Schemas): RouterHandler<Context, RoutesFromSchemas<Schemas>>;
