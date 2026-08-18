import { isDeepStrictEqual } from 'node:util';
import { BasicCrawler } from '@crawlee/basic';
import { extractUrlsFromPage } from '@crawlee/browser';
import { CheerioCrawler } from '@crawlee/cheerio';
import { createStorageTransaction, EnqueueStrategy, OwnedOrInjected, RequestHandlerError, resolveBaseUrlForEnqueueLinksFiltering, Router, Statistics, } from '@crawlee/core';
import { extractUrlsFromCheerio, parseArgument } from '@crawlee/utils/internal';
import { z } from 'zod';
import { addTimeoutToPromise } from '@apify/timeout';
import { PlaywrightCrawler } from './playwright-crawler.js';
import { RenderingTypePredictor, } from './utils/rendering-type-prediction.js';
const adaptiveStatisticStateSchema = z.object({
    /** How many requests were handled by the HTTP-only request handler. */
    httpOnlyRequestHandlerRuns: z.number().default(0),
    /** How many requests were handled in a browser. */
    browserRequestHandlerRuns: z.number().default(0),
    /** How many times the HTTP-only handler produced a result the `resultChecker` rejected. */
    renderingTypeMispredictions: z.number().default(0),
});
/**
 * The {@apilink AdaptivePlaywrightCrawlerStatisticState} fields as a {@apilink Statistics} state extension, defaults
 * and all. A {@apilink Statistics} instance to be injected into an {@apilink AdaptivePlaywrightCrawler} has to carry
 * them - `deserialize.extend()` your own fields onto this one and pass the result as `stateExtension`.
 */
