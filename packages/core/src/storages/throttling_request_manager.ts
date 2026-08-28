import { URL } from 'node:url';
import type { Dictionary } from '@crawlee/types';
import { getDomain } from 'tldts';
import { z } from 'zod';

import type { Configuration } from '../configuration.js';
import { asyncifyIterable } from '../iterables.js';
import type { CrawleeLogger } from '../log.js';
import type { Source } from '../request.js';
import { Request } from '../request.js';
import { serviceLocator } from '../service_locator.js';
import { normalizeHostname } from '../url.js';
import { parseArgument, schemas } from '../validators.js';
import { drainRequestBatches } from './batched_adds.js';
import { KeyValueStore } from './key_value_store.js';
import type { RequestSourceStatus } from './request_loader.js';
import { joinRequestSourceStatuses } from './request_loader.js';
import type { IRequestManager, PacingScope, PacingSignal, RequestsLike } from './request_manager.js';
import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    RequestQueueOperationInfo,
    RequestQueueOperationOptions,
} from './request_queue.js';
import { RequestQueue } from './request_queue.js';
import type { StorageIdentifier } from './storage_instance_manager.js';
import type { StorageOpenOptions } from './utils.js';

const throttlingRequestManagerOptionsSchema = z.strictObject({
    inner: z.union([schemas.anyObject, schemas.anyFunction]).optional(),
    domains: z.union([schemas.arrayOf(z.string().nonempty(), 'non-empty strings'), z.literal('all')]),
    requestManagerOpener: schemas.anyFunction.optional(),
    baseDelaySecs: schemas.anyNumber.refine((value) => value > 0, 'Expected a number greater than 0').optional(),
    maxDelaySecs: schemas.anyNumber.refine((value) => value > 0, 'Expected a number greater than 0').optional(),
    maxDomainStallSecs: schemas.anyNumber.refine((value) => value > 0, 'Expected a number greater than 0').optional(),
    minCrawlDelaySecs: schemas.anyNumber
        .refine((value) => value >= 0, 'Expected a number greater than or equal to 0')
        .optional(),
    throttleBy: z.enum(['hostname', 'registrableDomain']).optional(),
    maxThrottledDomains: schemas.anyNumber.refine((value) => value > 0, 'Expected a number greater than 0').optional(),
    persistStateKey: z.string().nonempty().optional(),
});

/**
 * Opens a request manager, matching the shape of storage `open` methods such as
 * {@apilink RequestQueue.open|`RequestQueue.open`}.
 *
 * {@apilink ThrottlingRequestManager} calls this once per configured domain, so every per-domain queue shares the
 * concrete type and storage backend of the manager being wrapped.
 */
export type RequestManagerOpener<T extends IRequestManager = IRequestManager> = (
    identifier?: string | StorageIdentifier | null,
    options?: StorageOpenOptions,
) => Promise<T>;

