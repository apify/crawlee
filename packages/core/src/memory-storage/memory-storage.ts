import { randomUUID } from 'node:crypto';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';

import { DatasetBackend } from './resource-clients/dataset.js';
import { KeyValueStoreBackend } from './resource-clients/key-value-store.js';
import { RequestQueueBackend } from './resource-clients/request-queue.js';

export interface MemoryStorageOptions {
    /**
     * Optional logger for MemoryStorageBackend warnings.
     */
    logger?: CrawleeLogger;
}

export class MemoryStorageBackend implements storage.StorageBackend {
    readonly logger?: CrawleeLogger;

    /**
     * Unique per-instance cache partition key. Mirrors the way `FileSystemStorageBackend` partitions its
     * cache by storage directory: two distinct `MemoryStorageBackend` instances must not share cached backends.
     */
    private readonly instanceCacheKey = `MemoryStorageBackend:${randomUUID()}`;

    readonly keyValueStoreBackendCache: KeyValueStoreBackend[] = [];
    readonly datasetBackendCache: DatasetBackend[] = [];
    readonly requestQueueBackendCache: RequestQueueBackend[] = [];

    constructor(options: MemoryStorageOptions = {}) {
        this.logger = options.logger;
    }

    /**
     * Return a per-instance unique cache key so that distinct `MemoryStorageBackend` instances get separate
     * cache partitions in the storage backend cache.
     */
    getStorageBackendCacheKey(): string {
        return this.instanceCacheKey;
    }

    private static resolveStorageKey(options: { id?: string; name?: string; alias?: string }): {
        isAlias: boolean;
        cacheKey: string | undefined;
    } {
        const isAlias = 'alias' in options && !!options.alias;
        const rawKey = isAlias ? options.alias : (options.name ?? options.id);
        // Normalize the internal __default__ alias to the user-facing 'default' name.
        const cacheKey = rawKey === '__default__' ? 'default' : rawKey;
        return { isAlias, cacheKey };
    }

    async createDatasetBackend(options: storage.CreateDatasetBackendOptions = {}): Promise<storage.DatasetBackend> {
        const { isAlias, cacheKey } = MemoryStorageBackend.resolveStorageKey(options);

        if (cacheKey) {
            const found = this.datasetBackendCache.find(
                (store) =>
                    store.id === cacheKey ||
                    store.name?.toLowerCase() === cacheKey.toLowerCase() ||
                    store.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const newStore = new DatasetBackend({
            name: isAlias ? undefined : cacheKey,
            cacheKey,
            storageBackend: this,
        });
        this.datasetBackendCache.push(newStore);

        return newStore;
    }

    async createKeyValueStoreBackend(
        options: storage.CreateKeyValueStoreBackendOptions = {},
    ): Promise<storage.KeyValueStoreBackend> {
        const { isAlias, cacheKey } = MemoryStorageBackend.resolveStorageKey(options);

        if (cacheKey) {
            const found = this.keyValueStoreBackendCache.find(
                (store) =>
                    store.id === cacheKey ||
                    store.name?.toLowerCase() === cacheKey.toLowerCase() ||
                    store.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const newStore = new KeyValueStoreBackend({
            name: isAlias ? undefined : cacheKey,
            cacheKey,
            storageBackend: this,
        });
        this.keyValueStoreBackendCache.push(newStore);

        return newStore;
    }

    async createRequestQueueBackend(
        options: storage.CreateRequestQueueBackendOptions = {},
    ): Promise<RequestQueueBackend> {
        const { isAlias, cacheKey } = MemoryStorageBackend.resolveStorageKey(options);

        if (cacheKey) {
            const found = this.requestQueueBackendCache.find(
                (queue) =>
                    queue.id === cacheKey ||
                    queue.name?.toLowerCase() === cacheKey.toLowerCase() ||
                    queue.cacheKey.toLowerCase() === cacheKey.toLowerCase(),
            );
            if (found) {
                return found;
            }
        }

        const newStore = new RequestQueueBackend({
            name: isAlias ? undefined : cacheKey,
            cacheKey,
            storageBackend: this,
        });
        this.requestQueueBackendCache.push(newStore);

        return newStore;
    }

    async storageExists(id: string, type: 'Dataset' | 'KeyValueStore' | 'RequestQueue'): Promise<boolean> {
        let backends: { id: string }[];

        switch (type) {
            case 'Dataset':
                backends = this.datasetBackendCache;
                break;
            case 'KeyValueStore':
                backends = this.keyValueStoreBackendCache;
                break;
            case 'RequestQueue':
                backends = this.requestQueueBackendCache;
                break;
            default:
                return false;
        }

        // In-memory storage only knows about backends in its cache.
        return backends.some((store) => store.id === id);
    }

    /**
     * Cleans up the default storages before the run starts. For the in-memory storage this simply
     * resets the in-memory state of the cached default dataset, key-value store and request queue.
     *
     * As with `FileSystemStorageBackend`, the run's input (the `INPUT` key in the default key-value
     * store) is preserved — only the rest of the default storages is cleared.
     */
    async purge(): Promise<void> {
        // The run default is opened via `{ alias: '__default__' }`, which `resolveStorageKey`
        // normalizes to `cacheKey === 'default'` (with `name === undefined`) — that is the clause
        // that actually matches it. The `name === 'default'` clause additionally covers a store a user
        // explicitly opened via `{ name: 'default' }`. (`'__default__'` never reaches `cacheKey`,
        // as it is always normalized to `'default'` first, so it does not need to be checked here.)
        const isDefault = (store: { name?: string; cacheKey: string }) =>
            store.name === 'default' || store.cacheKey === 'default';

        const purgeDefaults = async <T extends { name?: string; cacheKey: string }>(
            cache: T[],
            purgeStore: (store: T) => Promise<void>,
        ) => {
            await Promise.all(cache.filter(isDefault).map(async (store) => purgeStore(store)));
        };

        await Promise.all([
            // Preserve the run input (INPUT) when purging the default key-value store, matching
            // `FileSystemStorageBackend`.
            purgeDefaults(this.keyValueStoreBackendCache, async (store) => store.purgeExceptInput()),
            purgeDefaults(this.datasetBackendCache, async (store) => store.purge()),
            purgeDefaults(this.requestQueueBackendCache, async (store) => store.purge()),
        ]);
    }

    /**
     * This method should be called at the end of the process. The in-memory storage holds no resources
     * that outlive the process (no file handles, no cross-process locks), so there is nothing to do.
     */
    async teardown(): Promise<void> {
        // Nothing to tear down for in-memory storage.
    }
}
