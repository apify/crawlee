import type {
    BrowserCrawlerOptions,
    BrowserCrawlingContext,
    BrowserHook,
    ContextPipeline,
    CrawlingContext,
    GetUserDataFromRequest,
    RequestHandler,
    RouterHandler,
    RouterRoutes,
    RouteSchemas,
    RoutesFromSchemas,
} from '@crawlee/browser';
import { assertBrowserPoolNotConfigured, BrowserCrawler, RequestState, Router, serviceLocator } from '@crawlee/browser';
import type { Dictionary } from '@crawlee/types';
import { parseArgument, schemas } from '@crawlee/utils/internal';
import type { Download, LaunchOptions, Page, Response } from 'playwright';
import { z } from 'zod';

import type { EnqueueLinksByClickingElementsOptions } from './enqueue-links/click-elements.js';
import { playwrightBrowserPool, remotePlaywrightBrowserPool } from './playwright-browser-pool.js';
import type { PlaywrightLaunchContext } from './playwright-launcher.js';
import type {
    BlockRequestsOptions,
    DirectNavigationOptions,
    HandleCloudflareChallengeOptions,
    InfiniteScrollOptions,
    InjectFileOptions,
    PlaywrightContextUtils,
    SaveSnapshotOptions,
} from './utils/playwright-utils.js';
import { gotoExtended, playwrightUtils } from './utils/playwright-utils.js';

export type PlaywrightGotoOptions = NonNullable<Parameters<Page['goto']>[1]>;

export interface PlaywrightCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
>
    extends BrowserCrawlingContext<Page, Response, UserData, PlaywrightGotoOptions>, PlaywrightContextUtils {}
export type PlaywrightHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = BrowserHook<PlaywrightCrawlingContext<UserData>>;

export interface PlaywrightCrawlerOptions<
    ContextExtension = Dictionary<never>,
    ExtendedContext extends PlaywrightCrawlingContext = PlaywrightCrawlingContext & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<
        string,
        GetUserDataFromRequest<PlaywrightCrawlingContext['request']>
    >,
    StatisticStateExtension extends object = {},
> extends BrowserCrawlerOptions<
    Page,
    Response,
    PlaywrightCrawlingContext,
    ContextExtension,
    ExtendedContext,
    Routes,
    StatisticStateExtension
> {
    /**
     * The same options as used by {@apilink launchPlaywright}.
     */
    launchContext?: PlaywrightLaunchContext;

    /**
     * Whether to run browser in headless mode. Defaults to `true`.
     * Can be also set via {@apilink Configuration}.
     */
    headless?: boolean;

    /**
     * Function that is called to process each request.
     *
     * The function receives the {@apilink PlaywrightCrawlingContext} as an argument, where:
     * - `request` is an instance of the {@apilink Request} object with details about the URL to open, HTTP method etc.
     * - `page` is an instance of the `Playwright`
     * [`Page`](https://playwright.dev/docs/api/class-page)
     * - `response` is an instance of the `Playwright`
     * [`Response`](https://playwright.dev/docs/api/class-response),
     * which is the main resource response as returned by `page.goto(request.url)`.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     * If all the retries fail, the crawler calls the function
     * provided to the `failedRequestHandler` parameter.
     * To make this work, you should **always**
     * let your function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@apilink Request.pushErrorMessage} function.
     */
    requestHandler?: RouterHandler<ExtendedContext, Routes> | RequestHandler<ExtendedContext>;

    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function receives the `crawlingContext`; the options object
     * forwarded to `page.goto()` is available as `crawlingContext.gotoOptions` and can be mutated in place.
     * A hook may optionally return a partial object whose properties are merged into the crawling context
     * (e.g. to override context members for subsequent hooks and pipeline stages).
     * Example:
     * ```
     * preNavigationHooks: [
     *     async ({ page, gotoOptions }) => {
     *         await page.evaluate((attr) => { window.foo = attr; }, 'bar');
     *         gotoOptions.timeout = 60_000;
     *     },
     * ]
     * ```
     */
    preNavigationHooks?: BrowserHook<
        PlaywrightCrawlingContext<GetUserDataFromRequest<ExtendedContext['request']>>,
        ContextExtension
    >[];

    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts `crawlingContext` as the only parameter. A hook may optionally return a partial object
     * whose properties are merged into the crawling context (e.g. to override `response` after solving a challenge).
     * Example:
     * ```
     * postNavigationHooks: [
     *     async (crawlingContext) => {
     *         const { page } = crawlingContext;
     *         if (hasCaptcha(page)) {
     *             await solveCaptcha (page);
     *         }
     *     },
     * ]
     * ```
     */
    postNavigationHooks?: BrowserHook<
        PlaywrightCrawlingContext<GetUserDataFromRequest<ExtendedContext['request']>>,
        ContextExtension
    >[];
}

