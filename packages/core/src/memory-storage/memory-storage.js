import { randomUUID } from 'node:crypto';
import { DatasetBackend } from './resource-clients/dataset.js';
import { KeyValueStoreBackend } from './resource-clients/key-value-store.js';
import { RequestQueueBackend } from './resource-clients/request-queue.js';
/** The alias the default (unnamed) storage is opened under. */
const DEFAULT_STORAGE_ALIAS = '__default__';
export class MemoryStorageBackend {
    logger;
    /**
     * Unique per-instance cache partition key. Mirrors the way `FileSystemStorageBackend` partitions its
     * cache by storage directory: two distinct `MemoryStorageBackend` instances must not share cached backends.
     */
    #instanceCacheKey = `MemoryStorageBackend:${randomUUID()}`;
    #keyValueStoreBackendCache = [];
    #datasetBackendCache = [];
    #requestQueueBackendCache = [];
    constructor(options = {}) {
        this.logger = options.logger;
    }
    /**
     * Return a per-instance unique cache key so that distinct `MemoryStorageBackend` instances get separate
     * cache partitions in the storage backend cache.
     */
    getStorageBackendCacheKey() {
        return this.#instanceCacheKey;
    }
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
    evictBackend(type, id) {
        let cache;
        switch (type) {
            case 'Dataset':
                cache = this.#datasetBackendCache;
                break;
            case 'KeyValueStore':
                cache = this.#keyValueStoreBackendCache;
                break;
            case 'RequestQueue':
                cache = this.#requestQueueBackendCache;
                break;
        }
        const index = cache.findIndex((entry) => entry.id === id);
        if (index === -1) {
            return false;
        }
        cache.splice(index, 1);
        return true;
    }
    static #resolveStorageKey(options) {
        // No identifier at all means the default storage, which is opened under the reserved alias —
        // same rule as `resolveStorageIdentifier` in the storage frontends, so that a backend used
        // directly lands on the very storage the frontends would have opened.
        const alias = options.alias || (!options.id && !options.name ? DEFAULT_STORAGE_ALIAS : undefined);
        // `alias` covers the identifier-less case, so one of the three is always set.
        const rawKey = alias ?? options.name ?? options.id;
        // Normalize the internal __default__ alias to the user-facing 'default' name.
        const cacheKey = rawKey === DEFAULT_STORAGE_ALIAS ? 'default' : rawKey;
        return { isAlias: alias !== undefined, cacheKey };
    }
    async createDatasetBackend(options = {}) {
        const { isAlias, cacheKey } = MemoryStorageBackend.#resolveStorageKey(options);
        const found = this.#datasetBackendCache.find((store) => store.id === cacheKey ||
            store.name?.toLowerCase() === cacheKey.toLowerCase() ||
            store.cacheKey.toLowerCase() === cacheKey.toLowerCase());
        if (found) {
            return found;
        }
        const newStore = new DatasetBackend({
            name: isAlias ? undefined : cacheKey,
            cacheKey,
            storageBackend: this,
        });
        this.#datasetBackendCache.push(newStore);
        return newStore;
    }
    async createKeyValueStoreBackend(options = {}) {
        const { isAlias, cacheKey } = MemoryStorageBackend.#resolveStorageKey(options);
        const found = this.#keyValueStoreBackendCache.find((store) => store.id === cacheKey ||
            store.name?.toLowerCase() === cacheKey.toLowerCase() ||
            store.cacheKey.toLowerCase() === cacheKey.toLowerCase());
        if (found) {
            return found;
        }
        const newStore = new KeyValueStoreBackend({
            name: isAlias ? undefined : cacheKey,
            cacheKey,
            storageBackend: this,
        });
        this.#keyValueStoreBackendCache.push(newStore);
        return newStore;
    }
    async createRequestQueueBackend(options = {}) {
        const { isAlias, cacheKey } = MemoryStorageBackend.#resolveStorageKey(options);
        const found = this.#requestQueueBackendCache.find((queue) => queue.id === cacheKey ||
            queue.name?.toLowerCase() === cacheKey.toLowerCase() ||
            queue.cacheKey.toLowerCase() === cacheKey.toLowerCase());
        if (found) {
            return found;
        }
        const newStore = new RequestQueueBackend({
            name: isAlias ? undefined : cacheKey,
            cacheKey,
            storageBackend: this,
        });
        this.#requestQueueBackendCache.push(newStore);
        return newStore;
    }
    async storageExists(id, type) {
        let backends;
        switch (type) {
            case 'Dataset':
                backends = this.#datasetBackendCache;
                break;
            case 'KeyValueStore':
                backends = this.#keyValueStoreBackendCache;
                break;
            case 'RequestQueue':
                backends = this.#requestQueueBackendCache;
                break;
            default:
                return false;
        }
        // In-memory storage only knows about backends in its cache.
        return backends.some((store) => store.id === id);
    }
    /**
     * Cleans up the run-scoped storages before the run starts. For the in-memory storage this simply
     * resets the in-memory state of the cached backends.
     */
    async purge() {
        // `#resolveStorageKey` leaves `name` unset for the default and alias-keyed storages, which is what
        // marks them as run-scoped. `'default'` is the exception — it collapses onto the default storage.
        const isRunScoped = (store) => store.name === undefined || store.name === 'default';
        const isDefault = (store) => store.name === 'default' || store.cacheKey === 'default';
        const purgeRunScoped = async (cache, purgeStore) => {
            await Promise.all(cache.filter(isRunScoped).map(async (store) => purgeStore(store)));
        };
        await Promise.all([
            // Only the default store holds the run input, so it is the only one that keeps `INPUT`.
            purgeRunScoped(this.#keyValueStoreBackendCache, async (store) => isDefault(store) ? store.purgeExceptInput() : store.purge()),
            purgeRunScoped(this.#datasetBackendCache, async (store) => store.purge()),
            purgeRunScoped(this.#requestQueueBackendCache, async (store) => store.purge()),
        ]);
    }
    /**
     * This method should be called at the end of the process. The in-memory storage holds no resources
     * that outlive the process (no file handles, no cross-process locks), so there is nothing to do.
     */
    async teardown() {
        // Nothing to tear down for in-memory storage.
    }
}
