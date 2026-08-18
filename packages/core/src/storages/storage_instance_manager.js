import { AsyncQueue } from '@sapphire/async-queue';
/** Reserved alias for the default (unnamed) storage. */
const DEFAULT_STORAGE_ALIAS = '__default__';
/**
 * Three-tier cache for storage instances, modelled after crawlee-python's `_StorageCache`.
 *
 * Each tier maps `[storageClass][key][backendCacheKey] → instance`:
 *   - `byId`    — keyed by the backend-assigned storage id
 *   - `byName`  — keyed by the persistent storage name
 *   - `byAlias` — keyed by a run-scoped alias (e.g. `'__default__'` for unnamed storages)
 */
class StorageCache {
    byId = new Map();
    byName = new Map();
    byAlias = new Map();
    get(cls, { id, name, alias, backendCacheKey, }) {
        for (const [tier, key] of [
            [this.byId, id],
            [this.byName, name],
            [this.byAlias, alias],
        ]) {
            if (key === undefined)
                continue;
            const cached = tier.get(cls)?.get(key)?.get(backendCacheKey);
            if (cached) {
                if (cached instanceof cls) {
                    return cached;
                }
                throw new Error('Cached storage instance type mismatch.');
            }
        }
        return undefined;
    }
    /** Write a single entry into a given tier. */
    setInMap(tier, cls, key, instance, backendCacheKey) {
        if (!tier.has(cls))
            tier.set(cls, new Map());
        const keyMap = tier.get(cls);
        if (!keyMap.has(key))
            keyMap.set(key, new Map());
        keyMap.get(key).set(backendCacheKey, instance);
    }
    /**
     * Cache an instance under its actual id, name, and an optional alias.
     */
    set(cls, instance, backendCacheKey, alias) {
        // Always cache by id.
        this.setInMap(this.byId, cls, instance.id, instance, backendCacheKey);
        // Cache by name — only for named storages.
        if (instance.name) {
            this.setInMap(this.byName, cls, instance.name, instance, backendCacheKey);
        }
        // Cache by alias — only for unnamed storages opened via alias.
        if (alias !== undefined) {
            this.setInMap(this.byAlias, cls, alias, instance, backendCacheKey);
        }
    }
    removeFromCache(instance) {
        const storageType = instance.constructor;
        for (const tier of [this.byId, this.byName, this.byAlias]) {
            const classMap = tier.get(storageType);
            if (!classMap)
                continue;
            for (const keyMap of classMap.values()) {
                for (const [cacheKey, cached] of keyMap) {
                    if (cached === instance) {
                        keyMap.delete(cacheKey);
                    }
                }
            }
        }
    }
    /**
     * Ensure that the same string is not used as both a name and an alias for the same
     * storage class + backend combination. Mirrors crawlee-python's `_check_name_alias_conflict`.
     */
    checkNameAliasConflict(cls, { name, alias, backendCacheKey }) {
        if (alias) {
            const existingByName = this.byName.get(cls)?.get(alias)?.get(backendCacheKey);
            if (existingByName) {
                throw new Error(`Cannot open storage with alias "${alias}" because a named storage with the same identifier already exists.`);
            }
        }
        if (name) {
            const existingByAlias = this.byAlias.get(cls)?.get(name)?.get(backendCacheKey);
            if (existingByAlias) {
                throw new Error(`Cannot open storage with name "${name}" because an alias storage with the same identifier already exists.` +
                    ` If you meant to open the alias storage, use { alias: "${name}" } instead.`);
            }
        }
    }
    /** Iterate all cached instances across all storage types. */
    *allValues() {
        const seen = new Set();
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
    clear() {
        this.byId.clear();
        this.byName.clear();
        this.byAlias.clear();
    }
}
/**
 * Unified manager for opening and caching storage instances (Dataset, KeyValueStore, RequestQueue).
 *
 * A single instance manages all storage types. Instances are cached by
 * `(storageClass, id/name/alias, backendCacheKey)` so the same storage is never opened twice.
 *
 * The manager itself does not resolve identifiers — callers pass explicit `id`, `name`, or `alias` (at most one),
 * and a pre-bound `backendOpener` promise. When none of `id`, `name`, `alias` are provided, the manager automatically
 * assigns a reserved default alias.
 */
export class StorageInstanceManager {
    #cache = new StorageCache();
    #openerLocks = new Map();
    /**
     * Open (or retrieve from cache) a storage instance.
     *
     * @param cls               The storage class constructor (e.g. `Dataset`, `KeyValueStore`, `RequestQueue`).
     * @param id                Storage ID (mutually exclusive with `name` and `alias`).
     * @param name              Storage name (mutually exclusive with `id` and `alias`).
     * @param alias             Run-scoped alias (mutually exclusive with `id` and `name`).
     *                          Automatically assigned when no identifier is provided.
     * @param backendOpener      A **lazy** factory that creates the sub-backend.
     *                          Only called on a cache miss.
     * @param backendCacheKey    Opaque key identifying the storage backend, so that the same logical
     *                          storage opened through different clients is cached separately.
     */
    async openStorage(cls, { id, name, alias, backendOpener, backendCacheKey, }) {
        // Auto-set alias='__default__' when no parameters are specified (mirrors crawlee-python).
        if (!id && !name && !alias) {
            alias = DEFAULT_STORAGE_ALIAS;
        }
        // Fast-path cache check (no lock).
        if (alias !== undefined) {
            const cached = this.#cache.get(cls, { alias, backendCacheKey });
            if (cached)
                return cached;
        }
        else if (id) {
            const cached = this.#cache.get(cls, { id, backendCacheKey });
            if (cached)
                return cached;
        }
        else if (name) {
            const cached = this.#cache.get(cls, { name, backendCacheKey });
            if (cached)
                return cached;
        }
        const identifierKey = id ?? name ?? alias ?? DEFAULT_STORAGE_ALIAS;
        const lockKey = `${cls.name}:${identifierKey}:${backendCacheKey}`;
        if (!this.#openerLocks.has(lockKey)) {
            this.#openerLocks.set(lockKey, new AsyncQueue());
        }
        const queue = this.#openerLocks.get(lockKey);
        await queue.wait();
        try {
            // Double-check cache under lock (another caller may have filled it while we waited).
            if (alias !== undefined) {
                const cached = this.#cache.get(cls, { alias, backendCacheKey });
                if (cached)
                    return cached;
            }
            else if (id) {
                const cached = this.#cache.get(cls, { id, backendCacheKey });
                if (cached)
                    return cached;
            }
            else if (name) {
                const cached = this.#cache.get(cls, { name, backendCacheKey });
                if (cached)
                    return cached;
            }
            // Prevent the same string from being used as both a name and an alias.
            this.#cache.checkNameAliasConflict(cls, { name, alias, backendCacheKey });
            // Cache miss — create the sub-backend and storage instance.
            const subBackend = await backendOpener();
            const storageInfo = await subBackend.getMetadata();
            // Storage frontends are thin wrappers over the backend. We hand them the resolved metadata
            // we just fetched (so `id`/`name` etc. are available synchronously) along with the backend.
            const instance = new cls({ metadata: storageInfo, backend: subBackend });
            // Atomic cache writes (no awaits between these).
            this.#cache.set(cls, instance, backendCacheKey, alias);
            return instance;
        }
        finally {
            queue.shift();
            // Clean up idle locks so the map doesn't grow unboundedly
            // (mirrors crawlee-python's WeakValueDictionary behaviour).
            if (queue.remaining === 0) {
                this.#openerLocks.delete(lockKey);
            }
        }
    }
    /**
     * Remove a storage instance from the cache (called from `storage.drop()`).
     */
    removeFromCache(instance) {
        this.#cache.removeFromCache(instance);
    }
    /**
     * Clear the entire cache. Also calls `clearCache()` on any cached KeyValueStore
     * instances (duck-typed to avoid importing KeyValueStore and circular dependencies).
     * Called during service locator reset.
     */
    clearCache() {
        for (const instance of this.#cache.allValues()) {
            if ('clearCache' in instance && typeof instance.clearCache === 'function') {
                instance.clearCache();
            }
        }
        this.#cache.clear();
    }
}
/**
 * Decompose a user-provided `identifier` (the `Dataset.open()` / `KeyValueStore.open()` /
 * `RequestQueue.open()` argument) into separate `id`, `name`, and `alias` fields that
 * the `StorageInstanceManager` and `StorageBackend.create*Client` expect.
 *
 * - `null` / `undefined` / `{}` → default storage alias
 * - `string` → resolved via `storageExists` (ID-first, then name)
 * - `{ id }` → `{ id }`
 * - `{ name }` → `{ name }`
 * - `{ alias }` → `{ alias }`
 */
export async function resolveStorageIdentifier(identifier, storageBackend, storageType) {
    if (identifier === null || identifier === undefined) {
        return { alias: DEFAULT_STORAGE_ALIAS };
    }
    if (typeof identifier === 'string') {
        if (storageBackend.storageExists && (await storageBackend.storageExists(identifier, storageType))) {
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
    if ('alias' in identifier && identifier.alias) {
        return { alias: identifier.alias };
    }
    // Empty object — treated as default storage.
    return { alias: DEFAULT_STORAGE_ALIAS };
}
