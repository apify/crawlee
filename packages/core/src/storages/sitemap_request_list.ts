import { parseSitemap } from '@crawlee/utils';

import type { IRequestList } from './request_list';
import { Request } from '../request';

export class SitemapRequestList implements IRequestList {
    inProgress = new Set<string>();

    reclaimed = new Set<string>();

    requests: Request[] = [];

    uniqueKeyToIndex = new Map<string, number>();

    private nextIndex = 0;

    private isSitemapFullyLoaded = false;

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

    static async open({ sitemapUrls }: { sitemapUrls: string | string[] }): Promise<SitemapRequestList> {
        return new SitemapRequestList(
            (Array.isArray(sitemapUrls) ? sitemapUrls : [sitemapUrls]).map((url) => ({ type: 'url', url })),
        );
    }

    length(): number {
        return this.requests.length;
    }

    async isFinished(): Promise<boolean> {
        return this.inProgress.size === 0 && this.nextIndex >= this.requests.length && this.isSitemapFullyLoaded;
    }

    async isEmpty(): Promise<boolean> {
        return this.reclaimed.size === 0 && this.nextIndex >= this.requests.length;
    }

    handledCount(): number {
        return this.nextIndex - this.inProgress.size;
    }

    async persistState(): Promise<void> {
        throw new Error('SitemapRequestList persistence is not yet implemented.');
    }

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

    async reclaimRequest(request: Request): Promise<void> {
        this.ensureInProgressAndNotReclaimed(request.uniqueKey);
        this.reclaimed.add(request.uniqueKey);
    }

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