export const adaptivePlaywrightCrawlerStatisticState = {
    deserialize: adaptiveStatisticStateSchema,
};
const proxyLogMethods = [
    'error',
    'exception',
    'softFail',
    'info',
    'debug',
    'perf',
    'warningOnce',
    'deprecated',
];
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
export class AdaptivePlaywrightCrawler extends BasicCrawler {
    #renderingTypePredictor;
    #resultChecker;
    #shouldPropagateError;
    #resultComparator;
    #staticContextPipeline;
    #browserContextPipeline;
    #individualRequestHandlerTimeoutMillis;
    /**
     * The write policy of the per-attempt transactions. Defaults the request queue to `deferred`:
     * a discarded attempt's enqueues must never reach the queue.
     */
    #attemptWritePolicy;
    #teardownHooks = [];
    constructor(options = {}) {
        const { requestHandler, renderingTypeDetectionRatio = 0.1, renderingTypePredictor, resultChecker, shouldPropagateError, resultComparator, statistics, requestHandlerTimeoutSecs = 60, errorHandler, failedRequestHandler, preNavigationHooks = [], postNavigationHooks = [], extendContext, contextPipelineBuilder, transactionalStorage, ...rest } = options;
        // The user's value is replaced by `false` in the `super` call below — validate it separately,
        // wrapped in an object so the error still names the field.
        parseArgument({ transactionalStorage }, z.object({ transactionalStorage: BasicCrawler.optionsShape.transactionalStorage }), 'AdaptivePlaywrightCrawlerOptions');
        // The extra fields are only tracked if the injected instance was built with them - the types enforce that,
        // but plain JS callers would otherwise silently increment `undefined` into a sticky `NaN`. Extend
        // `adaptivePlaywrightCrawlerStatisticState` to satisfy this.
        if (statistics !== undefined) {
            parseArgument(statistics.state, z.object({
                httpOnlyRequestHandlerRuns: z.number(),
                browserRequestHandlerRuns: z.number(),
                renderingTypeMispredictions: z.number(),
            }), 'statistics.state');
        }
        // Per-attempt buffering is load-bearing here: the handler runs up to twice per request and the
        // losing attempt's writes must be discardable.
        if (transactionalStorage === false) {
            throw new Error('AdaptivePlaywrightCrawler requires transactional storage - it runs the request handler ' +
                'multiple times per request and must be able to discard the storage writes of losing ' +
                'attempts. `transactionalStorage: false` is therefore not supported; a write policy ' +
                'object is accepted and forwarded to the per-attempt transactions.');
        }
        super({
            ...rest,
            errorHandler,
            failedRequestHandler,
            requestHandler,
            requestHandlerTimeoutSecs,
            // The base would build a `Statistics` without the adaptive fields, so provide a default that has them.
            // The cast covers a `StatisticStateExtension` that adds further fields - those can only come from an
            // injected instance, in which case this default is never built.
            statistics: statistics ??
                new Statistics({
                    logMessage: `${AdaptivePlaywrightCrawler.name} request statistics:`,
                    stateExtension: adaptivePlaywrightCrawlerStatisticState,
                }),
            contextPipelineBuilder: contextPipelineBuilder ?? (() => this.buildContextPipeline()),
            // The base crawler must not wrap requests in a transaction of its own - this crawler opens
            // one per request handler attempt in `crawlOne` instead, forwarding the write policy of the
            // user-facing option (validated above) to those.
            transactionalStorage: false,
        });
        this.#individualRequestHandlerTimeoutMillis = requestHandlerTimeoutSecs * 1000;
        // `renderingTypeDetectionRatio` only configures the default predictor - an injected one brings its own
        // detection ratio (and its own state), so the option is ignored in that case.
        this.#renderingTypePredictor = OwnedOrInjected.resolve(renderingTypePredictor, () => new RenderingTypePredictor({ detectionRatio: renderingTypeDetectionRatio }));
        this.#attemptWritePolicy = {
            requestQueue: 'deferred',
            ...(typeof transactionalStorage === 'object' ? transactionalStorage : {}),
        };
        this.#resultChecker = resultChecker ?? (() => true);
        this.#shouldPropagateError = shouldPropagateError ?? (() => false);
        if (resultComparator !== undefined) {
            this.#resultComparator = resultComparator;
        }
        else if (resultChecker !== undefined) {
            this.#resultComparator = (resultA, resultB) => this.#resultChecker(resultA) && this.#resultChecker(resultB);
        }
        else {
            this.#resultComparator = (resultA, resultB) => {
                return (resultA.datasetItems.length === resultB.datasetItems.length &&
                    resultA.datasetItems.every((itemA, i) => {
                        const itemB = resultB.datasetItems[i];
                        return isDeepStrictEqual(itemA, itemB);
                    }));
            };
        }
        // `extendContext` is forwarded to the inner crawlers, which run it *before* navigation (see
        // `BasicCrawler`), keeping the behavior consistent with the non-adaptive crawlers: the
        // extension is visible to the pre/post-navigation hooks and the request handler, but cannot
        // access navigation-dependent members (`page`, `response`, `$`, ...).
        //
        // The adaptive hooks target a subset context (`AdaptiveHookContext`); the casts to the inner
        // crawlers' `PlaywrightHook` type relax that nominal difference. The `ContextPipeline` merges
        // each hook's overrides at runtime regardless of the static type.
        const staticCrawler = new CheerioCrawler({
            ...rest,
            statistics: new Statistics({ persistenceOptions: { enable: false } }),
            preNavigationHooks,
            postNavigationHooks,
            extendContext,
        });
        const browserCrawler = new PlaywrightCrawler({
            ...rest,
            statistics: new Statistics({ persistenceOptions: { enable: false } }),
            preNavigationHooks: preNavigationHooks,
            postNavigationHooks: postNavigationHooks,
            extendContext,
        });
        this.#teardownHooks.push(browserCrawler.teardown.bind(browserCrawler));
        this.#staticContextPipeline = staticCrawler.contextPipeline.compose({
            action: this.adaptCheerioContext.bind(this),
        });
        this.#browserContextPipeline = browserCrawler.contextPipeline.compose({
            action: this.adaptPlaywrightContext.bind(this),
        });
    }
    async init() {
        // Only the predictor we built ourselves is ours to initialize - an injected one is borrowed, so its
        // lifecycle (including restoring persisted state) stays with whoever created it.
        await this.#renderingTypePredictor.ifOwned((predictor) => predictor.initialize());
        return await super.init();
    }
    buildContextPipeline() {
        const errorMessage = (prop) => `The \`${prop}\` property is not available on the outer context pipeline of AdaptivePlaywrightCrawler - it is provided by the inner (static/browser) pipelines`;
        return super.buildContextPipeline().compose({
            action: async ({ request }) => ({
                get request() {
                    return request;
                },
                get response() {
                    throw new Error(errorMessage('response'));
                },
                get page() {
                    throw new Error(errorMessage('page'));
                },
                get querySelector() {
                    throw new Error(errorMessage('querySelector'));
                },
                get querySelectorAll() {
                    throw new Error(errorMessage('querySelectorAll'));
                },
                get waitForSelector() {
                    throw new Error(errorMessage('waitForSelector'));
                },
                get parseWithCheerio() {
                    throw new Error(errorMessage('parseWithCheerio'));
                },
                get enqueueLinks() {
                    throw new Error(errorMessage('enqueueLinks'));
                },
            }),
        });
    }
    async adaptCheerioContext(cheerioContext) {
        return {
            get page() {
                throw new Error('Page object was used in HTTP-only request handler');
            },
            async querySelector(selector) {
                return cheerioContext.$(selector).first();
            },
            async querySelectorAll(selector) {
                return cheerioContext.$(selector);
            },
            enqueueLinks: async (options = {}) => {
                const urls = extractUrlsFromCheerio(cheerioContext.$, options.selector, options.baseUrl ?? cheerioContext.request.loadedUrl);
                return (await this.enqueueLinks(urls, options, cheerioContext.request));
            },
            response: cheerioContext.response,
        };
    }
    async adaptPlaywrightContext(playwrightContext) {
        // Capture the original response to avoid infinite recursion when the getter is copied to the context
        const originalResponse = playwrightContext.response;
        return {
            response: new Response(Uint8Array.from(await originalResponse.body()), {
                headers: originalResponse.headers(),
                status: originalResponse.status(),
                statusText: originalResponse.statusText(),
            }),
            async querySelector(selector, timeoutMs = 5000) {
                const locator = playwrightContext.page.locator(selector).first();
                await locator.waitFor({ timeout: timeoutMs, state: 'attached' });
                const $ = await playwrightContext.parseWithCheerio();
                return $(selector).first();
            },
            async querySelectorAll(selector, timeoutMs = 5000) {
                const locator = playwrightContext.page.locator(selector).first();
                await locator.waitFor({ timeout: timeoutMs, state: 'attached' });
                const $ = await playwrightContext.parseWithCheerio();
                return $(selector);
            },
            enqueueLinks: async (options = {}, timeoutMs = 5000) => {
                // TODO consider using `context.parseWithCheerio` to make this universal and avoid code duplication
                const selector = options.selector ?? 'a';
                const locator = playwrightContext.page.locator(selector).first();
                await locator.waitFor({ timeout: timeoutMs, state: 'attached' });
                const urls = await extractUrlsFromPage(playwrightContext.page, selector, options.baseUrl ?? playwrightContext.request.loadedUrl);
                return (await this.enqueueLinks(urls, options, playwrightContext.request));
            },
        };
    }
    /**
     * Runs one request handler attempt inside its own {@apilink StorageTransaction}, wrapping the inner
     * (static or browser) context pipeline. The transaction is pushed to `transactions` *at creation
     * time, before the `try`* - the `ok: false` branch of the returned {@apilink Result} carries no
     * result, and failed attempts are routine here. The caller owns the outcome and disposal.
     */
    async crawlOne(renderingType, context, useStateFunction, transactions) {
        const transaction = createStorageTransaction({
            policy: this.#attemptWritePolicy,
            commitTimeoutMillis: this.internalTimeoutMillis,
        });
        transactions.push(transaction);
        const logs = [];
        const deferredCleanup = [];
        const attemptBoundContextHelpers = {
            useState: useStateFunction,
            log: this.createLogProxy(context.log, logs),
            registerDeferredCleanup: (cleanup) => deferredCleanup.push(cleanup),
        };
        const subCrawlerContext = Object.defineProperties({}, Object.getOwnPropertyDescriptors(context));
        // Mark attempt-bound helpers as non-configurable so they survive the sub-crawler context pipeline
        // (which would otherwise override them with the sub-crawler's own versions, losing the binding).
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(attemptBoundContextHelpers))) {
            Object.defineProperty(subCrawlerContext, key, { ...descriptor, configurable: false });
        }
        try {
            const callAdaptiveRequestHandler = async () => {
                if (renderingType === 'static') {
                    await this.#staticContextPipeline.call(subCrawlerContext, this.requestHandler.bind(this));
                }
                else if (renderingType === 'clientOnly') {
                    await this.#browserContextPipeline.call(subCrawlerContext, this.requestHandler.bind(this));
                }
            };
            // this crawler overrides `runRequestHandler` and times each rendering-type run itself, so it has
            // to resolve any per-route override too - otherwise routes would be silently ignored here
            const routeTimeoutSecs = this.requestHandler.getTimeoutSecs?.(context.request.label);
            const timeoutMillis = routeTimeoutSecs === undefined ? this.#individualRequestHandlerTimeoutMillis : routeTimeoutSecs * 1000;
            await addTimeoutToPromise(async () => transaction.run(callAdaptiveRequestHandler), timeoutMillis, 'Request handler timed out');
            return { result: transaction, ok: true, logs };
        }
        catch (error) {
            return { error, ok: false, logs };
        }
        finally {
            await Promise.all(deferredCleanup.map((cleanup) => cleanup()));
        }
    }
    async runRequestHandler(crawlingContext) {
        const renderingTypePrediction = this.#renderingTypePredictor.value.predict(crawlingContext.request);
        const shouldDetectRenderingType = Math.random() < renderingTypePrediction.detectionProbabilityRecommendation;
        if (!shouldDetectRenderingType) {
            crawlingContext.log.debug(`Predicted rendering type ${renderingTypePrediction.renderingType} for ${crawlingContext.request.url}`);
        }
        // Every transaction created for this request - up to two, since the static-then-browser
        // fall-through and the browser-then-detection pair are mutually exclusive. Disposed in the
        // `finally` below, not earlier: the comparators read the journals after `crawlOne` returns.
        const transactions = [];
        try {
            if (renderingTypePrediction.renderingType === 'static' && !shouldDetectRenderingType) {
                crawlingContext.log.debug(`Running HTTP-only request handler for ${crawlingContext.request.url}`);
                this.statistics.state.httpOnlyRequestHandlerRuns++;
                const plainHTTPRun = await this.crawlOne('static', crawlingContext, crawlingContext.useState, transactions);
                if (plainHTTPRun.ok && this.#resultChecker(plainHTTPRun.result)) {
                    crawlingContext.log.debug(`HTTP-only request handler succeeded for ${crawlingContext.request.url}`);
                    plainHTTPRun.logs?.forEach(([log, method, ...args]) => log[method](...args));
                    await plainHTTPRun.result.commit();
                    return;
                }
                // Execution will "fall through" and try running the request handler in a browser
                if (!plainHTTPRun.ok) {
                    const actualError = plainHTTPRun.error instanceof RequestHandlerError
                        ? plainHTTPRun.error.cause
                        : plainHTTPRun.error;
                    if (await this.#shouldPropagateError(actualError, crawlingContext)) {
                        throw actualError;
                    }
                    crawlingContext.log.exception(actualError, `HTTP-only request handler failed for ${crawlingContext.request.url}`);
                }
                else {
                    crawlingContext.log.warning(`HTTP-only request handler returned a suspicious result for ${crawlingContext.request.url}`);
                    this.statistics.state.renderingTypeMispredictions++;
                }
            }
            crawlingContext.log.debug(`Running browser request handler for ${crawlingContext.request.url}`);
            this.statistics.state.browserRequestHandlerRuns++;
            // Run the request handler in a browser. The copy of the crawler state is kept so that we can perform
            // a rendering type detection if necessary. Without this measure, the HTTP request handler would run
            // under different conditions, which could change its behavior. Changes done to the crawler state by
            // the HTTP request handler will not be committed to the actual storage.
            const stateTracker = {
                stateCopy: null,
                async getLiveState(defaultValue = {}) {
                    const state = await crawlingContext.useState(defaultValue);
                    if (this.stateCopy === null) {
                        this.stateCopy = JSON.parse(JSON.stringify(state));
                    }
                    return state;
                },
                async getStateCopy(defaultValue = {}) {
                    if (this.stateCopy === null) {
                        return defaultValue;
                    }
                    return this.stateCopy;
                },
            };
            const browserRun = await this.crawlOne('clientOnly', crawlingContext, stateTracker.getLiveState.bind(stateTracker), transactions);
            if (!browserRun.ok) {
                throw browserRun.error;
            }
            browserRun.logs?.forEach(([log, method, ...args]) => log[method](...args));
            await browserRun.result.commit();
            if (shouldDetectRenderingType) {
                crawlingContext.log.debug(`Detecting rendering type for ${crawlingContext.request.url}`);
                // The detection attempt's transaction is never committed - its writes exist only for the
                // result comparison.
                const plainHTTPRun = await this.crawlOne('static', crawlingContext, stateTracker.getStateCopy.bind(stateTracker), transactions);
                const detectionResult = (() => {
                    if (!plainHTTPRun.ok) {
                        return 'clientOnly';
                    }
                    const comparisonResult = this.#resultComparator(plainHTTPRun.result, browserRun.result);
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
                    this.#renderingTypePredictor.value.storeResult(crawlingContext.request, detectionResult);
                }
            }
        }
        finally {
            // A still-open transaction here belongs to a discarded attempt - roll it back, then release.
            for (const transaction of transactions) {
                transaction.rollback();
                transaction.dispose();
            }
        }
    }
    async enqueueLinks(urls, options, request) {
        const baseUrl = resolveBaseUrlForEnqueueLinksFiltering({
            enqueueStrategy: options?.strategy,
            finalRequestUrl: request.loadedUrl,
            originalRequestUrl: request.url,
            userProvidedBaseUrl: options?.baseUrl,
        });
        const requestsWithDepth = this.addCrawlDepthRequestGenerator(urls, request.crawlDepth + 1);
        // The per-attempt transaction buffers these (the queue policy defaults to `deferred` here),
        // so a discarded attempt's enqueues never reach the queue.
        return await this.addRequests(requestsWithDepth, {
            ...options,
            baseUrl,
            strategy: options.strategy ?? EnqueueStrategy.SameHostname,
        });
    }
    createLogProxy(log, logs) {
        return new Proxy(log, {
            get(target, propertyName, receiver) {
                if (proxyLogMethods.includes(propertyName)) {
                    return (...args) => {
                        logs.push([target, propertyName, ...args]);
                    };
                }
                return Reflect.get(target, propertyName, receiver);
            },
        });
    }
    async teardown() {
        await super.teardown();
        // Mirrors the owned-only `initialize()` in `init()` - without this, the predictor we built keeps its
        // PERSIST_STATE listener registered after the crawl and never gets a final write.
        await this.#renderingTypePredictor.ifOwned((predictor) => predictor.teardown());
        for (const hook of this.#teardownHooks) {
            await hook();
        }
    }
}
export function createAdaptivePlaywrightRouter(routesOrSchemas) {
    return Router.create(routesOrSchemas);
}
/**
 * An opt-in {@apilink AdaptivePlaywrightCrawlerOptions.resultComparator|`resultComparator`} that considers two
 * request handler results equal only if *all* of their observable effects match - the pushed dataset items, the
 * enqueued requests, and the key-value store changes. This is stricter than the default comparator, which only
 * compares dataset items.
 *
 * **Beware:** enqueued URLs are compared exactly. The same page rendered in a browser and via plain HTTP often
 * yields links that differ only in tracking query parameters, for example:
 * - `https://sdk.apify.com/docs/guides/getting-started`
 * - `https://sdk.apify.com/docs/guides/getting-started?__hsfp=1136113150&__hssc=7591405.1.173549427712`
 *
 * Such links are treated as *different*, which will make the crawler favor browser rendering for those pages.
 *
 * **Example usage:**
 * ```ts
 * const crawler = new AdaptivePlaywrightCrawler({
 *     resultComparator: fullResultComparator,
 *     async requestHandler({ pushData, enqueueLinks }) {
 *         // ...
 *     },
 * });
 * ```
 */
export function fullResultComparator(resultA, resultB) {
    return (isDeepStrictEqual(resultA.datasetItems, resultB.datasetItems) &&
        isDeepStrictEqual(resultA.enqueuedUrls, resultB.enqueuedUrls) &&
        isDeepStrictEqual(resultA.keyValueStoreChanges, resultB.keyValueStoreChanges));
}
