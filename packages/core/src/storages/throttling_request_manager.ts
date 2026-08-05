import { URL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Dictionary, ProcessedRequest, BatchAddRequestsResult } from '@crawlee/types';
import ow from 'ow';

import type { Configuration } from '../configuration.js';
import type { CrawleeLogger } from '../log.js';
import type { Request, Source } from '../request.js';
import { serviceLocator } from '../service_locator.js';
import type { IRequestManager, RequestsLike } from './request_manager.js';
import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    RequestQueueOperationInfo,
    RequestQueueOperationOptions,
} from './request_queue.js';
import { RequestQueue } from './request_queue.js';
import type { StorageIdentifier } from './storage_instance_manager.js';
import type { StorageOpenOptions } from './utils.js';

export type RequestManagerOpener<T extends IRequestManager = IRequestManager> = (
    identifier: string | StorageIdentifier,
    options?: StorageOpenOptions,
) => Promise<T>;

export interface ThrottlingRequestManagerOptions<T extends IRequestManager = IRequestManager> {
    inner: T;
    domains: string[];
    requestManagerOpener?: RequestManagerOpener<T>;
    baseDelayMs?: number;
    maxDelayMs?: number;
}

interface DomainState {
    domain: string;
    throttledUntil: number; // Date.now() timestamp in ms
    consecutive429Count: number;
    crawlDelayMs: number | null;
}

export function parseRetryAfterHeader(value?: string | null): number | null {
    if (!value) {
        return null;
    }

    const seconds = parseInt(value, 10);
    if (!isNaN(seconds) && String(seconds) === value.trim()) {
        return seconds * 1000;
    }

    try {
        const date = Date.parse(value);
        if (!isNaN(date)) {
            const delayMs = date - Date.now();
            return delayMs > 0 ? delayMs : null;
        }
    } catch {
        // Ignore
    }

    return null;
}

export class ThrottlingRequestManager<T extends IRequestManager = IRequestManager> implements IRequestManager {
    private readonly inner: T;
    private readonly domains: string[];
    private readonly requestManagerOpener: RequestManagerOpener<T>;
    private readonly baseDelayMs: number;
    private readonly maxDelayMs: number;

    private readonly domainStates = new Map<string, DomainState>();
    private readonly subManagers = new Map<string, T>();
    private readonly log: CrawleeLogger;

    /**
     * Sub-managers are keyed by a stable alias, so they outlive the process. They must therefore be reopened
     * for every configured domain rather than created on first insert - otherwise a restart sees an empty map,
     * reports the crawl finished, and strands whatever the previous run left in them.
     */
    private subManagersReady?: Promise<void>;

    constructor(
        options: ThrottlingRequestManagerOptions<T>,
        protected readonly config: Configuration = serviceLocator.getConfiguration(),
    ) {
        ow(
            options,
            ow.object.exactShape({
                inner: ow.object,
                domains: ow.array.ofType(ow.string),
                requestManagerOpener: ow.optional.function,
                baseDelayMs: ow.optional.number,
                maxDelayMs: ow.optional.number,
            }),
        );

        this.inner = options.inner;
        this.domains = options.domains;
        this.requestManagerOpener =
            options.requestManagerOpener ??
            ((idOrAlias, opts) => {
                return RequestQueue.open(idOrAlias, opts) as unknown as Promise<T>;
            });
        this.baseDelayMs = options.baseDelayMs ?? 2000;
        this.maxDelayMs = options.maxDelayMs ?? 60000;
        this.log = serviceLocator.getLogger().child({ prefix: 'ThrottlingRequestManager' });

        for (const domain of this.domains) {
            if (domain) {
                const lowerDomain = domain.toLowerCase();
                this.domainStates.set(lowerDomain, {
                    domain: lowerDomain,
                    throttledUntil: 0,
                    consecutive429Count: 0,
                    crawlDelayMs: null,
                });
            }
        }
    }