/** Options for {@apilink ThrottlingRequestManager}. */
export interface ThrottlingRequestManagerOptions<T extends IRequestManager = IRequestManager> {
    /**
     * The request manager to wrap, usually a {@apilink RequestQueue}. Requests for domains that are not throttled
     * are stored here. May be a factory, so that the throttler can be constructed synchronously and the manager
     * under it opened only on first use.
     *
     * Omitted, the default request queue is opened on first use through
     * {@apilink ThrottlingRequestManagerOptions.requestManagerOpener|`requestManagerOpener`}.
     */
    inner?: T | (() => T | Promise<T>);

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
     * longer one; this is a minimum, not an override. A `minIntervalEverywhere` {@apilink PacingSignal} raises
     * this floor at runtime, and never lowers it.
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

interface DomainState {
    domain: string;
    /**
     * Earliest dispatch time imposed by 429 backoff, as a `Date.now()` timestamp. Kept apart from
     * `crawlDelayUntil` so that the crawl delay, which is armed on every single dispatch, cannot pass for an
     * active backoff and swallow the 429s it is supposed to be tracking.
     */
    backoffUntil: number;
    /** Earliest dispatch time imposed by the domain's crawl delay, as a `Date.now()` timestamp. */
    crawlDelayUntil: number;
    /** Time after which an incoming 429 is treated as a fresh burst rather than a continuation. */
    backoffDecaysAt: number;
    consecutive429Count: number;
    /** The `Crawl-delay` this domain's robots.txt asked for, if any - a floor, not the whole story. */
    declaredCrawlDelayMs: number | null;
    /**
     * When the current unbroken run of 429s began, as a `Date.now()` timestamp, or `0` if the domain is not
     * currently rate-limiting us. Cleared the moment a request gets through, so it measures how long we have
     * been stonewalled rather than how long the domain has been quiet.
     */
    rateLimitedSince: number;
    /**
     * When this domain last answered 429, as a `Date.now()` timestamp, or `0` if it never has. Read alongside
     * `rateLimitedSince` to tell a domain that is still turning us away from one that is merely being waited out.
     */
    lastRateLimitedAt: number;
}

/** The moment a domain may be dispatched to again - whichever of its two independent clocks runs longer. */
function throttledUntil(state: DomainState): number {
    return Math.max(state.backoffUntil, state.crawlDelayUntil);
}

/** How long a domain must be left alone after a dispatch: what it asked for, or our floor, whichever is longer. */
function crawlDelayMs(state: DomainState, minCrawlDelayMs: number): number {
    return Math.max(state.declaredCrawlDelayMs ?? 0, minCrawlDelayMs);
}

function newDomainState(domain: string): DomainState {
    return {
        domain,
        backoffUntil: 0,
        crawlDelayUntil: 0,
        backoffDecaysAt: 0,
        consecutive429Count: 0,
        declaredCrawlDelayMs: null,
        rateLimitedSince: 0,
        lastRateLimitedAt: 0,
    };
}

const DEFAULT_PERSIST_STATE_KEY = 'CRAWLEE_THROTTLED_DOMAINS';

/**
 * How many requests one fetch may move out of the wrapped manager before giving up on finding a dispatchable
 * one. The next fetch resumes where it left off, and a migrated request is never walked again.
 */
const MAX_INNER_MIGRATIONS = 1000;

/**
 * A request manager that wraps another one and paces requests per domain.
 *
 * Requests for a throttled domain are routed into their own queue when they are added, so each request lives in
 * exactly one place and deduplication keeps working. Everything else goes to the wrapped manager untouched.
 *
 * {@apilink ThrottlingRequestManager.fetchNextRequest|`fetchNextRequest()`} serves the domain that has been waiting
 * longest and skips any that are backing off, falling back to the wrapped manager. It never blocks: while every
 * remaining request belongs to a throttled domain it returns `null` and
 * {@apilink ThrottlingRequestManager.checkReadiness|`checkReadiness()`} reports `waiting` with the moment the
 * earliest of them comes due, so the crawler idles instead of holding a concurrency slot open.
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
 * Pass one as a crawler's `requestManager`; the `sameDomainDelaySecs` shorthand builds one with `domains: 'all'`
 * and `throttleBy: 'registrableDomain'`. Construct it yourself to name the domains or tune the delays - one
 * covering every domain also makes `sameDomainDelaySecs` land on it as a floor rather than adding a second pacer.
 *
 * Signals - 429s, robots.txt `Crawl-delay`, that floor - arrive through
 * {@apilink IRequestManager.recordPacingSignal|`recordPacingSignal`}, which wrapping managers forward, so this
 * works wherever it sits in a composition, including inside a {@apilink RequestManagerTandem}.
 *
 * **Example usage:**
 *
 * ```ts
 * const crawler = new CheerioCrawler({
 *     requestManager: new ThrottlingRequestManager({
 *         domains: ['api.example.com', 'slow-site.org'],
 *     }),
 *     requestHandler: async ({ request }) => { ... },
 * });
 * ```
 *
 * @category Sources
 */
export class ThrottlingRequestManager<T extends IRequestManager = IRequestManager> implements IRequestManager {
    readonly #innerFactory: () => T | Promise<T>;
    #innerPromise?: Promise<T>;
    #resolvedInner?: T;
    readonly #requestManagerOpener: RequestManagerOpener<T>;
    readonly #baseDelayMs: number;
    readonly #maxDelayMs: number;
    readonly #maxDomainStallMs: number;
    #minCrawlDelayMs: number;
    readonly #throttlesEveryDomain: boolean;
    readonly #throttleBy: 'hostname' | 'registrableDomain';
    readonly #maxThrottledDomains: number;
    readonly #persistStateKey: string;

    readonly #subManagers = new Map<string, Promise<T>>();

    // Not `#private`, unlike the rest: the tests reach for these two.
    private readonly domainStates = new Map<string, DomainState>();
    private readonly log: CrawleeLogger;

    /** Domains from the `domains` option, which are throttled whether or not the crawl ever visits them. */
    readonly #listedDomains = new Set<string>();

    /**
     * Domains picked up at runtime under `domains: 'all'`. Persisted, because unlike the listed ones there
     * is nothing to rediscover them from at startup - and a sub-queue nobody reopens is a sub-queue whose
     * requests are never crawled.
     */
    readonly #discoveredDomains = new Set<string>();

    /**
     * Requests currently held by the consumer that came out of the wrapped manager rather than a sub-queue.
     * They have to go back where they came from: routing them by domain would mark them handled in a queue
     * that has never heard of them, leaving the wrapped manager to hand them out over and over.
     */
    readonly #inFlightFromInner = new Set<string>();
    #domainListStore?: KeyValueStore;
    #lastDomainListWrite: Promise<unknown> = Promise.resolve();
    #queuedDomainListWrite?: Promise<void>;

    /**
     * Sub-managers are keyed by a stable alias, so with `purgeOnStart` disabled they outlive the process. They
     * must therefore be reopened for every known domain rather than created on first insert - otherwise a
     * restart sees an empty map, reports the crawl finished, and strands whatever the previous run left in them.
     */
    #subManagersReady?: Promise<void>;

    /** Batches still being added in the background; keeps {@apilink ThrottlingRequestManager.checkReadiness} honest. */
    #inProgressBatchCount = 0;

