import type { Constructor, DatasetBackend, KeyValueStoreBackend, RequestQueueBackend, StorageBackend, StorageIdentifier } from '@crawlee/types';
export type { StorageIdentifier } from '@crawlee/types';
/**
 * Matches an `IStorage` – a storage "frontend" (Dataset, KeyValueStore, RequestQueue).
 */
export interface IStorage {
    id: string;
    name?: string;
}
type Hashable = string;
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
export declare class StorageInstanceManager {
    #private;
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
    openStorage<TStorage extends IStorage>(cls: Constructor<TStorage>, { id, name, alias, backendOpener, backendCacheKey, }: (ExplicitStorageIdentifier | DefaultStorageIdentifier) & {
        backendOpener: () => Promise<DatasetBackend | KeyValueStoreBackend | RequestQueueBackend>;
        backendCacheKey: Hashable;
    }): Promise<TStorage>;
    /**
     * Remove a storage instance from the cache (called from `storage.drop()`).
     */
    removeFromCache(instance: IStorage): void;
    /**
     * Clear the entire cache. Also calls `clearCache()` on any cached KeyValueStore
     * instances (duck-typed to avoid importing KeyValueStore and circular dependencies).
     * Called during service locator reset.
     */
    clearCache(): void;
}
/**
 * A storage identifier where exactly one of `id`, `name`, or `alias` is specified.
 * Produced by {@link resolveStorageIdentifier} from ambiguous user input.
 */
export type ExplicitStorageIdentifier = {
    id: string;
    name?: never;
    alias?: never;
} | {
    id?: never;
    name: string;
    alias?: never;
} | {
    id?: never;
    name?: never;
    alias: string;
};
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
 * the `StorageInstanceManager` and `StorageBackend.create*Client` expect.
 *
 * - `null` / `undefined` / `{}` → default storage alias
 * - `string` → resolved via `storageExists` (ID-first, then name)
 * - `{ id }` → `{ id }`
 * - `{ name }` → `{ name }`
 * - `{ alias }` → `{ alias }`
 */
export declare function resolveStorageIdentifier(identifier: string | StorageIdentifier | null | undefined, storageBackend: StorageBackend, storageType: 'Dataset' | 'KeyValueStore' | 'RequestQueue'): Promise<ExplicitStorageIdentifier>;
