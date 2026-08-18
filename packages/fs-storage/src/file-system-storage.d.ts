import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
export interface FileSystemStorageOptions {
    /**
     * Path to directory where the data will be saved.
     */
    localDataDirectory: string;
    /**
     * Optional logger for FileSystemStorageBackend warnings.
     */
    logger?: CrawleeLogger;
    /**
     * How the on-disk request queues opened by this backend are expected to be accessed.
     *
     * With `'single'` (the default), this process asserts it is the *sole* consumer of every request
     * queue it opens: on open, any requests that a previous run left *in progress* (e.g. after a
     * crash) are reclaimed immediately, so they become fetchable again right away. This is the right
     * behavior for the common single-process crawl.
     *
     * Use `'shared'` if multiple processes share the same on-disk request queue concurrently (for
     * example, the {@apilink parallel scraping setup | "Parallel Scraping Guide"}). In that mode an
     * in-progress request is treated as a potential live peer's lock and is only reclaimed once that
     * lock expires on the wall clock, so two workers won't process the same request at once.
     *
     * @default 'single'
     */
    requestQueueAccess?: 'single' | 'shared';
}
/**
 * A file-system storage backend backed by the native `@crawlee/fs-storage-native` Rust extension.
 *
 * The native extension owns the on-disk format, timestamps, item counting, request-queue locking and
 * state persistence. This class is responsible for resolving the user-facing `id` / `name` / `alias`
 * identifiers to native storages, caching the opened backends (so that `storageExists`, `purge` and
 * `teardown` can operate over them), and exposing them through the `@crawlee/types` interfaces.
 */
export declare class FileSystemStorageBackend implements storage.StorageBackend {
    #private;
    readonly localDataDirectory: string;
    readonly datasetsDirectory: string;
    readonly keyValueStoresDirectory: string;
    readonly requestQueuesDirectory: string;
    readonly logger?: CrawleeLogger;
    readonly requestQueueAccess: 'single' | 'shared';
    constructor(options: FileSystemStorageOptions);
    /**
     * Return a cache key that includes the resolved storage directory, so that two
     * `FileSystemStorageBackend` instances pointing at different directories get separate cache
     * partitions, by including the storage directory in the cache key.
     */
    getStorageBackendCacheKey(): string;
    createDatasetBackend(options?: storage.StorageIdentifier): Promise<storage.DatasetBackend>;
    createKeyValueStoreBackend(options?: storage.StorageIdentifier): Promise<storage.KeyValueStoreBackend>;
    createRequestQueueBackend(options?: storage.StorageIdentifier): Promise<storage.RequestQueueBackend>;
    storageExists(id: string, type: 'Dataset' | 'KeyValueStore' | 'RequestQueue'): Promise<boolean>;
    /**
     * Cleans up the run-scoped storages before the run starts, sweeping the storage directories so that
     * leftovers from a previous process are caught too.
     */
    purge(): Promise<void>;
    /**
     * This method should be called at the end of the process, to ensure all data is saved.
     *
     * It persists the state of every opened request queue so that requests fetched but not yet handled
     * are not stuck (until their lock expires) for the next consumer of the same on-disk queue.
     */
    teardown(): Promise<void>;
}