    /** Requests moved into a sub-queue, which both managers count. Subtracted below; not persisted. */
    #migratedFromInner = 0;

    /** The latest {@link setExpectedRequestProcessingTimeSecs} hint, kept for a wrapped manager resolved later. */
    #expectedRequestProcessingSecs?: number;

    readonly #warnedAbout = new Set<string>();

    /** Whether any domain at all may end up throttled - listed up front, or discovered as the crawl runs. */
    get #throttlingEnabled(): boolean {
        return this.#listedDomains.size > 0 || this.#throttlesEveryDomain;
    }

    constructor(
        options: ThrottlingRequestManagerOptions<T>,
        private readonly config: Configuration = serviceLocator.getConfiguration(),
    ) {
        parseArgument(options, throttlingRequestManagerOptionsSchema, 'ThrottlingRequestManagerOptions');

        if (options.inner === undefined) {
            // Deferred like any other factory, so a manager nobody fetches from opens no storage. The opener is
            // assigned below and read only when this runs.
            this.#innerFactory = () => this.#requestManagerOpener(null, { configuration: this.config });
        } else if (typeof options.inner === 'function') {
            this.#innerFactory = options.inner;
        } else {
            // Nothing to open: resolved from the start, so `innerManager` and bookkeeping see it immediately.
            this.#resolvedInner = options.inner;
            this.#innerFactory = () => this.#resolvedInner!;
        }

        this.#requestManagerOpener =
            options.requestManagerOpener ??
            ((idOrAlias, opts) => RequestQueue.open(idOrAlias, opts) as unknown as Promise<T>);
        this.#baseDelayMs = (options.baseDelaySecs ?? 2) * 1000;
        this.#maxDelayMs = (options.maxDelaySecs ?? 60) * 1000;
        this.#maxDomainStallMs = (options.maxDomainStallSecs ?? 900) * 1000;
        this.#minCrawlDelayMs = (options.minCrawlDelaySecs ?? 0) * 1000;
        this.#throttlesEveryDomain = options.domains === 'all';
        this.#throttleBy = options.throttleBy ?? 'hostname';
        this.#maxThrottledDomains = options.maxThrottledDomains ?? 100;
        this.#persistStateKey = options.persistStateKey ?? DEFAULT_PERSIST_STATE_KEY;
        this.log = serviceLocator.getLogger().child({ prefix: 'ThrottlingRequestManager' });

        for (const domain of Array.isArray(options.domains) ? options.domains : []) {
            let hostname: string;
            try {
                // These are bare hostnames, so they only reach `URL` - and with it IDNA - via a synthetic URL.
                hostname = new URL(`http://${domain}`).hostname;
            } catch {
                throw new Error(
                    `"${domain}" is not a valid hostname. The \`domains\` option takes bare hostnames such as ` +
                        `"example.com"; an IPv6 address has to be bracketed, as in "[::1]".`,
                );
            }

            const key = this.#domainKey(hostname);
            this.#listedDomains.add(key);
            this.domainStates.set(key, newDomainState(key));
        }
    }

    /**
     * The key a URL's requests are grouped under - one delay clock and one sub-queue per key.
     *
     * @param hostname A hostname as `URL` reports it, so in punycode and possibly with a root dot.
     */
    #domainKey(hostname: string): string {
        const normalized = normalizeHostname(hostname);

        if (this.#throttleBy === 'hostname') {
            return normalized;
        }

