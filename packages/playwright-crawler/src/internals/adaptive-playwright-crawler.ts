import type { BrowserHook, LoadedContext, LoadedRequest, Request, RouterHandler } from '@crawlee/browser';
import { extractUrlsFromPage } from '@crawlee/browser';
import type {
    BaseHttpResponseData,
    GetUserDataFromRequest,
    RestrictedCrawlingContext,
    RouterRoutes,
    StatisticPersistedState,
    StatisticsOptions,
    StatisticState,
} from '@crawlee/core';
import { Configuration, RequestHandlerResult, Router, Statistics, withCheckedStorageAccess } from '@crawlee/core';
import type { Awaitable, Dictionary } from '@crawlee/types';
import { type CheerioRoot, extractUrlsFromCheerio } from '@crawlee/utils';
import { type Cheerio, type Element, load } from 'cheerio';
import isEqual from 'lodash.isequal';
import type { Page } from 'playwright';

import type { Log } from '@apify/log';
import { addTimeoutToPromise } from '@apify/timeout';

import type { PlaywrightCrawlerOptions, PlaywrightCrawlingContext, PlaywrightGotoOptions } from './playwright-crawler';
import { PlaywrightCrawler } from './playwright-crawler';
import { type RenderingType, RenderingTypePredictor } from './utils/rendering-type-prediction';

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
    extends RestrictedCrawlingContext<UserData> {
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
    querySelector(selector: string, timeoutMs?: number): Promise<Cheerio<Element>>;

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
}

interface AdaptiveHook
    extends BrowserHook<
        Pick<AdaptivePlaywrightCrawlerContext, 'id' | 'request' | 'session' | 'proxyInfo' | 'log'> & { page?: Page },
        PlaywrightGotoOptions
    > {}

