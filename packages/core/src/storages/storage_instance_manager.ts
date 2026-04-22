import type {
    BaseHttpClient,
    DatasetClient,
    KeyValueStoreClient,
    RequestQueueClient,
    StorageClient,
    StorageIdentifier,
} from '@crawlee/types';
import { AsyncQueue } from '@sapphire/async-queue';

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
 * Modelled after crawlee-python's `_StorageCache`, minus the `by_alias` tier
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
        if (id !== undefined) {
            const cached = this.byId.get(cls)?.get(id)?.get(clientCacheKey);
            if (cached) {
                if (cached instanceof (cls as unknown as abstract new (...args: any[]) => any)) {
                    return cached as T;
                }
                throw new Error('Cached storage instance type mismatch.');
            }
        }

        if (name !== undefined) {
            const cached = this.byName.get(cls)?.get(name)?.get(clientCacheKey);
            if (cached) {
                if (cached instanceof (cls as unknown as abstract new (...args: any[]) => any)) {
                    return cached as T;
                }
                throw new Error('Cached storage instance type mismatch.');
            }
        }

        return undefined;
    }

    set<T extends IStorage>(cls: Constructor<T>, instance: T, clientCacheKey: Hashable): void {
        // by id — always cache
        if (!this.byId.has(cls)) this.byId.set(cls, new Map());
        const idMap = this.byId.get(cls)!;
        if (!idMap.has(instance.id)) idMap.set(instance.id, new Map());
        idMap.get(instance.id)!.set(clientCacheKey, instance);

        // by name — only if named
        if (instance.name) {
            if (!this.byName.has(cls)) this.byName.set(cls, new Map());
            const nameMap = this.byName.get(cls)!;
            if (!nameMap.has(instance.name)) nameMap.set(instance.name, new Map());
            nameMap.get(instance.name)!.set(clientCacheKey, instance);
        }
    }

    removeFromCache(instance: IStorage): void {
        const storageType = instance.constructor as Constructor<IStorage>;

        // Remove from ID cache
        const idKeyMap = this.byId.get(storageType)?.get(instance.id);
        if (idKeyMap) {
            for (const [key, cached] of idKeyMap) {
                if (cached === instance) {
                    idKeyMap.delete(key);
                    break;
                }
            }
            if (idKeyMap.size === 0) this.byId.get(storageType)!.delete(instance.id);
        }

        // Remove from name cache
        if (instance.name) {
            const nameKeyMap = this.byName.get(storageType)?.get(instance.name);
            if (nameKeyMap) {
                for (const [key, cached] of nameKeyMap) {
                    if (cached === instance) {
                        nameKeyMap.delete(key);
                        break;
                    }
                }
                if (nameKeyMap.size === 0) this.byName.get(storageType)!.delete(instance.name);
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

    clear(): void {
        this.byId.clear();
        this.byName.clear();
    }
}

// ---------------------------------------------------------------------------
// Identifier resolution (called by storage open() methods before the manager)
// ---------------------------------------------------------------------------

const DEFAULT_ID_CONFIG_KEYS: Record<string, string> = {
    Dataset: 'defaultDatasetId',
    KeyValueStore: 'defaultKeyValueStoreId',
    RequestQueue: 'defaultRequestQueueId',
};

/**
 * Resolves a user-provided identifier to an unambiguous `{ id?, name? }` object.
 *
 * - `null`/`undefined` → uses the default storage ID from config
 * - `StorageIdentifier` object → passed through (with default ID fallback if empty)
 * - `string` → tries to find an existing storage with that ID first;
 *   if none exists, treats the string as a name
 *
 * This is called by `Dataset.open()`, `KeyValueStore.open()`, and `RequestQueue.open()`
 * before delegating to `StorageInstanceManager.openStorage()`.
 */
export async function resolveStorageIdentifier(
    storageTypeName: string,
    identifier: string | StorageIdentifier | null | undefined,
    client: StorageClient,
    config: Configuration,
): Promise<StorageIdentifier> {
    if (typeof identifier === 'string') {
        if (client.storageExists && (await client.storageExists(identifier, storageTypeName as any))) {
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

    const defaultIdConfigKey = DEFAULT_ID_CONFIG_KEYS[storageTypeName];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- config key is dynamically determined
    const defaultId = config.get(defaultIdConfigKey as any) as string;

    return { id: defaultId };
}

// ---------------------------------------------------------------------------
// StorageInstanceManager
// ---------------------------------------------------------------------------

/**
 * Unified manager for opening and caching storage instances (Dataset, KeyValueStore, RequestQueue).
 *
 * Modelled after crawlee-python's `StorageInstanceManager`. A single instance manages all storage
 * types. Instances are cached by `(storageClass, id/name, clientCacheKey)` so the same storage
 * is never opened twice.
 *
 * The manager is stateless — it has no configuration dependency. Identifier resolution
 * (default IDs, string-to-id/name disambiguation) is handled by the caller before
 * calling `openStorage()`.
 *
 * @ignore
 */
export class StorageInstanceManager {
    private readonly _cache = new StorageCache();
    private readonly _openerLocks = new Map<string, AsyncQueue>();

    /**
     * Open (or retrieve from cache) a storage instance.
     *
     * @param cls             The storage class constructor (e.g. `Dataset`, `KeyValueStore`, `RequestQueue`).
     * @param id              Storage ID (already resolved by the caller).
     * @param name            Storage name (already resolved by the caller).
     * @param clientOpener    A **lazy** factory function that creates the sub-client. It will only be
     *                        called on a cache miss. This follows the coroutine-as-parameter pattern
     *                        from crawlee-python.
     * @param clientCacheKey  Opaque key identifying the storage backend, so that the same logical
     *                        storage opened through different clients is cached separately.
     */
    async openStorage<T extends IStorage>(
        cls: Constructor<T>,
        {
            id,
            name,
            clientOpener,
            clientCacheKey,
        }: StorageIdentifier & {
            clientOpener: ClientOpener;
            clientCacheKey: Hashable;
        },
    ): Promise<T> {
        // Fast path: check cache without lock.
        const cached = this._cache.get(cls, { id, name, clientCacheKey });
        if (cached) return cached;

        // Build a per-(class, identifier, clientCacheKey) lock key.
        const lockKey = `${cls.name}:${id ?? ''}:${name ?? ''}:${clientCacheKey}`;

        if (!this._openerLocks.has(lockKey)) {
            this._openerLocks.set(lockKey, new AsyncQueue());
        }
        const queue = this._openerLocks.get(lockKey)!;

        await queue.wait();
        try {
            // Double-check after acquiring lock.
            const cachedAfterLock = this._cache.get(cls, { id, name, clientCacheKey });
            if (cachedAfterLock) return cachedAfterLock;

            // Cache miss — create the sub-client and storage instance.
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
                serviceLocator.getConfiguration(),
            ) as T;

            // Atomic cache writes (no awaits between these).
            this._cache.set(cls, instance, clientCacheKey);

            return instance;
        } finally {
            queue.shift();
        }
    }

    /**
     * Remove a storage instance from the cache (called from `storage.drop()`).
     */
    removeFromCache(instance: IStorage): void {
        this._cache.removeFromCache(instance);
    }

    /**
     * Clear the entire cache. Called during service locator reset.
     */
    clearCache(): void {
        this._cache.clear();
    }

    /**
     * Iterate all cached instances across all storage types.
     * Used by the service locator to call `clearCache()` on KeyValueStore instances
     * without importing the KeyValueStore class (avoids circular dependencies).
     */
    *getAllInstances(): IterableIterator<IStorage> {
        yield* this._cache.allValues();
    }
}

// ---------------------------------------------------------------------------
// Re-exports
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
