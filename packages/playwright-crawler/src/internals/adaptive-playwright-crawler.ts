import { addTimeoutToPromise } from '@apify/timeout';
import { BasicCrawler } from '@crawlee/basic';
import type { Configuration, RecordOptions, RestrictedCrawlingContext } from '@crawlee/core';
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
    private _keyValueStoreChanges: Record<string, Record<string, {changedValue: unknown; options?: RecordOptions}>> = {};
    private pushDataCalls: Parameters<RestrictedCrawlingContext['pushData']>[] = [];
    private addRequestsCalls: Parameters<RestrictedCrawlingContext['addRequests']>[] = [];
    private enqueueLinksCalls: Parameters<RestrictedCrawlingContext['enqueueLinks']>[] = [];

    constructor(private config: Configuration) {}

    get datasetItems() {
        return this.pushDataCalls.flatMap(([data, datasetIdOrName]) => (Array.isArray(data) ? data : [data]).map((item) => ({ item, datasetIdOrName })));
    }

    get calls(): {
        pushData: Parameters<RestrictedCrawlingContext['pushData']>[];
        addRequests: Parameters<RestrictedCrawlingContext['addRequests']>[];
        enqueueLinks: Parameters<RestrictedCrawlingContext['enqueueLinks']>[];
        } {
        return { pushData: this.pushDataCalls, addRequests: this.addRequestsCalls, enqueueLinks: this.enqueueLinksCalls };
    }

    get keyValueStoreChanges(): Record<string, Record<string, {changedValue: unknown; options?: RecordOptions}>> {
        return this._keyValueStoreChanges;
    }

    get enqueuedUrls(): {url: string; label?: string}[] {
        const result: {url: string; label? : string}[] = [];

        for (const [options] of this.enqueueLinksCalls) {
            result.push(...(options?.urls?.map((url) => ({ url, label: options?.label })) ?? []));
        }

        for (const [requests] of this.addRequestsCalls) {
            for (const request of requests) {
                if (typeof request === 'object' && (!('requestsFromUrl' in request) || request.requestsFromUrl !== undefined) && request.url !== undefined) {
                    result.push({ url: request.url, label: request.label });
                } else if (typeof request === 'string') {
                    result.push({ url: request });
                }
            }
        }

        return result;
    }

    get enqueuedUrlLists(): {listUrl: string; label? : string}[] {
        const result: {listUrl: string; label? : string}[] = [];

        for (const [requests] of this.addRequestsCalls) {
            for (const request of requests) {
                if (typeof request === 'object' && 'requestsFromUrl' in request && request.requestsFromUrl !== undefined) {
                    result.push({ listUrl: request.requestsFromUrl, label: request.label });
                }
            }
        }

        return result;
    }

    pushData: RestrictedCrawlingContext['pushData'] = async (data, datasetIdOrName) => {
        this.pushDataCalls.push([data, datasetIdOrName]);
    };

    enqueueLinks: RestrictedCrawlingContext['enqueueLinks'] = async (options) => {
        this.enqueueLinksCalls.push([options]);
    };

    addRequests: RestrictedCrawlingContext['addRequests'] = async (requests, options = {}) => {
        this.addRequestsCalls.push([requests, options]);
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
        this._keyValueStoreChanges[id] ??= {};
        return this.keyValueStoreChanges[id][key]?.changedValue ?? null;
    };

    private setKeyValueStoreChangedValue = (idOrName: string | undefined, key: string, changedValue: unknown, options?: RecordOptions) => {
        const id = this.idOrDefault(idOrName);
        this._keyValueStoreChanges[id] ??= {};
        this._keyValueStoreChanges[id][key] = { changedValue, options };
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
        const result = new RequestHandlerResult(this.config);

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
                                    const $ = await playwrightContext.parseWithCheerio();
                                    const urls = extractUrlsFromCheerio($, options.selector, playwrightContext.request.loadedUrl); // TODO avoid parsing with cheerio
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
        const result = new RequestHandlerResult(this.config);

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
