import { URL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Dictionary, ProcessedRequest } from '@crawlee/types';
import ow from 'ow';

import type { Configuration } from '../configuration.js';
import { asyncifyIterable, chunkedAsyncIterable, peekableAsyncIterable } from '../iterables.js';
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

/**
 * Opens a request manager, matching the shape of storage `open` methods such as
 * {@apilink RequestQueue.open|`RequestQueue.open`}.
 *
 * {@apilink ThrottlingRequestManager} calls this once per configured domain, so every per-domain queue shares the
 * concrete type and storage backend of the manager being wrapped.
 */
export type RequestManagerOpener<T extends IRequestManager = IRequestManager> = (
    identifier: string | StorageIdentifier,
    options?: StorageOpenOptions,
) => Promise<T>;

export interface ThrottlingRequestManagerOptions<T extends IRequestManager = IRequestManager> {
    /**
     * The request manager to wrap, usually a {@apilink RequestQueue}. Requests for domains that are not throttled
     * are stored here.
     */
    inner: T;

    /**
     * Hostnames to throttle. Matching is case-insensitive and exact - wildcards such as `*.example.com` are not
     * supported, so list each subdomain you care about. Requests for any other domain bypass throttling entirely.
     */
    domains: string[];

    /**
     * Opens the per-domain queues, one per entry in `domains`, each under the alias `throttled-<domain>`.
     * @default RequestQueue.open
     */
    requestManagerOpener?: RequestManagerOpener<T>;

    /**
     * The delay applied after a domain's first HTTP 429, doubled on each subsequent one.
     * @default 2000
     */
    baseDelayMs?: number;

    /**
     * Upper bound on the delay between requests to a rate-limited domain, applied to both the exponential
     * backoff and a `Retry-After` value.
     * @default 60000
     */
    maxDelayMs?: number;
}

interface DomainState {
    domain: string;
    /** Earliest time the next request to this domain may be dispatched, as a `Date.now()` timestamp. */
    throttledUntil: number;
    /** Time after which an incoming 429 is treated as a fresh burst rather than a continuation. */
    backoffDecaysAt: number;
    consecutive429Count: number;
    /** Minimum interval between dispatches, from a robots.txt `Crawl-delay` directive. */
    crawlDelayMs: number | null;
}

/**
 * Parses a `Retry-After` response header into a delay in milliseconds.
 *
 * The header holds either a non-negative number of seconds or an HTTP-date.
 * See [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After).
 *
 * @returns The delay in milliseconds, or `null` if the header is absent, unparseable, or already elapsed.
 */
export function parseRetryAfterHeader(value?: string | null): number | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();

    // Per the spec this is a `delay-seconds`: digits only, so a negative or fractional value is not one.
    if (/^\d+$/.test(trimmed)) {
        return Number(trimmed) * 1000;
    }

    const date = Date.parse(trimmed);
    if (!Number.isNaN(date)) {
        const delayMs = date - Date.now();
        return delayMs > 0 ? delayMs : null;
    }

    return null;
}

/**
 * A request manager that wraps another one and paces requests per domain.
 *
 * Requests for the configured {@apilink ThrottlingRequestManagerOptions.domains|`domains`} are routed into their own
 * queue when they are added, so each request lives in exactly one place and deduplication keeps working. Everything
 * else goes to the wrapped manager untouched.
 *
 * {@apilink ThrottlingRequestManager.fetchNextRequest|`fetchNextRequest()`} serves the domain that has been waiting
 * longest and skips any that are backing off, falling back to the wrapped manager. It never blocks: while every
 * remaining request belongs to a throttled domain it returns `null` and {@apilink ThrottlingRequestManager.isEmpty}
 * reports `true`, so the crawler idles instead of holding a concurrency slot open.
 *
 * Delays come from two places:
 * - HTTP 429 responses, honouring `Retry-After` and otherwise backing off exponentially. The crawlers report these
 *   automatically; a request that is throttled is retried later without counting against `maxRequestRetries` and
 *   without penalising its session.
 * - robots.txt `Crawl-delay` directives, when `respectRobotsTxtFile` is enabled.
 *
 * This is opt-in: throttling only happens for a domain you list explicitly.
 *
 * **Example usage:**
 *
 * ```ts
 * const crawler = new CheerioCrawler({
 *     requestManager: new ThrottlingRequestManager({
 *         inner: await RequestQueue.open(),
 *         domains: ['api.example.com', 'slow-site.org'],
 *     }),
 *     requestHandler: async ({ request }) => { ... },
 * });
 * ```
 *
 * @category Sources
 */
export class ThrottlingRequestManager<T extends IRequestManager = IRequestManager> implements IRequestManager {
    private readonly inner: T;
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

    /** Batches still being added in the background; keeps {@apilink ThrottlingRequestManager.isFinished} honest. */
    private inProgressBatchCount = 0;

    private readonly warnedAbout = new Set<string>();

