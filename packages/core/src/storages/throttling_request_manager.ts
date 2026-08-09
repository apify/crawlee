import { URL } from 'node:url';
import type { Dictionary } from '@crawlee/types';
import ow from 'ow';

import type { Configuration } from '../configuration.js';
import { PersistentRateLimitError } from '../errors.js';
import { asyncifyIterable } from '../iterables.js';
import type { CrawleeLogger } from '../log.js';
import type { Request, Source } from '../request.js';
import { serviceLocator } from '../service_locator.js';
import { normalizeHostname } from '../url.js';
import { drainRequestBatches } from './batched_adds.js';
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

/**
 * A request manager that can pace requests per domain, as {@apilink ThrottlingRequestManager} does.
 *
 * The crawlers detect this structurally rather than by type, so a wrapper can opt in by forwarding these three
 * methods without {@apilink IRequestManager} having to know that throttling exists.
 */
export interface SupportsDomainThrottling {
    /** @see {@apilink ThrottlingRequestManager.recordDomainDelay} */
    recordDomainDelay(url: string, retryAfterMs?: number | null): boolean;
    /** @see {@apilink ThrottlingRequestManager.setCrawlDelay} */
    setCrawlDelay(url: string, delaySeconds: number): boolean;
    /** @see {@apilink ThrottlingRequestManager.assertNoStalledDomains} */
    assertNoStalledDomains(): Promise<void>;
}

/** Whether `manager` can pace requests per domain. */
export function supportsDomainThrottling(manager: unknown): manager is SupportsDomainThrottling {
    const candidate = manager as Partial<SupportsDomainThrottling> | null | undefined;

    return (
        typeof candidate?.recordDomainDelay === 'function' &&
        typeof candidate.setCrawlDelay === 'function' &&
        typeof candidate.assertNoStalledDomains === 'function'
    );
}

/** Options for {@apilink ThrottlingRequestManager}. */
export interface ThrottlingRequestManagerOptions<T extends IRequestManager = IRequestManager> {
    /**
     * The request manager to wrap, usually a {@apilink RequestQueue}. Requests for domains that are not throttled
     * are stored here.
     */
    inner: T;

    /**
     * Hostnames to throttle. Matching is case-insensitive and exact - wildcards such as `*.example.com` are not
     * supported, so list each subdomain you care about. Requests for any other domain bypass throttling entirely.
     *
     * An internationalized domain may be given in either its unicode or its punycode form, and an IPv6 address
     * has to be bracketed (`[::1]`).
     */
    domains: string[];

    /**
     * Opens the per-domain queues, one per entry in `domains`, each under the alias `throttled-<domain>`.
     * @default RequestQueue.open
     */
    requestManagerOpener?: RequestManagerOpener<T>;

    /**
     * The delay applied after a domain's first HTTP 429, doubled on each subsequent one.
     * @default 2
     */
    baseDelaySecs?: number;

    /**
     * Upper bound on the delay between requests to a rate-limited domain, applied to both the exponential
     * backoff and a `Retry-After` value.
     * @default 60
     */
    maxDelaySecs?: number;

    /**
     * How long a domain may rate-limit us without a single request getting through before the crawl is
     * abandoned with a {@apilink PersistentRateLimitError}.
     *
     * A domain that keeps answering 429 for this long is not going to be crawled by waiting longer - the
     * concurrency is too high for it, or it has blocked us outright. Its requests are deliberately left in
     * their queue, so re-running the crawl without purging storages picks them up once the domain recovers.
     * @default 900
     */
    maxDomainStallSecs?: number;
}

interface DomainState {
    domain: string;
    /**
     * Earliest dispatch time imposed by 429 backoff, as a `Date.now()` timestamp. Kept apart from
     * `crawlDelayUntil` so that a crawl-delay, which is armed on every single dispatch, cannot pass for an
     * active backoff and swallow the 429s it is supposed to be tracking.
     */
    backoffUntil: number;
    /** Earliest dispatch time imposed by the robots.txt `Crawl-delay`, as a `Date.now()` timestamp. */
    crawlDelayUntil: number;
    /** Time after which an incoming 429 is treated as a fresh burst rather than a continuation. */
    backoffDecaysAt: number;
    consecutive429Count: number;
    /** Minimum interval between dispatches, from a robots.txt `Crawl-delay` directive. */
    crawlDelayMs: number | null;
    /** When this domain last let a request through, as a `Date.now()` timestamp. Drives stall detection. */
    lastProgressAt: number;
}

