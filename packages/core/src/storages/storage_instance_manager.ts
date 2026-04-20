import type {
    BaseHttpClient,
    DatasetClient,
    KeyValueStoreClient,
    RequestQueueClient,
    StorageClient,
    StorageIdentifier,
} from '@crawlee/types';

import type { Configuration } from '../configuration.js';
import type { ProxyConfiguration } from '../proxy_configuration.js';
import { serviceLocator } from '../service_locator.js';
import type { Constructor } from '../typedefs.js';

export type { StorageIdentifier } from '@crawlee/types';

/**
 * Matches an `IStorage` – a storage "frontend" (Dataset, KeyValueStore, RequestQueue).
 */
export interface IStorage {
    id: string;
    name?: string;
}

type ClientOpener = () => Promise<DatasetClient | KeyValueStoreClient | RequestQueueClient>;
type Hashable = string;

// ---------------------------------------------------------------------------
// Storage cache
// ---------------------------------------------------------------------------

/**
 * Two-tier cache for storage instances, keyed by `[storageClass][identifier][clientCacheKey]`.
 *
 * This is modelled after crawlee-python's `_StorageCache`, minus the `by_alias` tier
 * (aliases will be introduced separately).
 */
class StorageCache {
    /** `storageClass → id → clientCacheKey → instance` */
    readonly byId = new Map<Constructor<IStorage>, Map<string, Map<Hashable, IStorage>>>();

    /** `storageClass → name → clientCacheKey → instance` */
    readonly byName = new Map<Constructor<IStorage>, Map<string, Map<Hashable, IStorage>>>();

    get<T extends IStorage>(
        cls: Constructor<T>,
        { id, name, clientCacheKey }: { id?: string; name?: string; clientCacheKey: Hashable },
    ): T | undefined {
        if (id) {
            const cached = this.byId.get(cls)?.get(id)?.get(clientCacheKey);
            if (cached) return cached as T;
        }

        if (name) {
            const cached = this.byName.get(cls)?.get(name)?.get(clientCacheKey);
            if (cached) return cached as T;
        }

        return undefined;
    }

    set<T extends IStorage>(cls: Constructor<T>, instance: T, clientCacheKey: Hashable): void {
        // by id
        if (!this.byId.has(cls)) this.byId.set(cls, new Map());
        const idMap = this.byId.get(cls)!;
        if (!idMap.has(instance.id)) idMap.set(instance.id, new Map());
        idMap.get(instance.id)!.set(clientCacheKey, instance);

        // by name
        if (instance.name) {
            if (!this.byName.has(cls)) this.byName.set(cls, new Map());
            const nameMap = this.byName.get(cls)!;
            if (!nameMap.has(instance.name)) nameMap.set(instance.name, new Map());
            nameMap.get(instance.name)!.set(clientCacheKey, instance);
        }
    }

    remove(instance: IStorage): void {
        for (const [, idMap] of this.byId) {
            const keyMap = idMap.get(instance.id);
            if (keyMap) {
                for (const [key, cached] of keyMap) {
                    if (cached === instance) keyMap.delete(key);
                }
                if (keyMap.size === 0) idMap.delete(instance.id);
            }
        }

        if (instance.name) {
            for (const [, nameMap] of this.byName) {
                const keyMap = nameMap.get(instance.name);
                if (keyMap) {
                    for (const [key, cached] of keyMap) {
                        if (cached === instance) keyMap.delete(key);
                    }
                    if (keyMap.size === 0) nameMap.delete(instance.name);
                }
            }
        }
    }

    /** Iterate all cached instances across all storage types. */
    *allValues(): IterableIterator<IStorage> {
        const seen = new Set<IStorage>();
        for (const classMap of this.byId.values()) {
            for (const keyMap of classMap.values()) {
                for (const instance of keyMap.values()) {
                    if (!seen.has(instance)) {
                        seen.add(instance);
                        yield instance;
                    }
                }
            }
        }
    }

    /** Iterate all cached instances for a given storage class. */
    *valuesForClass(cls: Constructor<IStorage>): IterableIterator<IStorage> {
        const seen = new Set<IStorage>();
        const idMap = this.byId.get(cls);
        if (idMap) {
            for (const keyMap of idMap.values()) {
                for (const instance of keyMap.values()) {
                    if (!seen.has(instance)) {
                        seen.add(instance);
                        yield instance;
                    }
                }
            }
        }
    }

    clear(): void {
        this.byId.clear();
        this.byName.clear();
    }
}

// ---------------------------------------------------------------------------
// Per-key async lock (similar to Python's WeakValueDictionary[tuple, Lock])
// ---------------------------------------------------------------------------

class KeyedLock {
    private locks = new Map<string, { promise: Promise<void>; resolve: () => void; refCount: number }>();

    async acquire(key: string): Promise<void> {
        while (this.locks.has(key)) {
            await this.locks.get(key)!.promise;
        }

        let resolve!: () => void;
        const promise = new Promise<void>((r) => {
            resolve = r;
        });
        this.locks.set(key, { promise, resolve, refCount: 1 });
    }

    release(key: string): void {
        const entry = this.locks.get(key);
        if (entry) {
            this.locks.delete(key);
            entry.resolve();
        }
    }
}

// ---------------------------------------------------------------------------
// StorageInstanceManager
// ---------------------------------------------------------------------------

