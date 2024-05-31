import { parseSitemap } from '@crawlee/utils';
import ow from 'ow';

import { KeyValueStore } from './key_value_store';
import type { IRequestList } from './request_list';
import { purgeDefaultStorages } from './utils';
import { Request } from '../request';

export interface SitemapRequestListOptions {
    sitemapUrls: string[];
    proxyUrl?: string;
    persistStateKey?: string;
}

interface SitemapRequestListState {
    reclaimed: string[];
    handledSitemapUrls: string[];
    handledUrls: string[];
    currentSitemapUrl?: string;
    currentSitemapUrlQueue?: string[];
}

/**
 * A list of URLs to crawl parsed from a sitemap.
 *
 * The loading of the sitemap is performed in the background so that crawling can start before the sitemap is fully loaded.
 */
export class SitemapRequestList implements IRequestList {
    /**
     * Set of URLs that were returned by fetchNextRequest() and not marked as handled yet.
     * @internal */
    inProgress = new Set<string>();

    /** Set of URLs for which reclaimRequest() was called. */
    private reclaimed = new Set<string>();

    /** Request objects for in-progress and reclaimed URLs so that we can keep track of state */
    private requestData = new Map<string, Request>();

    /**
     * URLs of
     * 1. sitemaps that have been completely processed and
     * 2. processed sitemap items of the current (partially processed) sitemap
     */
    private handledUrls = { sitemapUrls: new Set<string>(), urls: new Set<string>() };

    /** URLs loaded from the sitemaps */
    private queuedUrlsBySitemap = new Map<string, string[]>();

    /** Number of URLs that were marked as handled */
    private handledUrlCount = 0;

    /** Indicates whether the background processing of sitemap contents has already finished.  */
    private isSitemapFullyLoaded = false;

    private persistStateKey?: string;

    private store?: KeyValueStore;

    private sitemapUrls: string[];

    private proxyUrl: string | undefined;

    /** @internal */
    private constructor(options: SitemapRequestListOptions) {
        ow(
            options,
            ow.object.exactShape({
                sitemapUrls: ow.array,
                proxyUrl: ow.optional.string,
                persistStateKey: ow.optional.string,
            }),
        );

        this.persistStateKey = options.persistStateKey;
        this.sitemapUrls = options.sitemapUrls;
        this.proxyUrl = options.proxyUrl;
    }

    private startLoadingInBackground(): void {
        (async () => {
            for await (const item of parseSitemap(
                this.sitemapUrls.map((url) => ({ type: 'url', url })),
                this.proxyUrl,
            )) {
                if (this.handledUrls.sitemapUrls.has(item.originSitemapUrl)) {
                    continue;
                }

                if (!this.queuedUrlsBySitemap.has(item.originSitemapUrl)) {
                    this.queuedUrlsBySitemap.set(item.originSitemapUrl, []);
                }

                const queue = this.queuedUrlsBySitemap.get(item.originSitemapUrl)!;

                if (!this.handledUrls.urls.has(item.url)) {
                    queue.push(item.url);
                }
            }
        })()
            .then(() => {
                this.isSitemapFullyLoaded = true;
            })
            .catch(() => {
                this.isSitemapFullyLoaded = true;
            });
    }

    /**
     * Open a sitemap and start processing it.
     */
    static async open(options: SitemapRequestListOptions): Promise<SitemapRequestList> {
        const requestList = new SitemapRequestList(options);
        await requestList.restoreState();
        requestList.startLoadingInBackground();
        return requestList;
    }

    /**
     * @inheritDoc
     */
    length(): number {
        const totalQueueSize = Array.from(this.queuedUrlsBySitemap.values())
            .map((it) => it.length)
            .reduce((acc, val) => acc + val);

        return totalQueueSize + this.handledUrlCount - this.inProgress.size - this.reclaimed.size;
    }

    /**
     * @inheritDoc
     */
    async isFinished(): Promise<boolean> {
        return this.inProgress.size === 0 && this.getQueuedRequestUrl() === null && this.isSitemapFullyLoaded;
    }

    /**
     * @inheritDoc
     */
    async isEmpty(): Promise<boolean> {
        return this.getQueuedRequestUrl() === null;
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

        const sitemapUrl: string | undefined = this.queuedUrlsBySitemap.keys().next().value;

        await this.store.setValue(this.persistStateKey, {
            handledSitemapUrls: Array.from(this.handledUrls.sitemapUrls),
            handledUrls: Array.from(this.handledUrls.urls),
            reclaimed: [...this.inProgress, ...this.reclaimed], // In-progress and reclaimed requests will be both retried if state is restored
            currentSitemapUrl: sitemapUrl, // We only store the queue from a single sitemap for better storage efficiency
            currentSitemapUrlQueue: sitemapUrl !== undefined ? this.queuedUrlsBySitemap.get(sitemapUrl) : undefined,
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
        for (const url of state.reclaimed) {
            this.requestData.set(url, new Request({ url }));
        }

        this.handledUrls = {
            sitemapUrls: new Set(state.handledSitemapUrls),
            urls: new Set(state.handledUrls),
        };

        this.queuedUrlsBySitemap.clear();
        if (state.currentSitemapUrl !== undefined) {
            this.queuedUrlsBySitemap.set(state.currentSitemapUrl, state.currentSitemapUrlQueue ?? []);
        }
    }

    /**
     * @inheritDoc
     */
    async fetchNextRequest(): Promise<Request | null> {
        // Try to return a reclaimed request first
        const url = this.reclaimed.values().next().value as string | undefined;
        if (url !== undefined) {
            this.reclaimed.delete(url);
            return this.requestData.get(url)!;
        }

        // Otherwise return next request.
        const queuedUrl = this.getQueuedRequestUrl();
        if (queuedUrl !== null) {
            const request = new Request({ url: queuedUrl });
            this.advanceQueue();

            this.requestData.set(request.url, request);
            this.inProgress.add(request.url);

            return request;
        }

        return null;
    }

    /** Get the next URL to be processed, without changing the queue. */
    private getQueuedRequestUrl(): string | null {
        for (const queue of this.queuedUrlsBySitemap.values()) {
            if (queue.length > 0) {
                return queue[0];
            }
        }

        return null;
    }

    /** Mark the URL at the front of the queue as handled (if any) and advance the queue (if possible) */
    private advanceQueue(): void {
        const sitemapUrls = Array.from(this.queuedUrlsBySitemap.keys());
        let found = false;

        for (let i = 0; i < sitemapUrls.length; i++) {
            const sitemapUrl = sitemapUrls[i];
            const queue = this.queuedUrlsBySitemap.get(sitemapUrl)!;

            if (queue.length >= 1) {
                found = true;
                this.handledUrls.urls.add(queue.shift()!);
            }

            if (queue.length === 0 && (i + 1 < sitemapUrls.length || this.isSitemapFullyLoaded)) {
                this.handledUrls.sitemapUrls.add(sitemapUrl);
                this.handledUrls.urls.clear();

                this.queuedUrlsBySitemap.delete(sitemapUrl);
            }

            if (found) {
                break;
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