    private get hasThrottledDomains(): boolean {
        return this.domainStates.size > 0;
    }

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
        this.requestManagerOpener =
            options.requestManagerOpener ??
            ((idOrAlias, opts) => RequestQueue.open(idOrAlias, opts) as unknown as Promise<T>);
        this.baseDelayMs = options.baseDelayMs ?? 2_000;
        this.maxDelayMs = options.maxDelayMs ?? 60_000;
        this.log = serviceLocator.getLogger().child({ prefix: 'ThrottlingRequestManager' });

        for (const domain of options.domains) {
            if (domain) {
                const hostname = domain.toLowerCase();
                this.domainStates.set(hostname, {
                    domain: hostname,
                    throttledUntil: 0,
                    backoffDecaysAt: 0,
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

        if ('requestsFromUrl' in requestLike && requestLike.requestsFromUrl !== undefined && this.hasThrottledDomains) {
            // The URL list is only fetched once the owning manager expands it, so we cannot know which domains
            // it covers and cannot route it. Warn instead of silently exempting those URLs from throttling.
            this.warnOnce(
                'urlListNotRouted',
                `Requests loaded via \`requestsFromUrl\` cannot be routed to a per-domain queue, because their URLs ` +
                    `are not known at insertion time. They will be added to the inner request manager and will not ` +
                    `be throttled, even if they belong to a configured domain.`,
            );
        }

        return requestLike.url ?? '';
    }

    private warnOnce(key: string, message: string): void {
        if (this.warnedAbout.has(key)) {
            return;
        }
        this.warnedAbout.add(key);
        this.log.warning(message);
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
        return this.managerForUrl(url);
    }

    /** Only valid once {@apilink ThrottlingRequestManager.ensureSubManagers} has resolved. */
    private managerForUrl(url: string): T {
        return this.subManagers.get(this.extractDomain(url)) ?? this.inner;
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

    /**
     * Records a 429 response and puts the URL's domain into backoff.
     *
     * @returns `false` if the domain is not configured for throttling, in which case this is a no-op.
     */
    recordDomainDelay(url: string, retryAfterMs?: number | null): boolean {
        const state = this.getDomainState(url);
        if (!state) {
            return false;
        }

        const now = Date.now();

        // Requests already in flight when the limit was hit all come back 429. They describe one rate-limit
        // event, so only the first advances the backoff - otherwise concurrency alone drives the exponent.
        if (now < state.throttledUntil) {
            return true;
        }

        // A domain that has served us for a full extra backoff window is no longer rate-limiting; start over
        // rather than carrying the old exponent into an unrelated burst.
        if (now >= state.backoffDecaysAt) {
            state.consecutive429Count = 0;
        }

        state.consecutive429Count += 1;

        const retryAfterGiven = retryAfterMs !== undefined && retryAfterMs !== null;
        let delayMs = retryAfterGiven ? retryAfterMs : this.baseDelayMs * Math.pow(2, state.consecutive429Count - 1);

        if (delayMs > this.maxDelayMs) {
            const source = retryAfterGiven ? 'Retry-After header' : 'exponential backoff';
            this.log.warning(
                `Capping ${source} delay of ${(delayMs / 1000).toFixed(1)}s for domain "${state.domain}" ` +
                    `to maxDelayMs (${(this.maxDelayMs / 1000).toFixed(1)}s); the domain may continue to rate-limit. ` +
                    `Consider increasing maxDelayMs if this recurs.`,
            );
            delayMs = this.maxDelayMs;
        }

        state.throttledUntil = now + delayMs;
        state.backoffDecaysAt = state.throttledUntil + delayMs;

        this.log.info(
            `Rate limit (429) detected for domain "${state.domain}" ` +
                `(consecutive: ${state.consecutive429Count}, delay: ${(delayMs / 1000).toFixed(1)}s)`,
        );

        return true;
    }

    /**
     * Applies a robots.txt `Crawl-delay` to the URL's domain, as a minimum interval between dispatches.
     *
     * The first value wins, so a robots.txt re-fetch cannot change the cadence mid-crawl.
     *
     * @returns `false` if the domain is not configured for throttling, in which case this is a no-op.
     */
    setCrawlDelay(url: string, delaySeconds: number): boolean {
        const state = this.getDomainState(url);
        if (!state) {
            return false;
        }

        if (state.crawlDelayMs === null) {
            state.crawlDelayMs = delaySeconds * 1000;
            this.log.debug(`Set crawl-delay for domain "${state.domain}" to ${delaySeconds}s`);
        }

        return true;
    }

    // --- IRequestManager Implementation ---

    async addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo> {
        const manager = await this.selectManager(this.getUrlFromRequest(requestLike));
        return manager.addRequest(requestLike, options);
    }

    /**
     * Adds requests in batches, routing each one to the manager that owns its domain.
     *
     * Batching, validation, deduplication and `Retry-After`-free bookkeeping are all delegated to the target
     * managers - this only decides where each request goes, one batch at a time, so a lazy or unbounded input
     * iterable is never fully materialized.
     */
    async addRequestsBatched(
        requests: RequestsLike,
        options: AddRequestsBatchedOptions = {},
    ): Promise<AddRequestsBatchedResult> {
        await this.ensureSubManagers();

        const { batchSize = 1000, waitBetweenBatchesMillis = 1000, forefront, maxNewRequests } = options;

        let remainingBudget = maxNewRequests ?? Infinity;
        const requestsOverLimit: Source[] = [];

        // Never hand a target more than the budget allows, so an over-large final batch cannot overshoot.
        const effectiveChunkSize =
            maxNewRequests !== undefined ? () => Math.min(batchSize, remainingBudget) : batchSize;

        // An async generator is both the iterator `chunkedAsyncIterable` consumes and an iterable we can drain
        // leftovers from later - the same object, so only unconsumed requests end up over the limit.
        async function* iterateRequests(): AsyncGenerator<Source | string> {
            yield* asyncifyIterable<Source | string>(requests);
        }

        const requestIterator = iterateRequests();
        const chunks = peekableAsyncIterable(chunkedAsyncIterable(requestIterator, effectiveChunkSize));
        const chunksIterator = chunks[Symbol.asyncIterator]();

        const processChunk = async (chunk: (Source | string)[]): Promise<ProcessedRequest[]> => {
            const byManager = new Map<T, (Source | string)[]>();
            for (const request of chunk) {
                const manager = this.managerForUrl(this.getUrlFromRequest(request));
                const bucket = byManager.get(manager);
                if (bucket) {
                    bucket.push(request);
                } else {
                    byManager.set(manager, [request]);
                }
            }

            const results = await Promise.all(
                Array.from(byManager, ([manager, slice]) =>
                    manager.addRequestsBatched(slice, {
                        forefront,
                        // The slice is already one batch, and we need its results before releasing the next one.
                        batchSize: slice.length,
                        waitForAllRequestsToBeAdded: true,
                    }),
                ),
            );

            const processedRequests = results.flatMap((result) => result.addedRequests);
            if (maxNewRequests !== undefined) {
                remainingBudget -= processedRequests.filter((request) => !request.wasAlreadyPresent).length;
            }

            return processedRequests;
        };

        const buildResult = async (
            addedRequests: ProcessedRequest[],
            waitForAllRequestsToBeAdded: Promise<ProcessedRequest[]>,
        ): Promise<AddRequestsBatchedResult> => {
            if (maxNewRequests !== undefined) {
                // `chunkedAsyncIterable` stops pulling once the budget-derived chunk size hits zero, so whatever
                // is left is still sitting in the source iterator.
                for await (const request of requestIterator) {
                    requestsOverLimit.push(typeof request === 'string' ? { url: request } : request);
                }
            }

            return { addedRequests, waitForAllRequestsToBeAdded, requestsOverLimit };
        };

        const initialChunk = await chunksIterator.peek();
        if (initialChunk === undefined) {
            return buildResult([], Promise.resolve([]));
        }

        const addedRequests = await processChunk(initialChunk);
        await chunksIterator.next();

        if ((await chunksIterator.peek()) === undefined) {
            return buildResult(addedRequests, Promise.resolve([]));
        }

        const remainder = (async () => {
            const added: ProcessedRequest[] = [];
            for await (const chunk of chunks) {
                added.push(...(await processChunk(chunk)));
                await sleep(waitBetweenBatchesMillis);
            }
            return added;
        })();

        // Keep the crawler from concluding it is finished while batches are still landing. The caller is not
        // obliged to await `remainder`, so every derived promise needs its own handler - an unhandled rejection
        // here would take the process down.
        this.inProgressBatchCount += 1;
        void remainder
            .catch(() => {})
            .finally(() => {
                this.inProgressBatchCount -= 1;
            });

        // With a budget we must drain everything before we can report what went over it.
        if (options.waitForAllRequestsToBeAdded || maxNewRequests !== undefined) {
            addedRequests.push(...(await remainder));
        }

        return buildResult(addedRequests, remainder);
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
        return manager.markRequestAsHandled(request);
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
        if (this.inProgressBatchCount > 0) {
            return false;
        }

        return this.everyManager((manager) => manager.isFinished());
    }

    /**
     * Empties every manager and clears the accumulated backoff. A robots.txt `Crawl-delay` is a property of the
     * site rather than of the run, so it survives.
     */
    async purge(): Promise<void> {
        await this.forEachManager((manager) => manager.purge?.());
        for (const state of this.domainStates.values()) {
            state.consecutive429Count = 0;
            state.throttledUntil = 0;
            state.backoffDecaysAt = 0;
        }
    }

    async setExpectedRequestProcessingTimeSecs(secs: number): Promise<void> {
        await this.forEachManager((manager) => manager.setExpectedRequestProcessingTimeSecs?.(secs));
    }

    private async forEachManager(fn: (manager: T) => Promise<unknown> | undefined): Promise<void> {
        // `fn` targets optional members, so it may return nothing - the wrapper normalizes that for `Promise.all`.
        await Promise.all([this.inner, ...(await this.getSubManagers())].map(async (manager) => fn(manager)));
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
