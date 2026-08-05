import type {
    BasicCrawlerOptions,
    BasicCrawlingContext,
    ContextMiddleware,
    CrawlingContext,
    EnqueueLinksOptions,
    ErrorHandler,
    GetUserDataFromRequest,
    IRequestManager,
    LoadedRequest,
    Request,
    RequestHandler,
    RouterHandler,
    SkippedRequestCallback,
} from '@crawlee/basic';
import {
    BasicCrawler,
    browserPoolCookieToToughCookie,
    ContextPipeline,
    cookieStringToToughCookie,
    enqueueLinks,
    NavigationSkippedError,
    OwnedOrInjected,
    remainingNavigationWindowMillis,
    RequestState,
    resolveBaseUrlForEnqueueLinksFiltering,
    SessionError,
    toughCookieToBrowserPoolCookie,
    tryAbsoluteURL,
    validators,
    parseRetryAfterHeader,
} from '@crawlee/basic';
import type {
    BrowserController,
    BrowserPlugin,
    BrowserPoolHooks,
    BrowserPoolOptions,
    CommonPage,
    CrawlerRemoteBrowserOptions,
    InferBrowserPluginArray,
    LaunchContext,
} from '@crawlee/browser-pool';
import { BrowserPool, RemoteBrowserPool } from '@crawlee/browser-pool';
import type {
    Awaitable,
    BatchAddRequestsResult,
    Cookie as CookieObject,
    Dictionary,
    IBrowserPool,
    ISession,
} from '@crawlee/types';
import type { RobotsTxtFile } from '@crawlee/utils';
import { CLOUDFLARE_RETRY_CSS_SELECTORS, RETRY_CSS_SELECTORS, sleep } from '@crawlee/utils';
import ow from 'ow';
import type { ReadonlyDeep } from 'type-fest';

import { addTimeoutToPromise, TimeoutError, tryCancel } from '@apify/timeout';

import type { BrowserLaunchContext } from './browser-launcher.js';

interface BaseResponse {
    status(): number;
}

/**
 * The type of a browser pool the crawler builds (and therefore owns) for itself. It's an {@apilink IBrowserPool} that
 * additionally exposes `destroy()` — the crawler only ever tears down pools it created, which is why {@apilink IBrowserPool}
 * itself intentionally omits `destroy`.
 */
type OwnedBrowserPool<Page> = IBrowserPool<Page> & { destroy: () => Promise<void> };

type ContextDifference<T, U> = Omit<U, keyof T> & Partial<U>;

export interface BrowserCrawlingContext<
    Page extends CommonPage = CommonPage,
    Response extends BaseResponse = BaseResponse,
    UserData extends Dictionary = Dictionary,
    GoToOptions extends Dictionary = Dictionary,
> extends CrawlingContext<UserData> {
    /**
     * The browser page object where the web page is loaded and rendered.
     */
    page: Page;

    /**
     * The request object that was successfully loaded and navigated to, including the {@apilink Request.loadedUrl|`loadedUrl`} property.
     */
    request: LoadedRequest<Request<UserData>>;

    /**
     * The HTTP response object returned by the browser's navigation.
     */
    response: Response;

    /**
     * Options object passed to the underlying `page.goto()` call. `preNavigationHooks` can mutate this
     * object (or return `{ gotoOptions: ... }`) to influence the navigation.
     */
    gotoOptions: GoToOptions;

    /**
     * Helper function for extracting URLs from the current page and adding them to the request queue.
     */
    enqueueLinks: (options?: EnqueueLinksOptions) => Promise<BatchAddRequestsResult>;
}

export type BrowserHook<Context = BrowserCrawlingContext, ContextExtension = {}> = (
    crawlingContext: Context & ContextExtension,
) => Awaitable<void | Partial<Context>>;

const COOKIES_BEFORE_HOOKS = Symbol('cookiesBeforeHooks');

const readContextField = <T>(ctx: object, key: symbol): T => (ctx as Record<symbol, unknown>)[key] as T;

export interface BrowserCrawlerOptions<
    Page extends CommonPage = CommonPage,
    Response extends BaseResponse = BaseResponse,
    Context extends BrowserCrawlingContext<Page, Response, Dictionary> = BrowserCrawlingContext<
        Page,
        Response,
        Dictionary
    >,
    ContextExtension = Dictionary<never>,
    ExtendedContext extends Context = Context & ContextExtension,
    InternalBrowserPoolOptions extends BrowserPoolOptions = BrowserPoolOptions,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
    __BrowserPlugins extends BrowserPlugin[] = InferBrowserPluginArray<InternalBrowserPoolOptions['browserPlugins']>,
    __BrowserControllerReturn extends BrowserController = ReturnType<__BrowserPlugins[number]['createController']>,
    __LaunchContextReturn extends LaunchContext = ReturnType<__BrowserPlugins[number]['createLaunchContext']>,
