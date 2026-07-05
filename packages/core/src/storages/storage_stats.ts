/**
 * Backend-independent usage counters tracked by the storage frontend classes
 * ({@apilink Dataset}, {@apilink KeyValueStore}, {@apilink RequestQueue}).
 *
 * These count the operations the frontend issues against its underlying storage client, so they are
 * meaningful for any storage backend (memory, file system, cloud). They are tallied per client call
 * — e.g. iterating a key-value store increments `readCount` once per record fetched and `listCount`
 * once per listed page. Backend-specific figures that the frontend cannot compute (such as the number
 * of bytes stored) are intentionally not included here; read those from the backend's own API instead.
 */

/** Usage counters for a {@apilink Dataset}. */
export interface DatasetStats {
    /** Number of read operations issued to the dataset client (e.g. `getData`). */
    readCount: number;
    /** Number of write operations issued to the dataset client (e.g. `pushData`). */
    writeCount: number;
}

/** Usage counters for a {@apilink KeyValueStore}. */
export interface KeyValueStoreStats {
    /** Number of read operations issued to the key-value store client (e.g. `getValue`). */
    readCount: number;
    /** Number of write operations issued to the key-value store client (e.g. `setValue`). */
    writeCount: number;
    /** Number of delete operations issued to the key-value store client (e.g. `deleteValue`). */
    deleteCount: number;
    /** Number of listing operations issued to the key-value store client (e.g. `listKeys`). */
    listCount: number;
}

/** Usage counters for a {@apilink RequestQueue}. */
export interface RequestQueueStats {
    /** Number of write operations issued to the request queue client (add / handle / reclaim). */
    writeCount: number;
    /** Number of queue-head reads issued to the request queue client (`fetchNextRequest`). */
    headItemReadCount: number;
}

/**
 * A tiny mutable counter that the storage frontends increment on each client call and expose through
 * a read-only `stats` snapshot. Generic over the concrete counter shape so each storage type gets only
 * the buckets that make sense for it.
 */
export class StorageStatsTracker<T extends Record<keyof T, number>> {
    private readonly counters: T;

    constructor(initial: T) {
        this.counters = { ...initial };
    }

    /** Increment a counter bucket by `by` (default `1`). */
    add(key: keyof T, by = 1): void {
        (this.counters[key] as number) += by;
    }

    /** Return a snapshot of the current counters. The returned object is a copy and safe to keep. */
    get current(): T {
        return { ...this.counters };
    }
}
