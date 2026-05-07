import type {
    DatasetClient,
    KeyValueStoreClient,
    RequestQueueClient,
    StorageClient,
    StorageIdentifier,
} from '@crawlee/types';
import { AsyncQueue } from '@sapphire/async-queue';

import type { Constructor } from '../typedefs.js';

export type { StorageIdentifier } from '@crawlee/types';

/**
 * Matches an `IStorage` – a storage "frontend" (Dataset, KeyValueStore, RequestQueue).
 */
export interface IStorage {
    id: string;
    name?: string;
}

type Hashable = string;

/** Reserved alias for the default (unnamed) storage. */
const DEFAULT_STORAGE_ALIAS = '__default__';

type CacheTier = Map<Constructor<IStorage>, Map<string, Map<Hashable, IStorage>>>;

/**
 * Three-tier cache for storage instances, modelled after crawlee-python's `_StorageCache`.
 *
 * Each tier maps `[storageClass][key][clientCacheKey] → instance`:
 *   - `byId`    — keyed by the backend-assigned storage id
 *   - `byName`  — keyed by the persistent storage name
 *   - `byAlias` — keyed by a run-scoped alias (e.g. `'__default__'` for unnamed storages)
 */
class StorageCache {
    readonly byId: CacheTier = new Map();
    readonly byName: CacheTier = new Map();
    readonly byAlias: CacheTier = new Map();

    get<T extends IStorage>(
        cls: Constructor<T>,
        {
            id,
            name,
            alias,
            clientCacheKey,
        }: (
            | { id: string; name?: string; alias?: undefined }
            | { id?: string; name: string; alias?: undefined }
            | { id?: undefined; name?: undefined; alias: string }
        ) & { clientCacheKey: Hashable },
    ): T | undefined {
        for (const [tier, key] of [
            [this.byId, id],
            [this.byName, name],
            [this.byAlias, alias],
        ] as [CacheTier, string | undefined][]) {
            if (key === undefined) continue;
            const cached = tier.get(cls)?.get(key)?.get(clientCacheKey);
            if (cached) {
                if (cached instanceof (cls as unknown as abstract new (...args: any[]) => any)) {
                    return cached as T;
                }
                throw new Error('Cached storage instance type mismatch.');
            }
        }

        return undefined;
    }

    /** Write a single entry into a given tier. */
    private setInMap<T extends IStorage>(
        tier: CacheTier,
        cls: Constructor<T>,
        key: string,
        instance: T,
        clientCacheKey: Hashable,
    ): void {
        if (!tier.has(cls)) tier.set(cls, new Map());
        const keyMap = tier.get(cls)!;
        if (!keyMap.has(key)) keyMap.set(key, new Map());
        keyMap.get(key)!.set(clientCacheKey, instance);
    }

    /**
     * Cache an instance under its actual id, name, and an optional alias.
     */
    set<T extends IStorage>(cls: Constructor<T>, instance: T, clientCacheKey: Hashable, alias?: string): void {
        // Always cache by id.
        this.setInMap(this.byId, cls, instance.id, instance, clientCacheKey);

        // Cache by name — only for named storages.
        if (instance.name) {
            this.setInMap(this.byName, cls, instance.name, instance, clientCacheKey);
        }

        // Cache by alias — only for unnamed storages opened via alias.
        if (alias !== undefined) {
            this.setInMap(this.byAlias, cls, alias, instance, clientCacheKey);
        }
    }

