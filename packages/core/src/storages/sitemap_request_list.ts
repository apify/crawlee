import defaultLog from '@apify/log';
import { parseSitemap } from '@crawlee/utils';
import ow from 'ow';

import { KeyValueStore } from './key_value_store';
import type { IRequestList } from './request_list';
import { purgeDefaultStorages } from './utils';
import { Request } from '../request';

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
}

interface SitemapParsingProgress {
    inProgressUrl: string | null;
    inProgressEntries: Set<string>;
    pendingUrls: Set<string>;
}

interface SitemapRequestListState {
    urlQueue: string[];
    reclaimed: string[];
    sitemapParsingProgress: Record<keyof SitemapParsingProgress, any>;
    abortLoading: boolean;
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
     * Object for keeping track of the sitemap parsing progress.
     */
    private sitemapParsingProgress: SitemapParsingProgress = {
        /**
         * URL of the sitemap that is currently being parsed. `null` if no sitemap is being parsed.
         */
        inProgressUrl: null,
        /**
         * Buffer for URLs from the currently parsed sitemap. Used for tracking partially loaded sitemaps across migrations.
         */
        inProgressEntries: new Set<string>(),
        /**
         * Set of sitemap URLs that have not been fully parsed yet. If the set is empty and `inProgressUrl` is `null`, the sitemap loading is finished.
         */
        pendingUrls: new Set<string>(),
    };

    /**
     * Queue of URLs parsed from the sitemaps.
     *
     * Fetch the next URL to be processed using `fetchNextRequest()`.
     */
    private urlQueue: string[] = [];

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
            }),
        );

        this.persistStateKey = options.persistStateKey;
        this.proxyUrl = options.proxyUrl;

        this.sitemapParsingProgress.pendingUrls = new Set(options.sitemapUrls);
    }

    /**
     * Indicates whether the background processing of sitemap contents has already finished.
     */
    isSitemapFullyLoaded(): boolean {
        return this.sitemapParsingProgress.inProgressUrl === null && this.sitemapParsingProgress.pendingUrls.size === 0;
    }

    /**
     * Start processing the sitemaps and loading the URLs.
     *
     * Resolves once all the sitemaps URLs have been fully loaded (sets `isSitemapFullyLoaded` to `true`).
     */
    private async load(): Promise<void> {
        while (!this.isSitemapFullyLoaded() && !this.abortLoading) {
            const sitemapUrl =
                this.sitemapParsingProgress.inProgressUrl ??
                this.sitemapParsingProgress.pendingUrls.values().next().value;

            try {
                for await (const item of parseSitemap([{ type: 'url', url: sitemapUrl }], this.proxyUrl, {
                    maxDepth: 0,
                    emitNestedSitemaps: true,
                })) {
                    if (!item.originSitemapUrl) {
                        // This is a nested sitemap
                        this.sitemapParsingProgress.pendingUrls.add(item.loc);
                        continue;
                    }

                    if (!this.sitemapParsingProgress.inProgressEntries.has(item.loc)) {
                        this.urlQueue.push(item.loc);
                        this.sitemapParsingProgress.inProgressEntries.add(item.loc);
                    }
                }
            } catch (e: any) {
                this.log.error('Error loading sitemap contents:', e);
            }

            this.sitemapParsingProgress.pendingUrls.delete(sitemapUrl);
            this.sitemapParsingProgress.inProgressEntries.clear();
            this.sitemapParsingProgress.inProgressUrl = null;
        }
    }

    /**
     * Open a sitemap and start processing it.
     *
     * Resolves to a new instance of `SitemapRequestList`, which **might not be fully loaded yet** - i.e. the sitemap might still be loading in the background.
     *
     * Track the loading progress using the `isSitemapFullyLoaded` property.
     */
    static async open(options: SitemapRequestListOptions): Promise<SitemapRequestList> {
        const requestList = new SitemapRequestList(options);
        await requestList.restoreState();
        void requestList.load();

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
        return this.urlQueue.length + this.handledUrlCount - this.inProgress.size - this.reclaimed.size;
    }

    /**
     * @inheritDoc
     */
    async isFinished(): Promise<boolean> {
        return (
            this.urlQueue.length === 0 &&
            this.inProgress.size === 0 &&
            this.reclaimed.size === 0 &&
            (this.isSitemapFullyLoaded() || this.abortLoading)
        );
    }

    /**
     * @inheritDoc
     */
    async isEmpty(): Promise<boolean> {
        return this.reclaimed.size === 0 && this.urlQueue.length === 0;
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

        await this.store.setValue(this.persistStateKey, {
            sitemapParsingProgress: {
                pendingUrls: Array.from(this.sitemapParsingProgress.pendingUrls),
                inProgressUrl: this.sitemapParsingProgress.inProgressUrl,
                inProgressEntries: Array.from(this.sitemapParsingProgress.inProgressEntries),
            },
            urlQueue: this.urlQueue,
            reclaimed: [...this.inProgress, ...this.reclaimed], // In-progress and reclaimed requests will be both retried if state is restored
            abortLoading: this.abortLoading,
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
            pendingUrls: new Set(state.sitemapParsingProgress.pendingUrls),
            inProgressUrl: state.sitemapParsingProgress.inProgressUrl,
            inProgressEntries: new Set(state.sitemapParsingProgress.inProgressEntries),
        };
        this.urlQueue = state.urlQueue;
        this.abortLoading = state.abortLoading;
    }

    /**
     * @inheritDoc
     */
    async fetchNextRequest(): Promise<Request | null> {
        // Try to return a reclaimed request first
        const url = this.reclaimed.values().next().value as string | undefined;
        if (url !== undefined) {
            this.reclaimed.delete(url);
            return new Request({ url });
        }

        // Otherwise return next request.
        const nextUrl = this.urlQueue.shift();
        if (!nextUrl) {
            return null;
        }

        const request = new Request({ url: nextUrl });
        this.inProgress.add(request.url);

        return request;
    }

    /**
     * @inheritDoc
     */
    async *waitForNextRequest() {
        while ((!this.isSitemapFullyLoaded() && !this.abortLoading) || this.urlQueue.length > 0) {
            const request = await this.fetchNextRequest();
            if (request) {
                yield request;
            } else {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }

    /**
     * @inheritDoc
     */
    async reclaimRequest(request: Request): Promise<void> {
        this.ensureInProgressAndNotReclaimed(request.url);
        this.reclaimed.add(request.url);
    }

    /**
     * @inheritDoc
     */
    async markRequestHandled(request: Request): Promise<void> {
        this.handledUrlCount += 1;
        this.ensureInProgressAndNotReclaimed(request.url);
        this.inProgress.delete(request.url);
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