const DEFAULT_ID_CONFIG_KEYS = {
    Dataset: 'defaultDatasetId',
    KeyValueStore: 'defaultKeyValueStoreId',
    RequestQueue: 'defaultRequestQueueId',
} as const;

/**
 * Unified manager for opening and caching storage instances (Dataset, KeyValueStore, RequestQueue).
 *
 * Modelled after crawlee-python's `StorageInstanceManager`. A single instance manages all storage
 * types. Instances are cached by `(storageClass, identifier, clientCacheKey)` so the same storage
 * is never opened twice.
 *
 * @ignore
 */
export class StorageInstanceManager {
    private readonly cache = new StorageCache();
    private readonly openerLocks = new KeyedLock();

    constructor(private readonly config: Configuration) {}

    /**
     * Open (or retrieve from cache) a storage instance.
     *
     * @param cls          The storage class constructor (e.g. `Dataset`, `KeyValueStore`, `RequestQueue`).
     * @param identifier   String, `{ id?, name? }`, `null`, or `undefined`.
     * @param clientOpener A **lazy** factory function that creates the sub-client. It will only be
     *                     called on a cache miss. This follows the coroutine-as-parameter pattern
     *                     from crawlee-python.
     * @param clientCacheKey  Opaque key identifying the storage backend, so that the same logical
     *                        storage opened through different clients is cached separately.
     */
    async openStorage<T extends IStorage>(
        cls: Constructor<T>,
        identifier: string | StorageIdentifier | null | undefined,
        clientOpener: ClientOpener,
        clientCacheKey: Hashable,
    ): Promise<T> {
        const resolved = await this._resolveIdentifier(cls, identifier);

        // Fast path: check cache without lock.
        const cached = this.cache.get(cls, { ...resolved, clientCacheKey });
        if (cached) return cached;

        // Build a per-(class, identifier, clientCacheKey) lock key.
        const lockKey = `${cls.name}:${resolved.id ?? ''}:${resolved.name ?? ''}:${clientCacheKey}`;

        await this.openerLocks.acquire(lockKey);
        try {
            // Double-check after acquiring lock.
            const cachedAfterLock = this.cache.get(cls, { ...resolved, clientCacheKey });
            if (cachedAfterLock) return cachedAfterLock;

            // Cache miss – create the sub-client and storage instance.
            const subClient = await clientOpener();
            const storageInfo = await (
                subClient as DatasetClient | KeyValueStoreClient | RequestQueueClient
            ).getMetadata();

            const instance = new cls(
                {
                    id: storageInfo.id,
                    name: storageInfo.name,
                    client: subClient,
                },
                this.config,
            ) as T;

            // Atomic cache writes (no awaits between these).
            this.cache.set(cls, instance, clientCacheKey);

            return instance;
        } finally {
            this.openerLocks.release(lockKey);
        }
    }

    /**
     * Remove a storage instance from the cache (called from `storage.drop()`).
     */
    removeFromCache(instance: IStorage): void {
        this.cache.remove(instance);
    }

    /**
     * Clear the entire cache. Called during service locator reset.
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Iterate all cached instances for a given storage class.
     */
    *getInstancesOfType(cls: Constructor<IStorage>): IterableIterator<IStorage> {
        yield* this.cache.valuesForClass(cls);
    }

    /**
     * Iterate all cached instances across all storage types.
     * Used by the service locator to call `clearCache()` on KeyValueStore instances
     * without importing the KeyValueStore class (avoids circular dependencies).
     */
    *getAllInstances(): IterableIterator<IStorage> {
        yield* this.cache.allValues();
    }

    /**
     * Resolves the user-provided identifier to an unambiguous `StorageIdentifier`.
     *
     * - `null`/`undefined` → uses the default storage ID from config
     * - `StorageIdentifier` object → passed through (with default ID fallback if empty)
     * - `string` → tries to find an existing storage with that ID first;
     *   if none exists, treats the string as a name
     */
    private async _resolveIdentifier(
        cls: Constructor<IStorage>,
        identifier?: string | StorageIdentifier | null,
    ): Promise<StorageIdentifier> {
        const storageName = cls.name as keyof typeof DEFAULT_ID_CONFIG_KEYS;

        if (typeof identifier === 'string') {
            const client = serviceLocator.getStorageClient();

            if (client.storageExists && (await client.storageExists(identifier, storageName))) {
                return { id: identifier };
            }

            return { name: identifier };
        }

        if (identifier?.id) {
            return { id: identifier.id };
        }

        if (identifier?.name) {
            return { name: identifier.name };
        }

        const defaultIdConfigKey = DEFAULT_ID_CONFIG_KEYS[storageName];
        const defaultId = this.config.get(defaultIdConfigKey) as string;

        return { id: defaultId };
    }
}

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------

export interface StorageManagerOptions {
    /**
     * SDK configuration instance, defaults to the static register.
     */
    config?: Configuration;

    /**
     * Optional storage client that should be used to open storages.
     */
    storageClient?: StorageClient;

    /**
     * Used to pass the proxy configuration for the `requestsFromUrl` objects.
     * Takes advantage of the internal address rotation and authentication process.
     * If undefined, the `requestsFromUrl` requests will be made without proxy.
     */
    proxyConfiguration?: ProxyConfiguration;

    /**
     * HTTP client to be used to download the list of URLs in `RequestQueue`.
     */
    httpClient?: BaseHttpClient;
}