    removeFromCache(instance: IStorage): void {
        const storageType = instance.constructor as Constructor<IStorage>;

        for (const tier of [this.byId, this.byName, this.byAlias]) {
            const classMap = tier.get(storageType);
            if (!classMap) continue;

            for (const keyMap of classMap.values()) {
                for (const [cacheKey, cached] of keyMap) {
                    if (cached === instance) {
                        keyMap.delete(cacheKey);
                    }
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

    clear(): void {
        this.byId.clear();
        this.byName.clear();
        this.byAlias.clear();
    }
}

/**
 * Unified manager for opening and caching storage instances (Dataset, KeyValueStore, RequestQueue).
 *
 * A single instance manages all storage types. Instances are cached by
 * `(storageClass, id/name/alias, clientCacheKey)` so the same storage is never opened twice.
 *
 * The manager itself does not resolve identifiers — callers pass explicit `id`, `name`, or `alias` (at most one),
 * and a pre-bound `clientOpener` promise. When none of `id`, `name`, `alias` are provided, the manager automatically
 * assigns a reserved default alias.
 *
 * @ignore
 */
export class StorageInstanceManager {
    private readonly cache = new StorageCache();
    private readonly openerLocks = new Map<string, AsyncQueue>();

    /**
     * Open (or retrieve from cache) a storage instance.
     *
     * @param cls               The storage class constructor (e.g. `Dataset`, `KeyValueStore`, `RequestQueue`).
     * @param id                Storage ID (mutually exclusive with `name` and `alias`).
     * @param name              Storage name (mutually exclusive with `id` and `alias`).
     * @param alias             Run-scoped alias (mutually exclusive with `id` and `name`).
     *                          Automatically assigned when no identifier is provided.
     * @param clientOpener      A **lazy** factory that creates the sub-client.
     *                          Only called on a cache miss.
     * @param clientCacheKey    Opaque key identifying the storage backend, so that the same logical
     *                          storage opened through different clients is cached separately.
     */
    async openStorage<TStorage extends IStorage>(
        cls: Constructor<TStorage>,
        {
            id,
            name,
            alias,
            clientOpener,
            clientCacheKey,
        }: (ExplicitStorageIdentifier | DefaultStorageIdentifier) & {
            clientOpener: () => Promise<DatasetClient | KeyValueStoreClient | RequestQueueClient>;
            clientCacheKey: Hashable;
        },
    ): Promise<TStorage> {
        // Auto-set alias='__default__' when no parameters are specified (mirrors crawlee-python).
        if (!id && !name && !alias) {
            alias = DEFAULT_STORAGE_ALIAS;
        }

        // Fast-path cache check (no lock).
        if (alias !== undefined) {
            const cached = this.cache.get(cls, { alias, clientCacheKey });
            if (cached) return cached;
        } else if (id) {
            const cached = this.cache.get(cls, { id, clientCacheKey });
            if (cached) return cached;
        } else if (name) {
            const cached = this.cache.get(cls, { name, clientCacheKey });
            if (cached) return cached;
        }

        const identifierKey = id ?? name ?? alias ?? DEFAULT_STORAGE_ALIAS;
        const lockKey = `${cls.name}:${identifierKey}:${clientCacheKey}`;

        if (!this.openerLocks.has(lockKey)) {
            this.openerLocks.set(lockKey, new AsyncQueue());
        }
        const queue = this.openerLocks.get(lockKey)!;

        await queue.wait();
        try {
            // Double-check cache under lock (another caller may have filled it while we waited).
            if (alias !== undefined) {
                const cached = this.cache.get(cls, { alias, clientCacheKey });
                if (cached) return cached;
            } else if (id) {
                const cached = this.cache.get(cls, { id, clientCacheKey });
                if (cached) return cached;
            } else if (name) {
                const cached = this.cache.get(cls, { name, clientCacheKey });
                if (cached) return cached;
            }

            // Cache miss — create the sub-client and storage instance.
            const subClient = await clientOpener();
            const storageInfo = await (
                subClient as DatasetClient | KeyValueStoreClient | RequestQueueClient
            ).getMetadata();

            const instance = new cls({
                id: storageInfo.id,
                name: storageInfo.name,
                client: subClient,
            }) as TStorage;

            // Atomic cache writes (no awaits between these).
            this.cache.set(cls, instance, clientCacheKey, alias);

            return instance;
        } finally {
            queue.shift();

            // Clean up idle locks so the map doesn't grow unboundedly
            // (mirrors crawlee-python's WeakValueDictionary behaviour).
            if (queue.remaining === 0) {
                this.openerLocks.delete(lockKey);
            }
        }
    }

    /**
     * Remove a storage instance from the cache (called from `storage.drop()`).
     */
    removeFromCache(instance: IStorage): void {
        this.cache.removeFromCache(instance);
    }

    /**
     * Clear the entire cache. Also calls `clearCache()` on any cached KeyValueStore
     * instances (duck-typed to avoid importing KeyValueStore and circular dependencies).
     * Called during service locator reset.
     */
    clearCache(): void {
        for (const instance of this.cache.allValues()) {
            if ('clearCache' in instance && typeof (instance as any).clearCache === 'function') {
                (instance as any).clearCache();
            }
        }

        this.cache.clear();
    }
}

/**
 * A storage identifier where exactly one of `id`, `name`, or `alias` is specified.
 * Produced by {@link resolveStorageIdentifier} from ambiguous user input.
 */
export type ExplicitStorageIdentifier =
    | { id: string; name?: never; alias?: never }
    | { id?: never; name: string; alias?: never }
    | { id?: never; name?: never; alias: string };

/**
 * Represents the case where no identifier was provided — the caller wants the default storage.
 */
export interface DefaultStorageIdentifier {
    id?: never;
    name?: never;
    alias?: never;
}

/**
 * Decompose a user-provided `identifier` (the `Dataset.open()` / `KeyValueStore.open()` /
 * `RequestQueue.open()` argument) into separate `id`, `name`, and `alias` fields that
 * the `StorageInstanceManager` and `StorageClient.create*Client` expect.
 *
 * - `null` / `undefined` / `{}` → default storage alias
 * - `string` → resolved via `storageExists` (ID-first, then name)
 * - `{ id }` → `{ id }`
 * - `{ name }` → `{ name }`
 */
export async function resolveStorageIdentifier(
    identifier: string | StorageIdentifier | null | undefined,
    client: StorageClient,
): Promise<ExplicitStorageIdentifier> {
    if (identifier === null || identifier === undefined) {
        return { alias: DEFAULT_STORAGE_ALIAS };
    }

    if (typeof identifier === 'string') {
        if (client.storageExists && (await client.storageExists(identifier, 'Dataset'))) {
            return { id: identifier };
        }
        return { name: identifier };
    }

    if (identifier.id) {
        return { id: identifier.id };
    }

    if (identifier.name) {
        return { name: identifier.name };
    }

    // Empty object — treated as default storage.
    return { alias: DEFAULT_STORAGE_ALIAS };
}