    private getUrlFromRequest(requestLike: Source | string): string {
        if (typeof requestLike === 'string') {
            return requestLike;
        }
        return requestLike.url ?? '';
    }

    private extractDomain(url: string): string {
        try {
            const parsed = new URL(url);
            return parsed.hostname.toLowerCase();
        } catch {
            return '';
        }
    }

    private getDomainState(url: string): DomainState | null {
        const domain = this.extractDomain(url);
        return this.domainStates.get(domain) ?? null;
    }

    private async selectManager(url: string): Promise<T> {
        await this.ensureSubManagers();
        const domain = this.extractDomain(url);
        return this.subManagers.get(domain) ?? this.inner;
    }

    private async ensureSubManagers(): Promise<void> {
        this.subManagersReady ??= (async () => {
            await Promise.all(
                Array.from(this.domainStates.keys(), async (domain) => {
                    const subManager = await this.requestManagerOpener(
                        { alias: `throttled-${domain}` },
                        { configuration: this.config },
                    );
                    this.subManagers.set(domain, subManager);
                }),
            );
        })();

        await this.subManagersReady;
    }

    private async getSubManagers(): Promise<T[]> {
        await this.ensureSubManagers();
        return Array.from(this.subManagers.values());
    }

    private markDomainDispatched(domain: string): void {
        const state = this.domainStates.get(domain);
        if (state && state.crawlDelayMs !== null) {
            state.throttledUntil = Date.now() + state.crawlDelayMs;
        }
    }

    /** Configured domains that are not currently backing off, longest-overdue first. */
    private fetchableDomains(): string[] {
        const now = Date.now();
        return Array.from(this.domainStates.values())
            .filter((state) => now >= state.throttledUntil)
            .sort((a, b) => a.throttledUntil - b.throttledUntil)
            .map((state) => state.domain);
    }

    recordDomainDelay(url: string, retryAfterMs?: number | null): boolean {
        const state = this.getDomainState(url);
        if (!state) {
            return false;
        }

        state.consecutive429Count += 1;
        let delayMs =
            retryAfterMs !== undefined && retryAfterMs !== null
                ? retryAfterMs
                : this.baseDelayMs * Math.pow(2, state.consecutive429Count - 1);

        if (delayMs > this.maxDelayMs) {
            const source =
                retryAfterMs !== undefined && retryAfterMs !== null ? 'Retry-After header' : 'exponential backoff';
            this.log.warning(
                `Capping ${source} delay of ${(delayMs / 1000).toFixed(1)}s for domain "${state.domain}" ` +
                    `to maxDelayMs (${(this.maxDelayMs / 1000).toFixed(1)}s); the domain may continue to rate-limit. ` +
                    `Consider increasing maxDelayMs if this recurs.`,
            );
            delayMs = this.maxDelayMs;
        }

        state.throttledUntil = Date.now() + delayMs;

        this.log.info(
            `Rate limit (429) detected for domain "${state.domain}" ` +
                `(consecutive: ${state.consecutive429Count}, delay: ${(delayMs / 1000).toFixed(1)}s)`,
        );

        return true;
    }

    recordSuccess(url: string): void {
        const state = this.getDomainState(url);
        if (state && state.consecutive429Count > 0) {
            this.log.debug(`Resetting rate limit state for domain "${state.domain}" after successful request`);
            state.consecutive429Count = 0;
        }
    }

    setCrawlDelay(url: string, delaySeconds: number): void {
        const state = this.getDomainState(url);
        if (state?.crawlDelayMs !== null) {
            return;
        }
        state.crawlDelayMs = delaySeconds * 1000;
        this.log.debug(`Set crawl-delay for domain "${state.domain}" to ${delaySeconds}s`);
    }

    // --- IRequestManager Implementation ---

    async addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo> {
        const manager = await this.selectManager(this.getUrlFromRequest(requestLike));
        return manager.addRequest(requestLike, options);
    }