        // No registrable domain to group by for an IP address or a single-label host such as `localhost`,
        // so those stay paced per hostname.
        return getDomain(normalized, { mixedInputs: false }) ?? normalized;
    }

    /**
     * The wrapped manager, holding every request whose domain is not throttled. `undefined` until an `inner`
     * passed as a factory is resolved - reading this never forces it, because a getter should not open a queue
     * behind a caller's back.
     */
    get innerManager(): T | undefined {
        return this.#resolvedInner;
    }

    /**
     * Resolves the wrapped manager, opening a factory `inner` on first use and memoizing it.
     *
     * Memoized for identity as much as for cost: {@link addRequestsBatched} groups by manager identity and
     * {@link reclaimRequest} compares against it, so a fresh instance per call would split batches and reclaim
     * requests into a manager that never handed them out.
     */
    async #getInner(): Promise<T> {
        if (this.#resolvedInner === undefined) {
            this.#innerPromise ??= Promise.resolve(this.#innerFactory());
            this.#resolvedInner = await this.#innerPromise;

            if (this.#expectedRequestProcessingSecs !== undefined) {
                await this.#resolvedInner.setExpectedRequestProcessingTimeSecs?.(this.#expectedRequestProcessingSecs);
            }
        }

        return this.#resolvedInner;
    }

    /** Warns once about sources that cannot be routed by domain, because their URLs are not known yet. */
    #warnIfNotRoutable(requestLike: Source): void {
        if ('requestsFromUrl' in requestLike && requestLike.requestsFromUrl !== undefined && this.#throttlingEnabled) {
            // The URL list is only fetched once the owning manager expands it, so we cannot know which domains
            // it covers and cannot route it. Warn instead of silently exempting those URLs from throttling.
            this.#warnOnce(
                'urlListNotRouted',
                `Requests loaded via \`requestsFromUrl\` cannot be routed to a per-domain queue, because their URLs ` +
                    `are not known at insertion time. They will be added to the inner request manager and will not ` +
                    `be throttled, even if they belong to a configured domain.`,
            );
        }
    }

    #warnOnce(key: string, message: string): void {
        if (this.#warnedAbout.has(key)) {
            return;
        }
        this.#warnedAbout.add(key);
        this.log.warning(message);
    }

    #extractDomain(url: string): string {
        try {
            return this.#domainKey(new URL(url).hostname);
        } catch {
            return '';
        }
    }

    #getDomainState(url: string): DomainState | null {
        const domain = this.#extractDomain(url);
        return this.domainStates.get(domain) ?? null;
    }

    /**
     * The manager that owns a URL's requests, opening a sub-queue for its domain if this is the first time we
     * have seen it and every domain is throttled. `null` means the domain is new and `maxThrottledDomains`
     * leaves no room for it.
     */
    async #selectManager(url: string): Promise<T | null> {
        await this.#ensureSubManagers();

        const domain = this.#extractDomain(url);

        if (!domain || !(this.#listedDomains.has(domain) || this.#throttlesEveryDomain)) {
            return this.#getInner();
        }

        if (!this.#listedDomains.has(domain) && !this.#discoveredDomains.has(domain)) {
            if (this.#discoveredDomains.size >= this.#maxThrottledDomains) {
                return null;
            }

            this.#discoveredDomains.add(domain);
            // Written before the request lands in the sub-queue: a crash in between would leave that queue
            // with nothing to reopen it, and the crawl would silently drop everything in it.
            await this.#persistDiscoveredDomains();
        }

        return this.#subManagerFor(domain);
    }

    async #selectManagerOrThrow(url: string): Promise<T> {
        const manager = await this.#selectManager(url);

        if (!manager) {
            throw this.#throttledDomainLimitError([this.#extractDomain(url)]);
        }

        return manager;
    }

    #throttledDomainLimitError(domains: string[]): Error {
        const [first, ...rest] = domains;
        const named = rest.slice(0, 10);
        const ellipsis = rest.length > named.length ? ', ...' : '';
        const others =
            rest.length > 0 ? ` (and ${rest.length} other new domain(s): ${named.join(', ')}${ellipsis})` : '';

        return new Error(
            `Refusing to throttle "${first}"${others}: ${this.#maxThrottledDomains} domains are already being ` +
                `throttled (\`maxThrottledDomains\`). Each of them holds a request queue of its own, so a crawl ` +
                `that keeps discovering new domains will bury the storage backend in them. Narrow the crawl down, ` +
                `pace it with \`maxRequestsPerMinute\` instead, or raise \`maxThrottledDomains\` if you are ` +
                `prepared to pay for it.`,
        );
    }

    /** Opens the domain's sub-queue, or returns the one already opened (or being opened) for it. */
    #subManagerFor(domain: string): Promise<T> {
        let subManager = this.#subManagers.get(domain);

        if (!subManager) {
            subManager = this.#requestManagerOpener(
                // Backends use the alias as a directory name, and an IPv6 literal is full of characters
                // Windows will not accept. Ordinary hostnames survive this untouched.
                { alias: `throttled-${encodeURIComponent(domain)}` },
                { configuration: this.config },
            );
            this.#subManagers.set(domain, subManager);
            this.#ensureDomainState(domain);
        }

        return subManager;
    }

    #ensureDomainState(domain: string): DomainState {
        let state = this.domainStates.get(domain);

        if (!state) {
            state = newDomainState(domain);
            this.domainStates.set(domain, state);
        }

        return state;
    }

    /**
     * Coalesces the writes of the discovered domain list: callers that arrive while one is in flight share the
     * single write queued behind it, which snapshots the set once it starts and so covers all of them.
     */
    async #persistDiscoveredDomains(): Promise<void> {
        this.#queuedDomainListWrite ??= this.#lastDomainListWrite
            // A failed write must not poison the ones behind it - they will rewrite the whole set anyway.
            .catch(() => {})
            .then(async () => {
                this.#queuedDomainListWrite = undefined;
                await this.#domainListStore!.setValue(this.#persistStateKey, Array.from(this.#discoveredDomains));
            });
        this.#lastDomainListWrite = this.#queuedDomainListWrite;

        await this.#queuedDomainListWrite;
    }

    async #ensureSubManagers(): Promise<void> {
        this.#subManagersReady ??= (async () => {
            if (this.#throttlesEveryDomain) {
                this.#domainListStore = await KeyValueStore.open(null, { configuration: this.config });

                for (const domain of (await this.#domainListStore.getValue<string[]>(this.#persistStateKey)) ?? []) {
                    this.#discoveredDomains.add(domain);
                }
            }

            await Promise.all(
                Array.from([...this.#listedDomains, ...this.#discoveredDomains], async (domain) =>
                    this.#subManagerFor(domain),
                ),
            );
        })();

        await this.#subManagersReady;
    }

    async #getSubManagers(): Promise<T[]> {
        await this.#ensureSubManagers();
        return Promise.all(this.#subManagers.values());
    }

    /**
     * Throttled domains that are not currently backing off, longest-overdue first.
     *
     * A domain whose sub-queue has not been opened yet is skipped - a robots.txt `Crawl-delay` gives a domain a
     * clock before its first request gives it a queue, and there is nothing to fetch from until then.
     */
    #fetchableDomains(): string[] {
        const now = Date.now();
        return Array.from(this.domainStates.values())
            .filter((state) => now >= throttledUntil(state) && this.#subManagers.has(state.domain))
            .sort((a, b) => throttledUntil(a) - throttledUntil(b))
            .map((state) => state.domain);
    }

    /**
     * Records a pacing signal: a refusal puts the URL's domain into backoff, a declared interval becomes its
     * crawl delay, and a crawl-wide floor raises {@link recordEverywhereFloor|the floor under all of them}.
     *
     * @returns `false` if the domain the signal covers is not throttled, in which case this is a no-op.
     * @throws If the signal's scope is one this manager cannot honour - see {@link assertScopeHonourable}.
     * @inheritdoc
     */
    recordPacingSignal(signal: PacingSignal): boolean {
        if (signal.reason === 'minIntervalEverywhere') {
            return this.#recordEverywhereFloor(signal.intervalMs, signal.scope);
        }

        this.#assertScopeHonourable(signal.scope);

        return signal.reason === 'rateLimited'
            ? this.#recordRateLimit(signal.url, signal.waitMs)
            : this.#recordDeclaredInterval(signal.url, signal.intervalMs);
    }

    /**
     * The runtime form of {@apilink ThrottlingRequestManagerOptions.minCrawlDelaySecs|`minCrawlDelaySecs`}: raises
     * the floor under every throttled domain's crawl delay.
     *
     * @returns `false` if this manager paces nothing at all, so there is no floor to raise.
     * @throws If it paces some domains but not all - holding back only those would leave the rest of what the
     *  floor covers unpaced.
     */
    #recordEverywhereFloor(intervalMs: number, scope: PacingScope): boolean {
        // Before the scope check: a manager that paces nothing has no grouping worth objecting about, and
        // `false` lets the caller pace it from outside.
        if (!this.#throttlingEnabled) {
            return false;
        }

        this.#assertScopeHonourable(scope);

        if (!this.#throttlesEveryDomain) {
            throw new Error(
                `Cannot honour a crawl-delay floor covering every domain: this manager only paces the domains ` +
                    `it was given (${Array.from(this.#listedDomains).join(', ')}), so everything else would run ` +
                    `unpaced. Set \`domains: 'all'\` to pace whatever the crawl encounters, or declare the floor ` +
                    `on this manager yourself via \`minCrawlDelaySecs\`.`,
            );
        }

        this.#minCrawlDelayMs = Math.max(this.#minCrawlDelayMs, intervalMs);
        this.log.debug(`Crawl-delay floor for every domain set to ${(this.#minCrawlDelayMs / 1000).toFixed(1)}s`);

        return true;
    }

    /**
     * Throws unless a signal scoped to `scope` can be honoured as declared or wider.
     *
     * Holding a domain back means holding its queue back, so
     * {@apilink ThrottlingRequestManagerOptions.throttleBy|`throttleBy`} is the finest granularity this manager
     * can express: a narrower scope is honoured by pacing the whole group, while a wider or unknown one must
     * throw rather than under-apply, because pacing one group would leave the rest of what it covers unpaced.
     */
    #assertScopeHonourable(scope: string | undefined): void {
        // No scope means the reporter cannot tell how far the signal reaches, so our own grouping is as good
        // an answer as there is.
        if (scope === undefined || scope === this.#throttleBy) {
            return;
        }

        if (scope === 'hostname' && this.#throttleBy === 'registrableDomain') {
            // Only debug: grouping by registrable domain deliberately paces whole sites, subdomains included.
            this.log.debug(
                `Applying a pacing signal scoped to "hostname" across the whole registrable domain, because that ` +
                    `is how this manager groups requests (\`throttleBy\`). Sibling subdomains are paced with it.`,
            );
            return;
        }

        throw new Error(
            `Cannot honour a pacing signal scoped to "${scope}": this manager groups requests by ` +
                `"${this.#throttleBy}" and holds one request queue per group, so that is the widest scope it can ` +
                `hold back at once. Applying the signal anyway would leave part of what it covers unpaced. ` +
                (scope === 'registrableDomain'
                    ? 'Set `throttleBy: "registrableDomain"` to group requests that way.'
                    : 'This manager only understands the scopes "hostname" and "registrableDomain"; pace by ' +
                      `"${scope}" with a request manager that groups requests by it.`),
        );
    }

    /** Puts the URL's domain into backoff after a refusal, doubling from `baseDelaySecs` if it keeps refusing. */
    #recordRateLimit(url: string, waitMs?: number): boolean {
        const state = this.#getDomainState(url);
        if (!state) {
            return false;
        }

        const now = Date.now();

        // Recorded before the burst suppression below, because a suppressed 429 is still the domain turning us
        // away - which is exactly what stall detection needs to know about.
        state.lastRateLimitedAt = now;
        if (state.rateLimitedSince === 0) {
            state.rateLimitedSince = now;
        }

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

        const waitGiven = waitMs !== undefined;
        let delayMs = waitGiven ? waitMs : this.#baseDelayMs * Math.pow(2, state.consecutive429Count - 1);

        if (delayMs > this.#maxDelayMs) {
            const source = waitGiven ? 'requested wait' : 'exponential backoff';
            this.log.warning(
                `Capping ${source} delay of ${(delayMs / 1000).toFixed(1)}s for domain "${state.domain}" ` +
                    `to maxDelaySecs (${(this.#maxDelayMs / 1000).toFixed(1)}s); the domain may continue to rate-limit. ` +
                    `Consider increasing maxDelaySecs if this recurs.`,
            );
            delayMs = this.#maxDelayMs;
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
     * Records a declared minimum interval for a domain, which becomes its crawl delay unless
     * {@apilink ThrottlingRequestManagerOptions.minCrawlDelaySecs|`minCrawlDelaySecs`} asks for longer.
     *
     * The first value wins, so a robots.txt re-fetch cannot change the cadence mid-crawl.
     *
     * @returns `false` if the domain is not throttled, in which case this is a no-op.
     */
    #recordDeclaredInterval(url: string, intervalMs: number): boolean {
        const domain = this.#extractDomain(url);

        if (!domain || !(this.#listedDomains.has(domain) || this.#throttlesEveryDomain)) {
            return false;
        }

        // The crawler reads robots.txt before it enqueues a domain's first request, so the clock can predate
        // the sub-queue it will end up pacing.
        const state = this.#ensureDomainState(domain);

        if (state.declaredCrawlDelayMs === null) {
            state.declaredCrawlDelayMs = intervalMs;
            this.log.debug(`Set crawl-delay for domain "${state.domain}" to ${(intervalMs / 1000).toFixed(1)}s`);
        }

        return true;
    }

    /** Records that a domain let a request through, which ends any rate-limit run stall detection was timing. */
    #recordProgress(url: string): void {
        const state = this.#getDomainState(url);
        if (state) {
            state.rateLimitedSince = 0;
        }
    }

    // --- IRequestManager Implementation ---

    async addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo> {
        this.#warnIfNotRoutable(requestLike);

        const manager = await this.#selectManagerOrThrow(requestLike.url ?? '');

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
        await this.#ensureSubManagers();

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
                // Collected, not thrown on sight, so an overflow does not discard the requests that fit.
                const overflowing = new Set<string>();

                for (const request of chunk) {
                    this.#warnIfNotRoutable(request);

                    const url = request.url ?? '';
                    const manager = await this.#selectManager(url);

                    if (!manager) {
                        overflowing.add(this.#extractDomain(url));
                        continue;
                    }

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

                if (overflowing.size > 0) {
                    throw this.#throttledDomainLimitError(Array.from(overflowing));
                }

                return results.flatMap((result) => result.addedRequests);
            },

            // Keeps the crawler from concluding it is finished while batches are still landing.
            trackBackgroundBatches: (batches) => {
                this.#inProgressBatchCount += 1;
                void batches.finally(() => {
                    this.#inProgressBatchCount -= 1;
                });
            },
        });
    }

    async reclaimRequest(
        request: Request,
        options?: RequestQueueOperationOptions,
    ): Promise<RequestQueueOperationInfo | null> {
        const manager = await this.#managerHolding(request);

        return manager.reclaimRequest(request, options);
    }

    async markRequestAsHandled(request: Request): Promise<RequestQueueOperationInfo | void | null> {
        const manager = await this.#managerHolding(request);
        // Reached whether the request succeeded or ran out of retries; either way the domain answered us.
        this.#recordProgress(request.url);
        return manager.markRequestAsHandled(request);
    }

    /**
     * The manager a request in the consumer's hands has to be given back to - the one it was fetched from,
     * which is only the same as the one its domain routes to if it was routed in the first place.
     */
    async #managerHolding(request: Request): Promise<T> {
        const key = request.id ?? request.uniqueKey;

        // Only a fetch from the wrapped manager puts a key here, so it is necessarily resolved already.
        if (this.#inFlightFromInner.delete(key)) {
            return this.#resolvedInner!;
        }

        return this.#selectManagerOrThrow(request.url);
    }

    async getTotalCount(): Promise<number> {
        return (await this.#sumOverManagers((manager) => manager.getTotalCount())) - this.#migratedFromInner;
    }

    async getPendingCount(): Promise<number> {
        return this.#sumOverManagers((manager) => manager.getPendingCount());
    }

    async getHandledCount(): Promise<number> {
        return (await this.#sumOverManagers((manager) => manager.getHandledCount())) - this.#migratedFromInner;
    }

    /**
     * Reports whether anything can be dispatched right now, and if not, when — or why never.
     *
     * One traversal of the domain clocks answers all of it: only domains whose delays have run out are probed,
     * the rest merely contribute the moment they come due. Throttled requests count as outstanding work, so a
     * crawler gated on this idles for the backoff instead of concluding it is done.
     *
     * `ready` from anywhere else outranks a stalling domain and is returned without looking at the stall clocks,
     * so one hopeless domain never ends a crawl making progress elsewhere. It cannot outrank itself, though -
     * see the traversal.
     */
    async checkReadiness(): Promise<RequestSourceStatus> {
        await this.#ensureSubManagers();

        const now = Date.now();
        const dispatchable: Promise<T>[] = [];
        let readyAt: number | undefined;
        let stallCandidates: DomainState[] | undefined;

        for (const state of this.domainStates.values()) {
            // A `Crawl-delay` can give a domain a clock before its first request gives it a queue - nothing
            // to fetch from and nothing to wait for until then.
            if (!this.#subManagers.has(state.domain)) {
                continue;
            }

            if (
                // Together: still turning us away, and has been without a break for longer than the window - a
                // domain that has merely been idle starts this clock at its first 429, not with idle time on it.
                state.rateLimitedSince !== 0 &&
                now - state.lastRateLimitedAt <= this.#maxDomainStallMs &&
                now - state.rateLimitedSince > this.#maxDomainStallMs
            ) {
                // Deliberately not dispatchable: a domain that has refused every request for the whole window
                // is not progress just because its backoff momentarily lapsed - that is what it does between 429s.
                (stallCandidates ??= []).push(state);
                continue;
            }

            const until = throttledUntil(state);

            if (now >= until) {
                dispatchable.push(this.#subManagers.get(state.domain)!);
            } else if (readyAt === undefined || until < readyAt) {
                readyAt = until;
            }
        }

        const inner = await this.#getInner();

        const probed = (
            await Promise.all([
                inner.checkReadiness(),
                ...dispatchable.map(async (subManager) => (await subManager).checkReadiness()),
            ])
        ).reduce(joinRequestSourceStatuses);

        // Anything dispatchable outranks a stalled or throttled domain, so we stop here without touching them.
        if (probed.status === 'ready') {
            return probed;
        }

        if (stallCandidates !== undefined) {
            const stalled = (
                await Promise.all(
                    stallCandidates.map(async (state) =>
                        (await (await this.#subManagers.get(state.domain)!).checkReadiness()).status === 'ready'
                            ? state
                            : null,
                    ),
                )
            ).filter((state) => state !== null);

            if (stalled.length > 0) {
                const summary = stalled
                    .map((state) => `"${state.domain}" (${((now - state.rateLimitedSince) / 1000).toFixed(0)}s)`)
                    .join(', ');

                return {
                    status: 'stalled',
                    reason:
                        `${summary} rate-limited every request for longer than maxDomainStallSecs ` +
                        `(${(this.#maxDomainStallMs / 1000).toFixed(0)}s). Waiting longer will not help - lower the ` +
                        `crawler's concurrency, or drop these domains. Their requests are still queued, so ` +
                        `re-running with \`purgeOnStart\` disabled will resume them if the rate limit lifts.`,
                };
            }
        }

        if (readyAt !== undefined) {
            return joinRequestSourceStatuses(probed, { status: 'waiting', readyAt });
        }

        // Batches still landing in the background are work nobody can see in a queue yet.
        if (this.#inProgressBatchCount > 0 && probed.status === 'finished') {
            return { status: 'waiting' };
        }

        return probed;
    }

    /**
     * Empties every manager and clears the accumulated backoff. A robots.txt `Crawl-delay` is a property of the
     * site rather than of the run, so it survives.
     */
    async purge(): Promise<void> {
        await this.#purgeDomainQueues();
        await this.#resolvedInner?.purge?.();
    }

    /**
     * Empties the per-domain queues, leaving the wrapped manager alone - those queues are this manager's own no
     * matter who owns the one it wraps.
     */
    async #purgeDomainQueues(): Promise<void> {
        const subManagers = await this.#getSubManagers();
        await Promise.all(subManagers.map(async (manager) => manager.purge?.()));

        this.#migratedFromInner = 0;

        for (const state of this.domainStates.values()) {
            state.consecutive429Count = 0;
            state.backoffUntil = 0;
            state.crawlDelayUntil = 0;
            state.backoffDecaysAt = 0;
            state.rateLimitedSince = 0;
            state.lastRateLimitedAt = 0;
        }
    }

    async setExpectedRequestProcessingTimeSecs(secs: number): Promise<void> {
        // Remembered so a manager opened later still gets the hint, without opening one now just to pass it along.
        this.#expectedRequestProcessingSecs = secs;
        await this.#forEachManager((manager) => manager.setExpectedRequestProcessingTimeSecs?.(secs));
    }

    /**
     * Runs `fn` over the sub-queues and, if it has been resolved, the wrapped manager - bookkeeping never forces
     * a lazily-opened `inner`, since there is no point opening a queue purely to tell it something.
     */
    async #forEachManager(fn: (manager: T) => Promise<unknown> | undefined): Promise<void> {
        const managers = await this.#getSubManagers();

        if (this.#resolvedInner !== undefined) {
            managers.push(this.#resolvedInner);
        }

        // `fn` targets optional members, so it may return nothing - the wrapper normalizes that for `Promise.all`.
        await Promise.all(managers.map(async (manager) => fn(manager)));
    }

    async #sumOverManagers(fn: (manager: T) => Promise<number>): Promise<number> {
        // Counts have to include the wrapped manager, so this one does resolve it.
        const counts = await Promise.all([await this.#getInner(), ...(await this.#getSubManagers())].map(fn));
        return counts.reduce((a, b) => a + b, 0);
    }

    /**
     * Returns the next request from a domain that is not backing off, or from the inner manager.
     *
     * Returns `null` while every remaining request belongs to a throttled domain - it never waits the backoff
     * out, because a consumer parked in here holds a concurrency slot, which the autoscaler reads as spare
     * capacity and answers by scaling up. Callers poll instead, and
     * {@apilink ThrottlingRequestManager.checkReadiness|`checkReadiness()`} reports `waiting` meanwhile so the
     * crawler's task loop idles rather than spins.
     */
    async fetchNextRequest<R extends Dictionary = Dictionary>(): Promise<Request<R> | null> {
        await this.#ensureSubManagers();

        for (const domain of this.#fetchableDomains()) {
            const state = this.domainStates.get(domain)!;

            // Armed while the fetch below is still suspended, so that a concurrent `fetchNextRequest` cannot
            // find the domain fetchable and dispatch into the same window - which would pace each task
            // rather than the domain.
            const crawlDelayUntilBefore = state.crawlDelayUntil;
            const delayMs = crawlDelayMs(state, this.#minCrawlDelayMs);
            if (delayMs > 0) {
                state.crawlDelayUntil = Date.now() + delayMs;
            }

            const request = await (await this.#subManagers.get(domain)!).fetchNextRequest<R>();
            if (request) {
                return request;
            }

            // No dispatch to pace, so the domain keeps its slot.
            state.crawlDelayUntil = crawlDelayUntilBefore;
        }

        const request = await this.#fetchFromInner<R>();

        if (request !== null) {
            this.#inFlightFromInner.add(request.id ?? request.uniqueKey);
        }

        if (request !== null && this.#throttlesEveryDomain) {
            // Requests that were never routed by domain - a `RequestList`, a `requestsFromUrl` expansion - are
            // handed out as fast as the crawler asks for them, because there is no per-domain queue to hold
            // them back in.
            this.#warnOnce(
                'innerNotThrottled',
                `Requests read directly from the wrapped request manager (for instance from a \`RequestList\` or a ` +
                    `\`requestsFromUrl\` list) are not throttled, because they are not stored per domain. Enqueue ` +
                    `them through the crawler - \`crawler.run(requests)\` or \`crawler.addRequests()\` - to have ` +
                    `their domains paced.`,
            );
        }

        return request;
    }

    /**
     * The next request the wrapped manager can offer whose domain is not being held back.
     *
     * Its requests are not stored per domain, so they cannot be skipped the way a sub-queue can - the only
     * way to find out which domain one belongs to is to take it out. One that turns out to be backing off is
     * moved into its domain's sub-queue, where that domain's clocks hold it back like any other: dispatching
     * it would have the crawler hammer the domain that just told us to wait, and putting it back would have
     * every later fetch walk past it again.
     */
    async #fetchFromInner<R extends Dictionary = Dictionary>(): Promise<Request<R> | null> {
        const inner = await this.#getInner();

        for (let migrated = 0; migrated < MAX_INNER_MIGRATIONS; migrated++) {
            const request = await inner.fetchNextRequest<R>();

            if (request === null) {
                return null;
            }

            const state = this.#getDomainState(request.url);

            if (state === null || Date.now() >= throttledUntil(state)) {
                return request;
            }

            await this.#migrateToSubQueue(request, inner);
        }

        return null;
    }

    /**
     * Moves a request from the wrapped manager into its domain's sub-queue.
     *
     * Added there before it is marked handled here, so that a crash in between duplicates the request rather
     * than dropping it, and `uniqueKey` absorbs the duplicate. A copy is what lands in the sub-queue: adding
     * the request itself would overwrite the `id` the wrapped manager knows it by.
     */
    async #migrateToSubQueue(request: Request, inner: T): Promise<void> {
        try {
            const subManager = await this.#selectManagerOrThrow(request.url);
            await subManager.addRequest(new Request({ ...request, id: undefined }));
        } catch (error) {
            // Whatever the reason, the request is out of the wrapped manager and in nobody's hands, so it
            // goes back before the failure is raised.
            await inner.reclaimRequest(request, { forefront: true });
            throw error;
        }

        await inner.markRequestAsHandled(request);
        this.#migratedFromInner += 1;
    }

    async *[Symbol.asyncIterator]() {
        while (true) {
            const req = await this.fetchNextRequest();
            if (!req) break;
            yield req;
        }
    }

    async persistState(): Promise<void> {
        await this.#forEachManager((manager) => manager.persistState?.());
    }

    async drop(): Promise<void> {
        await this.#forEachManager((manager) => (manager as { drop?(): Promise<void> }).drop?.());
        this.#subManagers.clear();
        this.#subManagersReady = undefined;
    }
}