> extends Omit<
    BasicCrawlerOptions<Context, ContextExtension, ExtendedContext>,
    // Overridden with browser context
    'requestHandler' | 'failedRequestHandler' | 'errorHandler'
> {
    launchContext?: BrowserLaunchContext<any, any>;

    /**
     * An existing browser pool instance to use. When provided, the crawler will use this pool directly instead of
     * constructing a new one from `browserPoolOptions`, enabling browser sharing across multiple crawlers. The crawler
     * will not tear down a shared pool — the caller is responsible for its lifecycle.
     */
    browserPool?: IBrowserPool<Page>;

    /**
     * Connect to a remote browser service (Browserbase, Browserless, Steel, …) instead of launching locally.
     *
     * The crawler builds a {@apilink RemoteBrowserPool} around its own browser plugin, so the connection is
     * always for the right browser — there is no plugin to construct and no way to mismatch the pool with the
     * crawler. Supply the connection details only: a static `endpoint` URL, a function returning one per launch,
     * or a {@apilink RemoteBrowserProvider}.
     *
     * Ignored when `browserPool` is set. For sharing a remote pool across crawlers, construct a
     * {@apilink RemoteBrowserPool} yourself and pass it as `browserPool` instead.
     */
    remoteBrowser?: CrawlerRemoteBrowserOptions;

    /**
     * Function that is called to process each request.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as an argument, where:
     * - {@apilink BrowserCrawlingContext.request|`request`} is an instance of the {@apilink Request} object
     * with details about the URL to open, HTTP method etc;
     * - {@apilink BrowserCrawlingContext.page|`page`} is an instance of the
     * Puppeteer [Page](https://pptr.dev/api/puppeteer.page) or
     * Playwright [Page](https://playwright.dev/docs/api/class-page);
     * - {@apilink BrowserCrawlingContext.response|`response`} is an instance of the
     * Puppeteer [Response](https://pptr.dev/api/puppeteer.httpresponse) or
     * Playwright [Response](https://playwright.dev/docs/api/class-response),
     * which is the main resource response as returned by the respective `page.goto()` function.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to the {@apilink BrowserCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     * If all the retries fail, the crawler calls the function
     * provided to the {@apilink BrowserCrawlerOptions.failedRequestHandler|`failedRequestHandler`} parameter.
     * To make this work, we should **always**
     * let our function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@apilink Request.pushErrorMessage|`Request.pushErrorMessage()`} function.
     */
    requestHandler?: RouterHandler<ExtendedContext, Routes> | RequestHandler<ExtendedContext>;

    /**
     * User-provided function that allows modifying the request object before it gets retried by the crawler.
     * It's executed before each retry for the requests that failed less than {@apilink BrowserCrawlerOptions.maxRequestRetries|`maxRequestRetries`} times.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as the first argument,
     * where the {@apilink BrowserCrawlingContext.request|`request`} corresponds to the request to be retried.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    errorHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the {@apilink BrowserCrawlingContext}
     * (actual context will be enhanced with the crawler specific properties) as the first argument,
     * where the {@apilink BrowserCrawlingContext.request|`request`} corresponds to the failed request.
     * Second argument is the `Error` instance that
     * represents the last error thrown during processing of the request.
     */
    failedRequestHandler?: ErrorHandler<CrawlingContext, ExtendedContext>;

    /**
     * Custom options passed to the underlying {@apilink BrowserPool} constructor.
     * We can tweak those to fine-tune browser management.
     */
    browserPoolOptions?: Partial<BrowserPoolOptions> &
        Partial<BrowserPoolHooks<__BrowserControllerReturn, __LaunchContextReturn>>;

    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function receives the `crawlingContext`; the options object
     * forwarded to `page.goto()` is available as `crawlingContext.gotoOptions` and can be mutated in place.
     *
     * **Example:**
     *
     * ```js
     * preNavigationHooks: [
     *     async ({ page, gotoOptions }) => {
     *         await page.evaluate((attr) => { window.foo = attr; }, 'bar');
     *         gotoOptions.timeout = 60_000;
     *         gotoOptions.waitUntil = 'domcontentloaded';
     *     },
     * ]
     * ```
     *
     * A hook may optionally return a partial object whose properties are merged into the crawling context,
     * allowing the hook to override context members for subsequent hooks and pipeline stages.
     *
     * The context is built up in the following order: base context (`request`, `session`, helpers, ...) ->
     * `extendContext` -> `preNavigationHooks` -> navigation -> `postNavigationHooks` -> `requestHandler`.
     * This means the members added by `extendContext` are already available here, but navigation-dependent
     * members (e.g. `page`, `response`) are not.
     */
    preNavigationHooks?: BrowserHook<Context, ContextExtension>[];

    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts `crawlingContext` as the only parameter.
     *
     * A hook may optionally return a partial object whose properties are merged into the crawling context.
     * This is useful for overriding context members (e.g. `response`) after solving a challenge.
     *
     * **Example:**
     *
     * ```js
     * postNavigationHooks: [
     *     async (crawlingContext) => {
     *         const { page } = crawlingContext;
     *         if (hasCaptcha(page)) {
     *             await solveCaptcha(page);
     *         }
     *     },
     *     async (crawlingContext) => {
     *         if (await needsRevalidation(crawlingContext)) {
     *             return { response: await crawlingContext.page.reload() };
     *         }
     *     },
     * ]
     * ```
     */
    postNavigationHooks?: BrowserHook<Context, ContextExtension>[];

    /**
     * Timeout for the whole navigation phase, in seconds. A single window shared by the `preNavigationHooks`,
     * the page navigation, and the `postNavigationHooks` - so a slow hook eats into the same budget the
     * navigation uses. Separate from the
     * {@apilink BasicCrawlerOptions.requestHandlerTimeoutSecs|`requestHandlerTimeoutSecs`}, which times only the
     * request handler.
     */
    navigationTimeoutSecs?: number;

    /**
     * Defines whether the cookies should be persisted for sessions. Enabled by default.
     */
    saveResponseCookies?: boolean;

    /**
     * Whether to run browser in headless mode. Defaults to `true`.
     * Can be also set via {@apilink Configuration}.
     */
    headless?: boolean | 'new' | 'old'; // `new`/`old` are for puppeteer only

    /**
     * Whether to ignore custom elements (and their #shadow-roots) when processing the page content via `parseWithCheerio` helper.
     * By default, they are expanded automatically. Use this option to disable this behavior.
     */
    ignoreShadowRoots?: boolean;

    /**
     * Whether to ignore `iframes` when processing the page content via `parseWithCheerio` helper.
     * By default, `iframes` are expanded automatically. Use this option to disable this behavior.
     */
    ignoreIframes?: boolean;
}