    async addRequests(
        requestsLike: RequestsLike,
        options: RequestQueueOperationOptions = {},
    ): Promise<BatchAddRequestsResult> {
        const innerRequests: (Source | string)[] = [];
        const domainRequests = new Map<string, (Source | string)[]>();

        for await (const request of requestsLike) {
            const url = this.getUrlFromRequest(request);
            const domain = this.extractDomain(url);

            if (this.domainStates.has(domain)) {
                if (!domainRequests.has(domain)) {
                    domainRequests.set(domain, []);
                }
                domainRequests.get(domain)!.push(request);
            } else {
                innerRequests.push(request);
            }
        }

        const results: BatchAddRequestsResult = {
            processedRequests: [],
            unprocessedRequests: [],
        };

        if (innerRequests.length > 0) {
            if ('addRequests' in this.inner && typeof (this.inner as any).addRequests === 'function') {
                const res = await (this.inner as any).addRequests(innerRequests, options);
                results.processedRequests.push(...res.processedRequests);
                results.unprocessedRequests.push(...res.unprocessedRequests);
            } else {
                for (const req of innerRequests) {
                    const res = await this.inner.addRequest(typeof req === 'string' ? { url: req } : req, options);
                    results.processedRequests.push(res);
                }
            }
        }

        await this.ensureSubManagers();

        for (const [domain, reqs] of domainRequests.entries()) {
            const sm = this.subManagers.get(domain)!;
            if ('addRequests' in sm && typeof (sm as any).addRequests === 'function') {
                const res = await (sm as any).addRequests(reqs, options);
                results.processedRequests.push(...res.processedRequests);
                results.unprocessedRequests.push(...res.unprocessedRequests);
            } else {
                for (const req of reqs) {
                    const res = await sm.addRequest(typeof req === 'string' ? { url: req } : req, options);
                    results.processedRequests.push(res);
                }
            }
        }

        if (innerRequests.length > 0 || domainRequests.size > 0) {
        }

        return results;
    }

    async addRequestsBatched(
        requests: RequestsLike,
        options: AddRequestsBatchedOptions = {},
    ): Promise<AddRequestsBatchedResult> {
        const allRequests: (Source | string)[] = [];
        for await (const req of requests) {
            allRequests.push(req);
        }

        const { batchSize = 1000, waitBetweenBatchesMillis = 1000, forefront } = options;
        const operationOptions: RequestQueueOperationOptions = { forefront };

        const initialBatch = allRequests.slice(0, batchSize);
        const remainingBatches = allRequests.slice(batchSize);

        const addedRequests = (await this.addRequests(initialBatch, operationOptions)).processedRequests;

        let promise: Promise<ProcessedRequest[]>;
        if (remainingBatches.length > 0) {
            promise = (async () => {
                const finalAddedRequests: ProcessedRequest[] = [];
                for (let i = 0; i < remainingBatches.length; i += batchSize) {
                    const chunk = remainingBatches.slice(i, i + batchSize);
                    const res = await this.addRequests(chunk, { ...operationOptions, cache: false });
                    finalAddedRequests.push(...res.processedRequests);
                    await sleep(waitBetweenBatchesMillis);
                }
                return finalAddedRequests;
            })();

            if (options.waitForAllRequestsToBeAdded) {
                addedRequests.push(...(await promise));
            }
        } else {
            promise = Promise.resolve([]);
        }

        return {
            addedRequests,
            waitForAllRequestsToBeAdded: promise,
        };
    }

    async reclaimRequest(
        request: Request,
        options?: RequestQueueOperationOptions,
    ): Promise<RequestQueueOperationInfo | null> {
        const manager = await this.selectManager(request.url);
        return manager.reclaimRequest(request, options);
    }

