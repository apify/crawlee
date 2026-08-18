import type * as storage from '@crawlee/types';
import type { MemoryStorageBackend } from '../memory-storage.js';
import { BaseClient } from './common/base-client.js';
export interface KeyValueStoreBackendOptions {
    name?: string;
    id?: string;
    /**
     * The key used for cache lookup. When provided, takes precedence over `name` and `id`.
     * This allows alias-opened storages to have a cache key that differs from their
     * metadata `name` (which is `undefined` for unnamed storages).
     */
    cacheKey?: string;
    storageBackend: MemoryStorageBackend;
}
export interface InternalKeyRecord {
    key: string;
    value: Buffer;
    contentType?: string;
    extension: string;
}
export declare class KeyValueStoreBackend extends BaseClient implements storage.KeyValueStoreBackend {
    #private;
    name?: string;
    /**
     * The key used for cache lookup. For named storages, this equals the name. For alias (unnamed)
     * storages, this is the alias string. Falls back to id.
     */
    cacheKey: string;
    createdAt: Date;
    accessedAt: Date;
    modifiedAt: Date;
    private readonly storageBackend;
    constructor(options: KeyValueStoreBackendOptions);
    getMetadata(): Promise<storage.KeyValueStoreInfo>;
    drop(): Promise<void>;
    purge(): Promise<void>;
    /**
     * Purges every record except the run's input. Used by {@link MemoryStorageBackend.purge} for the
     * default key-value store, mirroring `FileSystemStorageBackend`, which preserves `INPUT` (and its
     * extension variants) when purging the default store. The in-memory key has no extension, so we
     * preserve the bare `INPUT` key only.
     */
    purgeExceptInput(): Promise<void>;
    listKeys(options?: storage.KeyValueStoreListKeysOptions): Promise<storage.KeyValueStoreListKeysResult>;
    /**
     * In-memory records are not file-backed, so there is no public file URL to return.
     * Always resolves to `undefined`.
     * @param key The key of the record to generate the public URL for.
     */
    getPublicUrl(key: string): Promise<string | undefined>;
    /**
     * Tests whether a record with the given key exists in the key-value store without retrieving its value.
     *
     * @param key The queried record key.
     * @returns `true` if the record exists, `false` if it does not.
     */
    recordExists(key: string): Promise<boolean>;
    getValue(key: string): Promise<storage.KeyValueStoreRecord | undefined>;
    setValue(record: storage.KeyValueStoreInputRecord): Promise<void>;
    deleteValue(key: string): Promise<void>;
    toKeyValueStoreInfo(): storage.KeyValueStoreInfo;
    private updateTimestamps;
}
