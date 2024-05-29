import { parseSitemap } from '@crawlee/utils';

import type { IRequestList } from './request_list';
import { Request } from '../request';

export interface SitemapRequestListOptions {
    sitemapUrls: string[];
}

/**
 * A list of URLs to crawl parsed from a sitemap.
 */
export class SitemapRequestList implements IRequestList {
    /**
     * Set of `uniqueKey`s of requests that were returned by fetchNextRequest().
     * @interal */
    inProgress = new Set<string>();

    /**
     * Set of `uniqueKey`s of requests for which reclaimRequest() was called.
     */
    private reclaimed = new Set<string>();

    /**
     * Array of all requests from the sitemap(s), in the order as they appeared in sources.
     * All requests in the array have distinct uniqueKey!
     */
    private requests: Request[] = [];

    /** Dictionary, key is Request.uniqueKey, value is corresponding index in the requests array. */
    private uniqueKeyToIndex = new Map<string, number>();

    /** Index to the next item in requests array to fetch. All previous requests are either handled or in progress. */
    private nextIndex = 0;

    /** Indicates whether the background processing of sitemap contents has already finished.  */
    private isSitemapFullyLoaded = false;

    /** @internal */
    private constructor(...args: Parameters<typeof parseSitemap>) {
        (async () => {
            for await (const item of parseSitemap(args[0], args[1])) {
                this.addRequest(item.url);
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
    static async open({ sitemapUrls }: SitemapRequestListOptions): Promise<SitemapRequestList> {
        return new SitemapRequestList(sitemapUrls.map((url) => ({ type: 'url', url })));
    }

    /**
     * @inheritDoc
     */
    length(): number {
        return this.requests.length;
    }

    /**
     * @inheritDoc
     */
    async isFinished(): Promise<boolean> {
        return this.inProgress.size === 0 && this.nextIndex >= this.requests.length && this.isSitemapFullyLoaded;
    }

    /**
     * @inheritDoc
     */
    async isEmpty(): Promise<boolean> {
        return this.reclaimed.size === 0 && this.nextIndex >= this.requests.length;
    }

    /**
     * @inheritDoc
     */
    handledCount(): number {
        return this.nextIndex - this.inProgress.size;
    }

    /**
     * @inheritDoc
     */
    async persistState(): Promise<void> {
        throw new Error('SitemapRequestList persistence is not yet implemented.');
    }

    /**
     * @inheritDoc
     */
    async fetchNextRequest(): Promise<Request | null> {
        // Try to return a reclaimed request first
        const uniqueKey = this.reclaimed.values().next().value as string | undefined;
        if (uniqueKey !== undefined) {
            this.reclaimed.delete(uniqueKey);
            const index = this.uniqueKeyToIndex.get(uniqueKey)!;
            return this.requests[index];
        }

        // Otherwise return next request.
        if (this.nextIndex < this.requests.length) {
            const request = this.requests[this.nextIndex];
            this.nextIndex += 1;

            this.inProgress.add(request.uniqueKey);

            return request;
        }

        return null;
    }

    /**
     * @inheritDoc
     */
    async reclaimRequest(request: Request): Promise<void> {
        this.ensureInProgressAndNotReclaimed(request.uniqueKey);
        this.reclaimed.add(request.uniqueKey);
    }

    /**
     * @inheritDoc
     */
    async markRequestHandled(request: Request): Promise<void> {
        this.ensureInProgressAndNotReclaimed(request.uniqueKey);
        this.inProgress.delete(request.uniqueKey);
    }

    private ensureInProgressAndNotReclaimed(uniqueKey: string): void {
        if (!this.inProgress.has(uniqueKey)) {
            throw new Error(`The request is not being processed (uniqueKey: ${uniqueKey})`);
        }
        if (this.reclaimed.has(uniqueKey)) {
            throw new Error(`The request was already reclaimed (uniqueKey: ${uniqueKey})`);
        }
    }

    private addRequest(url: string): void {
        const request = new Request({ url });
        this.requests.push(request);
        this.uniqueKeyToIndex.set(request.uniqueKey, this.requests.length - 1);
    }
}
