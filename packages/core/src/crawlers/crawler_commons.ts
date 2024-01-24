import type { Dictionary, BatchAddRequestsResult } from '@crawlee/types';
// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { Response as GotResponse, OptionsInit } from 'got-scraping';

import type { EnqueueLinksOptions } from '../enqueue_links/enqueue_links';
import type { Log } from '../log';
import type { ProxyInfo } from '../proxy_configuration';
import type { Request, Source } from '../request';
import type { Session } from '../session_pool/session';
import type { RequestQueueOperationOptions, Dataset, KeyValueStore } from '../storages';

// eslint-disable-next-line @typescript-eslint/ban-types
export interface RestrictedCrawlingContext<UserData extends Dictionary = Dictionary> extends Record<string & {}, unknown>{
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
    pushData(data: Parameters<Dataset['pushData']>[0], datasetIdOrName?: string): Promise<void>;

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
    enqueueLinks: (options?: Omit<EnqueueLinksOptions, 'requestQueue'>) => Promise<unknown>;

    /**
     * Add requests directly to the request queue.
     *
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    addRequests: (
        requestsLike: Source[],
        options?: RequestQueueOperationOptions,
    ) => Promise<void>;

    /**
     * Returns the state - a piece of mutable persistent data shared across all the request handler runs.
     */
    useState: <State extends Dictionary = Dictionary>(defaultValue?: State) => Promise<State>;

    /**
     * Get a key-value store with given name or id, or the default one for the crawler.
     */
    getKeyValueStore: (idOrName?: string) => Promise<Pick<KeyValueStore, 'id' | 'name' | 'getValue' | 'getAutoSavedValue' | 'setValue'>>;

    /**
     * A preconfigured logger for the request handler.
     */
    log: Log;
}

export interface CrawlingContext<Crawler = unknown, UserData extends Dictionary = Dictionary> extends RestrictedCrawlingContext<UserData> {
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
    enqueueLinks(options?: EnqueueLinksOptions): Promise<BatchAddRequestsResult>;

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
