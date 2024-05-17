import { addTimeoutToPromise } from '@apify/timeout';
import { extractUrlsFromPage } from '@crawlee/browser';
import type {
    RestrictedCrawlingContext,
    StatisticState,
    StatisticsOptions,
    StatisticPersistedState,
    GetUserDataFromRequest,
    RouterRoutes,
} from '@crawlee/core';
import { Configuration, RequestHandlerResult, Router, Statistics, withCheckedStorageAccess } from '@crawlee/core';
import type { Awaitable, Dictionary } from '@crawlee/types';
import { extractUrlsFromCheerio } from '@crawlee/utils';
import { load, type Cheerio, type Element } from 'cheerio';
import isEqual from 'lodash.isequal';

import type { PlaywrightCrawlerOptions, PlaywrightCrawlingContext } from './playwright-crawler';
import { PlaywrightCrawler } from './playwright-crawler';
import { RenderingTypePredictor, type RenderingType } from './utils/rendering-type-prediction';

type Result<TResult> = { result: TResult; ok: true } | { error: unknown; ok: false };

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

export interface AdaptivePlaywrightCrawlerContext extends RestrictedCrawlingContext {
    /**
     * Wait for an element matching the selector to appear and return a Cheerio object of matched elements.
     */
    querySelector: (selector: string, timeoutMs?: number) => Awaitable<Cheerio<Element>>;
}

