import { Transform } from 'node:stream';

import defaultLog from '@apify/log';
import { type ParseSitemapOptions, parseSitemap } from '@crawlee/utils';
import ow from 'ow';

import { KeyValueStore } from './key_value_store';
import type { IRequestList } from './request_list';
import { purgeDefaultStorages } from './utils';
import { Request } from '../request';

/** @internal */
export const STATE_PERSISTENCE_KEY = 'SITEMAP_REQUEST_LIST_STATE';

export interface SitemapRequestListOptions {
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
     * Advanced options for the underlying `parseSitemap` call.
     */
    parseSitemapOptions?: Omit<ParseSitemapOptions, 'emitNestedSitemaps' | 'maxDepth'>;
}

interface SitemapParsingProgress {
    inProgressSitemapUrl: string | null;
    inProgressEntries: Set<string>;
    pendingSitemapUrls: Set<string>;
}

interface SitemapRequestListState {
    urlQueue: string[];
    reclaimed: string[];
    sitemapParsingProgress: Record<keyof SitemapParsingProgress, any>;
    abortLoading: boolean;
    closed: boolean;
    requestData: [string, Request][];
}

/**
 * A list of URLs to crawl parsed from a sitemap.
 *
 * The loading of the sitemap is performed in the background so that crawling can start before the sitemap is fully loaded.
 */
export class SitemapRequestList implements IRequestList {
    /**
     * Set of URLs that were returned by `fetchNextRequest()` and not marked as handled yet.
     * @internal
     */
    inProgress = new Set<string>();

    /** Set of URLs for which `reclaimRequest()` was called. */
    private reclaimed = new Set<string>();

    /**
     * Map of returned Request objects that have not been marked as handled yet.
     *
     * We use this to persist custom user fields on the in-progress (or reclaimed) requests.
     */
    private requestData = new Map<string, Request>();

    /**
     * Object for keeping track of the sitemap parsing progress.
     */
    private sitemapParsingProgress: SitemapParsingProgress = {
        /**
         * URL of the sitemap that is currently being parsed. `null` if no sitemap is being parsed.
         */
        inProgressSitemapUrl: null,
        /**
         * Buffer for URLs from the currently parsed sitemap. Used for tracking partially loaded sitemaps across migrations.
         */
        inProgressEntries: new Set<string>(),
        /**
         * Set of sitemap URLs that have not been fully parsed yet. If the set is empty and `inProgressSitemapUrl` is `null`, the sitemap loading is finished.
         */
        pendingSitemapUrls: new Set<string>(),
    };

    /**
     * Object stream of URLs parsed from the sitemaps.
     * Using `highWaterMark`, this can manage the speed of the sitemap loading.
     *
     * Fetch the next URL to be processed using `fetchNextRequest()`.
     */
    private urlQueueStream: Transform;

    /**
     * Indicates whether the request list sitemap loading was aborted.
     *
     * If the loading was aborted before the sitemaps were fully loaded, the request list might be missing some URLs.
     * The `isSitemapFullyLoaded` method can be used to check if the sitemaps were fully loaded.
     *
     * If the loading is aborted and all the requests are handled, `isFinished()` will return `true`.
     */
    private abortLoading: boolean = false;

    /** Number of URLs that were marked as handled */
    private handledUrlCount = 0;

    private persistStateKey?: string;

    private store?: KeyValueStore;

    private closed: boolean = false;

    /**
     * Proxy URL to be used for sitemap loading.
     */
    private proxyUrl: string | undefined;

    /**
     * Logger instance.
     */
    private log = defaultLog.child({ prefix: 'SitemapRequestList' });

    /** @internal */
    private constructor(options: SitemapRequestListOptions) {
        ow(
            options,
            ow.object.exactShape({
                sitemapUrls: ow.array.ofType(ow.string),
                proxyUrl: ow.optional.string,
                persistStateKey: ow.optional.string,
                signal: ow.optional.any(),
                timeoutMillis: ow.optional.number,
                maxBufferSize: ow.optional.number,
                parseSitemapOptions: ow.optional.object,
            }),
        );

        this.persistStateKey = options.persistStateKey;
        this.proxyUrl = options.proxyUrl;

        this.urlQueueStream = new Transform({
            objectMode: true,
            highWaterMark: options.maxBufferSize ?? 200,
        });
        this.urlQueueStream.pause();

        this.sitemapParsingProgress.pendingSitemapUrls = new Set(options.sitemapUrls);
    }

