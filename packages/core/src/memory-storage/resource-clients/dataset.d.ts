import type * as storage from '@crawlee/types';
import type { Dictionary } from '@crawlee/types';
import type { MemoryStorageBackend } from '../memory-storage.js';
import { BaseClient } from './common/base-client.js';
export interface DatasetBackendOptions {
    id?: string;
    name?: string;
    /**
     * The key used for cache lookup. When provided, takes precedence over `name` and `id`.
     * This allows alias-opened storages to have a cache key that differs from their
     * metadata `name` (which is `undefined` for unnamed storages).
     */
    cacheKey?: string;
    storageBackend: MemoryStorageBackend;
}
export declare class DatasetBackend<Data extends Dictionary = Dictionary> extends BaseClient implements storage.DatasetBackend<Data> {
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
    itemCount: number;
    private readonly storageBackend;
    constructor(options: DatasetBackendOptions);
    getMetadata(): Promise<storage.DatasetInfo>;
    drop(): Promise<void>;
    purge(): Promise<void>;
    getData(options?: storage.DatasetBackendListOptions): Promise<storage.PaginatedList<Data>>;
    private getDataPage;
    pushData(items: Data[]): Promise<void>;
    toDatasetInfo(): storage.DatasetInfo;
    private generateLocalEntryName;
    private getStartAndEndIndexes;
    private updateTimestamps;
}
