import { randomUUID } from 'node:crypto';

import type * as storage from '@crawlee/types';
import type { Dictionary } from '@crawlee/types';
import { parseArgument, schemas } from '@crawlee/utils/internal';

import type { MemoryStorageBackend } from '../memory-storage.js';
import { BaseClient } from './common/base-client.js';

/**
 * This is what API returns in the x-apify-pagination-limit
 * header when no limit query parameter is used.
 */
const LIST_ITEMS_LIMIT = 999_999_999_999;

/**
 * Number of characters of the dataset item entry names.
 * E.g.: 000000019 - 9 digits
 */
const LOCAL_ENTRY_NAME_DIGITS = 9;

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

export class DatasetBackend<Data extends Dictionary = Dictionary>
    extends BaseClient
    implements storage.DatasetBackend<Data>
{
    name?: string;
    /**
     * The key used for cache lookup. For named storages, this equals the name. For alias (unnamed)
     * storages, this is the alias string. Falls back to id.
     */
    cacheKey: string;
    createdAt = new Date();
    accessedAt = new Date();
    modifiedAt = new Date();
    itemCount = 0;

    readonly #datasetEntries = new Map<string, Data>();
    // kept as TS-private: storage-backend tests read this field at runtime
    private readonly storageBackend: MemoryStorageBackend;

    constructor(options: DatasetBackendOptions) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.cacheKey = options.cacheKey ?? this.name ?? this.id;
        this.storageBackend = options.storageBackend;
    }

    async getMetadata(): Promise<storage.DatasetInfo> {
        this.updateTimestamps(false);
        return this.toDatasetInfo();
    }

    async drop(): Promise<void> {
        if (this.storageBackend.evictBackend('Dataset', this.id)) {
            this.itemCount = 0;
            this.#datasetEntries.clear();
        }
    }

    async purge(): Promise<void> {
        this.itemCount = 0;
        this.#datasetEntries.clear();

        this.updateTimestamps(true);
    }

    getData(options: storage.DatasetBackendListOptions = {}): Promise<storage.PaginatedList<Data>> {
        const { desc, limit, offset } = parseArgument(options, schemas.datasetListItemsOptions);

        return this.getDataPage({
            desc,
            offset: offset ?? 0,
            limit: Math.min(limit ?? LIST_ITEMS_LIMIT, LIST_ITEMS_LIMIT),
        });
    }

    private async getDataPage(options: storage.DatasetBackendListOptions = {}): Promise<storage.PaginatedList<Data>> {
        const { limit = LIST_ITEMS_LIMIT, offset = 0, desc } = options;

        const [start, end] = this.getStartAndEndIndexes(
            desc ? Math.max(this.itemCount - offset - limit, 0) : offset,
            limit,
        );

        const items: Data[] = [];

        for (let idx = start; idx < end; idx++) {
            const entryNumber = this.generateLocalEntryName(idx);
            items.push(this.#datasetEntries.get(entryNumber)!);
        }

        this.updateTimestamps(false);

        return {
            count: items.length,
            desc: desc ?? false,
            items: desc ? items.reverse() : items,
            limit,
            offset,
            total: this.itemCount,
        };
    }

    async pushData(items: Data[]): Promise<void> {
        for (const entry of items) {
            const idx = this.generateLocalEntryName(++this.itemCount);
            this.#datasetEntries.set(idx, JSON.parse(JSON.stringify(entry)) as Data);
        }

        this.updateTimestamps(true);
    }

    toDatasetInfo(): storage.DatasetInfo {
        return {
            id: this.id,
            accessedAt: this.accessedAt,
            createdAt: this.createdAt,
            itemCount: this.itemCount,
            modifiedAt: this.modifiedAt,
            name: this.name,
        };
    }

    private generateLocalEntryName(idx: number): string {
        return idx.toString().padStart(LOCAL_ENTRY_NAME_DIGITS, '0');
    }

    private getStartAndEndIndexes(offset: number, limit = this.itemCount) {
        const start = offset + 1;
        const end = Math.min(offset + limit, this.itemCount) + 1;
        return [start, end] as const;
    }

    private updateTimestamps(hasBeenModified: boolean) {
        this.accessedAt = new Date();

        if (hasBeenModified) {
            this.modifiedAt = new Date();
        }
    }
}