    /**
     * Adds a URL to the queue of parsed URLs.
     *
     * Blocks if the stream is full until it is drained.
     */
    private async pushNextUrl(url: string | null) {
        return new Promise<void>((resolve) => {
            if (this.closed) {
                return resolve();
            }

            if (!this.urlQueueStream.push(url)) {
                // This doesn't work with the 'drain' event (it's not emitted for some reason).
                this.urlQueueStream.once('readdata', () => {
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
    private async readNextUrl(): Promise<string | null> {
        return new Promise((resolve) => {
            if (this.closed) {
                return resolve(null);
            }

            const result = this.urlQueueStream.read();

            if (!result && !this.isSitemapFullyLoaded()) {
                this.urlQueueStream.once('readable', () => {
                    const nextUrl = this.urlQueueStream.read();
                    resolve(nextUrl);
                });
            } else {
                resolve(result);
            }
            this.urlQueueStream.emit('readdata');
        });
    }

    /**
     * Indicates whether the background processing of sitemap contents has successfully finished.
     *
     * If this is `false`, the background processing is either still in progress or was aborted.
     */
    isSitemapFullyLoaded(): boolean {
        return (
            this.sitemapParsingProgress.inProgressSitemapUrl === null &&
            this.sitemapParsingProgress.pendingSitemapUrls.size === 0
        );
    }

    /**
     * Start processing the sitemaps and loading the URLs.
     *
     * Resolves once all the sitemaps URLs have been fully loaded (sets `isSitemapFullyLoaded` to `true`).
     */
    private async load({
        parseSitemapOptions,
    }: { parseSitemapOptions?: SitemapRequestListOptions['parseSitemapOptions'] }): Promise<void> {
        while (!this.isSitemapFullyLoaded() && !this.abortLoading) {
            const sitemapUrl =
                this.sitemapParsingProgress.inProgressSitemapUrl ??
                this.sitemapParsingProgress.pendingSitemapUrls.values().next().value;

            try {
                for await (const item of parseSitemap([{ type: 'url', url: sitemapUrl }], this.proxyUrl, {
                    ...parseSitemapOptions,
                    maxDepth: 0,
                    emitNestedSitemaps: true,
                })) {
                    if (!item.originSitemapUrl) {
                        // This is a nested sitemap
                        this.sitemapParsingProgress.pendingSitemapUrls.add(item.loc);
                        continue;
                    }

                    if (!this.sitemapParsingProgress.inProgressEntries.has(item.loc)) {
                        await this.pushNextUrl(item.loc);
                        this.sitemapParsingProgress.inProgressEntries.add(item.loc);
                    }
                }
            } catch (e: any) {
                this.log.error('Error loading sitemap contents:', e);
            }

            this.sitemapParsingProgress.pendingSitemapUrls.delete(sitemapUrl);
            this.sitemapParsingProgress.inProgressEntries.clear();
            this.sitemapParsingProgress.inProgressSitemapUrl = null;
        }

        await this.pushNextUrl(null);
    }

    /**
     * Open a sitemap and start processing it.
     *
     * Resolves to a new instance of `SitemapRequestList`, which **might not be fully loaded yet** - i.e. the sitemap might still be loading in the background.
     *
     * Track the loading progress using the `isSitemapFullyLoaded` property.
     */
    static async open(options: SitemapRequestListOptions): Promise<SitemapRequestList> {
        const requestList = new SitemapRequestList({
            ...options,
            persistStateKey: options.persistStateKey ?? STATE_PERSISTENCE_KEY,
        });
        await requestList.restoreState();
        void requestList.load({ parseSitemapOptions: options.parseSitemapOptions });

        options?.signal?.addEventListener('abort', () => {
            requestList.abortLoading = true;
        });

        if (options.timeoutMillis) {
            setTimeout(() => {
                requestList.abortLoading = true;
            }, options.timeoutMillis);
        }

        return requestList;
    }

    /**
     * @inheritDoc
     */
    length(): number {
        return this.urlQueueStream.readableLength + this.handledUrlCount - this.inProgress.size - this.reclaimed.size;
    }

    /**
     * @inheritDoc
     */
    async isFinished(): Promise<boolean> {
        return (
            (await this.isEmpty()) && this.inProgress.size === 0 && (this.isSitemapFullyLoaded() || this.abortLoading)
        );
    }

    /**
     * @inheritDoc
     */
    async isEmpty(): Promise<boolean> {
        return this.reclaimed.size === 0 && this.urlQueueStream.readableLength === 0;
    }

    /**
     * @inheritDoc
     */
    handledCount(): number {
        return this.handledUrlCount;
    }

    /**
     * @inheritDoc
     */
    async persistState(): Promise<void> {
        if (this.persistStateKey === undefined) {
            return;
        }

        this.store ??= await KeyValueStore.open();

        const urlQueue = [];

        while (this.urlQueueStream.readableLength > 0) {
            const url = this.urlQueueStream.read();
            if (url === null) {
                break;
            }
            urlQueue.push(url);
        }

        for (const url of urlQueue) {
            this.urlQueueStream.push(url);
        }

        await this.store.setValue(this.persistStateKey, {
            sitemapParsingProgress: {
                pendingSitemapUrls: Array.from(this.sitemapParsingProgress.pendingSitemapUrls),
                inProgressSitemapUrl: this.sitemapParsingProgress.inProgressSitemapUrl,
                inProgressEntries: Array.from(this.sitemapParsingProgress.inProgressEntries),
            },
            urlQueue,
            reclaimed: [...this.inProgress, ...this.reclaimed], // In-progress and reclaimed requests will be both retried if state is restored
            requestData: Array.from(this.requestData.entries()),
            abortLoading: this.abortLoading,
            closed: this.closed,
        } satisfies SitemapRequestListState);
    }

    private async restoreState(): Promise<void> {
        await purgeDefaultStorages({ onlyPurgeOnce: true });

        if (this.persistStateKey === undefined) {
            return;
        }

        this.store ??= await KeyValueStore.open();
        const state = await this.store.getValue<SitemapRequestListState>(this.persistStateKey);

        if (state === null) {
            return;
        }

        this.reclaimed = new Set(state.reclaimed);
        this.sitemapParsingProgress = {
            pendingSitemapUrls: new Set(state.sitemapParsingProgress.pendingSitemapUrls),
            inProgressSitemapUrl: state.sitemapParsingProgress.inProgressSitemapUrl,
            inProgressEntries: new Set(state.sitemapParsingProgress.inProgressEntries),
        };

        this.requestData = new Map(state.requestData ?? []);

        for (const url of state.urlQueue) {
            this.urlQueueStream.push(url);
        }

        this.abortLoading = state.abortLoading;
        this.closed = state.closed;
    }

    /**
     * @inheritDoc
     */
    async fetchNextRequest(): Promise<Request | null> {
        // Try to return a reclaimed request first
        let nextUrl: string | null = this.reclaimed.values().next().value;
        if (nextUrl) {
            this.reclaimed.delete(nextUrl);
        } else {
            // Otherwise read next url from the stream
            nextUrl = await this.readNextUrl();
            if (!nextUrl) {
                return null;
            }
            this.requestData.set(nextUrl, new Request({ url: nextUrl }));
        }

        this.inProgress.add(nextUrl);
        return this.requestData.get(nextUrl)!;
    }

    /**
     * @inheritDoc
     */
    async *[Symbol.asyncIterator]() {
        while (!(await this.isFinished())) {
            const request = await this.fetchNextRequest();
            if (!request) break;

            yield request;
        }
    }

    /**
     * @inheritDoc
     */
    async reclaimRequest(request: Request): Promise<void> {
        this.ensureInProgressAndNotReclaimed(request.url);
        this.reclaimed.add(request.url);
        this.inProgress.delete(request.url);
    }

    /**
     * Aborts the internal sitemap loading, stops the processing of the sitemap contents and drops all the pending URLs.
     *
     * Calling `fetchNextRequest()` after this method will always return `null`.
     */
    async teardown(): Promise<void> {
        this.closed = true;
        this.abortLoading = true;
        await this.persistState();

        this.urlQueueStream.emit('readdata'); // unblocks the potentially waiting `pushNextUrl` call
    }

    /**
     * @inheritDoc
     */
    async markRequestHandled(request: Request): Promise<void> {
        this.handledUrlCount += 1;
        this.ensureInProgressAndNotReclaimed(request.url);
        this.inProgress.delete(request.url);
        this.requestData.delete(request.url);
    }

    private ensureInProgressAndNotReclaimed(url: string): void {
        if (!this.inProgress.has(url)) {
            throw new Error(`The request is not being processed (url: ${url})`);
        }
        if (this.reclaimed.has(url)) {
            throw new Error(`The request was already reclaimed (url: ${url})`);
        }
    }
}
