import type { Log } from '@apify/log';
import { addTimeoutToPromise } from '@apify/timeout';
import {
    extractUrlsFromPage,
    type LoadedContext,
    type LoadedRequest,
    type Request,
    type RouterHandler,
} from '@crawlee/browser';
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
import { type CheerioRoot, extractUrlsFromCheerio } from '@crawlee/utils';
import { load, type Cheerio, type Element } from 'cheerio';
import isEqual from 'lodash.isequal';

import type { PlaywrightCrawlerOptions, PlaywrightCrawlingContext } from './playwright-crawler';
import { PlaywrightCrawler } from './playwright-crawler';
import { RenderingTypePredictor, type RenderingType } from './utils/rendering-type-prediction';

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

export interface AdaptivePlaywrightCrawlerContext extends RestrictedCrawlingContext {
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
    requestHandler?: (crawlingContext: LoadedContext<AdaptivePlaywrightCrawlerContext>) => Awaitable<void>;

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
    override readonly stats: AdaptivePlaywrightCrawlerStatistics;

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
    }

    protected override async _runRequestHandler(crawlingContext: PlaywrightCrawlingContext): Promise<void> {
        const url = new URL(crawlingContext.request.loadedUrl ?? crawlingContext.request.url);

        const renderingTypePrediction = this.renderingTypePredictor.predict(url, crawlingContext.request.label);
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

        // Keep a copy of the `useState` value, we need to use the old state when trying the HTTP handler to have
        // the same outcome. We don't need to care about its persistence, since we only run this for detection
        // purposes. We read the value directly instead of using `useState` so there are no side effects.
        const kvs = await crawlingContext.getKeyValueStore();
        const oldState = await kvs.getValue(AdaptivePlaywrightCrawler.CRAWLEE_STATE_KEY);
        const oldStateCopy = JSON.parse(JSON.stringify(oldState));
        const browserRun = await this.runRequestHandlerInBrowser(crawlingContext);

        if (!browserRun.ok) {
            throw browserRun.error;
        }

        await this.commitResult(crawlingContext, browserRun.result);

        if (shouldDetectRenderingType) {
            crawlingContext.log.debug(`Detecting rendering type for ${crawlingContext.request.url}`);
            const plainHTTPRun = await this.runRequestHandlerWithPlainHTTP(crawlingContext, oldStateCopy);

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
            this.renderingTypePredictor.storeResult(url, crawlingContext.request.label, detectionResult);
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
                                            id: crawlingContext.id,
                                            session: crawlingContext.session,
                                            proxyInfo: crawlingContext.proxyInfo,
                                            request: crawlingContext.request as LoadedRequest<Request>,
                                            log: crawlingContext.log,
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
        crawlingContext: PlaywrightCrawlingContext,
        oldStateCopy?: Dictionary,
    ): Promise<Result<RequestHandlerResult>> {
        const result = new RequestHandlerResult(this.config, AdaptivePlaywrightCrawler.CRAWLEE_STATE_KEY);
        const logs: LogProxyCall[] = [];

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
                                id: crawlingContext.id,
                                session: crawlingContext.session,
                                proxyInfo: crawlingContext.proxyInfo,
                                request: crawlingContext.request as LoadedRequest<Request>,
                                log: this.createLogProxy(crawlingContext.log, logs),
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
                            }),
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
