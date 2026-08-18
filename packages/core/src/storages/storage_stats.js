/**
 * Backend-independent usage counters tracked by the storage frontend classes
 * ({@apilink Dataset}, {@apilink KeyValueStore}, {@apilink RequestQueue}).
 *
 * These count the operations the frontend issues against its underlying storage backend, so they are
 * meaningful for any storage backend (memory, file system, cloud). They are tallied per client call
 * — e.g. iterating a key-value store increments `readCount` once per record fetched and `listCount`
 * once per listed page. Backend-specific figures that the frontend cannot compute (such as the number
 * of bytes stored) are intentionally not included here; read those from the backend's own API instead.
 */
/**
 * A tiny mutable counter that the storage frontends increment on each client call and expose through
 * a read-only `stats` snapshot. Generic over the concrete counter shape so each storage type gets only
 * the buckets that make sense for it.
 */
export class StorageStatsTracker {
    #counters;
    constructor(initial) {
        this.#counters = { ...initial };
    }
    /** Increment a counter bucket by `by` (default `1`). */
    add(key, by = 1) {
        this.#counters[key] += by;
    }
    /** Return a snapshot of the current counters. The returned object is a copy and safe to keep. */
    get current() {
        return { ...this.#counters };
    }
}
