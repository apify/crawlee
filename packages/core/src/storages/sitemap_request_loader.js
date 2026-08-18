import { Transform } from 'node:stream';
import { EnqueueStrategy, parseSitemap } from '@crawlee/utils';
import { minimatch } from 'minimatch';
import { z } from 'zod';
import { constructUrlPatternObjects, urlPatternSchema } from '../enqueue_links/shared.js';
import { EventType } from '../events/event_manager.js';
import { Request } from '../request.js';
import { serviceLocator } from '../service_locator.js';
import { parseArgument, schemas } from '../validators.js';
import { KeyValueStore } from './key_value_store.js';
import { purgeDefaultStorages } from './utils.js';
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
});
/** @internal */
const STATE_PERSISTENCE_KEY = 'SITEMAP_REQUEST_LOADER_STATE';
/**
 * A list of URLs to crawl parsed from a sitemap.
 *
 * The loading of the sitemap is performed in the background so that crawling can start before the sitemap is fully loaded.
 */
export class SitemapRequestLoader {
    /**
     * Set of URLs that were returned by `fetchNextRequest()` and not marked as handled yet.
     * @internal
     */
    inProgress = new Set();
    /**
     * Map of returned Request objects that have not been marked as handled yet.
     *
     * We use this to persist custom user fields on the in-progress requests.
     */
    #requestData = new Map();
    /**
     * Object for keeping track of the sitemap parsing progress.
     */
    #sitemapParsingProgress = {
        /**
         * URL of the sitemap that is currently being parsed. `null` if no sitemap is being parsed.
         */
        inProgressSitemapUrl: null,
        /**
         * Buffer for URLs from the currently parsed sitemap. Used for tracking partially loaded sitemaps across migrations.
         */
        inProgressEntries: new Set(),
        /**
         * Set of sitemap URLs that have not been parsed yet. If the set is empty and `inProgressSitemapUrl` is `null`, the sitemap loading is finished.
         */
        pendingSitemapUrls: new Set(),
    };
    /**
     * Object stream of URLs parsed from the sitemaps.
     * Using `highWaterMark`, this can manage the speed of the sitemap loading.
     *
     * Fetch the next URL to be processed using `fetchNextRequest()`.
     */
    #urlQueueStream;
    /**
     * Indicates whether the request list sitemap loading was aborted.
     *
     * If the loading was aborted before the sitemaps were fully loaded, the request list might be missing some URLs.
     * The `isSitemapFullyLoaded` method can be used to check if the sitemaps were fully loaded.
     *
     * If the loading is aborted and all the requests are handled, `isFinished()` will return `true`.
     */
    #abortLoading = false;
    /** Number of URLs that were marked as handled */
    #handledUrlCount = 0;
    #persistStateKey;
    #store;
    #closed = false;
    /**
     * Proxy URL to be used for sitemap loading.
     */
    #proxyUrl;
    /**
     * Enqueue strategy applied to sitemap-derived URLs and stamped onto the emitted `Request` objects.
     */
    #enqueueStrategy;
    /**
     * Logger instance.
     */
    #log;
    #urlExcludePatternObjects = [];
    #urlPatternObjects = [];
    /** EventManager used to handle persistence */
    #events;
    #persistenceOptions;
    /** @internal */
    constructor(options) {
        const { include, exclude, persistStateKey, persistenceOptions, proxyUrl, maxBufferSize, sitemapUrls, enqueueStrategy, } = parseArgument(options, sitemapRequestLoaderOptionsSchema, 'SitemapRequestLoaderOptions');
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
        this.#urlQueueStream = this.createNewStream(maxBufferSize);
        this.#sitemapParsingProgress.pendingSitemapUrls = new Set(sitemapUrls);
        this.#events = serviceLocator.getEventManager();
        this.persistState = this.persistState.bind(this);
    }
    /**
     * Creates a new object stream with the specified highWaterMark.
     * @param highWaterMark High water mark for the stream (the maximum number of objects the stream will buffer).
     * @returns A new object stream.
     */
    createNewStream(highWaterMark) {
        return new Transform({
            objectMode: true,
            highWaterMark,
        }).pause();
    }
    /**
     * Returns a function that checks whether the provided pattern matches the closure URL.
     * @param url URL to be checked.
     * @returns A matcher function that checks whether the pattern matches the closure URL.
     */
    matchesUrl(url) {
        return (patternObject) => {
            const { regexp, glob } = patternObject;
            const matchesRegex = (regexp && url.match(regexp)) || false;
            const matchesGlob = (glob && minimatch(url, glob, { nocase: true })) || false;
            return Boolean(matchesRegex || matchesGlob);
        };
    }
    /**
     * Checks whether the URL matches the `include` / `exclude` patterns provided in the `options`.
     * @param url URL to be checked.
     * @returns `true` if the URL matches the patterns, `false` otherwise.
     */
    isUrlMatchingPatterns(url) {
        return (!this.#urlExcludePatternObjects.some(this.matchesUrl(url)) &&
            (this.#urlPatternObjects.length === 0 || this.#urlPatternObjects.some(this.matchesUrl(url))));
    }
    /**
     * Adds a URL to the queue of parsed URLs.
     *
     * Blocks if the stream is full until it is drained.
     */
    async pushNextUrl(url) {
        return new Promise((resolve) => {
            if (this.#closed || (url && !this.isUrlMatchingPatterns(url))) {
                resolve();
                return;
            }
            if (!this.#urlQueueStream.push(url)) {
                // This doesn't work with the 'drain' event (it's not emitted for some reason).
                this.#urlQueueStream.once('readdata', () => {
                    resolve();
                });
            }
            else {
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
    async readNextUrl() {
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
            }
            else {
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
    isSitemapFullyLoaded() {
        return (this.#sitemapParsingProgress.inProgressSitemapUrl === null &&
            this.#sitemapParsingProgress.pendingSitemapUrls.size === 0);
    }
    /**
     * Start processing the sitemaps and loading the URLs.
     *
     * Resolves once all the sitemaps URLs have been fully loaded (sets `isSitemapFullyLoaded` to `true`).
     */
    async load({ parseSitemapOptions, }) {
        while (!this.isSitemapFullyLoaded() && !this.#abortLoading) {
            const sitemapUrl = this.#sitemapParsingProgress.inProgressSitemapUrl ??
                this.#sitemapParsingProgress.pendingSitemapUrls.values().next().value;
            try {
                for await (const item of parseSitemap([{ type: 'url', url: sitemapUrl }], this.#proxyUrl, {
                    ...parseSitemapOptions,
                    maxDepth: 0,
                    emitNestedSitemaps: true,
                    enqueueStrategy: this.#enqueueStrategy,
                })) {
                    if (!item.originSitemapUrl) {
                        // This is a nested sitemap
                        this.#sitemapParsingProgress.pendingSitemapUrls.add(item.loc);
                        continue;
                    }
                    if (!this.#sitemapParsingProgress.inProgressEntries.has(item.loc)) {
                        await this.pushNextUrl(item.loc);
                        this.#sitemapParsingProgress.inProgressEntries.add(item.loc);
                    }
                }
            }
            catch (e) {
                this.#log.error('Error loading sitemap contents:', e);
            }
            this.#sitemapParsingProgress.pendingSitemapUrls.delete(sitemapUrl);
            this.#sitemapParsingProgress.inProgressEntries.clear();
            this.#sitemapParsingProgress.inProgressSitemapUrl = null;
        }
        this.#urlQueueStream.end();
    }
    /**
     * Open a sitemap and start processing it.
     *
     * Resolves to a new instance of `SitemapRequestLoader`, which **might not be fully loaded yet** - i.e. the sitemap might still be loading in the background.
     *
     * Track the loading progress using the `isSitemapFullyLoaded` property.
     */
    static async open(options) {
        const { httpClient, ...restOptions } = options;
        const requestList = new SitemapRequestLoader({
            ...restOptions,
            persistStateKey: options.persistStateKey ?? STATE_PERSISTENCE_KEY,
        });
        await requestList.restoreState();
        void requestList.load({
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
    async getTotalCount() {
        // Total known so far = not-yet-fetched (still buffered in the stream) + in-progress (fetched but not
        // yet handled) + already handled.
        return this.#urlQueueStream.readableLength + this.inProgress.size + this.#handledUrlCount;
    }
    /**
     * @inheritDoc
     */
    async getPendingCount() {
        // Pending = everything not yet handled = not-yet-fetched + in-progress.
        return this.#urlQueueStream.readableLength + this.inProgress.size;
    }
    /**
     * Combines this list with a request manager (a {@apilink RequestQueue} by default) into a
     * {@apilink RequestManagerTandem}, allowing requests to be added and reclaimed while still
     * being read from this list first.
     */
    async toTandem(requestManager) {
        // Import here to avoid circular imports.
        const { RequestManagerTandem } = await import('./request_manager_tandem.js');
        const { RequestQueue } = await import('./request_queue.js');
        return new RequestManagerTandem(this, requestManager ?? (await RequestQueue.open()));
    }
    /**
     * @inheritDoc
     */
    async isFinished() {
        return ((await this.isEmpty()) && this.inProgress.size === 0 && (this.isSitemapFullyLoaded() || this.#abortLoading));
    }
    /**
     * @inheritDoc
     */
    async isEmpty() {
        return this.#urlQueueStream.readableLength === 0;
    }
    /**
     * @inheritDoc
     */
    async getHandledCount() {
        return this.#handledUrlCount;
    }
    /**
     * @inheritDoc
     */
    async persistState() {
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
        const newStream = this.createNewStream(previousStream.readableHighWaterMark);
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
        await this.#store.setValue(this.#persistStateKey, {
            sitemapParsingProgress: {
                pendingSitemapUrls: Array.from(this.#sitemapParsingProgress.pendingSitemapUrls),
                inProgressSitemapUrl: this.#sitemapParsingProgress.inProgressSitemapUrl,
                inProgressEntries: Array.from(this.#sitemapParsingProgress.inProgressEntries),
            },
            // Re-queue in-progress requests to the front so they are retried if the state is restored.
            urlQueue: [...this.inProgress, ...urlQueue],
            requestData: Array.from(this.#requestData.entries()),
            abortLoading: this.#abortLoading,
            closed: this.#closed,
        });
    }
    async restoreState() {
        await purgeDefaultStorages({ onlyPurgeOnce: true });
        if (this.#persistStateKey === undefined) {
            return;
        }
        this.#store ??= await KeyValueStore.open();
        const state = await this.#store.getValue(this.#persistStateKey);
        if (state === null) {
            return;
        }
        this.#sitemapParsingProgress = {
            pendingSitemapUrls: new Set(state.sitemapParsingProgress.pendingSitemapUrls),
            inProgressSitemapUrl: state.sitemapParsingProgress.inProgressSitemapUrl,
            inProgressEntries: new Set(state.sitemapParsingProgress.inProgressEntries),
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
    async fetchNextRequest() {
        const nextUrl = await this.readNextUrl();
        if (!nextUrl) {
            return null;
        }
        // A restored in-progress request already has its Request data; don't overwrite it.
        if (!this.#requestData.has(nextUrl)) {
            this.#requestData.set(nextUrl, new Request({ url: nextUrl, enqueueStrategy: this.#enqueueStrategy }));
        }
        this.inProgress.add(nextUrl);
        return this.#requestData.get(nextUrl);
    }
    /**
     * @inheritDoc
     */
    async *[Symbol.asyncIterator]() {
        while (!(await this.isFinished())) {
            const request = await this.fetchNextRequest();
            if (!request)
                break;
            yield request;
        }
    }
    /**
     * Aborts the internal sitemap loading, stops the processing of the sitemap contents and drops all the pending URLs.
     *
     * Calling `fetchNextRequest()` after this method will always return `null`.
     */
    async teardown() {
        this.#closed = true;
        this.#abortLoading = true;
        this.#events.off(EventType.PERSIST_STATE, this.persistState);
        await this.persistState();
        this.#urlQueueStream.emit('readdata'); // unblocks the potentially waiting `pushNextUrl` call
    }
    /**
     * @inheritDoc
     */
    async markRequestAsHandled(request) {
        this.#handledUrlCount += 1;
        this.ensureInProgress(request.url);
        this.inProgress.delete(request.url);
        this.#requestData.delete(request.url);
    }
    ensureInProgress(url) {
        if (!this.inProgress.has(url)) {
            throw new Error(`The request is not being processed (url: ${url})`);
        }
    }
}