export interface AdaptivePlaywrightCrawlerOptions
    extends Omit<
        PlaywrightCrawlerOptions,
        'requestHandler' | 'handlePageFunction' | 'preNavigationHooks' | 'postNavigationHooks'
    > {
    /**
     * Function that is called to process each request.
     *
     * The function receives the {@apilink AdaptivePlaywrightCrawlingContext} as an argument, and it must refrain from calling code with side effects,
     * other than the methods of the crawling context. Any other side effects may be invoked repeatedly by the crawler, which can lead to inconsistent results.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     */
    requestHandler?: (crawlingContext: LoadedContext<AdaptivePlaywrightCrawlerContext>) => Awaitable<void>;

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
     * If a callback is provided, the contract is as follows:
     *   It the callback returns true or 'equal', the results are considered equal and the target site is considered static.
     *   If it returns false or 'different', the target site is considered client-rendered.
     *   If it returns 'inconclusive', the detection result won't be used.
     * If no result comparator is specified, but there is a `resultChecker`, any site where the `resultChecker` returns true is considered static.
     * If neither `resultComparator` nor `resultChecker` are specified, a deep comparison of returned dataset items is used as a default.
     */
    resultComparator?: (
        resultA: RequestHandlerResult,
        resultB: RequestHandlerResult,
    ) => boolean | 'equal' | 'different' | 'inconclusive';

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
export class AdaptivePlaywrightCrawler extends PlaywrightCrawler {
    private adaptiveRequestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] & {};
    private renderingTypePredictor: NonNullable<AdaptivePlaywrightCrawlerOptions['renderingTypePredictor']>;
    private resultChecker: NonNullable<AdaptivePlaywrightCrawlerOptions['resultChecker']>;
    private resultComparator: NonNullable<AdaptivePlaywrightCrawlerOptions['resultComparator']>;
    private preventDirectStorageAccess: boolean;
    declare readonly stats: AdaptivePlaywrightCrawlerStatistics;

    /**
     * Default {@apilink Router} instance that will be used if we don't specify any {@apilink AdaptivePlaywrightCrawlerOptions.requestHandler|`requestHandler`}.
     * See {@apilink Router.addHandler|`router.addHandler()`} and {@apilink Router.addDefaultHandler|`router.addDefaultHandler()`}.
     */
    // @ts-ignore
    override readonly router: RouterHandler<AdaptivePlaywrightCrawlerContext> =
        Router.create<AdaptivePlaywrightCrawlerContext>();

    constructor(
        options: AdaptivePlaywrightCrawlerOptions = {},
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
            ...rest
        } = options;

        super(rest, config);
        this.adaptiveRequestHandler = requestHandler ?? this.router;
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
                        return isEqual(itemA, itemB);
                    })
                );
            };
        }

        this.stats = new AdaptivePlaywrightCrawlerStatistics({
            logMessage: `${this.log.getOptions().prefix} request statistics:`,
            config,
            ...statisticsOptions,
        });

        this.preventDirectStorageAccess = preventDirectStorageAccess;
    }

    protected override async _runRequestHandler(crawlingContext: PlaywrightCrawlingContext): Promise<void> {
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

            const plainHTTPRun = await this.runRequestHandlerWithPlainHTTP(crawlingContext);

            if (plainHTTPRun.ok && this.resultChecker(plainHTTPRun.result)) {
                crawlingContext.log.debug(`HTTP-only request handler succeeded for ${crawlingContext.request.url}`);
                plainHTTPRun.logs?.forEach(([log, method, ...args]) => log[method](...(args as [any, any])));
                await this.commitResult(crawlingContext, plainHTTPRun.result);
                return;
            }
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
        const { result: browserRun, initialStateCopy } = await this.runRequestHandlerInBrowser(crawlingContext);

        if (!browserRun.ok) {
            throw browserRun.error;
        }

        await this.commitResult(crawlingContext, browserRun.result);

        if (shouldDetectRenderingType) {
            crawlingContext.log.debug(`Detecting rendering type for ${crawlingContext.request.url}`);
            const plainHTTPRun = await this.runRequestHandlerWithPlainHTTP(crawlingContext, initialStateCopy);

            const detectionResult: RenderingType | undefined = (() => {
                if (!plainHTTPRun.ok) {
                    return 'clientOnly';
                }

                const comparisonResult = this.resultComparator(plainHTTPRun.result, browserRun.result);
                if (comparisonResult === true || comparisonResult === 'equal') {
                    return 'static';
                }

                if (comparisonResult === false || comparisonResult === 'different') {
                    return 'clientOnly';
                }

                return undefined;
            })();

            crawlingContext.log.debug(`Detected rendering type ${detectionResult} for ${crawlingContext.request.url}`);

            if (detectionResult !== undefined) {
                this.renderingTypePredictor.storeResult(crawlingContext.request, detectionResult);
            }
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

    protected async runRequestHandlerInBrowser(
        crawlingContext: PlaywrightCrawlingContext,
    ): Promise<{ result: Result<RequestHandlerResult>; initialStateCopy?: Record<string, unknown> }> {
        const result = new RequestHandlerResult(this.config, AdaptivePlaywrightCrawler.CRAWLEE_STATE_KEY);
        let initialStateCopy: Record<string, unknown> | undefined;

        try {
            await super._runRequestHandler.call(
                new Proxy(this, {
                    get: (target, propertyName, receiver) => {
                        if (propertyName === 'userProvidedRequestHandler') {
                            return async (playwrightContext: PlaywrightCrawlingContext) =>
                                withCheckedStorageAccess(
                                    () => {
                                        if (this.preventDirectStorageAccess) {
                                            throw new Error(
                                                'Directly accessing storage in a request handler is not allowed in AdaptivePlaywrightCrawler',
                                            );
                                        }
                                    },
                                    () =>
                                        this.adaptiveRequestHandler({
                                            id: crawlingContext.id,
                                            session: crawlingContext.session,
                                            proxyInfo: crawlingContext.proxyInfo,
                                            request: crawlingContext.request as LoadedRequest<Request>,
                                            response: {
                                                url: crawlingContext.response!.url(),
                                                statusCode: crawlingContext.response!.status(),
                                                headers: crawlingContext.response!.headers(),
                                                trailers: {},
                                                complete: true,
                                                redirectUrls: [],
                                            },
                                            log: crawlingContext.log,
                                            page: crawlingContext.page,
                                            querySelector: async (selector, timeoutMs = 5_000) => {
                                                const locator = playwrightContext.page.locator(selector).first();
                                                await locator.waitFor({ timeout: timeoutMs, state: 'attached' });
                                                const $ = await playwrightContext.parseWithCheerio();

                                                return $(selector) as Cheerio<Element>;
                                            },
                                            async waitForSelector(selector, timeoutMs = 5_000) {
                                                const locator = playwrightContext.page.locator(selector).first();
                                                await locator.waitFor({ timeout: timeoutMs, state: 'attached' });
                                            },
                                            async parseWithCheerio(
                                                selector?: string,
                                                timeoutMs = 5_000,
                                            ): Promise<CheerioRoot> {
                                                if (selector) {
                                                    const locator = playwrightContext.page.locator(selector).first();
                                                    await locator.waitFor({ timeout: timeoutMs, state: 'attached' });
                                                }

                                                return playwrightContext.parseWithCheerio();
                                            },
                                            async enqueueLinks(options = {}, timeoutMs = 5_000) {
                                                const selector = options.selector ?? 'a';
                                                const locator = playwrightContext.page.locator(selector).first();
                                                await locator.waitFor({ timeout: timeoutMs, state: 'attached' });

                                                const urls = await extractUrlsFromPage(
                                                    playwrightContext.page,
                                                    selector,
                                                    options.baseUrl ??
                                                        playwrightContext.request.loadedUrl ??
                                                        playwrightContext.request.url,
                                                );
                                                await result.enqueueLinks({ ...options, urls });
                                            },
                                            addRequests: result.addRequests,
                                            pushData: result.pushData,
                                            useState: this.allowStorageAccess(async (defaultValue) => {
                                                const state = await result.useState(defaultValue);
                                                if (initialStateCopy === undefined) {
                                                    initialStateCopy = JSON.parse(JSON.stringify(state));
                                                }
                                                return state;
                                            }),
                                            getKeyValueStore: this.allowStorageAccess(result.getKeyValueStore),
                                        }),
                                );
                        }
                        return Reflect.get(target, propertyName, receiver);
                    },
                }),
                crawlingContext,
            );
            return { result: { result, ok: true }, initialStateCopy };
        } catch (error) {
            return { result: { error, ok: false }, initialStateCopy };
        }
    }

    protected async runRequestHandlerWithPlainHTTP(
        crawlingContext: PlaywrightCrawlingContext,
        oldStateCopy?: Dictionary,
    ): Promise<Result<RequestHandlerResult>> {
        const result = new RequestHandlerResult(this.config, AdaptivePlaywrightCrawler.CRAWLEE_STATE_KEY);
        const logs: LogProxyCall[] = [];

        const pageGotoOptions = { timeout: this.navigationTimeoutMillis }; // Irrelevant, but required by BrowserCrawler

        try {
            await withCheckedStorageAccess(
                () => {
                    if (this.preventDirectStorageAccess) {
                        throw new Error(
                            'Directly accessing storage in a request handler is not allowed in AdaptivePlaywrightCrawler',
                        );
                    }
                },
                async () =>
                    addTimeoutToPromise(
                        async () => {
                            const hookContext: Parameters<AdaptiveHook>[0] = {
                                id: crawlingContext.id,
                                session: crawlingContext.session,
                                proxyInfo: crawlingContext.proxyInfo,
                                request: crawlingContext.request,
                                log: this.createLogProxy(crawlingContext.log, logs),
                            };

                            await this._executeHooks(
                                this.preNavigationHooks,
                                {
                                    ...hookContext,
                                    get page(): Page {
                                        throw new Error('Page object was used in HTTP-only pre-navigation hook');
                                    },
                                } as PlaywrightCrawlingContext, // This is safe because `executeHooks` just passes the context to the hooks which accept the partial context
                                pageGotoOptions,
                            );

                            const response = await crawlingContext.sendRequest({});
                            const loadedUrl = response.url;
                            crawlingContext.request.loadedUrl = loadedUrl;
                            const $ = load(response.body);

                            await this.adaptiveRequestHandler({
                                ...hookContext,
                                request: crawlingContext.request as LoadedRequest<Request>,
                                response,
                                get page(): Page {
                                    throw new Error('Page object was used in HTTP-only request handler');
                                },
                                async querySelector(selector, _timeoutMs?: number) {
                                    return $(selector) as Cheerio<Element>;
                                },
                                async waitForSelector(selector, _timeoutMs?: number) {
                                    if ($(selector).get().length === 0) {
                                        throw new Error(`Selector '${selector}' not found.`);
                                    }
                                },
                                async parseWithCheerio(selector?: string, _timeoutMs?: number): Promise<CheerioRoot> {
                                    if (selector && $(selector).get().length === 0) {
                                        throw new Error(`Selector '${selector}' not found.`);
                                    }

                                    return $;
                                },
                                async enqueueLinks(
                                    options: Parameters<RestrictedCrawlingContext['enqueueLinks']>[0] = {},
                                ) {
                                    const urls = extractUrlsFromCheerio(
                                        $,
                                        options.selector,
                                        options.baseUrl ?? loadedUrl,
                                    );
                                    await result.enqueueLinks({ ...options, urls });
                                },
                                addRequests: result.addRequests,
                                pushData: result.pushData,
                                useState: async (defaultValue) => {
                                    // return the old state before the browser handler was executed
                                    // when rerunning the handler via HTTP for detection
                                    if (oldStateCopy !== undefined) {
                                        return oldStateCopy ?? defaultValue; // fallback to the default for `null`
                                    }

                                    return this.allowStorageAccess(result.useState)(defaultValue);
                                },
                                getKeyValueStore: this.allowStorageAccess(result.getKeyValueStore),
                            });

                            await this._executeHooks(this.postNavigationHooks, crawlingContext, pageGotoOptions);
                        },
                        this.requestHandlerTimeoutInnerMillis,
                        'Request handler timed out',
                    ),
            );

            return { result, logs, ok: true };
        } catch (error) {
            return { error, logs, ok: false };
        }
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
