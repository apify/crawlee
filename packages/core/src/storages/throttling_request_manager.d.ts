import type { Dictionary } from '@crawlee/types';
import type { Configuration } from '../configuration.js';
import type { Request, Source } from '../request.js';
import type { IRequestManager, RequestsLike } from './request_manager.js';
import type { AddRequestsBatchedOptions, AddRequestsBatchedResult, RequestQueueOperationInfo, RequestQueueOperationOptions } from './request_queue.js';
import type { StorageIdentifier } from './storage_instance_manager.js';
import type { StorageOpenOptions } from './utils.js';
/**
 * Opens a request manager, matching the shape of storage `open` methods such as
 * {@apilink RequestQueue.open|`RequestQueue.open`}.
 *
 * {@apilink ThrottlingRequestManager} calls this once per configured domain, so every per-domain queue shares the
 * concrete type and storage backend of the manager being wrapped.
 */
export type RequestManagerOpener<T extends IRequestManager = IRequestManager> = (identifier: string | StorageIdentifier, options?: StorageOpenOptions) => Promise<T>;
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
export declare function supportsDomainThrottling(manager: unknown): manager is SupportsDomainThrottling;
/** Options for {@apilink ThrottlingRequestManager}. */
export interface ThrottlingRequestManagerOptions<T extends IRequestManager = IRequestManager> {
    /**
     * The request manager to wrap, usually a {@apilink RequestQueue}. Requests for domains that are not throttled
     * are stored here.
     */
    inner: T;
    /**
     * Which domains to throttle: a list of hostnames, or `'all'` for every domain the crawl encounters.
     *
     * Matching a listed hostname is case-insensitive and exact - wildcards such as `*.example.com` are not
     * supported, so list each subdomain you care about (or set
     * {@apilink ThrottlingRequestManagerOptions.throttleBy|`throttleBy: 'registrableDomain'`}). An
     * internationalized domain may be given in either its unicode or its punycode form, and an IPv6 address has
     * to be bracketed (`[::1]`). Requests for any other domain bypass throttling entirely.
     *
     * `'all'` gives each domain a queue of its own the first time it is seen, so that it can be held back
     * without its requests being repeatedly popped and re-enqueued. One request queue per domain is not free,
     * which is what {@apilink ThrottlingRequestManagerOptions.maxThrottledDomains|`maxThrottledDomains`} is
     * there to bound.
     */
    domains: string[] | 'all';
    /**
     * A floor under the crawl delay of every throttled domain, in seconds - the proactive clock described on
     * {@apilink ThrottlingRequestManager}. A domain whose robots.txt asks for a longer `Crawl-delay` gets the
     * longer one; this is a minimum, not an override.
     * @default 0
     */
    minCrawlDelaySecs?: number;
    /**
     * What counts as "the same domain": the exact hostname, or the registrable domain it belongs to
     * (`example.com` for `www.example.com`, `a.example.co.uk` and so on). Hosts with no registrable domain -
     * IP addresses, `localhost` - are always throttled per hostname.
     *
     * Grouping by registrable domain gives subdomains a single pair of clocks and a single queue, which is what
     * you want when the pacing is there to be polite to one server rather than to satisfy a specific host's
     * rate limit.
     * @default 'hostname'
     */
    throttleBy?: 'hostname' | 'registrableDomain';
    /**
     * The most domains a run may throttle at once. Exceeding it throws, rather than silently letting the
     * throttling lapse - one request queue per domain is not free, and a crawl that discovers domains without
     * bound would drown the storage backend in them.
     *
     * Only domains discovered under `domains: 'all'` count against this; an explicit list is taken at face value.
     * @default 100
     */
    maxThrottledDomains?: number;
    /**
     * The key under which the discovered domain list is kept in the default key-value store, so that a restart
     * with `purgeOnStart` disabled reopens their queues instead of stranding whatever they still hold. Only
     * written under `domains: 'all'`.
     *
     * Give each manager its own key when running several of them against the same storage.
     * @default 'CRAWLEE_THROTTLED_DOMAINS'
     */
    persistStateKey?: string;
    /**
     * Opens the per-domain queues, one per throttled domain, each under the alias `throttled-<domain>`.
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
     * their queue, so re-running the crawl with `purgeOnStart` disabled picks them up once the domain recovers.
     *
     * A crawler running with `keepAlive` is exempt - outliving a domain that will not let us through is the
     * whole point there.
     * @default 900
     */
    maxDomainStallSecs?: number;
}
/**
 * A request manager that wraps another one and paces requests per domain.
 *
 * Requests for a throttled domain are routed into their own queue when they are added, so each request lives in
 * exactly one place and deduplication keeps working. Everything else goes to the wrapped manager untouched.
 *
 * {@apilink ThrottlingRequestManager.fetchNextRequest|`fetchNextRequest()`} serves the domain that has been waiting
 * longest and skips any that are backing off, falling back to the wrapped manager. It never blocks: while every
 * remaining request belongs to a throttled domain it returns `null` and {@apilink ThrottlingRequestManager.isEmpty}
 * reports `true`, so the crawler idles instead of holding a concurrency slot open.
 *
 * Each throttled domain runs two independent clocks, and may be dispatched to once **both** have run out:
 * - **Backoff**, set by HTTP 429 responses - honouring `Retry-After`, and otherwise doubling from `baseDelaySecs`.
 *   Reactive and temporary: it decays once the domain stops turning us away. The crawlers report the 429s
 *   themselves; a request held back this way is retried later without counting against `maxRequestRetries` and
 *   without penalising its session.
 * - **Crawl delay**, the minimum interval between two dispatches to the domain, armed after each one. Proactive
 *   and constant: whatever the domain's robots.txt asks for, floored by
 *   {@apilink ThrottlingRequestManagerOptions.minCrawlDelaySecs|`minCrawlDelaySecs`}. Either may be absent, in
 *   which case the other one is the delay.
 *
 * Which domains get those clocks is {@apilink ThrottlingRequestManagerOptions.domains|`domains`} - a list, or
 * `'all'` for every domain the crawl encounters.
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
export declare class ThrottlingRequestManager<T extends IRequestManager = IRequestManager> implements IRequestManager, SupportsDomainThrottling {
    #private;
    private readonly config;
    private readonly domainStates;
    private readonly log;
    constructor(options: ThrottlingRequestManagerOptions<T>, config?: Configuration);
    /** The wrapped manager, holding every request whose domain is not throttled. */
    get innerManager(): T;
    /**
     * Records a 429 response and puts the URL's domain into backoff.
     *
     * @returns `false` if the domain is not configured for throttling, in which case this is a no-op.
     */
    recordDomainDelay(url: string, retryAfterMs?: number | null): boolean;
    /**
     * Records the `Crawl-delay` a domain's robots.txt asked for, which becomes its crawl delay unless
     * {@apilink ThrottlingRequestManagerOptions.minCrawlDelaySecs|`minCrawlDelaySecs`} asks for longer.
     *
     * The first value wins, so a robots.txt re-fetch cannot change the cadence mid-crawl.
     *
     * @returns `false` if the domain is not throttled, in which case this is a no-op.
     */
    setCrawlDelay(url: string, delaySeconds: number): boolean;
    /**
     * Throws {@apilink PersistentRateLimitError} if any domain has been rate-limiting us past
     * {@apilink ThrottlingRequestManagerOptions.maxDomainStallSecs|`maxDomainStallSecs`} without letting a single
     * request through.
     *
     * A domain qualifies only while it still has queued requests and is actively rate-limiting - a domain that
     * has simply run out of work is finished, not stalled, and one being waited out under a long robots.txt
     * `Crawl-delay` is being obeyed, not stonewalled.
     */
    assertNoStalledDomains(): Promise<void>;
    addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo>;
    /**
     * Adds requests in batches, routing each one to the manager that owns its domain.
     *
     * Batching, validation, deduplication and `Retry-After`-free bookkeeping are all delegated to the target
     * managers - this only decides where each request goes, one batch at a time, so a lazy or unbounded input
     * iterable is never fully materialized.
     */
    addRequestsBatched(requests: RequestsLike, options?: AddRequestsBatchedOptions): Promise<AddRequestsBatchedResult>;
    reclaimRequest(request: Request, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo | null>;
    markRequestAsHandled(request: Request): Promise<RequestQueueOperationInfo | void | null>;
    getTotalCount(): Promise<number>;
    getPendingCount(): Promise<number>;
    getHandledCount(): Promise<number>;
    /**
     * Whether the next {@apilink ThrottlingRequestManager.fetchNextRequest} would return `null`.
     *
     * Requests waiting on a throttled domain count as unavailable, so a crawler whose task loop is gated on
     * this idles for the backoff instead of spinning on a fetch that cannot succeed yet.
     */
    isEmpty(): Promise<boolean>;
    /** Unlike {@apilink ThrottlingRequestManager.isEmpty}, throttled requests still count as outstanding work. */
    isFinished(): Promise<boolean>;
    /**
     * Empties every manager and clears the accumulated backoff. A robots.txt `Crawl-delay` is a property of the
     * site rather than of the run, so it survives.
     */
    purge(): Promise<void>;
    /**
     * Empties the per-domain queues, leaving the wrapped manager alone.
     *
     * Those queues are this manager's own no matter who owns the one it wraps, which is what makes this safe to
     * call where a full {@apilink ThrottlingRequestManager.purge|`purge()`} would not be.
     */
    purgeDomainQueues(): Promise<void>;
    setExpectedRequestProcessingTimeSecs(secs: number): Promise<void>;
    /**
     * Returns the next request from a domain that is not backing off, or from the inner manager.
     *
     * Returns `null` while every remaining request belongs to a throttled domain - it never waits the backoff
     * out, because a consumer parked in here holds a concurrency slot, which the autoscaler reads as spare
     * capacity and answers by scaling up. Callers poll instead, and {@apilink ThrottlingRequestManager.isEmpty}
     * reports `true` meanwhile so the crawler's task loop idles rather than spins.
     */
    fetchNextRequest<R extends Dictionary = Dictionary>(): Promise<Request<R> | null>;
    [Symbol.asyncIterator](): AsyncGenerator<Request<Dictionary>, void, unknown>;
    persistState(): Promise<void>;
    drop(): Promise<void>;
}