export interface AdaptivePlaywrightCrawlerOptions
    extends Omit<PlaywrightCrawlerOptions, 'requestHandler' | 'handlePageFunction'> {
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
    requestHandler: (crawlingContext: AdaptivePlaywrightCrawlerContext) => Awaitable<void>;

    /**
     * Specifies the frequency of rendering type detection checks - 0.1 means roughly 10% of requests.
     */
    renderingTypeDetectionRatio: number;

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
}

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
    private adaptiveRequestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'];
    private renderingTypePredictor: NonNullable<AdaptivePlaywrightCrawlerOptions['renderingTypePredictor']>;
    private resultChecker: NonNullable<AdaptivePlaywrightCrawlerOptions['resultChecker']>;
    private resultComparator: NonNullable<AdaptivePlaywrightCrawlerOptions['resultComparator']>;
    override readonly stats: AdaptivePlaywrightCrawlerStatistics;

    constructor(
        {
            requestHandler,
            renderingTypeDetectionRatio,
            renderingTypePredictor,
            resultChecker,
            resultComparator,
            statisticsOptions,
            ...options
        }: AdaptivePlaywrightCrawlerOptions,
        override readonly config = Configuration.getGlobalConfig(),
    ) {
        super(options, config);
        this.adaptiveRequestHandler = requestHandler;
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
    }

    protected override async _runRequestHandler(crawlingContext: PlaywrightCrawlingContext<Dictionary>): Promise<void> {
        const url = new URL(crawlingContext.request.loadedUrl ?? crawlingContext.request.url);

        const renderingTypePrediction = this.renderingTypePredictor.predict(url, crawlingContext.request.label);
        const shouldDetectRenderingType = Math.random() < renderingTypePrediction.detectionProbabilityRecommendation;

        if (!shouldDetectRenderingType) {
            crawlingContext.log.info(
                `Predicted rendering type ${renderingTypePrediction.renderingType} for ${crawlingContext.request.url}`,
            );
        }

        if (renderingTypePrediction.renderingType === 'static' && !shouldDetectRenderingType) {
            crawlingContext.log.info(`Running HTTP-only request handler for ${crawlingContext.request.url}`);
            this.stats.trackHttpOnlyRequestHandlerRun();

            const plainHTTPRun = await this.runRequestHandlerWithPlainHTTP(crawlingContext);

            if (plainHTTPRun.ok && this.resultChecker(plainHTTPRun.result)) {
                crawlingContext.log.info(`HTTP-only request handler succeeded for ${crawlingContext.request.url}`);
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

        crawlingContext.log.info(`Running browser request handler for ${crawlingContext.request.url}`);
        this.stats.trackBrowserRequestHandlerRun();

        const browserRun = await this.runRequestHandlerInBrowser(crawlingContext);
        if (!browserRun.ok) {
            throw browserRun.error;
        }

        await this.commitResult(crawlingContext, browserRun.result);

        if (shouldDetectRenderingType) {
            crawlingContext.log.info(`Detecting rendering type for ${crawlingContext.request.url}`);
            const plainHTTPRun = await this.runRequestHandlerWithPlainHTTP(crawlingContext);

            const detectionResult: RenderingType = (() => {
                if (!plainHTTPRun.ok) {
                    return 'clientOnly';
                }

                if (this.resultComparator(plainHTTPRun.result, browserRun.result)) {
                    return 'static';
                }

                return 'clientOnly';
            })();

            crawlingContext.log.info(`Detected rendering type ${detectionResult} for ${crawlingContext.request.url}`);
            this.renderingTypePredictor.storeResult(url, crawlingContext.request.label, detectionResult);
        }
    }

    protected async commitResult(
        crawlingContext: PlaywrightCrawlingContext<Dictionary>,
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
        crawlingContext: PlaywrightCrawlingContext<Dictionary>,
    ): Promise<Result<RequestHandlerResult>> {
        const result = new RequestHandlerResult(this.config, AdaptivePlaywrightCrawler.CRAWLEE_STATE_KEY);

        try {
            await super._runRequestHandler.call(
                new Proxy(this, {
                    get: (target, propertyName, receiver) => {
                        if (propertyName === 'userProvidedRequestHandler') {
                            return async (playwrightContext: PlaywrightCrawlingContext) =>
                                withCheckedStorageAccess(
                                    () => {
                                        throw new Error(
                                            'Directly accessing storage in a request handler is not allowed in AdaptivePlaywrightCrawler',
                                        );
                                    },
                                    () =>
                                        this.adaptiveRequestHandler({
                                            request: crawlingContext.request,
                                            log: crawlingContext.log,
                                            querySelector: async (selector, timeoutMs) => {
                                                const locator = playwrightContext.page.locator(selector).first();
                                                await locator.waitFor({ timeout: timeoutMs });
                                                return (await playwrightContext.parseWithCheerio())(
                                                    selector,
                                                ) as Cheerio<Element>;
                                            },
                                            enqueueLinks: async (options = {}) => {
                                                const selector = options.selector ?? 'a';
                                                const locator = playwrightContext.page.locator(selector).first();
                                                await locator.waitFor();

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
                                            useState: this.allowStorageAccess(result.useState),
                                            getKeyValueStore: this.allowStorageAccess(result.getKeyValueStore),
                                        }),
                                );
                        }
                        return Reflect.get(target, propertyName, receiver);
                    },
                }),
                crawlingContext,
            );
            return { result, ok: true };
        } catch (error) {
            return { error, ok: false };
        }
    }

    protected async runRequestHandlerWithPlainHTTP(
        crawlingContext: PlaywrightCrawlingContext<Dictionary>,
    ): Promise<Result<RequestHandlerResult>> {
        const result = new RequestHandlerResult(this.config, AdaptivePlaywrightCrawler.CRAWLEE_STATE_KEY);

        const response = await crawlingContext.sendRequest({});
        const loadedUrl = response.url;
        crawlingContext.request.loadedUrl = loadedUrl;
        const $ = load(response.body);

        try {
            await withCheckedStorageAccess(
                () => {
                    throw new Error(
                        'Directly accessing storage in a request handler is not allowed in AdaptivePlaywrightCrawler',
                    );
                },
                async () =>
                    addTimeoutToPromise(
                        async () =>
                            this.adaptiveRequestHandler({
                                request: crawlingContext.request,
                                log: crawlingContext.log,
                                querySelector: (selector) => $(selector) as Cheerio<Element>,
                                enqueueLinks: async (
                                    options: Parameters<RestrictedCrawlingContext['enqueueLinks']>[0] = {},
                                ) => {
                                    const urls = extractUrlsFromCheerio(
                                        $,
                                        options.selector,
                                        options.baseUrl ?? loadedUrl,
                                    );
                                    await result.enqueueLinks({ ...options, urls });
                                },
                                addRequests: result.addRequests,
                                pushData: result.pushData,
                                useState: this.allowStorageAccess(result.useState),
                                getKeyValueStore: this.allowStorageAccess(result.getKeyValueStore),
                            }),
                        this.requestHandlerTimeoutInnerMillis,
                        'Request handler timed out',
                    ),
            );

            return { result, ok: true };
        } catch (error) {
            return { error, ok: false };
        }
    }
}

export function createAdaptivePlaywrightRouter<
    Context extends AdaptivePlaywrightCrawlerContext = AdaptivePlaywrightCrawlerContext,
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, UserData>) {
    return Router.create<Context>(routes);
}
