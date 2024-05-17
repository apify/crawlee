import type { Dictionary, BatchAddRequestsResult } from '@crawlee/types';
// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { Response as GotResponse, OptionsInit } from 'got-scraping';
import type { ReadonlyDeep } from 'type-fest';

import type { Configuration } from '../configuration';
import type { EnqueueLinksOptions } from '../enqueue_links/enqueue_links';
import type { Log } from '../log';
import type { ProxyInfo } from '../proxy_configuration';
import type { Request, Source } from '../request';
import type { Session } from '../session_pool/session';
import type { RequestQueueOperationOptions, Dataset, RecordOptions } from '../storages';
import { KeyValueStore } from '../storages';

// we need `Record<string & {}, unknown>` here, otherwise `Omit<Context>` is resolved badly
// eslint-disable-next-line
export interface RestrictedCrawlingContext<UserData extends Dictionary = Dictionary>
    extends Record<string & {}, unknown> {
    /**
     * The original {@apilink Request} object.
     */
    request: Request<UserData>;

    /**
     * This function allows you to push data to a {@apilink Dataset} specified by name, or the one currently used by the crawler.
     *
     * Shortcut for `crawler.pushData()`.
     *
     * @param [data] Data to be pushed to the default dataset.
     */
    pushData(data: ReadonlyDeep<Parameters<Dataset['pushData']>[0]>, datasetIdOrName?: string): Promise<void>;

    /**
     * This function automatically finds and enqueues links from the current page, adding them to the {@apilink RequestQueue}
     * currently used by the crawler.
     *
     * Optionally, the function allows you to filter the target links' URLs using an array of globs or regular expressions
     * and override settings of the enqueued {@apilink Request} objects.
     *
     * Check out the [Crawl a website with relative links](https://crawlee.dev/docs/examples/crawl-relative-links) example
     * for more details regarding its usage.
     *
     * **Example usage**
     *
     * ```ts
     * async requestHandler({ enqueueLinks }) {
     *     await enqueueLinks({
     *       globs: [
     *           'https://www.example.com/handbags/*',
     *       ],
     *     });
     * },
     * ```
     *
     * @param [options] All `enqueueLinks()` parameters are passed via an options object.
     */
    enqueueLinks: (options?: ReadonlyDeep<Omit<EnqueueLinksOptions, 'requestQueue'>>) => Promise<unknown>;

    /**
     * Add requests directly to the request queue.
     *
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    addRequests: (
        requestsLike: ReadonlyDeep<(string | Source)[]>,
        options?: ReadonlyDeep<RequestQueueOperationOptions>,
    ) => Promise<void>;

    /**
     * Returns the state - a piece of mutable persistent data shared across all the request handler runs.
     */
    useState: <State extends Dictionary = Dictionary>(defaultValue?: State) => Promise<State>;

    /**
     * Get a key-value store with given name or id, or the default one for the crawler.
     */
    getKeyValueStore: (
        idOrName?: string,
    ) => Promise<Pick<KeyValueStore, 'id' | 'name' | 'getValue' | 'getAutoSavedValue' | 'setValue'>>;

    /**
     * A preconfigured logger for the request handler.
     */
    log: Log;
}

export interface CrawlingContext<Crawler = unknown, UserData extends Dictionary = Dictionary>
    extends RestrictedCrawlingContext<UserData> {
    id: string;
    session?: Session;

    /**
     * An object with information about currently used proxy by the crawler
     * and configured by the {@apilink ProxyConfiguration} class.
     */
    proxyInfo?: ProxyInfo;

    crawler: Crawler;

    /**
     * This function automatically finds and enqueues links from the current page, adding them to the {@apilink RequestQueue}
     * currently used by the crawler.
     *
     * Optionally, the function allows you to filter the target links' URLs using an array of globs or regular expressions
     * and override settings of the enqueued {@apilink Request} objects.
     *
     * Check out the [Crawl a website with relative links](https://crawlee.dev/docs/examples/crawl-relative-links) example
     * for more details regarding its usage.
     *
     * **Example usage**
     *
     * ```ts
     * async requestHandler({ enqueueLinks }) {
     *     await enqueueLinks({
     *       globs: [
     *           'https://www.example.com/handbags/*',
     *       ],
     *     });
     * },
     * ```
     *
     * @param [options] All `enqueueLinks()` parameters are passed via an options object.
     * @returns Promise that resolves to {@apilink BatchAddRequestsResult} object.
     */
    enqueueLinks(
        options?: ReadonlyDeep<Omit<EnqueueLinksOptions, 'requestQueue'>> & Pick<EnqueueLinksOptions, 'requestQueue'>,
    ): Promise<BatchAddRequestsResult>;

    /**
     * Get a key-value store with given name or id, or the default one for the crawler.
     */
    getKeyValueStore: (idOrName?: string) => Promise<KeyValueStore>;

    /**
     * Fires HTTP request via [`got-scraping`](https://crawlee.dev/docs/guides/got-scraping), allowing to override the request
     * options on the fly.
     *
     * This is handy when you work with a browser crawler but want to execute some requests outside it (e.g. API requests).
     * Check the [Skipping navigations for certain requests](https://crawlee.dev/docs/examples/skip-navigation) example for
     * more detailed explanation of how to do that.
     *
     * ```ts
     * async requestHandler({ sendRequest }) {
     *     const { body } = await sendRequest({
     *         // override headers only
     *         headers: { ... },
     *     });
     * },
     * ```
     */
    sendRequest<Response = string>(overrideOptions?: Partial<OptionsInit>): Promise<GotResponse<Response>>;
}

