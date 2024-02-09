import { addTimeoutToPromise } from '@apify/timeout';
import { extractUrlsFromPage } from '@crawlee/browser';
import type { RestrictedCrawlingContext } from '@crawlee/core';
import { RequestHandlerResult } from '@crawlee/core';
import type { Awaitable, Dictionary } from '@crawlee/types';
import { extractUrlsFromCheerio } from '@crawlee/utils';
import type { Cheerio, Document } from 'cheerio';
import { load } from 'cheerio';
import { cheerioPortadom, playwrightLocatorPortadom, type CheerioPortadom, type PlaywrightLocatorPortadom } from 'portadom';

import type { PlaywrightCrawlerOptions, PlaywrightCrawlingContext } from './playwright-crawler';
import { PlaywrightCrawler } from './playwright-crawler';
import { RenderingTypePredictor, type RenderingType } from './utils/rendering-type-prediction';

type Result<TResult> = {result: TResult; ok: true} | {error: unknown; ok: false}

interface AdaptivePlaywrightCrawlerContext extends RestrictedCrawlingContext {
    dom: CheerioPortadom<Cheerio<Document>> | PlaywrightLocatorPortadom;
}

interface AdaptivePlaywrightCrawlerOptions extends Omit<PlaywrightCrawlerOptions, 'requestHandler'> {
    requestHandler: (crawlingContext: AdaptivePlaywrightCrawlerContext) => Awaitable<void>;
    renderingTypeDetectionRatio: number;
    resultChecker?: (result: RequestHandlerResult) => boolean;
    resultComparator?: (resultA: RequestHandlerResult, resultB: RequestHandlerResult) => boolean;
}

export class AdaptivePlaywrightCrawler extends PlaywrightCrawler {
    private adaptiveRequestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'];
    private renderingTypePredictor: RenderingTypePredictor;
    private resultChecker: NonNullable<AdaptivePlaywrightCrawlerOptions['resultChecker']>;
    private resultComparator: NonNullable<AdaptivePlaywrightCrawlerOptions['resultComparator']>;

    constructor({ requestHandler, renderingTypeDetectionRatio, resultChecker, resultComparator, ...options }: AdaptivePlaywrightCrawlerOptions) {
        super(options);
        this.adaptiveRequestHandler = requestHandler;
        this.renderingTypePredictor = new RenderingTypePredictor({ detectionRatio: renderingTypeDetectionRatio });
        this.resultChecker = resultChecker ?? (() => true);
        this.resultComparator = resultComparator ?? (() => true); // TODO
    }

    protected override async _runRequestHandler(crawlingContext: PlaywrightCrawlingContext<Dictionary>): Promise<void> {
        const url = new URL(crawlingContext.request.loadedUrl ?? crawlingContext.request.url);

        const renderingTypePrediction = this.renderingTypePredictor.predict(url, crawlingContext.request.label);
        const shouldDetectRenderingType = Math.random() < renderingTypePrediction.detectionProbabilityRecommendation;

        if (!shouldDetectRenderingType) {
            crawlingContext.log.info(`Predicted rendering type ${renderingTypePrediction.renderingType} for ${crawlingContext.request.url}`);
        }

        if (renderingTypePrediction.renderingType === 'static' && !shouldDetectRenderingType) {
            crawlingContext.log.info(`Running HTTP-only request handler for ${crawlingContext.request.url}`);

            const plainHTTPRun = await this.runRequestHandlerWithPlainHTTP(crawlingContext);

            if (plainHTTPRun.ok && this.resultChecker(plainHTTPRun.result)) {
                crawlingContext.log.info(`HTTP-only request handler succeeded for ${crawlingContext.request.url}`);
                await this.commitResult(crawlingContext, plainHTTPRun.result);
                return;
            } if (!plainHTTPRun.ok) {
                crawlingContext.log.exception(plainHTTPRun.error as Error, `HTTP-only request handler failed for ${crawlingContext.request.url}`);
            } else {
                crawlingContext.log.warning(`HTTP-only request handler returned a suspicious result for ${crawlingContext.request.url}`);
            }
        }

        crawlingContext.log.info(`Running browser request handler for ${crawlingContext.request.url}`);
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
                    Object.entries(changes).map(async ([key, { changedValue, options }]) => store.setValue(key, changedValue, options)),
                );
            }),
        ]);
    }

    protected async runRequestHandlerInBrowser(crawlingContext: PlaywrightCrawlingContext<Dictionary>): Promise<Result<RequestHandlerResult>> {
        const result = new RequestHandlerResult(this.config, AdaptivePlaywrightCrawler.CRAWLEE_STATE_KEY);

        try {
            await super._runRequestHandler.call(
                new Proxy(this, {
                    get: (target, propertyName, receiver) => {
                        if (propertyName === 'userProvidedRequestHandler') {
                            return (playwrightContext: PlaywrightCrawlingContext) => this.adaptiveRequestHandler({
                                request: crawlingContext.request,
                                log: crawlingContext.log,
                                dom: playwrightLocatorPortadom(playwrightContext.page.locator(':root'), playwrightContext.page),
                                enqueueLinks: async (options = {}) => {
                                    const urls = await extractUrlsFromPage(
                                        playwrightContext.page,
                                        options.selector ?? 'a',
                                        options.baseUrl ?? playwrightContext.request.loadedUrl ?? playwrightContext.request.url,
                                    );
                                    await result.enqueueLinks({ ...options, urls });
                                },
                                addRequests: playwrightContext.addRequests,
                                pushData: playwrightContext.pushData,
                                useState: playwrightContext.useState,
                                getKeyValueStore: playwrightContext.getKeyValueStore,
                            });
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

    protected async runRequestHandlerWithPlainHTTP(crawlingContext: PlaywrightCrawlingContext<Dictionary>): Promise<Result<RequestHandlerResult>> {
        const result = new RequestHandlerResult(this.config, AdaptivePlaywrightCrawler.CRAWLEE_STATE_KEY);

        const response = await crawlingContext.sendRequest({});
        const loadedUrl = response.url;
        const $ = load(response.body);

        crawlingContext.request.loadedUrl = loadedUrl;

        try {
            await addTimeoutToPromise(
                async () => Promise.resolve(
                    this.adaptiveRequestHandler({
                        request: crawlingContext.request,
                        log: crawlingContext.log,
                        dom: cheerioPortadom($.root(), response.url),
                        enqueueLinks: async (options: Parameters<RestrictedCrawlingContext['enqueueLinks']>[0] = {}) => {
                            const urls = extractUrlsFromCheerio($, options.selector, options.baseUrl ?? loadedUrl);
                            await result.enqueueLinks({ ...options, urls });
                        },
                        addRequests: result.addRequests,
                        pushData: result.pushData,
                        useState: result.useState,
                        getKeyValueStore: result.getKeyValueStore,
                    }),
                ),
                this.requestHandlerTimeoutInnerMillis,
                'Request handler timed out',
            );

            return { result, ok: true };
        } catch (error) {
            return { error, ok: false };
        }
    }
}
