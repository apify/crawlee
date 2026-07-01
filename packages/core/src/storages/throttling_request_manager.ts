import { URL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Dictionary, ProcessedRequest, BatchAddRequestsResult } from '@crawlee/types';
import ow from 'ow';

import { Configuration } from '../configuration.js';
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

export type RequestManagerOpener<T extends IRequestManager = IRequestManager> = (
    identifier: string | { alias: string },
    options?: { config?: Configuration; storageClient?: any },
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

    private newWorkSignaled = false;
    private resolveNewWork: (() => void) | null = null;

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

    private selectManager(url: string): T {
        const domain = this.extractDomain(url);
        return this.subManagers.get(domain) ?? this.inner;
    }

    private async getOrCreateSubManager(domain: string): Promise<T> {
        let sm = this.subManagers.get(domain);
        if (!sm) {
            sm = await this.requestManagerOpener({ alias: `throttled-${domain}` }, { config: this.config });
            this.subManagers.set(domain, sm);
        }
        return sm;
    }

    private signalNewWork(): void {
        this.newWorkSignaled = true;
        if (this.resolveNewWork) {
            this.resolveNewWork();
            this.resolveNewWork = null;
        }
    }

    private clearNewWork(): void {
        this.newWorkSignaled = false;
    }

    private async waitForNewWorkOrTimeout(timeoutMs: number): Promise<void> {
        if (this.newWorkSignaled) {
            return;
        }

        let timeoutId: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<void>((resolve) => {
            timeoutId = setTimeout(resolve, timeoutMs);
        });

        const workPromise = new Promise<void>((resolve) => {
            this.resolveNewWork = resolve;
        });

        await Promise.race([workPromise, timeoutPromise]);

        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        this.resolveNewWork = null;
    }

    private markDomainDispatched(domain: string): void {
        const state = this.domainStates.get(domain);
        if (state && state.crawlDelayMs !== null) {
            state.throttledUntil = Date.now() + state.crawlDelayMs;
        }
    }

    private getEarliestAvailableTime(now: number): number {
        let earliest = now + this.maxDelayMs;
        for (const state of this.domainStates.values()) {
            if (now < state.throttledUntil && state.throttledUntil < earliest) {
                earliest = state.throttledUntil;
            }
        }
        return earliest;
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

        this.signalNewWork();
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
        if (!state || state.crawlDelayMs !== null) {
            return;
        }
        state.crawlDelayMs = delaySeconds * 1000;
        this.log.debug(`Set crawl-delay for domain "${state.domain}" to ${delaySeconds}s`);
    }

    // --- IRequestManager Implementation ---

    async addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo> {
        const url = this.getUrlFromRequest(requestLike);
        const domain = this.extractDomain(url);

        let result: RequestQueueOperationInfo;
        if (this.domainStates.has(domain)) {
            const sm = await this.getOrCreateSubManager(domain);
            result = await sm.addRequest(requestLike, options);
        } else {
            result = await this.inner.addRequest(requestLike, options);
        }

        this.signalNewWork();
        return result;
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

        for (const [domain, reqs] of domainRequests.entries()) {
            const sm = await this.getOrCreateSubManager(domain);
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
            this.signalNewWork();
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

        const batchSize = options.batchSize ?? 1000;
        const waitBetweenBatchesMillis = options.waitBetweenBatchesMillis ?? 1000;

        const initialBatch = allRequests.slice(0, batchSize);
        const remainingBatches = allRequests.slice(batchSize);

        const addedRequests = (await this.addRequests(initialBatch, options)).processedRequests;

        let promise: Promise<ProcessedRequest[]>;
        if (remainingBatches.length > 0) {
            promise = (async () => {
                const finalAddedRequests: ProcessedRequest[] = [];
                for (let i = 0; i < remainingBatches.length; i += batchSize) {
                    const chunk = remainingBatches.slice(i, i + batchSize);
                    const res = await this.addRequests(chunk, { ...options, cache: false });
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
        const manager = this.selectManager(request.url);
        const result = await manager.reclaimRequest(request, options);
        this.signalNewWork();
        return result;
    }

    async markRequestAsHandled(request: Request): Promise<RequestQueueOperationInfo | void | null> {
        const manager = this.selectManager(request.url);
        const result = await manager.markRequestAsHandled(request);
        const isSuccess = request.errorMessages.length <= request.retryCount;
        if (isSuccess) {
            this.recordSuccess(request.url);
        }
        return result;
    }

    async getTotalCount(): Promise<number> {
        const counts = await Promise.all([
            this.inner.getTotalCount(),
            ...Array.from(this.subManagers.values()).map((sm) => sm.getTotalCount()),
        ]);
        return counts.reduce((a, b) => a + b, 0);
    }

    async getPendingCount(): Promise<number> {
        const counts = await Promise.all([
            this.inner.getPendingCount(),
            ...Array.from(this.subManagers.values()).map((sm) => sm.getPendingCount()),
        ]);
        return counts.reduce((a, b) => a + b, 0);
    }

    async getHandledCount(): Promise<number> {
        const counts = await Promise.all([
            this.inner.getHandledCount(),
            ...Array.from(this.subManagers.values()).map((sm) => sm.getHandledCount()),
        ]);
        return counts.reduce((a, b) => a + b, 0);
    }

    async isEmpty(): Promise<boolean> {
        const empties = await Promise.all([
            this.inner.isEmpty(),
            ...Array.from(this.subManagers.values()).map((sm) => sm.isEmpty()),
        ]);
        return empties.every(Boolean);
    }

    async isFinished(): Promise<boolean> {
        const finished = await Promise.all([
            this.inner.isFinished(),
            ...Array.from(this.subManagers.values()).map((sm) => sm.isFinished()),
        ]);
        return finished.every(Boolean);
    }

    async purge(): Promise<void> {
        const purges = [this.inner.purge?.(), ...Array.from(this.subManagers.values()).map((sm) => sm.purge?.())];
        await Promise.all(purges);
        for (const state of this.domainStates.values()) {
            state.consecutive429Count = 0;
            state.throttledUntil = 0;
        }
    }

    setExpectedRequestProcessingTimeSecs(secs: number): void {
        this.inner.setExpectedRequestProcessingTimeSecs?.(secs);
        for (const sm of this.subManagers.values()) {
            sm.setExpectedRequestProcessingTimeSecs?.(secs);
        }
    }

    async fetchNextRequest<R extends Dictionary = Dictionary>(): Promise<Request<R> | null> {
        while (true) {
            this.clearNewWork();

            const now = Date.now();
            const availableDomains: string[] = [];
            for (const [domain, state] of this.domainStates.entries()) {
                if (this.subManagers.has(domain) && now >= state.throttledUntil) {
                    availableDomains.push(domain);
                }
            }

            availableDomains.sort((a, b) => {
                const stateA = this.domainStates.get(a)!;
                const stateB = this.domainStates.get(b)!;
                return stateA.throttledUntil - stateB.throttledUntil;
            });

            for (const domain of availableDomains) {
                const sm = this.subManagers.get(domain)!;
                const req = await sm.fetchNextRequest<R>();
                if (req) {
                    this.markDomainDispatched(domain);
                    return req;
                }
            }

            const request = await this.inner.fetchNextRequest<R>();
            if (request) {
                return request;
            }

            if (this.subManagers.size === 0) {
                return null;
            }

            const subManagersEmpty = await Promise.all(Array.from(this.subManagers.values()).map((sm) => sm.isEmpty()));
            if (subManagersEmpty.every(Boolean)) {
                return null;
            }

            const earliest = this.getEarliestAvailableTime(now);
            const sleepDurationMs = Math.max(earliest - now, 100);

            this.log.debug(
                `All configured domains are throttled and inner manager is empty. ` +
                    `Waiting up to ${(sleepDurationMs / 1000).toFixed(1)}s for earliest domain to become available or new work.`,
            );

            await this.waitForNewWorkOrTimeout(sleepDurationMs);
        }
    }

    async *[Symbol.asyncIterator]() {
        while (true) {
            const req = await this.fetchNextRequest();
            if (!req) break;
            yield req;
        }
    }

    async persistState(): Promise<void> {
        const persists = [
            this.inner.persistState?.(),
            ...Array.from(this.subManagers.values()).map((sm) => sm.persistState?.()),
        ];
        await Promise.all(persists);
    }

    async drop(): Promise<void> {
        const drops = [
            (this.inner as any).drop?.(),
            ...Array.from(this.subManagers.values()).map((sm) => (sm as any).drop?.()),
        ];
        await Promise.all(drops);
        this.subManagers.clear();
    }
}
