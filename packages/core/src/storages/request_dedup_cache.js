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
export class RequestDeduplicationCache {
    size;
    #keys;
    #ids;
    // The slot count is the same for every queue, so it's a fixed default rather than a per-consumer option.
    constructor(size = 1_000_000) {
        this.size = size;
        this.#keys = new Array(size);
        this.#ids = new Array(size);
    }
    get(cacheKey) {
        const index = this.indexOf(cacheKey);
        return this.#keys[index] === cacheKey ? this.#ids[index] : null;
    }
    add(cacheKey, requestId) {
        const index = this.indexOf(cacheKey);
        this.#keys[index] = cacheKey;
        this.#ids[index] = requestId;
    }
    clear() {
        this.#keys = new Array(this.size);
        this.#ids = new Array(this.size);
    }
    // A cheap FNV-1a hash of the cache key — avoids pulling in a dedicated hashing dependency.
    indexOf(cacheKey) {
        /* eslint-disable no-bitwise */
        let hash = 0x811c9dc5;
        for (let i = 0; i < cacheKey.length; i++) {
            hash ^= cacheKey.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0) % this.size;
        /* eslint-enable no-bitwise */
    }
}