    async markRequestAsHandled(request: Request): Promise<RequestQueueOperationInfo | void | null> {
        const manager = await this.selectManager(request.url);
        const result = await manager.markRequestAsHandled(request);
        const isSuccess = request.errorMessages.length <= request.retryCount;
        if (isSuccess) {
            this.recordSuccess(request.url);
        }
        return result;
    }

    async getTotalCount(): Promise<number> {
        return this.sumOverManagers((manager) => manager.getTotalCount());
    }

    async getPendingCount(): Promise<number> {
        return this.sumOverManagers((manager) => manager.getPendingCount());
    }

    async getHandledCount(): Promise<number> {
        return this.sumOverManagers((manager) => manager.getHandledCount());
    }

    /**
     * Whether the next {@apilink ThrottlingRequestManager.fetchNextRequest} would return `null`.
     *
     * Requests waiting on a throttled domain count as unavailable, so a crawler whose task loop is gated on
     * this idles for the backoff instead of spinning on a fetch that cannot succeed yet.
     */
    async isEmpty(): Promise<boolean> {
        await this.ensureSubManagers();

        const fetchable = [this.inner, ...this.fetchableDomains().map((domain) => this.subManagers.get(domain)!)];
        const results = await Promise.all(fetchable.map((manager) => manager.isEmpty()));

        return results.every(Boolean);
    }

    /** Unlike {@apilink ThrottlingRequestManager.isEmpty}, throttled requests still count as outstanding work. */
    async isFinished(): Promise<boolean> {
        return this.everyManager((manager) => manager.isFinished());
    }

    async purge(): Promise<void> {
        await this.forEachManager((manager) => manager.purge?.());
        for (const state of this.domainStates.values()) {
            state.consecutive429Count = 0;
            state.throttledUntil = 0;
        }
    }

    async setExpectedRequestProcessingTimeSecs(secs: number): Promise<void> {
        await this.forEachManager((manager) => manager.setExpectedRequestProcessingTimeSecs?.(secs));
    }

    private async forEachManager(fn: (manager: T) => Promise<unknown> | undefined): Promise<void> {
        await Promise.all([this.inner, ...(await this.getSubManagers())].map(fn));
    }

    private async sumOverManagers(fn: (manager: T) => Promise<number>): Promise<number> {
        const counts = await Promise.all([this.inner, ...(await this.getSubManagers())].map(fn));
        return counts.reduce((a, b) => a + b, 0);
    }

    private async everyManager(fn: (manager: T) => Promise<boolean>): Promise<boolean> {
        const results = await Promise.all([this.inner, ...(await this.getSubManagers())].map(fn));
        return results.every(Boolean);
    }

    /**
     * Returns the next request from a domain that is not backing off, or from the inner manager.
     *
     * Returns `null` while every remaining request belongs to a throttled domain - it never waits the backoff
     * out, because a consumer parked in here holds a concurrency slot, which the autoscaler reads as spare
     * capacity and answers by scaling up. Callers poll instead, and {@apilink ThrottlingRequestManager.isEmpty}
     * reports `true` meanwhile so the crawler's task loop idles rather than spins.
     */
    async fetchNextRequest<R extends Dictionary = Dictionary>(): Promise<Request<R> | null> {
        await this.ensureSubManagers();

        for (const domain of this.fetchableDomains()) {
            const request = await this.subManagers.get(domain)!.fetchNextRequest<R>();
            if (request) {
                this.markDomainDispatched(domain);
                return request;
            }
        }

        return this.inner.fetchNextRequest<R>();
    }

    async *[Symbol.asyncIterator]() {
        while (true) {
            const req = await this.fetchNextRequest();
            if (!req) break;
            yield req;
        }
    }

    async persistState(): Promise<void> {
        await this.forEachManager((manager) => manager.persistState?.());
    }

    async drop(): Promise<void> {
        await this.forEachManager((manager) => (manager as { drop?(): Promise<void> }).drop?.());
        this.subManagers.clear();
        this.subManagersReady = undefined;
    }
}
