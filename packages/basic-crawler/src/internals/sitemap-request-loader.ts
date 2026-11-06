import { Transform } from 'node:stream';

import type { BaseHttpClient } from '@crawlee/http-client';
import type { ParseSitemapOptions } from '@crawlee/utils';
import { EnqueueStrategy } from '@crawlee/utils';
import { parseArgument, parseSitemap, schemas } from '@crawlee/utils/internal';
import type { RequiredDeep } from 'type-fest';
import { z } from 'zod';

import type { CrawleeLogger, EventManager, IRequestLoader, IRequestManager, RequestLoaderStatus } from '@crawlee/core';
import {
    EventType,
    KeyValueStore,
    purgeDefaultStorages,
    Request,
    RequestManagerTandem,
    RequestQueue,
    serviceLocator,
} from '@crawlee/core';

import type { UrlPatternInput } from './enqueue-links/index.js';
import type { UrlPatternObject } from './enqueue-links/shared.js';
import { constructUrlPatternObjects, urlPatternSchema } from './enqueue-links/index.js';

const sitemapRequestLoaderOptionsSchema = z.strictObject({
    sitemapUrls: schemas.arrayOf(z.string(), 'strings'),
    proxyUrl: z.string().optional(),
    persistStateKey: z.string().optional(),
    signal: z.unknown().optional(),
    timeoutMillis: schemas.anyNumber.optional(),
    maxBufferSize: schemas.anyNumber.default(200),
    enqueueStrategy: z.enum(EnqueueStrategy).default(EnqueueStrategy.SameHostname),
    parseSitemapOptions: z.looseObject({}).optional(),
    include: schemas.arrayOf(urlPatternSchema, 'URL patterns').optional(),
    exclude: schemas.arrayOf(urlPatternSchema, 'URL patterns').optional(),
    persistenceOptions: z.looseObject({}).optional(),
    httpClient: schemas.httpClient.optional(),
    concurrency: z.number().int().gte(1).default(1),
});

/** @internal */
const STATE_PERSISTENCE_KEY = 'SITEMAP_REQUEST_LOADER_STATE';

interface UrlConstraints {
    /**
     * An array of URL patterns that URLs must match to be included.
     *
     * Accepts glob pattern strings, `{ glob: string }` objects, `RegExp` instances, or `{ regexp: RegExp }` objects.
     *
     * Glob matching is always case-insensitive.
     * If you need case-sensitive matching, use a `RegExp`.
     *
     * If `include` is an empty array or `undefined`, then the `SitemapRequestLoader`
     * includes all the URLs from the sitemap.
     */
    include?: readonly UrlPatternInput[];

    /**
     * An array of URL patterns. Matching URLs will **not** be included.
     *
     * Accepts glob pattern strings, `{ glob: string }` objects, `RegExp` instances, or `{ regexp: RegExp }` objects.
     *
     * Glob matching is always case-insensitive.
     * If you need case-sensitive matching, use a `RegExp`.
     */
    exclude?: readonly UrlPatternInput[];
}

export interface SitemapRequestLoaderOptions extends UrlConstraints {
    /**
     * List of sitemap URLs to parse.
     */
    sitemapUrls: string[];
    /**
     * Proxy URL to be used for sitemap loading.
     */
    proxyUrl?: string;
    /**
     * Key for persisting the state of the request list in the `KeyValueStore`.
     */
    persistStateKey?: string;
    /**
     * Persistence-related options to control how and when crawler's data gets persisted.
     */
    persistenceOptions?: {
        /**
         * Use this flag to disable or enable periodic persistence to key value store.
         * @default true
         */
        enable?: boolean;
    };
    /**
     * Abort signal to be used for sitemap loading.
     */
    signal?: AbortSignal;
    /**
     * Timeout for sitemap loading in milliseconds. If both `signal` and `timeoutMillis` are provided, either of them can abort the loading.
     */
    timeoutMillis?: number;
    /**
     * Maximum number of buffered URLs for the sitemap loading stream.
     * If the buffer is full, the stream will pause until the buffer is drained.
     *
     * @default 200
     */
    maxBufferSize?: number;
    /**
     * Keep only sitemap-derived URLs matching this strategy relative to the parent sitemap URL; non-`http(s)`
     * schemes are always dropped. The filtering stays enforced after navigation (e.g. across redirects).
     * Pass `'all'` to disable host filtering.
     * @default EnqueueStrategy.SameHostname
     */
    enqueueStrategy?: EnqueueStrategy | `${EnqueueStrategy}`;
    /**
     * Advanced options for the underlying `parseSitemap` call.
     */
    parseSitemapOptions?: Omit<ParseSitemapOptions, 'emitNestedSitemaps' | 'maxDepth'>;
    /**
     * Custom HTTP client to be used for sitemap loading.
     */
    httpClient?: BaseHttpClient;
    /**
     * Maximum number of sitemaps to load in parallel.
     * This includes both the initial sitemaps and any nested sitemaps discovered during parsing.
     *
     * @default 1
     */
    concurrency?: number;
}

