import { isDeepStrictEqual } from 'node:util';

import { BasicCrawler } from '@crawlee/basic';
import type { BasicCrawlerOptions, BrowserHook, LoadedRequest, Request } from '@crawlee/browser';
import { extractUrlsFromPage } from '@crawlee/browser';
import type { CheerioCrawlingContext } from '@crawlee/cheerio';
import { CheerioCrawler } from '@crawlee/cheerio';
import type {
    BaseHttpResponseData,
    ContextPipeline,
    CrawlingContext,
    EnqueueLinksOptions,
    GetUserDataFromRequest,
    RouterRoutes,
    StatisticPersistedState,
    StatisticsOptions,
    StatisticState,
} from '@crawlee/core';
import { Configuration, RequestHandlerResult, Router, Statistics, withCheckedStorageAccess } from '@crawlee/core';
import type { Dictionary } from '@crawlee/types';
import { type CheerioRoot, extractUrlsFromCheerio } from '@crawlee/utils';
import { type Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { Page } from 'playwright';

import type { Log } from '@apify/log';
import { addTimeoutToPromise } from '@apify/timeout';

import type { PlaywrightCrawlingContext, PlaywrightGotoOptions } from './playwright-crawler.js';
import { PlaywrightCrawler } from './playwright-crawler.js';
import { type RenderingType, RenderingTypePredictor } from './utils/rendering-type-prediction.js';

type Result<TResult> =
    | { result: TResult; ok: true; logs?: LogProxyCall[] }
    | { error: unknown; ok: false; logs?: LogProxyCall[] };

interface AdaptivePlaywrightCrawlerStatisticState extends StatisticState {
    httpOnlyRequestHandlerRuns?: number;
    browserRequestHandlerRuns?: number;
    renderingTypeMispredictions?: number;
}

interface AdaptivePlaywrightCrawlerPersistedStatisticState extends StatisticPersistedState {
    httpOnlyRequestHandlerRuns?: number;
    browserRequestHandlerRuns?: number;
    renderingTypeMispredictions?: number;
}

class AdaptivePlaywrightCrawlerStatistics extends Statistics {
    override state: AdaptivePlaywrightCrawlerStatisticState = null as any; // this needs to be assigned for a valid override, but the initialization is done by a reset() call from the parent constructor

    constructor(options: StatisticsOptions = {}) {
        super(options);
        this.reset();
    }

    override reset(): void {
        super.reset();
        this.state.httpOnlyRequestHandlerRuns = 0;
        this.state.browserRequestHandlerRuns = 0;
        this.state.renderingTypeMispredictions = 0;
    }

    protected override async _maybeLoadStatistics(): Promise<void> {
        await super._maybeLoadStatistics();
        const savedState = await this.keyValueStore?.getValue<AdaptivePlaywrightCrawlerPersistedStatisticState>(
            this.persistStateKey,
        );

        if (!savedState) {
            return;
        }

        this.state.httpOnlyRequestHandlerRuns = savedState.httpOnlyRequestHandlerRuns;
        this.state.browserRequestHandlerRuns = savedState.browserRequestHandlerRuns;
        this.state.renderingTypeMispredictions = savedState.renderingTypeMispredictions;
    }

    trackHttpOnlyRequestHandlerRun(): void {
        this.state.httpOnlyRequestHandlerRuns ??= 0;
        this.state.httpOnlyRequestHandlerRuns += 1;
    }

    trackBrowserRequestHandlerRun(): void {
        this.state.browserRequestHandlerRuns ??= 0;
        this.state.browserRequestHandlerRuns += 1;
    }

    trackRenderingTypeMisprediction(): void {
        this.state.renderingTypeMispredictions ??= 0;
        this.state.renderingTypeMispredictions += 1;
    }
}

export interface AdaptivePlaywrightCrawlerContext<UserData extends Dictionary = Dictionary>
    extends CrawlingContext<UserData> {
    request: LoadedRequest<Request<UserData>>;
    /**
     * The HTTP response, either from the HTTP client or from the initial request from playwright's navigation.
     */
    response: BaseHttpResponseData;

    /**
     * Playwright Page object. If accessed in HTTP-only rendering, this will throw an error and make the AdaptivePlaywrightCrawlerContext retry the request in a browser.
     */
    page: Page;

    /**
     * Wait for an element matching the selector to appear and return a Cheerio object of matched elements.
     * Timeout defaults to 5s.
     */
    querySelector(selector: string, timeoutMs?: number): Promise<Cheerio<AnyNode>>;

    /**
     * Wait for an element matching the selector to appear.
     * Timeout defaults to 5s.
     *
     * **Example usage:**
     * ```ts
     * async requestHandler({ waitForSelector, parseWithCheerio }) {
     *     await waitForSelector('article h1');
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    waitForSelector(selector: string, timeoutMs?: number): Promise<void>;

    /**
     * Returns Cheerio handle for `page.content()`, allowing to work with the data same way as with {@apilink CheerioCrawler}.
     * When provided with the `selector` argument, it will first look for the selector with a 5s timeout.
     *
     * **Example usage:**
     * ```ts
     * async requestHandler({ parseWithCheerio }) {
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    parseWithCheerio(selector?: string, timeoutMs?: number): Promise<CheerioRoot>;

    enqueueLinks(options?: EnqueueLinksOptions): Promise<void>;
}

interface AdaptiveHook
    extends BrowserHook<
        Pick<AdaptivePlaywrightCrawlerContext, 'id' | 'request' | 'session' | 'proxyInfo' | 'log'> & { page?: Page },
        PlaywrightGotoOptions
    > {}

export interface AdaptivePlaywrightCrawlerOptions<
    ExtendedContext extends AdaptivePlaywrightCrawlerContext = AdaptivePlaywrightCrawlerContext,
> extends Omit<
        BasicCrawlerOptions<AdaptivePlaywrightCrawlerContext, ExtendedContext>,
        'preNavigationHooks' | 'postNavigationHooks'
    > {
    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies.
     * The function accepts a subset of the crawling context. If you attempt to access the `page` property during HTTP-only crawling,
     * an exception will be thrown. If it's not caught, the request will be transparently retried in a browser.
     */
    preNavigationHooks?: AdaptiveHook[];

    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts a subset of the crawling context. If you attempt to access the `page` property during HTTP-only crawling,
     * an exception will be thrown. If it's not caught, the request will be transparently retried in a browser.
     */
    postNavigationHooks?: AdaptiveHook[];

    /**
     * Specifies the frequency of rendering type detection checks - 0.1 means roughly 10% of requests.
     * Defaults to 0.1 (so 10%).
     */
    renderingTypeDetectionRatio?: number;

    /**
     * An optional callback that is called on dataset items found by the request handler in plain HTTP mode.
     * If it returns false, the request is retried in a browser.
     * If no callback is specified, every dataset item is considered valid.
     */
    resultChecker?: (result: RequestHandlerResult) => boolean;

    /**
     * An optional callback used in rendering type detection. On each detection, the result of the plain HTTP run is compared to that of the browser one.
     * If the callback returns true, the results are considered equal and the target site is considered static.
     * If no result comparator is specified, but there is a `resultChecker`, any site where the `resultChecker` returns true is considered static.
     * If neither `resultComparator` nor `resultChecker` are specified, a deep comparison of returned dataset items is used as a default.
     */
    resultComparator?: (resultA: RequestHandlerResult, resultB: RequestHandlerResult) => boolean;

    /**
     * A custom rendering type predictor
     */
    renderingTypePredictor?: Pick<RenderingTypePredictor, 'predict' | 'storeResult'>;

    /**
     * Prevent direct access to storage in request handlers (only allow using context helpers).
     * Defaults to `true`
     */
    preventDirectStorageAccess?: boolean;
}

const proxyLogMethods = [
    'error',
    'exception',
    'softFail',
    'info',
    'debug',
    'perf',
    'warningOnce',
    'deprecated',
] as const;

type LogProxyCall = [log: Log, method: (typeof proxyLogMethods)[number], ...args: unknown[]];

/**
 * An extension of {@apilink PlaywrightCrawler} that uses a more limited request handler interface so that it is able to switch to HTTP-only crawling when it detects it may be possible.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new AdaptivePlaywrightCrawler({
 *     renderingTypeDetectionRatio: 0.1,
 *     async requestHandler({ querySelector, pushData, enqueueLinks, request, log }) {
 *         // This function is called to extract data from a single web page
 *         const $prices = await querySelector('span.price')
 *
 *         await pushData({
 *             url: request.url,
 *             price: $prices.filter(':contains("$")').first().text(),
 *         })
 *
 *         await enqueueLinks({ selector: '.pagination a' })
 *     },
 * });
 *
 * await crawler.run([
 *     'http://www.example.com/page-1',
 *     'http://www.example.com/page-2',
 * ]);
 * ```
 *
 * @experimental
 */
export class AdaptivePlaywrightCrawler<
    ExtendedContext extends AdaptivePlaywrightCrawlerContext = AdaptivePlaywrightCrawlerContext,
> extends BasicCrawler<AdaptivePlaywrightCrawlerContext, ExtendedContext> {
    private renderingTypePredictor: NonNullable<AdaptivePlaywrightCrawlerOptions['renderingTypePredictor']>;
    private resultChecker: NonNullable<AdaptivePlaywrightCrawlerOptions['resultChecker']>;
    private resultComparator: NonNullable<AdaptivePlaywrightCrawlerOptions['resultComparator']>;
    private preventDirectStorageAccess: boolean;
    private staticContextPipeline: ContextPipeline<CrawlingContext, ExtendedContext>;
    private browserContextPipeline: ContextPipeline<CrawlingContext, ExtendedContext>;
    private individualRequestHandlerTimeoutMillis: number;
    declare readonly stats: AdaptivePlaywrightCrawlerStatistics;

    constructor(
        options: AdaptivePlaywrightCrawlerOptions<ExtendedContext> = {},
        override readonly config = Configuration.getGlobalConfig(),
    ) {
        const {
            requestHandler,
            renderingTypeDetectionRatio = 0.1,
            renderingTypePredictor,
            resultChecker,
            resultComparator,
            statisticsOptions,
            preventDirectStorageAccess = true,
            requestHandlerTimeoutSecs = 60,
            errorHandler,
            failedRequestHandler,
            preNavigationHooks, // TODO handle
            postNavigationHooks, // TODO handle
            contextPipelineEnhancer: userProvidedPipelineEnhancer,
            ...rest
        } = options;

        super(
            {
                ...rest,
                // Pass error handlers to the "main" crawler - we only pluck them from `rest` so that they don't go to the sub crawlers
                errorHandler,
                failedRequestHandler,
                // The request handler may be called twice by the crawler. Each invocation uses its own timeout, so this is just a failsafe.
                requestHandlerTimeoutSecs: requestHandlerTimeoutSecs * 3,
                // The builder intentionally returns null so that it crashes the crawler when it tries to use this instead of one of two the specialized context pipelines
                // (that would be a logical error in this class)
                contextPipelineBuilder: () =>
                    null as unknown as ContextPipeline<CrawlingContext, AdaptivePlaywrightCrawlerContext>,
            },
            config,
        );
        this.individualRequestHandlerTimeoutMillis = requestHandlerTimeoutSecs * 1000;

        this.renderingTypePredictor =
            renderingTypePredictor ?? new RenderingTypePredictor({ detectionRatio: renderingTypeDetectionRatio });
        this.resultChecker = resultChecker ?? (() => true);

        if (resultComparator !== undefined) {
            this.resultComparator = resultComparator;
        } else if (resultChecker !== undefined) {
            this.resultComparator = (resultA, resultB) => this.resultChecker(resultA) && this.resultChecker(resultB);
        } else {
            this.resultComparator = (resultA, resultB) => {
                return (
                    resultA.datasetItems.length === resultB.datasetItems.length &&
                    resultA.datasetItems.every((itemA, i) => {
                        const itemB = resultB.datasetItems[i];
                        return isDeepStrictEqual(itemA, itemB);
                    })
                );
            };
        }

        const contextPipelineEnhancer =
            userProvidedPipelineEnhancer ??
            ((pipeline) => pipeline as ContextPipeline<CrawlingContext, ExtendedContext>);

        /* eslint-disable dot-notation */
        this.staticContextPipeline = contextPipelineEnhancer(
            new CheerioCrawler(rest, config)['contextPipeline'].compose({
                action: this.adaptCheerioContext.bind(this),
            }),
        );

        this.browserContextPipeline = contextPipelineEnhancer(
            new PlaywrightCrawler(rest, config)['contextPipeline'].compose({
                action: this.adaptPlaywrightContext.bind(this),
            }),
        );
        /* eslint-enable dot-notation */

        this.stats = new AdaptivePlaywrightCrawlerStatistics({
            logMessage: `${this.log.getOptions().prefix} request statistics:`,
            config,
            ...statisticsOptions,
        });

        this.preventDirectStorageAccess = preventDirectStorageAccess;
    }

    private async adaptCheerioContext(cheerioContext: CheerioCrawlingContext) {
        // This will in fact delegate to RequestHandlerResult.enqueueLinks.
        // We access it indirectly like this to avoid the need to propagate RequestHandlerResult here
        const enqueueLinks = cheerioContext.enqueueLinks;

        return {
            get page(): Page {
                throw new Error('Page object was used in HTTP-only request handler');
            },
            get response(): BaseHttpResponseData {
                return {
                    // TODO remove this once cheerioContext.response is just a Response
                    complete: true,
                    headers: cheerioContext.response.headers,
                    trailers: {},
                    url: cheerioContext.response.url!,
                    statusCode: cheerioContext.response.statusCode!,
                    redirectUrls: (cheerioContext.response as unknown as BaseHttpResponseData).redirectUrls ?? [],
                };
            },
            async querySelector(selector: string) {
                return cheerioContext.$(selector);
            },
            async enqueueLinks(options: EnqueueLinksOptions = {}) {
                const urls =
                    options.urls ??
                    extractUrlsFromCheerio(
                        cheerioContext.$,
                        options.selector,
                        options.baseUrl ?? cheerioContext.request.loadedUrl,
                    );
                await enqueueLinks({ ...options, urls });
            },
        };
    }

    private async adaptPlaywrightContext(playwrightContext: PlaywrightCrawlingContext) {
        // This will in fact delegate to RequestHandlerResult.enqueueLinks.
        // We access it indirectly like this to avoid the need to propagate RequestHandlerResult here
        const enqueueLinks = playwrightContext.enqueueLinks;

        return {
            get response(): BaseHttpResponseData {
                return {
                    url: playwrightContext.response!.url(),
                    statusCode: playwrightContext.response!.status(),
                    headers: playwrightContext.response!.headers(),
                    trailers: {},
                    complete: true,
                    redirectUrls: [],
                };
            },
            async querySelector(selector: string, timeoutMs = 5000) {
                const locator = playwrightContext.page.locator(selector).first();
                await locator.waitFor({ timeout: timeoutMs, state: 'attached' });
                const $ = await playwrightContext.parseWithCheerio();

                return $(selector) as Cheerio<any>;
            },
            async enqueueLinks(options: EnqueueLinksOptions = {}, timeoutMs = 5000) {
                const selector = options.selector ?? 'a';
                const locator = playwrightContext.page.locator(selector).first();
                await locator.waitFor({ timeout: timeoutMs, state: 'attached' });

                // TODO consider using `context.parseWithCheerio` to make this universal and avoid code duplication
                const urls =
                    options.urls ??
                    (await extractUrlsFromPage(
                        playwrightContext.page,
                        selector,
                        options.baseUrl ?? playwrightContext.request.loadedUrl,
                    ));
                await enqueueLinks({ ...options, urls });
            },
        };
    }

    private async crawlOne(
        renderingType: RenderingType,
        context: CrawlingContext,
        useStateFunction: (defaultValue?: Dictionary) => Promise<Dictionary>,
    ): Promise<Result<RequestHandlerResult>> {
        const result = new RequestHandlerResult(this.config, AdaptivePlaywrightCrawler.CRAWLEE_STATE_KEY);
        const logs: LogProxyCall[] = [];

        const resultBoundContextHelpers = {
            addRequests: result.addRequests,
            pushData: result.pushData,
            useState: this.allowStorageAccess(useStateFunction),
            getKeyValueStore: this.allowStorageAccess(result.getKeyValueStore),
            enqueueLinks: result.enqueueLinks,
            log: this.createLogProxy(context.log, logs),
        };

        try {
            const callAdaptiveRequestHandler = async () => {
                if (renderingType === 'static') {
                    await this.staticContextPipeline.call(
                        { ...context, ...resultBoundContextHelpers },
                        async (finalContext) => await this.router(finalContext),
                    );
                } else if (renderingType === 'clientOnly') {
                    await this.browserContextPipeline.call(
                        { ...context, ...resultBoundContextHelpers },
                        async (finalContext) => await this.router(finalContext),
                    );
                }
            };

            await addTimeoutToPromise(
                async () =>
                    withCheckedStorageAccess(() => {
                        if (this.preventDirectStorageAccess) {
                            throw new Error(
                                'Directly accessing storage in a request handler is not allowed in AdaptivePlaywrightCrawler',
                            );
                        }
                    }, callAdaptiveRequestHandler),
                this.individualRequestHandlerTimeoutMillis,
                'Request handler timed out',
            );

            return { result, ok: true, logs };
        } catch (error) {
            return { error, ok: false, logs };
        }
    }

    protected override async runRequestHandler(crawlingContext: PlaywrightCrawlingContext): Promise<void> {
        const renderingTypePrediction = this.renderingTypePredictor.predict(crawlingContext.request);
        const shouldDetectRenderingType = Math.random() < renderingTypePrediction.detectionProbabilityRecommendation;

        if (!shouldDetectRenderingType) {
            crawlingContext.log.debug(
                `Predicted rendering type ${renderingTypePrediction.renderingType} for ${crawlingContext.request.url}`,
            );
        }

        if (renderingTypePrediction.renderingType === 'static' && !shouldDetectRenderingType) {
            crawlingContext.log.debug(`Running HTTP-only request handler for ${crawlingContext.request.url}`);
            this.stats.trackHttpOnlyRequestHandlerRun();

            const plainHTTPRun = await this.crawlOne('static', crawlingContext, crawlingContext.useState);

            if (plainHTTPRun.ok && this.resultChecker(plainHTTPRun.result)) {
                crawlingContext.log.debug(`HTTP-only request handler succeeded for ${crawlingContext.request.url}`);
                plainHTTPRun.logs?.forEach(([log, method, ...args]) => log[method](...(args as [any, any])));
                await this.commitResult(crawlingContext, plainHTTPRun.result);
                return;
            }

            // Execution will "fall through" and try running the request handler in a browser
            if (!plainHTTPRun.ok) {
                crawlingContext.log.exception(
                    plainHTTPRun.error as Error,
                    `HTTP-only request handler failed for ${crawlingContext.request.url}`,
                );
            } else {
                crawlingContext.log.warning(
                    `HTTP-only request handler returned a suspicious result for ${crawlingContext.request.url}`,
                );
                this.stats.trackRenderingTypeMisprediction();
            }
        }

        crawlingContext.log.debug(`Running browser request handler for ${crawlingContext.request.url}`);
        this.stats.trackBrowserRequestHandlerRun();

        // Run the request handler in a browser. The copy of the crawler state is kept so that we can perform
        // a rendering type detection if necessary. Without this measure, the HTTP request handler would run
        // under different conditions, which could change its behavior. Changes done to the crawler state by
        // the HTTP request handler will not be committed to the actual storage.
        const stateTracker = {
            stateCopy: null,
            async getLiveState(defaultValue: Dictionary = {}) {
                const state = await crawlingContext.useState(defaultValue);

                if (this.stateCopy === null) {
                    this.stateCopy = JSON.parse(JSON.stringify(state));
                }

                return state;
            },
            async getStateCopy(defaultValue: Dictionary = {}) {
                if (this.stateCopy === null) {
                    return defaultValue;
                }
                return this.stateCopy;
            },
        };

        const browserRun = await this.crawlOne(
            'clientOnly',
            crawlingContext,
            stateTracker.getLiveState.bind(stateTracker),
        );

        if (!browserRun.ok) {
            throw browserRun.error;
        }

        await this.commitResult(crawlingContext, browserRun.result);

        if (shouldDetectRenderingType) {
            crawlingContext.log.debug(`Detecting rendering type for ${crawlingContext.request.url}`);
            const plainHTTPRun = await this.crawlOne(
                'static',
                crawlingContext,
                stateTracker.getStateCopy.bind(stateTracker),
            );

            const detectionResult: RenderingType = (() => {
                if (!plainHTTPRun.ok) {
                    return 'clientOnly';
                }

                if (this.resultComparator(plainHTTPRun.result, browserRun.result)) {
                    return 'static';
                }

                return 'clientOnly';
            })();

            crawlingContext.log.debug(`Detected rendering type ${detectionResult} for ${crawlingContext.request.url}`);
            this.renderingTypePredictor.storeResult(crawlingContext.request, detectionResult);
        }
    }

    protected async commitResult(
        crawlingContext: PlaywrightCrawlingContext,
        { calls, keyValueStoreChanges }: RequestHandlerResult,
    ): Promise<void> {
        await Promise.all([
            ...calls.pushData.map(async (params) => crawlingContext.pushData(...params)),
            ...calls.enqueueLinks.map(async (params) => await crawlingContext.enqueueLinks(...params)),
            ...calls.addRequests.map(async (params) => crawlingContext.addRequests(...params)),
            ...Object.entries(keyValueStoreChanges).map(async ([storeIdOrName, changes]) => {
                const store = await crawlingContext.getKeyValueStore(storeIdOrName);
                await Promise.all(
                    Object.entries(changes).map(async ([key, { changedValue, options }]) =>
                        store.setValue(key, changedValue, options),
                    ),
                );
            }),
        ]);
    }

    protected allowStorageAccess<R, TArgs extends any[]>(
        func: (...args: TArgs) => Promise<R>,
    ): (...args: TArgs) => Promise<R> {
        return async (...args: TArgs) =>
            withCheckedStorageAccess(
                () => {},
                async () => func(...args),
            );
    }

    private createLogProxy(log: Log, logs: LogProxyCall[]) {
        return new Proxy(log, {
            get(target: Log, propertyName: (typeof proxyLogMethods)[number], receiver: any) {
                if (proxyLogMethods.includes(propertyName)) {
                    return (...args: unknown[]) => {
                        logs.push([target, propertyName, ...args]);
                    };
                }
                return Reflect.get(target, propertyName, receiver);
            },
        });
    }
}

export function createAdaptivePlaywrightRouter<
    Context extends AdaptivePlaywrightCrawlerContext = AdaptivePlaywrightCrawlerContext,
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, UserData>) {
    return Router.create<Context>(routes);
}