/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chromium, Firefox and Webkit browsers with [Playwright](https://github.com/microsoft/playwright).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `Playwright` uses headless browser to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, consider using {@apilink CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from the
 * {@apilink IRequestManager|request manager} provided via the {@apilink PlaywrightCrawlerOptions.requestManager|`requestManager`}
 * constructor option (a {@apilink RequestQueue} is itself a request manager). To read from a read-only source such
 * as a {@apilink RequestList} while still being able to enqueue new requests, combine it with a queue into a
 * {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`} and pass the
 * result as `requestManager`.
 *
 * > The {@apilink PlaywrightCrawlerOptions.requestList|`requestList`} and {@apilink PlaywrightCrawlerOptions.requestQueue|`requestQueue`}
 * > options are deprecated; they are still accepted and folded into a single `requestManager` for back-compat.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * `PlaywrightCrawler` opens a new Chrome page (i.e. tab) for each {@apilink Request} object to crawl
 * and then calls the function provided by user as the {@apilink PlaywrightCrawlerOptions.requestHandler} option.
 *
 * New pages are only opened when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the
 * `PlaywrightCrawler` constructor, or, for finer control, by injecting a pre-configured
 * {@apilink ConcurrencySystem|`concurrencySystem`}.
 *
 * Note that the pool of Playwright instances is internally managed by the [BrowserPool](https://github.com/apify/browser-pool) class.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new PlaywrightCrawler({
 *     async requestHandler({ page, request }) {
 *         // This function is called to extract data from a single web page
 *         // 'page' is an instance of Playwright.Page with page.goto(request.url) already called
 *         // 'request' is an instance of Request class with information about the page to load
 *         await Dataset.pushData({
 *             title: await page.title(),
 *             url: request.url,
 *             succeeded: true,
 *         })
 *     },
 *     async failedRequestHandler({ request }) {
 *         // This function is called when the crawling of a request failed too many times
 *         await Dataset.pushData({
 *             url: request.url,
 *             succeeded: false,
 *             errors: request.errorMessages,
 *         })
 *     },
 * });
 *
 * await crawler.run([
 *     'http://www.example.com/page-1',
 *     'http://www.example.com/page-2',
 * ]);
 * ```
 * @category Crawlers
 */
export class PlaywrightCrawler<
    ContextExtension = Dictionary<never>,
    ExtendedContext extends PlaywrightCrawlingContext = PlaywrightCrawlingContext & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<
        string,
        GetUserDataFromRequest<PlaywrightCrawlingContext['request']>
    >,
    StatisticStateExtension extends object = {},
> extends BrowserCrawler<
    Page,
    Response,
    LaunchOptions,
    PlaywrightCrawlingContext,
    ContextExtension,
    ExtendedContext,
    Routes,
    StatisticStateExtension
> {
    /**
     * @internal
     */
    protected static override optionsShape = {
        ...BrowserCrawler.optionsShape,
        headless: z.boolean().optional(),
        launcher: schemas.anyObject.optional(),
    };

    /** @internal */
    protected static override optionsSchema = z.strictObject(PlaywrightCrawler.optionsShape);

    /**
     * All `PlaywrightCrawler` parameters are passed via an options object.
     */
    constructor(
        options: PlaywrightCrawlerOptions<ContextExtension, ExtendedContext, Routes, StatisticStateExtension> = {},
    ) {
        const parsedOptions = parseArgument(options, PlaywrightCrawler.optionsSchema, 'PlaywrightCrawlerOptions');

        const { launchContext, headless, configuration, contextPipelineBuilder, ...browserCrawlerOptions } =
            parsedOptions;

        if (launchContext.proxyUrl) {
            throw new Error(
                'PlaywrightCrawlerOptions.launchContext.proxyUrl is not allowed in PlaywrightCrawler.' +
                    'Use PlaywrightCrawlerOptions.proxyConfiguration',
            );
        }

        if (options.browserPool) {
            // The raw options, not the parsed ones: `launchContext` has a default, so by now it is always set.
            assertBrowserPoolNotConfigured(new.target.name, {
                launchContext: options.launchContext,
                headless: options.headless,
            });
        }

        super({
            ...(browserCrawlerOptions as unknown as PlaywrightCrawlerOptions<
                ContextExtension,
                ExtendedContext,
                Routes,
                StatisticStateExtension
            >),
            launchContext,
            configuration,
            browserPoolBuilder: (remoteBrowser) =>
                remoteBrowser
                    ? remotePlaywrightBrowserPool({ ...remoteBrowser, launchContext, headless, configuration })
                    : playwrightBrowserPool({ launchContext, headless, configuration }),
            contextPipelineBuilder: contextPipelineBuilder ?? (() => this.buildContextPipeline()),
        });
    }

    protected override buildContextPipeline(): ContextPipeline<CrawlingContext, PlaywrightCrawlingContext> {
        return super.buildContextPipeline().compose({ action: this.enhanceContext.bind(this) });
    }

    protected override async navigationHandler(
        crawlingContext: PlaywrightCrawlingContext,
        gotoOptions: DirectNavigationOptions,
    ) {
        return gotoExtended(crawlingContext.page, crawlingContext.request, gotoOptions);
    }

    private async enhanceContext(context: BrowserCrawlingContext<Page, Response, Dictionary>) {
        const waitForSelector = async (selector: string, timeoutMs = 5_000) => {
            const locator = context.page.locator(selector).first();
            await locator.waitFor({ timeout: timeoutMs, state: 'attached' });
        };

        const downloads: Download[] = [];
        context.page.on('download', (download) => downloads.push(download));

        return {
            injectFile: async (filePath: string, options?: InjectFileOptions) =>
                playwrightUtils.injectFile(context.page, filePath, options),
            injectJQuery: async () => {
                if (context.request.state === RequestState.BEFORE_NAV) {
                    context.log.warning(
                        'Using injectJQuery() in preNavigationHooks leads to unstable results. Use it in a postNavigationHook or a requestHandler instead.',
                    );
                    await playwrightUtils.injectJQuery(context.page);
                    return;
                }
                await playwrightUtils.injectJQuery(context.page, { surviveNavigations: false });
            },
            blockRequests: async (options?: BlockRequestsOptions) =>
                playwrightUtils.blockRequests(context.page, options),
            waitForSelector,
            parseWithCheerio: async (selector?: string, timeoutMs = 5_000) => {
                if (selector) {
                    await waitForSelector(selector, timeoutMs);
                }

                return playwrightUtils.parseWithCheerio(context.page, this.ignoreShadowRoots, this.ignoreIframes);
            },
            infiniteScroll: async (options?: InfiniteScrollOptions) =>
                playwrightUtils.infiniteScroll(context.page, options),
            listDownloads: async () => downloads,
            saveSnapshot: async (options?: SaveSnapshotOptions) =>
                playwrightUtils.saveSnapshot(context.page, {
                    ...options,
                    configuration: serviceLocator.getConfiguration(),
                }),
            enqueueLinksByClickingElements: async (
                options: Omit<EnqueueLinksByClickingElementsOptions, 'page' | 'requestManager'>,
            ) =>
                playwrightUtils.enqueueLinksByClickingElements({
                    ...options,
                    page: context.page,
                    requestManager: this.requestManager!,
                }),
            compileScript: (scriptString: string, ctx?: Dictionary) => playwrightUtils.compileScript(scriptString, ctx),
            handleCloudflareChallenge: async (options?: HandleCloudflareChallengeOptions) => {
                return playwrightUtils.handleCloudflareChallenge(context.page, context.request.url, options);
            },
        };
    }
}

/**
 * Returns a `postNavigationHooks`-ready hook that runs {@apilink PlaywrightContextUtils.handleCloudflareChallenge}
 * and propagates the post-challenge {@apilink Response} back into the crawling context via its return value.
 *
 * **Example usage**
 * ```ts
 * import { PlaywrightCrawler, handleCloudflareChallengeHook } from 'crawlee';
 *
 * const crawler = new PlaywrightCrawler({
 *     postNavigationHooks: [handleCloudflareChallengeHook()],
 * });
 * ```
 */
export function handleCloudflareChallengeHook(options?: HandleCloudflareChallengeOptions): PlaywrightHook {
    return async (context) => {
        const response = await context.handleCloudflareChallenge(options);
        if (response !== undefined) {
            return { response };
        }
        return undefined;
    };
}

/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@apilink PlaywrightCrawler}.
 * Defaults to the {@apilink PlaywrightCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<PlaywrightCrawlingContext>()`.
 *
 * ```ts
 * import { PlaywrightCrawler, createPlaywrightRouter } from 'crawlee';
 *
 * const router = createPlaywrightRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new PlaywrightCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
export function createPlaywrightRouter<
    Context extends PlaywrightCrawlingContext = PlaywrightCrawlingContext,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export function createPlaywrightRouter<
    Context extends PlaywrightCrawlingContext = PlaywrightCrawlingContext,
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
export function createPlaywrightRouter<
    Context extends PlaywrightCrawlingContext = PlaywrightCrawlingContext,
    const Schemas extends RouteSchemas = RouteSchemas,
>(schemas: Schemas): RouterHandler<Context, RoutesFromSchemas<Schemas>>;
export function createPlaywrightRouter(routesOrSchemas?: any): any {
    return Router.create(routesOrSchemas);
}