interface SitemapParsingProgress {
    inProgressSitemapUrls: Set<string>;
    inProgressEntriesPerSitemap: Map<string, Set<string>>;
    pendingSitemapUrls: Set<string>;
    processedSitemapUrls: Set<string>;
}

interface SitemapRequestLoaderState {
    urlQueue: string[];
    sitemapParsingProgress: {
        pendingSitemapUrls: string[];
        inProgressSitemapUrls?: string[];
        inProgressEntriesPerSitemap?: Record<string, string[]>;
        processedSitemapUrls?: string[];
        /** Legacy single-sitemap format */
        inProgressSitemapUrl?: string | null;
        /** Legacy single-sitemap format */
        inProgressEntries?: string[];
    };
    abortLoading: boolean;
    closed: boolean;
    requestData: [string, Request][];
}

/**
 * A list of URLs to crawl parsed from a sitemap.
 *
 * The loading of the sitemap is performed in the background so that crawling can start before the sitemap is fully loaded.
 */
export class SitemapRequestLoader implements IRequestLoader {
    /**
     * Set of URLs that were returned by `fetchNextRequest()` and not marked as handled yet.
     * @internal
     */
    inProgress = new Set<string>();

    /**
     * Map of returned Request objects that have not been marked as handled yet.
     *
     * We use this to persist custom user fields on the in-progress requests.
     */
    #requestData = new Map<string, Request>();