/** The moment a domain may be dispatched to again - whichever of its two independent clocks runs longer. */
function throttledUntil(state: DomainState): number {
    return Math.max(state.backoffUntil, state.crawlDelayUntil);
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
export class ThrottlingRequestManager<T extends IRequestManager = IRequestManager>
    implements IRequestManager, SupportsDomainThrottling
{
    private readonly inner: T;
    private readonly requestManagerOpener: RequestManagerOpener<T>;
    private readonly baseDelayMs: number;
    private readonly maxDelayMs: number;
    private readonly maxDomainStallMs: number;

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
        private readonly config: Configuration = serviceLocator.getConfiguration(),
    ) {
        ow(
            options,
            ow.object.exactShape({
                inner: ow.object,
                domains: ow.array.ofType(ow.string.nonEmpty),
                requestManagerOpener: ow.optional.function,
                baseDelaySecs: ow.optional.number,
                maxDelaySecs: ow.optional.number,
                maxDomainStallSecs: ow.optional.number,
            }),
        );

        this.inner = options.inner;
        this.requestManagerOpener =
            options.requestManagerOpener ??
            ((idOrAlias, opts) => RequestQueue.open(idOrAlias, opts) as unknown as Promise<T>);
        this.baseDelayMs = (options.baseDelaySecs ?? 2) * 1000;
        this.maxDelayMs = (options.maxDelaySecs ?? 60) * 1000;
        this.maxDomainStallMs = (options.maxDomainStallSecs ?? 900) * 1000;
        this.log = serviceLocator.getLogger().child({ prefix: 'ThrottlingRequestManager' });

        const now = Date.now();

        for (const domain of options.domains) {
            let hostname: string;
            try {
                // These are bare hostnames, so they only reach `URL` - and with it IDNA - via a synthetic URL.
                hostname = normalizeHostname(new URL(`http://${domain}`).hostname);
            } catch {
                throw new Error(
                    `"${domain}" is not a valid hostname. The \`domains\` option takes bare hostnames such as ` +
                        `"example.com"; an IPv6 address has to be bracketed, as in "[::1]".`,
                );
            }

            this.domainStates.set(hostname, {
                domain: hostname,
                backoffUntil: 0,
                crawlDelayUntil: 0,
                backoffDecaysAt: 0,
                consecutive429Count: 0,
                crawlDelayMs: null,
                lastProgressAt: now,
            });
        }
    }

    /** The wrapped manager, holding every request whose domain is not throttled. */
    get innerManager(): T {
        return this.inner;
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
            return normalizeHostname(new URL(url).hostname);
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

    /** Configured domains that are not currently backing off, longest-overdue first. */
    private fetchableDomains(): string[] {
        const now = Date.now();
        return Array.from(this.domainStates.values())
            .filter((state) => now >= throttledUntil(state))
            .sort((a, b) => throttledUntil(a) - throttledUntil(b))
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
        // Only the backoff clock may suppress here: `crawlDelayUntil` is in the future after every dispatch,
        // so consulting it would discard every 429 the domain ever sends, `Retry-After` included.
        if (now < state.backoffUntil) {
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
                    `to maxDelaySecs (${(this.maxDelayMs / 1000).toFixed(1)}s); the domain may continue to rate-limit. ` +
                    `Consider increasing maxDelaySecs if this recurs.`,
            );
            delayMs = this.maxDelayMs;
        }

        state.backoffUntil = now + delayMs;
        state.backoffDecaysAt = state.backoffUntil + delayMs;

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

    /**
     * Throws {@apilink PersistentRateLimitError} if any domain has been rate-limiting us past
     * {@apilink ThrottlingRequestManagerOptions.maxDomainStallSecs|`maxDomainStallSecs`} without letting a single
     * request through.
     *
     * A domain qualifies only while it still has queued requests and is actively rate-limiting - a domain that
     * has simply run out of work is finished, not stalled.
     */
    async assertNoStalledDomains(): Promise<void> {
        await this.ensureSubManagers();

        const now = Date.now();
        const candidates = Array.from(this.domainStates.values()).filter(
            (state) => state.consecutive429Count > 0 && now - state.lastProgressAt > this.maxDomainStallMs,
        );

        const stalled = (
            await Promise.all(
                candidates.map(async (state) => ((await this.subManagers.get(state.domain)!.isEmpty()) ? null : state)),
            )
        ).filter((state) => state !== null);

        if (stalled.length === 0) {
            return;
        }

        const summary = stalled
            .map((state) => `"${state.domain}" (${((now - state.lastProgressAt) / 1000).toFixed(0)}s)`)
            .join(', ');

        throw new PersistentRateLimitError(
            `Giving up: ${summary} rate-limited every request for longer than maxDomainStallSecs ` +
                `(${(this.maxDomainStallMs / 1000).toFixed(0)}s). Waiting longer will not help - lower the ` +
                `crawler's concurrency, or drop these domains. Their requests are still queued, so re-running ` +
                `without purging storages will resume them if the rate limit lifts.`,
        );
    }

    /** Records that a domain let a request through, which is what stall detection watches for. */
    private recordProgress(url: string): void {
        const state = this.getDomainState(url);
        if (state) {
            state.lastProgressAt = Date.now();
        }
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

        // Normalized up front so the shared batching helper - and `requestsOverLimit` - only ever see `Source`.
        async function* iterateRequests(): AsyncGenerator<Source> {
            for await (const request of asyncifyIterable<Source | string>(requests)) {
                yield typeof request === 'string' ? { url: request } : request;
            }
        }

        return drainRequestBatches<Source>({
            items: iterateRequests(),
            batchSize: options.batchSize ?? 1000,
            waitBetweenBatchesMillis: options.waitBetweenBatchesMillis ?? 1000,
            waitForAllRequestsToBeAdded: options.waitForAllRequestsToBeAdded ?? false,
            maxNewRequests: options.maxNewRequests,

            // Routing is the only thing this manager adds; the targets do the batching, validation and
            // deduplication themselves.
            processChunk: async (chunk) => {
                const byManager = new Map<T, Source[]>();
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
                            forefront: options.forefront,
                            // The slice is already one batch, and we need its results before releasing the next one.
                            batchSize: slice.length,
                            waitForAllRequestsToBeAdded: true,
                        }),
                    ),
                );

                return results.flatMap((result) => result.addedRequests);
            },

            // Keeps the crawler from concluding it is finished while batches are still landing.
            trackBackgroundBatches: (batches) => {
                this.inProgressBatchCount += 1;
                void batches.finally(() => {
                    this.inProgressBatchCount -= 1;
                });
            },
        });
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
        // Reached whether the request succeeded or ran out of retries; either way the domain answered us.
        this.recordProgress(request.url);
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
        const now = Date.now();
        for (const state of this.domainStates.values()) {
            state.consecutive429Count = 0;
            state.backoffUntil = 0;
            state.crawlDelayUntil = 0;
            state.backoffDecaysAt = 0;
            state.lastProgressAt = now;
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
            const state = this.domainStates.get(domain)!;

            // Armed while the fetch below is still suspended, so that a concurrent `fetchNextRequest` cannot
            // find the domain fetchable and dispatch into the same window - which would pace each task
            // rather than the domain.
            const crawlDelayBefore = state.crawlDelayUntil;
            if (state.crawlDelayMs !== null) {
                state.crawlDelayUntil = Date.now() + state.crawlDelayMs;
            }

            const request = await this.subManagers.get(domain)!.fetchNextRequest<R>();
            if (request) {
                return request;
            }

            // No dispatch to pace, so the domain keeps its slot.
            state.crawlDelayUntil = crawlDelayBefore;
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