/**
 * A partial implementation of {@apilink RestrictedCrawlingContext} that stores parameters of calls to context methods for later inspection.
 *
 * @experimental
 */
export class RequestHandlerResult {
    private _keyValueStoreChanges: Record<string, Record<string, { changedValue: unknown; options?: RecordOptions }>> =
        {};
    private pushDataCalls: Parameters<RestrictedCrawlingContext['pushData']>[] = [];
    private addRequestsCalls: Parameters<RestrictedCrawlingContext['addRequests']>[] = [];
    private enqueueLinksCalls: Parameters<RestrictedCrawlingContext['enqueueLinks']>[] = [];

    constructor(
        private config: Configuration,
        private crawleeStateKey: string,
    ) {}

    /**
     * A record of calls to {@apilink RestrictedCrawlingContext.pushData}, {@apilink RestrictedCrawlingContext.addRequests}, {@apilink RestrictedCrawlingContext.enqueueLinks} made by a request handler.
     */
    get calls(): ReadonlyDeep<{
        pushData: Parameters<RestrictedCrawlingContext['pushData']>[];
        addRequests: Parameters<RestrictedCrawlingContext['addRequests']>[];
        enqueueLinks: Parameters<RestrictedCrawlingContext['enqueueLinks']>[];
    }> {
        return {
            pushData: this.pushDataCalls,
            addRequests: this.addRequestsCalls,
            enqueueLinks: this.enqueueLinksCalls,
        };
    }

    /**
     * A record of changes made to key-value stores by a request handler.
     */
    get keyValueStoreChanges(): ReadonlyDeep<
        Record<string, Record<string, { changedValue: unknown; options?: RecordOptions }>>
    > {
        return this._keyValueStoreChanges;
    }

    /**
     * Items added to datasets by a request handler.
     */
    get datasetItems(): ReadonlyDeep<{ item: Dictionary; datasetIdOrName?: string }[]> {
        return this.pushDataCalls.flatMap(([data, datasetIdOrName]) =>
            (Array.isArray(data) ? data : [data]).map((item) => ({ item, datasetIdOrName })),
        );
    }

    /**
     * URLs enqueued to the request queue by a request handler, either via {@apilink RestrictedCrawlingContext.addRequests} or {@apilink RestrictedCrawlingContext.enqueueLinks}
     */
    get enqueuedUrls(): ReadonlyDeep<{ url: string; label?: string }[]> {
        const result: { url: string; label?: string }[] = [];

        for (const [options] of this.enqueueLinksCalls) {
            result.push(...(options?.urls?.map((url) => ({ url, label: options?.label })) ?? []));
        }

        for (const [requests] of this.addRequestsCalls) {
            for (const request of requests) {
                if (
                    typeof request === 'object' &&
                    (!('requestsFromUrl' in request) || request.requestsFromUrl !== undefined) &&
                    request.url !== undefined
                ) {
                    result.push({ url: request.url, label: request.label });
                } else if (typeof request === 'string') {
                    result.push({ url: request });
                }
            }
        }

        return result;
    }

    /**
     * URL lists enqueued to the request queue by a request handler via {@apilink RestrictedCrawlingContext.addRequests} using the `requestsFromUrl` option.
     */
    get enqueuedUrlLists(): ReadonlyDeep<{ listUrl: string; label?: string }[]> {
        const result: { listUrl: string; label?: string }[] = [];

        for (const [requests] of this.addRequestsCalls) {
            for (const request of requests) {
                if (
                    typeof request === 'object' &&
                    'requestsFromUrl' in request &&
                    request.requestsFromUrl !== undefined
                ) {
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
        const store = await this.getKeyValueStore(undefined);
        return await store.getAutoSavedValue(this.crawleeStateKey, defaultValue);
    };

    getKeyValueStore: RestrictedCrawlingContext['getKeyValueStore'] = async (idOrName) => {
        const store = await KeyValueStore.open(idOrName, { config: this.config });

        return {
            id: this.idOrDefault(idOrName),
            name: idOrName,
            getValue: async (key) => this.getKeyValueStoreChangedValue(idOrName, key) ?? (await store.getValue(key)),
            getAutoSavedValue: async <T extends Dictionary = Dictionary>(key: string, defaultValue: T = {} as T) => {
                let value = this.getKeyValueStoreChangedValue(idOrName, key);
                if (value === null) {
                    value = (await store.getValue(key)) ?? defaultValue;
                    this.setKeyValueStoreChangedValue(idOrName, key, value);
                }

                return value as T;
            },
            setValue: async (key, value, options) => {
                this.setKeyValueStoreChangedValue(idOrName, key, value, options);
            },
        };
    };

    private idOrDefault = (idOrName?: string): string => idOrName ?? this.config.get('defaultKeyValueStoreId');

    private getKeyValueStoreChangedValue = (idOrName: string | undefined, key: string) => {
        const id = this.idOrDefault(idOrName);
        this._keyValueStoreChanges[id] ??= {};
        return this.keyValueStoreChanges[id][key]?.changedValue ?? null;
    };

    private setKeyValueStoreChangedValue = (
        idOrName: string | undefined,
        key: string,
        changedValue: unknown,
        options?: RecordOptions,
    ) => {
        const id = this.idOrDefault(idOrName);
        this._keyValueStoreChanges[id] ??= {};
        this._keyValueStoreChanges[id][key] = { changedValue, options };
    };
}
