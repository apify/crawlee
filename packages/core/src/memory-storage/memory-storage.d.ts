import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { RequestQueueBackend } from './resource-clients/request-queue.js';
export interface MemoryStorageOptions {
    /**
     * Optional logger for MemoryStorageBackend warnings.
     */
    logger?: CrawleeLogger;
}
export declare class MemoryStorageBackend implements storage.StorageBackend {
    #private;
    readonly logger?: CrawleeLogger;
    constructor(options?: MemoryStorageOptions);
    /**
     * Return a per-instance unique cache key so that distinct `MemoryStorageBackend` instances get separate
     * cache partitions in the storage backend cache.
     */
    getStorageBackendCacheKey(): string;
    /**
     * Evict a cached backend so that a dropped storage is no longer resolved by `createXBackend`,
     * reported by `storageExists` or visited by `purge`. Returns whether the backend was cached, which
     * tells the caller whether it still owns in-memory state worth clearing.
     *
     * The resource clients own their own entry's lifetime but must not reach into the caches directly.
     * Because a client is only ever constructed by `createXBackend`, which caches it immediately, the
     * entry matching `id` is always the caller itself.
     * @internal
     */
    evictBackend(type: 'Dataset' | 'KeyValueStore' | 'RequestQueue', id: string): boolean;
    createDatasetBackend(options?: storage.StorageIdentifier): Promise<storage.DatasetBackend>;
    createKeyValueStoreBackend(options?: storage.StorageIdentifier): Promise<storage.KeyValueStoreBackend>;
    createRequestQueueBackend(options?: storage.StorageIdentifier): Promise<RequestQueueBackend>;
    storageExists(id: string, type: 'Dataset' | 'KeyValueStore' | 'RequestQueue'): Promise<boolean>;
    /**
     * Cleans up the run-scoped storages before the run starts. For the in-memory storage this simply
     * resets the in-memory state of the cached backends.
     */
    purge(): Promise<void>;
    /**
     * This method should be called at the end of the process. The in-memory storage holds no resources
     * that outlive the process (no file handles, no cross-process locks), so there is nothing to do.
     */
    teardown(): Promise<void>;
}
