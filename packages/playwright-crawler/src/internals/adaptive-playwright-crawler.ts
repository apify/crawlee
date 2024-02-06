import { addTimeoutToPromise } from '@apify/timeout';
import { BasicCrawler } from '@crawlee/basic';
import type { Source, Configuration, RecordOptions, RestrictedCrawlingContext } from '@crawlee/core';
import { KeyValueStore } from '@crawlee/core';
import type { Awaitable, Dictionary } from '@crawlee/types';
import { extractUrlsFromCheerio } from '@crawlee/utils';
import type { Cheerio, Document } from 'cheerio';
import { load } from 'cheerio';
import { cheerioPortadom, playwrightLocatorPortadom, type CheerioPortadom, type PlaywrightLocatorPortadom } from 'portadom';

import type { PlaywrightCrawlerOptions, PlaywrightCrawlingContext } from './playwright-crawler';
import { PlaywrightCrawler } from './playwright-crawler';
import { RenderingTypePredictor, type RenderingType } from './rendering-type-prediction';

type Result<TResult> = NonNullable<{result: TResult; ok: true} | {error: unknown; ok: false}>

class RequestHandlerResult {
    datasetItems: {item: Dictionary; datasetIdOrName?: string}[] = [];
    requestListUrls: {url?: string; label?: string; request: Source; options: Parameters<RestrictedCrawlingContext['addRequests']>[1]}[] = [];
    requestUrls: {url?: string; label?: string; request: Source; options: Parameters<RestrictedCrawlingContext['addRequests']>[1]}[] = [];
    enqueuedUrls: {url?: string; label?: string; options: Parameters<RestrictedCrawlingContext['enqueueLinks']>[0]}[] = [];
    keyValueStoreChanges: Record<string, Record<string, {changedValue: unknown; options?: RecordOptions}>> = {};

    constructor(private config: Configuration) {}

    pushData: RestrictedCrawlingContext['pushData'] = async (data, datasetIdOrName) => {
        this.datasetItems.push(...(Array.isArray(data) ? data : [data]).map((item) => ({ item, datasetIdOrName })));
    };

    enqueueLinks: RestrictedCrawlingContext['enqueueLinks'] = async (options) => {
        this.enqueuedUrls.push(...(options?.urls?.map((url) => ({ url, label: options.label, options })) ?? []));
    };

    addRequests: RestrictedCrawlingContext['addRequests'] = async (requests, options = {}) => {
        for (const request of requests) {
            if (typeof request === 'object' && 'requestsFromUrl' in request) {
                this.requestListUrls.push({ url: request.url, label: request.label, request, options });
            } else if (typeof request === 'string') {
                this.requestUrls.push({ url: request, request: { url: request }, options });
            } else {
                this.requestUrls.push({ url: request.url, label: request.label, request, options });
            }
        }
    };

    useState: RestrictedCrawlingContext['useState'] = async (defaultValue) => {
        // @ts-ignore
        const key = BasicCrawler.CRAWLEE_STATE_KEY;
        const store = await this.getKeyValueStore(undefined);

        return await store.getAutoSavedValue(key, defaultValue);
    };

    private idOrDefault = (idOrName?: string): string => idOrName ?? this.config.get('defaultKeyValueStoreId');

    private getKeyValueStoreChangedValue = (idOrName: string | undefined, key: string) => {
        const id = this.idOrDefault(idOrName);
        this.keyValueStoreChanges[id] ??= {};
        return this.keyValueStoreChanges[id][key]?.changedValue ?? null;
    };

    private setKeyValueStoreChangedValue = (idOrName: string | undefined, key: string, changedValue: unknown, options?: RecordOptions) => {
        const id = this.idOrDefault(idOrName);
        this.keyValueStoreChanges[id] ??= {};
        this.keyValueStoreChanges[id][key] = { changedValue, options };
    };

    getKeyValueStore: RestrictedCrawlingContext['getKeyValueStore'] = async (idOrName) => {
        const store = await KeyValueStore.open(idOrName, { config: this.config });

        return {
            id: this.idOrDefault(idOrName),
            name: idOrName,
            getValue: async (key) => this.getKeyValueStoreChangedValue(idOrName, key) ?? await store.getValue(key),
            getAutoSavedValue: async <T extends Dictionary = Dictionary>(key: string, defaultValue: T = {} as T) => {
                let value = this.getKeyValueStoreChangedValue(idOrName, key);
                if (value === null) {
                    value = await store.getValue(key) ?? defaultValue;
                    this.setKeyValueStoreChangedValue(idOrName, key, value);
                }

                return value as T;
            },
            setValue: async (key, value, options) => {
                this.setKeyValueStoreChangedValue(idOrName, key, value, options);
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

    protected async commitResult(
        crawlingContext: PlaywrightCrawlingContext<Dictionary>,
        { datasetItems, enqueuedUrls, requestUrls, requestListUrls, keyValueStoreChanges } : RequestHandlerResult,
    ): Promise<void> {
        await Promise.all([
            ...datasetItems.map(async ({ item, datasetIdOrName }) => crawlingContext.pushData(item, datasetIdOrName)),
            ...enqueuedUrls.map(async ({ options }) => crawlingContext.enqueueLinks(options)),
            ...requestUrls.map(async ({ request, options }) => crawlingContext.addRequests([request], options)),
            ...requestListUrls.map(async ({ request, options }) => crawlingContext.addRequests([request], options)),
            ...Object.entries(keyValueStoreChanges).map(async ([storeIdOrName, changes]) => {
                const store = await crawlingContext.getKeyValueStore(storeIdOrName);
                await Promise.all(
                    Object.entries(changes).map(async ([key, { changedValue, options }]) => store.setValue(key, changedValue, options)),
                );
            }),
        ]);
    }

    protected async runRequestHandlerInBrowser(crawlingContext: PlaywrightCrawlingContext<Dictionary>): Promise<Result<RequestHandlerResult>> {
        const result = new RequestHandlerResult(this.config);
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
        const result = new RequestHandlerResult(this.config);

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
