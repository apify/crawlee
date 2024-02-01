import { addTimeoutToPromise } from '@apify/timeout';
import { extractUrlsFromCheerio } from '@crawlee/utils';
import type { Cheerio, Document } from 'cheerio';
import { load } from 'cheerio';
import { cheerioPortadom, playwrightLocatorPortadom, type CheerioPortadom, type PlaywrightLocatorPortadom } from 'portadom';

import type { PlaywrightCrawlerOptions, PlaywrightCrawlingContext } from './playwright-crawler';
import { PlaywrightCrawler } from './playwright-crawler';
import { RenderingTypePredictor, type RenderingType } from './rendering-type-prediction';
import type { Awaitable, Dictionary, RestrictedCrawlingContext } from '..';

type Result<TResult> = NonNullable<{result: TResult; ok: true} | {error: unknown; ok: false}>

class RequestHandlerResult {
    pushData: RestrictedCrawlingContext['pushData'] = async (data, datasetIdOrName) => {

    };

    enqueueLinks: RestrictedCrawlingContext['enqueueLinks'] = async (options) => {

    };

    addRequests: RestrictedCrawlingContext['addRequests'] = async (requests, options) => {

    };

    useState: RestrictedCrawlingContext['useState'] = async (defaultValue) => {

    };

    getKeyValueStore: RestrictedCrawlingContext['getKeyValueStore'] = async (idOrName) => {
        return {
            id: idOrName,
            name: idOrName,
            getValue: (key) => {},
            getAutoSavedValue: (key, defaultValue) => {},
            setValue: (key, value, options) => {

            },
        };
    };
}

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
    private _requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'];
    private renderingTypePredictor: RenderingTypePredictor;
    private resultChecker: NonNullable<AdaptivePlaywrightCrawlerOptions['resultChecker']>;
    private resultComparator: NonNullable<AdaptivePlaywrightCrawlerOptions['resultComparator']>;

    constructor({ requestHandler, renderingTypeDetectionRatio, resultChecker, resultComparator, ...options }: AdaptivePlaywrightCrawlerOptions) {
        super({
            ...options,
            requestHandler: async (context) => {
                await this._requestHandler({ ...context, dom: playwrightLocatorPortadom(context.page.locator(':root'), context.page) });
            },
        });
        this._requestHandler = requestHandler;
        this.renderingTypePredictor = new RenderingTypePredictor({ detectionRatio: renderingTypeDetectionRatio });
        this.resultChecker = resultChecker ?? (() => true);
        this.resultComparator = resultComparator ?? (() => true); // TODO
    }

    protected override async _runRequestHandler(crawlingContext: PlaywrightCrawlingContext<Dictionary>): Promise<void> {
        const url = new URL(crawlingContext.request.loadedUrl ?? crawlingContext.request.url);

        const renderingTypePrediction = this.renderingTypePredictor.predict(url);
        const shouldDetectRenderingType = Math.random() < renderingTypePrediction.detectionProbabilityRecommendation;

        if (!shouldDetectRenderingType) {
            crawlingContext.log.info(`Predicted rendering type ${renderingTypePrediction} for ${crawlingContext.request.url}`);
        }

        if (renderingTypePrediction.renderingType === 'static' || !shouldDetectRenderingType) {
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
            this.renderingTypePredictor.storeResult(url, detectionResult);
        }
    }

    protected async commitResult(crawlingContext: PlaywrightCrawlingContext<Dictionary>, result: RequestHandlerResult): Promise<void> {

    }

    protected async runRequestHandlerInBrowser(crawlingContext: PlaywrightCrawlingContext<Dictionary>): Promise<Result<RequestHandlerResult>> {
        const result = new RequestHandlerResult();
        const instrumentedContext = {
            ...crawlingContext,
            pushData: result.pushData,
            enqueueLinks: result.enqueueLinks,
            addRequests: result.addRequests,
            useState: result.useState,
            getKeyValueStore: result.getKeyValueStore,
        };
        try {
            await (super._runRequestHandler as (context: RestrictedCrawlingContext) => Promise<void>)(instrumentedContext);
            return { result, ok: true };
        } catch (error) {
            return { error, ok: false };
        }
    }

    protected async runRequestHandlerWithPlainHTTP(crawlingContext: PlaywrightCrawlingContext<Dictionary>): Promise<Result<RequestHandlerResult>> {
        const result = new RequestHandlerResult();

        const response = await crawlingContext.sendRequest({});
        const loadedUrl = response.url;
        const $ = load(response.body);

        try {
            await addTimeoutToPromise(
                async () => Promise.resolve(
                    this._requestHandler({
                        request: { ...crawlingContext.request, loadedUrl } as any,
                        log: crawlingContext.log,
                        dom: cheerioPortadom($.root(), response.url),
                        enqueueLinks: async (options: Parameters<RestrictedCrawlingContext['enqueueLinks']>[0] = {}) => {
                            const urls = extractUrlsFromCheerio($, options.selector, loadedUrl);
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