    /**
     * Object for keeping track of the sitemap parsing progress.
     */
    #sitemapParsingProgress: SitemapParsingProgress = {
        inProgressSitemapUrls: new Set<string>(),
        /**
         * URLs already emitted from each in-progress sitemap. Used for tracking partially loaded sitemaps across migrations.
         */
        inProgressEntriesPerSitemap: new Map<string, Set<string>>(),
        /**
         * Set of sitemap URLs that have not been parsed yet. If this and `inProgressSitemapUrls` are empty, the sitemap loading is finished.
         */
        pendingSitemapUrls: new Set<string>(),
        /**
         * Set of sitemap URLs that have already been parsed. Keeps sitemap indexes that reference each other from being loaded again.
         */
        processedSitemapUrls: new Set<string>(),
    };

    /**
     * Maximum number of sitemaps to load in parallel.
     */
    #concurrency: number;

    /**
     * Object stream of URLs parsed from the sitemaps.
     * Using `highWaterMark`, this can manage the speed of the sitemap loading.
     *
     * Fetch the next URL to be processed using `fetchNextRequest()`.
     */
    #urlQueueStream: Transform;

    /**
     * Indicates whether the request list sitemap loading was aborted.
     *
     * If the loading was aborted before the sitemaps were fully loaded, the request list might be missing some URLs.
     * The `isSitemapFullyLoaded` method can be used to check if the sitemaps were fully loaded.
     *
     * If the loading is aborted and all the requests are handled, `checkReadiness()` will report `finished`.
     */
    #abortLoading = false;

    /** Number of URLs that were marked as handled */
    #handledUrlCount = 0;

    #persistStateKey?: string;

    #store?: KeyValueStore;

    #closed = false;

    /**
     * Proxy URL to be used for sitemap loading.
     */
    #proxyUrl?: string;

    /**
     * Enqueue strategy applied to sitemap-derived URLs and stamped onto the emitted `Request` objects.
     */
    #enqueueStrategy: EnqueueStrategy | `${EnqueueStrategy}`;

    /**
     * Logger instance.
     */
    #log: CrawleeLogger;

    #urlExcludePatternObjects: UrlPatternObject[] = [];
    #urlPatternObjects: UrlPatternObject[] = [];

    /** EventManager used to handle persistence */
    #events: EventManager;

    #persistenceOptions: RequiredDeep<SitemapRequestLoaderOptions['persistenceOptions']>;

    /** @internal */
    private constructor(options: SitemapRequestLoaderOptions) {
        const {
            include,
            exclude,
            persistStateKey,
            persistenceOptions,
            proxyUrl,
            maxBufferSize,
            sitemapUrls,
            enqueueStrategy,
            concurrency,
        } = parseArgument(options, sitemapRequestLoaderOptionsSchema, 'SitemapRequestLoaderOptions');

        this.#log = serviceLocator.getLogger().child({ prefix: 'SitemapRequestLoader' });

        if (exclude?.length) {
            this.#urlExcludePatternObjects.push(...constructUrlPatternObjects(exclude));
        }

        if (include?.length) {
            this.#urlPatternObjects.push(...constructUrlPatternObjects(include));
        }

        this.#persistStateKey = persistStateKey;
        this.#persistenceOptions = { enable: true, ...persistenceOptions };

        this.#proxyUrl = proxyUrl;
        this.#enqueueStrategy = enqueueStrategy;
        this.#concurrency = concurrency;

        this.#urlQueueStream = this.#createNewStream(maxBufferSize);

        this.#sitemapParsingProgress.pendingSitemapUrls = new Set(sitemapUrls);
        this.#events = serviceLocator.getEventManager();

        this.persistState = this.persistState.bind(this);
    }

    /**
     * Creates a new object stream with the specified highWaterMark.
     * @param highWaterMark High water mark for the stream (the maximum number of objects the stream will buffer).
     * @returns A new object stream.
     */
    #createNewStream(highWaterMark: number): Transform {
        return new Transform({
            objectMode: true,
            highWaterMark,
        }).pause();
    }

    /**
     * Checks whether the URL matches the `include` / `exclude` patterns provided in the `options`.
     * @param url URL to be checked.
     * @returns `true` if the URL matches the patterns, `false` otherwise.
     */
    #isUrlMatchingPatterns(url: string): boolean {
        return (
            !this.#urlExcludePatternObjects.some(({ match }) => match(url)) &&
            (this.#urlPatternObjects.length === 0 || this.#urlPatternObjects.some(({ match }) => match(url)))
        );
    }

    /**
     * Adds a URL to the queue of parsed URLs.
     *
     * Blocks if the stream is full until it is drained.
     */
    async #pushNextUrl(url: string | null) {
        return new Promise<void>((resolve) => {
            if (this.#closed || (url && !this.#isUrlMatchingPatterns(url))) {
                resolve();
                return;
            }

            if (!this.#urlQueueStream.push(url)) {
                // This doesn't work with the 'drain' event (it's not emitted for some reason).
                this.#urlQueueStream.once('readdata', () => {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Reads the next URL from the queue of parsed URLs.
     *
     * If the stream is empty, blocks until a new URL is pushed.
     * @returns The next URL from the queue or `null` if we have read all URLs.
     */
    async #readNextUrl(): Promise<string | null> {
        return new Promise((resolve) => {
            if (this.#closed) {
                resolve(null);
                return;
            }

            const result = this.#urlQueueStream.read();

            if (!result && !this.isSitemapFullyLoaded()) {
                this.#urlQueueStream.once('readable', () => {
                    const nextUrl = this.#urlQueueStream.read();
                    resolve(nextUrl);
                });
            } else {
                resolve(result);
            }
            this.#urlQueueStream.emit('readdata');
        });
    }

    /**
     * Indicates whether the background processing of sitemap contents has successfully finished.
     *
     * If this is `false`, the background processing is either still in progress or was aborted.
     */
    isSitemapFullyLoaded(): boolean {
        return (
            this.#sitemapParsingProgress.inProgressSitemapUrls.size === 0 &&
            this.#sitemapParsingProgress.pendingSitemapUrls.size === 0
        );
    }

    #isUrlAlreadyEmitted(url: string): boolean {
        for (const entries of this.#sitemapParsingProgress.inProgressEntriesPerSitemap.values()) {
            if (entries.has(url)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Processes a single sitemap URL and emits its URLs to the queue.
     * Nested sitemaps are added to the pending queue for later processing.
     */
    async #loadSingleSitemap(
        sitemapUrl: string,
        parseSitemapOptions?: SitemapRequestLoaderOptions['parseSitemapOptions'],
    ): Promise<void> {
        const progress = this.#sitemapParsingProgress;
        progress.inProgressSitemapUrls.add(sitemapUrl);

        if (!progress.inProgressEntriesPerSitemap.has(sitemapUrl)) {
            progress.inProgressEntriesPerSitemap.set(sitemapUrl, new Set<string>());
        }
        const entries = progress.inProgressEntriesPerSitemap.get(sitemapUrl)!;

        try {
            for await (const item of parseSitemap([{ type: 'url', url: sitemapUrl }], this.#proxyUrl, {
                ...parseSitemapOptions,
                maxDepth: 0,
                emitNestedSitemaps: true,
                enqueueStrategy: this.#enqueueStrategy,
            })) {
                if (this.#abortLoading) break;

                if (!item.originSitemapUrl) {
                    // This is a nested sitemap
                    if (!progress.processedSitemapUrls.has(item.loc) && !progress.inProgressSitemapUrls.has(item.loc)) {
                        progress.pendingSitemapUrls.add(item.loc);
                    }
                    continue;
                }

                if (!entries.has(item.loc) && !this.#isUrlAlreadyEmitted(item.loc)) {
                    await this.#pushNextUrl(item.loc);
                    entries.add(item.loc);
                }
            }
        } catch (e: any) {
            this.#log.error(`Error loading sitemap contents from ${sitemapUrl}:`, e);
        } finally {
            progress.inProgressSitemapUrls.delete(sitemapUrl);
            progress.pendingSitemapUrls.delete(sitemapUrl);
            progress.inProgressEntriesPerSitemap.delete(sitemapUrl);
            progress.processedSitemapUrls.add(sitemapUrl);
        }
    }

    /**
     * Start processing the sitemaps and loading the URLs.
     *
     * Resolves once all the sitemaps URLs have been fully loaded (sets `isSitemapFullyLoaded` to `true`).
     */
    async #load({
        parseSitemapOptions,
    }: {
        parseSitemapOptions?: SitemapRequestLoaderOptions['parseSitemapOptions'];
    }): Promise<void> {
        const activeLoaders: Promise<void>[] = [];

        const startNewLoaders = () => {
            while (
                !this.#abortLoading &&
                activeLoaders.length < this.#concurrency &&
                this.#sitemapParsingProgress.pendingSitemapUrls.size > 0
            ) {
                const sitemapUrl = this.#sitemapParsingProgress.pendingSitemapUrls.values().next().value!;
                this.#sitemapParsingProgress.pendingSitemapUrls.delete(sitemapUrl);

                const loaderPromise = this.#loadSingleSitemap(sitemapUrl, parseSitemapOptions).finally(() => {
                    const index = activeLoaders.indexOf(loaderPromise);
                    if (index !== -1) void activeLoaders.splice(index, 1);
                });
                activeLoaders.push(loaderPromise);
            }
        };

        startNewLoaders();

        while (
            (activeLoaders.length > 0 || this.#sitemapParsingProgress.pendingSitemapUrls.size > 0) &&
            !this.#abortLoading
        ) {
            if (activeLoaders.length > 0) await Promise.race(activeLoaders);
            startNewLoaders();
        }

        if (activeLoaders.length > 0) await Promise.all(activeLoaders);

        this.#urlQueueStream.end();
    }

    /**
     * Open a sitemap and start processing it.
     *
     * Resolves to a new instance of `SitemapRequestLoader`, which **might not be fully loaded yet** - i.e. the sitemap might still be loading in the background.
     *
     * Track the loading progress using the `isSitemapFullyLoaded` property.
     */
    static async open(options: SitemapRequestLoaderOptions): Promise<SitemapRequestLoader> {
        const { httpClient, ...restOptions } = options;

        const requestList = new SitemapRequestLoader({
            ...restOptions,
            persistStateKey: options.persistStateKey ?? STATE_PERSISTENCE_KEY,
        });
        await requestList.#restoreState();
        void requestList.#load({
            parseSitemapOptions: { logger: serviceLocator.getLogger(), ...options.parseSitemapOptions, httpClient },
        });

        if (requestList.#persistenceOptions.enable) {
            requestList.#events.on(EventType.PERSIST_STATE, requestList.persistState);
        }

        options?.signal?.addEventListener('abort', () => {
            requestList.#abortLoading = true;
        });

        if (options.timeoutMillis) {
            setTimeout(() => {
                requestList.#abortLoading = true;
            }, options.timeoutMillis);
        }

        return requestList;
    }

    /**
     * @inheritDoc
     */
    async getTotalCount(): Promise<number> {
        // Total known so far = not-yet-fetched (still buffered in the stream) + in-progress (fetched but not
        // yet handled) + already handled.
        return this.#urlQueueStream.readableLength + this.inProgress.size + this.#handledUrlCount;
    }

    /**
     * @inheritDoc
     */
    async getPendingCount(): Promise<number> {
        // Pending = everything not yet handled = not-yet-fetched + in-progress.
        return this.#urlQueueStream.readableLength + this.inProgress.size;
    }

    /**
     * Combines this list with a request manager (a {@apilink RequestQueue} by default) into a
     * {@apilink RequestManagerTandem}, allowing requests to be added and reclaimed while still
     * being read from this list first.
     */
    async toTandem(requestManager?: IRequestManager): Promise<IRequestManager> {
        return new RequestManagerTandem(this, requestManager ?? (await RequestQueue.open()));
    }

    /**
     * @inheritDoc
     */
    async checkReadiness(): Promise<RequestLoaderStatus> {
        if (this.#urlQueueStream.readableLength > 0) {
            return { status: 'ready' };
        }

        // The parser is still running, so more URLs may yet arrive - on no schedule, hence no `readyAt`.
        if (!this.isSitemapFullyLoaded() && !this.#abortLoading) {
            return { status: 'waiting' };
        }

        return this.inProgress.size === 0 ? { status: 'finished' } : { status: 'waiting' };
    }

    /**
     * @inheritDoc
     */
    async getHandledCount(): Promise<number> {
        return this.#handledUrlCount;
    }

    /**
     * @inheritDoc
     */
    async persistState(): Promise<void> {
        if (this.#persistStateKey === undefined) {
            return;
        }

        this.#store ??= await KeyValueStore.open();

        const urlQueue = [];

        while (this.#urlQueueStream.readableLength > 0) {
            const url = this.#urlQueueStream.read();
            if (url === null) {
                break;
            }
            urlQueue.push(url);
        }

        // Create a new stream, as we have read all the URLs from the current one.
        // Pushing the urls back to the original stream might not be possible if it has been ended.
        const previousStream = this.#urlQueueStream;
        const newStream = this.#createNewStream(previousStream.readableHighWaterMark);

        for (const url of urlQueue) {
            newStream.push(url);
        }

        if (previousStream.writableEnded) {
            newStream.end();
        }

        this.#urlQueueStream = newStream;

        // A `pushNextUrl()` call may be blocked on backpressure, waiting for a `readdata` event on the
        // previous stream. That event is only ever emitted by `readNextUrl()` on the current stream, so
        // after the swap the waiter would never be notified and the background sitemap loading would hang.
        // Re-emit `readdata` on the previous stream to release any such pending waiter (its URL has already
        // been transferred to the new stream above).
        previousStream.emit('readdata');

        const inProgressEntriesPerSitemap: Record<string, string[]> = {};
        for (const [sitemapUrl, entries] of this.#sitemapParsingProgress.inProgressEntriesPerSitemap) {
            inProgressEntriesPerSitemap[sitemapUrl] = Array.from(entries);
        }

        await this.#store.setValue(this.#persistStateKey, {
            sitemapParsingProgress: {
                pendingSitemapUrls: Array.from(this.#sitemapParsingProgress.pendingSitemapUrls),
                inProgressSitemapUrls: Array.from(this.#sitemapParsingProgress.inProgressSitemapUrls),
                inProgressEntriesPerSitemap,
                processedSitemapUrls: Array.from(this.#sitemapParsingProgress.processedSitemapUrls),
            },
            // Re-queue in-progress requests to the front so they are retried if the state is restored.
            urlQueue: [...this.inProgress, ...urlQueue],
            requestData: Array.from(this.#requestData.entries()),
            abortLoading: this.#abortLoading,
            closed: this.#closed,
        } satisfies SitemapRequestLoaderState);
    }

    async #restoreState(): Promise<void> {
        await purgeDefaultStorages({ onlyPurgeOnce: true });

        if (this.#persistStateKey === undefined) {
            return;
        }

        this.#store ??= await KeyValueStore.open();
        const state = await this.#store.getValue<SitemapRequestLoaderState>(this.#persistStateKey);

        if (state === null) {
            return;
        }

        const progress = state.sitemapParsingProgress;
        const inProgressSitemapUrls = new Set<string>(progress.inProgressSitemapUrls ?? []);
        if (progress.inProgressSitemapUrl && !progress.inProgressSitemapUrls) {
            inProgressSitemapUrls.add(progress.inProgressSitemapUrl);
        }

        const inProgressEntriesPerSitemap = new Map<string, Set<string>>();
        if (progress.inProgressEntriesPerSitemap) {
            for (const [sitemapUrl, entries] of Object.entries(progress.inProgressEntriesPerSitemap)) {
                inProgressEntriesPerSitemap.set(sitemapUrl, new Set(entries));
            }
        } else if (progress.inProgressEntries && progress.inProgressSitemapUrl) {
            inProgressEntriesPerSitemap.set(progress.inProgressSitemapUrl, new Set(progress.inProgressEntries));
        }

        // Interrupted sitemaps are re-parsed; `inProgressEntriesPerSitemap` skips the URLs they already emitted.
        this.#sitemapParsingProgress = {
            pendingSitemapUrls: new Set([...progress.pendingSitemapUrls, ...inProgressSitemapUrls]),
            inProgressSitemapUrls: new Set<string>(),
            inProgressEntriesPerSitemap,
            processedSitemapUrls: new Set(progress.processedSitemapUrls ?? []),
        };

        this.#requestData = new Map(state.requestData ?? []);

        for (const url of state.urlQueue) {
            this.#urlQueueStream.push(url);
        }

        this.#abortLoading = state.abortLoading;
        this.#closed = state.closed;
    }

    /**
     * @inheritDoc
     */
    async fetchNextRequest(): Promise<Request | null> {
        const nextUrl = await this.#readNextUrl();
        if (!nextUrl) {
            return null;
        }

        // A restored in-progress request already has its Request data; don't overwrite it.
        if (!this.#requestData.has(nextUrl)) {
            this.#requestData.set(nextUrl, new Request({ url: nextUrl, enqueueStrategy: this.#enqueueStrategy }));
        }

        this.inProgress.add(nextUrl);
        return this.#requestData.get(nextUrl)!;
    }

    /**
     * @inheritDoc
     */
    async *[Symbol.asyncIterator]() {
        while ((await this.checkReadiness()).status !== 'finished') {
            const request = await this.fetchNextRequest();
            if (!request) break;

            yield request;
        }
    }

    /**
     * Aborts the internal sitemap loading, stops the processing of the sitemap contents and drops all the pending URLs.
     *
     * Calling `fetchNextRequest()` after this method will always return `null`.
     */
    async teardown(): Promise<void> {
        this.#closed = true;
        this.#abortLoading = true;
        this.#events.off(EventType.PERSIST_STATE, this.persistState);
        await this.persistState();

        this.#urlQueueStream.emit('readdata'); // unblocks the potentially waiting `pushNextUrl` call
    }

    /**
     * @inheritDoc
     */
    async markRequestAsHandled(request: Request): Promise<void> {
        this.#handledUrlCount += 1;
        this.#ensureInProgress(request.url);
        this.inProgress.delete(request.url);
        this.#requestData.delete(request.url);
    }

    #ensureInProgress(url: string): void {
        if (!this.inProgress.has(url)) {
            throw new Error(`The request is not being processed (url: ${url})`);
        }
    }
}
