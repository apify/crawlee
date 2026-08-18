/**
 * A fixed-size, direct-mapped cache for `uniqueKey`-based request deduplication.
 *
 * `RequestProvider.requestCache` only remembers the first batch of requests, so repeated
 * `addRequestsBatched()` calls with overlapping URLs re-submit already-enqueued requests
 * (https://github.com/apify/crawlee/issues/3120). This is a separate, cheaper cache we can populate on
 * every batch: a fixed number of slots indexed by a hash of the request's cache key, storing the
 * server-assigned `requestId`. Memory is capped by the slot count regardless of the working set size;
 * a hash collision just overwrites a slot, causing an occasional cache miss (a harmless re-submission)
 * but never a false hit — so a genuinely new request is never dropped.
 *
 * @internal
 */
export declare class RequestDeduplicationCache {
    #private;
    private readonly size;
    constructor(size?: number);
    get(cacheKey: string): string | null;
    add(cacheKey: string, requestId: string): void;
    clear(): void;
    private indexOf;
}