/**
 * Whether an error thrown by `page.goto()` is a navigation timeout - either our own {@apilink TimeoutError}
 * or the driver's, which Playwright/Puppeteer report with their own class and a `Timeout ... exceeded` message
 * naming the raw millisecond value rather than the configured window.
 */
function isNavigationTimeoutError(error: Error): boolean {
    return (
        error instanceof TimeoutError ||
        error?.name === 'TimeoutError' ||
        error?.constructor?.name === 'TimeoutError' ||
        /timeout.*exceeded/i.test(error?.message ?? '')
    );
}

/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless browsers with [Puppeteer](https://github.com/puppeteer/puppeteer)
 * and [Playwright](https://github.com/microsoft/playwright).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `BrowserCrawler` uses headless (or even headful) browsers to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, we should consider using the {@apilink CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented by the {@apilink Request} objects that are fed from the
 * {@apilink IRequestManager|request manager} provided via the {@apilink BrowserCrawlerOptions.requestManager|`requestManager`}
 * constructor option (a {@apilink RequestQueue} is itself a request manager). If no `requestManager` is provided,
 * the crawler will open the default request queue either when the {@apilink BrowserCrawler.addRequests|`crawler.addRequests()`} function is called,
 * or if `requests` parameter (representing the initial requests) of the {@apilink BrowserCrawler.run|`crawler.run()`} function is provided.
 *
 * To read from a read-only source such as a {@apilink RequestList} while still being able to enqueue new requests,
 * combine it with a queue into a {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`}
 * and pass the result as `requestManager`.
 *
 * > The {@apilink BrowserCrawlerOptions.requestList|`requestList`} and {@apilink BrowserCrawlerOptions.requestQueue|`requestQueue`}
 * > options are deprecated; they are still accepted and folded into a single `requestManager` for back-compat.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * `BrowserCrawler` opens a new browser page (i.e. tab or window) for each {@apilink Request} object to crawl
 * and then calls the function provided by user as the {@apilink BrowserCrawlerOptions.requestHandler|`requestHandler`} option.
 *
 * New pages are only opened when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the
 * `BrowserCrawler` constructor, or, for finer control, by injecting a pre-configured
 * {@apilink ConcurrencySystem|`concurrencySystem`}.
 *
 * > *NOTE:* the pool of browser instances is internally managed by the {@apilink BrowserPool} class.
 *
 * @category Crawlers
 */
export abstract class BrowserCrawler<
    Page extends CommonPage = CommonPage,
    Response extends BaseResponse = BaseResponse,
    InternalBrowserPoolOptions extends BrowserPoolOptions = BrowserPoolOptions,
    LaunchOptions extends Dictionary | undefined = Dictionary,
    Context extends BrowserCrawlingContext<Page, Response, Dictionary> = BrowserCrawlingContext<
        Page,
        Response,
        Dictionary
    >,
    ContextExtension = Dictionary<never>,
    ExtendedContext extends Context = Context & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
    GoToOptions extends Dictionary = Dictionary,
> extends BasicCrawler<Context, ContextExtension, ExtendedContext, Routes> {
    /** Backs the {@apilink BrowserCrawler.browserPool|`browserPool`} getter. */
    private browserPoolDep: OwnedOrInjected<IBrowserPool<Page>, OwnedBrowserPool<Page>>;

    /**
     * A reference to the underlying browser pool that manages the crawler's browsers. Typed as
     * {@apilink IBrowserPool} so custom implementations can be plugged in via the `browserPool` constructor option.
     */
    get browserPool(): IBrowserPool<Page> {
        return this.browserPoolDep.value;
    }

    launchContext: BrowserLaunchContext<LaunchOptions, unknown>;

    protected readonly ignoreShadowRoots: boolean;
    protected readonly ignoreIframes: boolean;

    private readonly navigationTimeoutMillis: number;
    private readonly preNavigationHooks: BrowserHook<Context>[];
    private readonly postNavigationHooks: BrowserHook<Context>[];
    private readonly saveResponseCookies: boolean;

    protected static override optionsShape = {
        ...BasicCrawler.optionsShape,

        navigationTimeoutSecs: ow.optional.number.greaterThan(0),
        preNavigationHooks: ow.optional.array,
        postNavigationHooks: ow.optional.array,

        launchContext: ow.optional.object,
        headless: ow.optional.any(ow.boolean, ow.string),
        browserPool: ow.optional.object.validate(validators.browserPool),
        remoteBrowser: ow.optional.object,
        browserPoolOptions: ow.optional.object,
        saveResponseCookies: ow.optional.boolean,
        proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),
    };

    /**
     * All `BrowserCrawler` parameters are passed via an options object.
     */
    protected constructor(
        options: BrowserCrawlerOptions<Page, Response, Context, ContextExtension, ExtendedContext> & {
            contextPipelineBuilder: () => ContextPipeline<CrawlingContext, Context>;
        },
    ) {
        ow(options, 'BrowserCrawlerOptions', ow.object.exactShape(BrowserCrawler.optionsShape));
        const {
            navigationTimeoutSecs = 60,
            saveResponseCookies = true,
            launchContext = {},
            browserPool,
            remoteBrowser,
            browserPoolOptions,
            preNavigationHooks = [],
            postNavigationHooks = [],
            headless,
            ignoreIframes = false,
            ignoreShadowRoots = false,
            contextPipelineBuilder,
            extendContext,
            ...basicCrawlerOptions
        } = options;

        const skipGuard = <Ctx extends Context>(
            action: (ctx: Ctx) => Awaitable<void | Partial<Ctx>>,
        ): ContextMiddleware<Ctx, Partial<Ctx>> => ({
            action: async (ctx) => (ctx.request.skipNavigation ? {} : ((await action(ctx)) ?? {})),
        });

        super({
            ...basicCrawlerOptions,
            contextPipelineBuilder: () => {
                // A single navigation window covers the pre-navigation hooks, the navigation, and the
                // post-navigation hooks: the whole phase shares one `navigationTimeoutSecs` budget, so a slow
                // hook eats into the same window the navigation uses. The navigation itself is bounded by
                // capping its `gotoOptions.timeout` to the remaining budget.
                const windowGuard = <Ctx extends Context>(
                    step: (ctx: Ctx) => Awaitable<void | Partial<Ctx>>,
                ): ContextMiddleware<Ctx, Partial<Ctx>> =>
                    skipGuard(async (ctx: Ctx) => {
                        const remaining = remainingNavigationWindowMillis(ctx, this.navigationTimeoutMillis);
                        if (remaining <= 0) {
                            throw new TimeoutError(
                                `Navigation timed out after ${this.navigationTimeoutMillis / 1000} seconds.`,
                            );
                        }
                        return addTimeoutToPromise(
                            async () => step(ctx),
                            remaining,
                            `Navigation timed out after ${this.navigationTimeoutMillis / 1000} seconds.`,
                        );
                    });

                let pipeline = contextPipelineBuilder().compose({ action: this.prepareNavigation.bind(this) });

                for (const hook of this.preNavigationHooks) {
                    pipeline = pipeline.compose(windowGuard(hook));
                }

                pipeline = pipeline.compose(skipGuard(this.navigate.bind(this)));

                for (const hook of this.postNavigationHooks) {
                    pipeline = pipeline.compose(windowGuard(hook));
                }

                return pipeline
                    .compose(skipGuard(this.finalizeNavigation.bind(this)))
                    .compose({ action: this.handleBlockedRequestByContent.bind(this) })
                    .compose({ action: this.restoreRequestState.bind(this) });
            },
            extendContext,
        });

        this.launchContext = launchContext;
        this.navigationTimeoutMillis = navigationTimeoutSecs * 1000;
        // The public option hooks are extension-aware; internal storage uses the base context type
        // (the pipeline composes hooks against the concrete context, which does not statically carry
        // `ContextExtension`). The extension members are present at runtime regardless.
        this.preNavigationHooks = preNavigationHooks as BrowserHook<Context>[];
        this.postNavigationHooks = postNavigationHooks as BrowserHook<Context>[];
        this.ignoreIframes = ignoreIframes;
        this.ignoreShadowRoots = ignoreShadowRoots;

        if (headless != null) {
            this.launchContext.launchOptions ??= {} as LaunchOptions;
            (this.launchContext.launchOptions as Dictionary).headless = headless;
        }

        this.saveResponseCookies = saveResponseCookies;

        // `browserPool` wins over `remoteBrowser` — a passed-in pool is used as-is (borrowed), the sugar is ignored.
        // The default is only built when no pool was injected, so all the option/launchContext fiddling below stays
        // inside the factory.
        this.browserPoolDep = OwnedOrInjected.resolve(browserPool, () => {
            const resolvedBrowserPoolOptions = browserPoolOptions ?? ({} as Partial<BrowserPoolOptions>);

            if (launchContext?.userAgent) {
                if (resolvedBrowserPoolOptions.useFingerprints)
                    this.log.info('Custom user agent provided, disabling automatic browser fingerprint injection!');
                resolvedBrowserPoolOptions.useFingerprints = false;
            }

            if (remoteBrowser) {
                // The crawler already built the right plugin for its browser — hand it to a RemoteBrowserPool so the
                // remote connection is always for the matching browser (no plugin to construct, no way to mismatch).
                const { browserPlugins, ...remoteBrowserPoolOptions } = resolvedBrowserPoolOptions;
                return new RemoteBrowserPool({
                    browserPlugins: browserPlugins as BrowserPlugin[],
                    ...remoteBrowser,
                    browserPoolOptions: remoteBrowserPoolOptions as any,
                }) as OwnedBrowserPool<Page>;
            }

            // Double cast: `BrowserPool` implements `IBrowserPool<PageReturn>`, where `PageReturn` is derived from the
            // plugin/controller generics and doesn't overlap with the crawler's free `Page` type param, so TS won't
            // narrow it directly. The concrete pool does satisfy the `Page`/`destroy` contract at runtime — this is the
            // long-standing `Page` variance gap, not a `destroy`-related hole.
            return new BrowserPool<InternalBrowserPoolOptions>({
                ...(resolvedBrowserPoolOptions as any),
            }) as unknown as OwnedBrowserPool<Page>;
        });
    }

    protected override getNavigationTimeoutMillis(): number {
        return this.navigationTimeoutMillis;
    }

    protected override buildContextPipeline(): ContextPipeline<
        CrawlingContext,
        BrowserCrawlingContext<Page, Response, Dictionary>
    > {
        return ContextPipeline.create<CrawlingContext>().compose({
            action: this.preparePage.bind(this),
            cleanup: async (context: {
                page: Page;
                session: ISession;
                registerDeferredCleanup: BasicCrawlingContext['registerDeferredCleanup'];
            }) => {
                context.registerDeferredCleanup(async () => {
                    const error = !context.session.isUsable()
                        ? new SessionError('Session is no longer usable')
                        : undefined;

                    await this.browserPool
                        .closePage(context.page, { error })
                        .catch((closeError: Error) =>
                            this.log.debug('Error while closing page', { error: closeError }),
                        );
                });
            },
        });
    }

    private async containsSelectors(page: CommonPage, selectors: string[]): Promise<string[] | null> {
        const foundSelectors = (await Promise.all(selectors.map((selector) => (page as any).$(selector))))
            .map((x, i) => [x, selectors[i]] as [any, string])
            .filter(([x]) => x !== null)
            .map(([, selector]) => selector);

        return foundSelectors.length > 0 ? foundSelectors : null;
    }

    private async isRequestBlocked(crawlingContext: BrowserCrawlingContext<Page, Response>): Promise<string | false> {
        const { page, response } = crawlingContext;

        // Cloudflare specific heuristic - wait 5 seconds if we get a 403 for the JS challenge to load / resolve.
        if ((await this.containsSelectors(page, CLOUDFLARE_RETRY_CSS_SELECTORS)) && response?.status() === 403) {
            await sleep(5000);

            // here we cannot test for response code, because we only have the original response, not the possible Cloudflare redirect on passed challenge.
            const foundSelectors = await this.containsSelectors(page, RETRY_CSS_SELECTORS);

            if (!foundSelectors) return false;
            return `Cloudflare challenge failed, found selectors: ${foundSelectors.join(', ')}`;
        }

        const foundSelectors = await this.containsSelectors(page, RETRY_CSS_SELECTORS);
        const statusCode = response?.status() ?? 0;

        if (foundSelectors) return `Found selectors: ${foundSelectors.join(', ')}`;
        if (this.blockedStatusCodes.has(statusCode)) return `Received blocked status code: ${statusCode}`;

        return false;
    }

    private async preparePage(
        crawlingContext: CrawlingContext,
    ): Promise<ContextDifference<CrawlingContext, BrowserCrawlingContext<Page, Response, Dictionary>>> {
        const page = await this.browserPool.newPage({
            id: crawlingContext.id,
            session: crawlingContext.session,
        });
        tryCancel();

        const contextEnqueueLinks = crawlingContext.enqueueLinks;

        return {
            page,
            get response(): Response {
                throw new Error(
                    "The `response` property is not available. This might mean that you're trying to access it before navigation or that navigation resulted in `null` (this should only happen with `about:` URLs)",
                );
            },
            get gotoOptions(): Dictionary {
                throw new Error('The `gotoOptions` property is not available until `prepareNavigation` runs.');
            },
            enqueueLinks: async (enqueueOptions: EnqueueLinksOptions = {}) => {
                return (await browserCrawlerEnqueueLinks({
                    options: {
                        ...enqueueOptions,
                        limit: await this.calculateEnqueuedRequestLimit(enqueueOptions?.limit),
                    },
                    page,
                    requestManager: await this.getRequestManager(),
                    robotsTxtFile: await this.getRobotsTxtFileForUrl(crawlingContext.request.url),
                    onSkippedRequest: this.handleSkippedRequest,
                    originalRequestUrl: crawlingContext.request.url,
                    finalRequestUrl: crawlingContext.request.loadedUrl,
                    enqueueLinks: contextEnqueueLinks,
                })) as BatchAddRequestsResult; // TODO make this type safe
            },
        };
    }

    private async prepareNavigation(crawlingContext: Context): Promise<Partial<Context>> {
        if (crawlingContext.request.skipNavigation) {
            return {
                request: new Proxy(crawlingContext.request, {
                    get(target, propertyName, receiver) {
                        if (propertyName === 'loadedUrl') {
                            throw new NavigationSkippedError(
                                'The `request.loadedUrl` property is not available - `skipNavigation` was used',
                            );
                        }
                        return Reflect.get(target, propertyName, receiver);
                    },
                }) as LoadedRequest<Request>,
                get response(): Response {
                    throw new NavigationSkippedError(
                        'The `response` property is not available - `skipNavigation` was used',
                    );
                },
            } as Partial<Context>;
        }

        crawlingContext.request.state = RequestState.BEFORE_NAV;

        return {
            // Default to the full navigation timeout so a pre-navigation hook can read it; `navigate` narrows it
            // to the remaining shared window unless a hook overrode it (see there).
            gotoOptions: { timeout: this.navigationTimeoutMillis } as unknown as GoToOptions,
            [COOKIES_BEFORE_HOOKS]: this._getCookieHeaderFromRequest(crawlingContext.request),
        } as unknown as Partial<Context>;
    }

    private async navigate(crawlingContext: Context): Promise<Partial<Context>> {
        tryCancel();

        const gotoOptions = crawlingContext.gotoOptions as GoToOptions;
        const remaining = remainingNavigationWindowMillis(crawlingContext, this.navigationTimeoutMillis);
        if (remaining <= 0) {
            throw new TimeoutError(`Navigation timed out after ${this.navigationTimeoutMillis / 1000} seconds.`);
        }
        // If a hook left the default `navigationTimeoutMillis` in place, bound the goto to whatever is left of the
        // shared navigation window. If it overrode the value - including `0`, Playwright's "no timeout" - honour
        // that verbatim as the goto's own timeout. The driver enforces this natively (so a timed-out goto is
        // aborted, not left lingering) and `handleNavigationTimeout` turns its error into our own message.
        const gotoTimeout = gotoOptions as { timeout?: number };
        if (gotoTimeout.timeout === this.navigationTimeoutMillis) {
            gotoTimeout.timeout = remaining;
        }
        const cookiesBeforeHooks = readContextField<string>(crawlingContext, COOKIES_BEFORE_HOOKS);
        const cookiesAfterHooks = this._getCookieHeaderFromRequest(crawlingContext.request);

        await this.applyCookies(crawlingContext, cookiesBeforeHooks, cookiesAfterHooks);

        let response: Response | undefined;
        try {
            response = (await this._navigationHandler(crawlingContext, gotoOptions)) ?? undefined;
        } catch (error) {
            await this.handleNavigationTimeout(crawlingContext, error as Error);
            crawlingContext.request.state = RequestState.ERROR;
            this.throwIfProxyError(error as Error);
            throw error;
        }
        tryCancel();

        crawlingContext.request.state = RequestState.AFTER_NAV;

        return { response } as Partial<Context>;
    }

    private async finalizeNavigation(crawlingContext: Context): Promise<Partial<Context>> {
        tryCancel();

        let response: Response | undefined;
        try {
            response = crawlingContext.response;
        } catch {
            // `preparePage` installs a throwing getter for `response`; reaching this branch means
            // navigation produced no response and no hook overrode it. Treat as undefined.
        }

        await this.processResponse(response, crawlingContext);
        tryCancel();

        // Persist cookies from the navigation response before the user handler runs.
        // Cookies set during `requestHandler` are saved again afterwards.
        await this.persistCookiesFromPage(crawlingContext);

        return { request: crawlingContext.request as LoadedRequest<Request> } as Partial<Context>;
    }

    /**
     * Copies cookies from the live browser page into the session cookie jar.
     */
    private async persistCookiesFromPage(
        crawlingContext: Pick<BrowserCrawlingContext<Page, Response>, 'session' | 'page' | 'request'>,
    ): Promise<void> {
        if (!this.saveResponseCookies || !crawlingContext.session) {
            return;
        }

        const { cookies } = await this.browserPool.extractPageState(crawlingContext.page);
        tryCancel();
        // Prefer the live page URL — the handler may have navigated after the initial load.
        const url =
            (await crawlingContext.page.url()) || crawlingContext.request.loadedUrl || crawlingContext.request.url;
        for (const cookie of cookies) {
            try {
                crawlingContext.session.cookieJar.setCookieSync(browserPoolCookieToToughCookie(cookie), url, {
                    ignoreError: false,
                });
            } catch (e) {
                this.log.debug(`Could not set cookie: ${(e as Error).message}`);
            }
        }
    }

    /**
     * Runs the user request handler, then re-reads browser cookies so login flows /
     * `page.setCookie` / XHR `Set-Cookie` updates are stored for later requests.
     */
    protected override async runRequestHandler(crawlingContext: ExtendedContext): Promise<void> {
        try {
            await super.runRequestHandler(crawlingContext);
        } finally {
            if (!crawlingContext.request.skipNavigation) {
                try {
                    await this.persistCookiesFromPage(crawlingContext);
                } catch {
                    // Page may already be closed on some failure paths; ignore.
                }
            }
        }
    }

    private async handleBlockedRequestByContent(crawlingContext: BrowserCrawlingContext<Page, Response>) {
        if (this.retryOnBlocked) {
            const error = await this.isRequestBlocked(crawlingContext);
            if (error) throw new SessionError(error);
        }

        return {};
    }

    private async restoreRequestState(crawlingContext: CrawlingContext) {
        crawlingContext.request.state = RequestState.REQUEST_HANDLER;
        return {};
    }

    private async applyCookies(
        { session, request, page }: BrowserCrawlingContext<Page, Response>,
        preHooksCookies: string,
        postHooksCookies: string,
    ) {
        const sessionCookie = session?.cookieJar.getCookiesSync(request.url).map(toughCookieToBrowserPoolCookie) ?? [];
        const parsedPreHooksCookies = preHooksCookies.split(/ *; */).map((c) => cookieStringToToughCookie(c));
        const parsedPostHooksCookies = postHooksCookies.split(/ *; */).map((c) => cookieStringToToughCookie(c));

        const cookies = [...sessionCookie, ...parsedPreHooksCookies, ...parsedPostHooksCookies]
            .filter((c): c is CookieObject => typeof c !== 'undefined' && c !== null)
            .map((c) => ({ ...c, url: c.domain ? undefined : request.url }));

        await this.browserPool.injectPageState(page, { cookies });
    }

    /**
     * Marks session bad on navigation timeout, and stops in-flight page loading on any navigation error.
     */
    private async handleNavigationTimeout(crawlingContext: BrowserCrawlingContext, error: Error): Promise<void> {
        const { session, page } = crawlingContext;

        // Fire-and-forget: no user code will run on this page after a failed navigation.
        // Swallow rejections: the page may already be detached.
        void page.evaluate(() => window.stop()).catch(() => {});

        if (isNavigationTimeoutError(error)) {
            session?.markBad();
            // The driver was handed the remaining window (usually shorter than `navigationTimeoutSecs` once the
            // hooks have run), so it names that value in its own error; report the configured window instead.
            throw new TimeoutError(`Navigation timed out after ${this.navigationTimeoutMillis / 1000} seconds.`);
        }
    }

    /**
     * Transforms proxy-related errors to `SessionError`.
     */
    private throwIfProxyError(error: Error) {
        if (this.isProxyError(error)) {
            throw new SessionError(this._getMessageFromError(error) as string);
        }
    }

    protected abstract _navigationHandler(
        crawlingContext: BrowserCrawlingContext<Page, Response>,
        gotoOptions: GoToOptions,
    ): Promise<Context['response'] | null | undefined>;

    private async processResponse(
        response: Response | undefined,
        crawlingContext: BrowserCrawlingContext,
    ): Promise<void> {
        const { session, request, page } = crawlingContext;

        if (typeof response === 'object' && typeof response.status === 'function') {
            const status: number = response.status();

            this.stats.registerStatusCode(status);

            if (this.isErrorStatusCode(status)) {
                if (this.additionalHttpErrorStatusCodes.has(status)) {
                    throw new Error(`${status} - Error status code was set by user.`);
                }

                throw new Error(`${status} - Internal Server Error`);
            }

            if (status === 429) {
                const headers = typeof (response as any).headers === 'function' ? (response as any).headers() : {};
                let retryAfterHeader: string | undefined;
                for (const key of Object.keys(headers)) {
                    if (key.toLowerCase() === 'retry-after') {
                        retryAfterHeader = headers[key];
                        break;
                    }
                }
                const retryAfterStr = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader;
                const retryAfterMs = parseRetryAfterHeader(retryAfterStr);
                const requestManager = this.requestManager;
                if (
                    requestManager &&
                    'recordDomainDelay' in requestManager &&
                    typeof (requestManager as any).recordDomainDelay === 'function'
                ) {
                    const recorded = (requestManager as any).recordDomainDelay(
                        crawlingContext.request.url,
                        retryAfterMs,
                    );
                    if (recorded) {
                        throw new Error(
                            `Request to ${crawlingContext.request.url} failed with 429. Domain is throttled.`,
                        );
                    }
                }
            }
        }

        if (this.sessionPool && response && session) {
            if (typeof response === 'object' && typeof response.status === 'function') {
                this._throwOnBlockedRequest(response.status());
            } else {
                this.log.debug('Got a malformed Browser response.', { request, response });
            }
        }

        request.loadedUrl = await page.url();
    }

    /**
     * Function for cleaning up after all requests are processed.
     * @ignore
     */
    override async teardown(): Promise<void> {
        await this.browserPoolDep.ifOwned((pool) => pool.destroy());
        await super.teardown();
    }
}

/** @internal */
interface EnqueueLinksInternalOptions {
    options?: ReadonlyDeep<Omit<EnqueueLinksOptions, 'requestManager'>> & Pick<EnqueueLinksOptions, 'requestManager'>;
    page: CommonPage;
    requestManager: IRequestManager;
    robotsTxtFile?: RobotsTxtFile;
    onSkippedRequest?: SkippedRequestCallback;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}

/** @internal */
interface BoundEnqueueLinksInternalOptions {
    enqueueLinks: BasicCrawlingContext['enqueueLinks'];
    options?: ReadonlyDeep<Omit<EnqueueLinksOptions, 'requestManager'>> & Pick<EnqueueLinksOptions, 'requestManager'>;
    originalRequestUrl: string;
    finalRequestUrl?: string;
    page: CommonPage;
}

/** @internal */
function containsEnqueueLinks(
    options: EnqueueLinksInternalOptions | BoundEnqueueLinksInternalOptions,
): options is BoundEnqueueLinksInternalOptions {
    return !!(options as BoundEnqueueLinksInternalOptions).enqueueLinks;
}

/** @internal */
export async function browserCrawlerEnqueueLinks(
    options: EnqueueLinksInternalOptions | BoundEnqueueLinksInternalOptions,
) {
    const { options: enqueueLinksOptions, finalRequestUrl, originalRequestUrl, page } = options;

    const baseUrl = resolveBaseUrlForEnqueueLinksFiltering({
        enqueueStrategy: enqueueLinksOptions?.strategy,
        finalRequestUrl,
        originalRequestUrl,
        userProvidedBaseUrl: enqueueLinksOptions?.baseUrl,
    });

    const urls = await extractUrlsFromPage(
        page as any,
        enqueueLinksOptions?.selector ?? 'a',
        enqueueLinksOptions?.baseUrl ?? finalRequestUrl ?? originalRequestUrl,
    );

    if (containsEnqueueLinks(options)) {
        return options.enqueueLinks({
            urls,
            baseUrl,
            ...enqueueLinksOptions,
        });
    }

    return enqueueLinks({
        requestManager: options.requestManager,
        robotsTxtFile: options.robotsTxtFile,
        onSkippedRequest: options.onSkippedRequest,
        urls,
        baseUrl,
        ...(enqueueLinksOptions as EnqueueLinksOptions),
    });
}

/**
 * Extracts URLs from a given page.
 * @ignore
 */
export async function extractUrlsFromPage(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    page: { $$eval: Function },
    selector: string,
    baseUrl: string,
): Promise<string[]> {
    const urls =
        (await page.$$eval(selector, (linkEls: HTMLLinkElement[]) =>
            linkEls.map((link) => link.getAttribute('href')).filter((href) => !!href),
        )) ?? [];
    const [base] = await page.$$eval('base', (els: HTMLLinkElement[]) => els.map((el) => el.getAttribute('href')));
    const absoluteBaseUrl = base && tryAbsoluteURL(base, baseUrl);

    if (absoluteBaseUrl) {
        baseUrl = absoluteBaseUrl;
    }

    return urls
        .map((href: string) => {
            // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
            const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
            if (!isHrefAbsolute && !baseUrl) {
                throw new Error(
                    `An extracted URL: ${href} is relative and options.baseUrl is not set. ` +
                        'Use options.baseUrl in enqueueLinks() to automatically resolve relative URLs.',
                );
            }

            return baseUrl ? tryAbsoluteURL(href, baseUrl) : href;
        })
        .filter((href: string | undefined) => !!href);
}
