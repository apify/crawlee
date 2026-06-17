import { randomUUID } from 'node:crypto';

import type * as storage from '@crawlee/types';
import type { Dictionary } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import type { MemoryStorageClient } from '../index.js';
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

export interface DatasetClientOptions {
    id?: string;
    name?: string;
    /**
     * The key used for cache lookup. When provided, takes precedence over `name` and `id`.
     * This allows alias-opened storages to have a cache key that differs from their
     * metadata `name` (which is `undefined` for unnamed storages).
     */
    cacheKey?: string;
    client: MemoryStorageClient;
}

export class DatasetClient<Data extends Dictionary = Dictionary>
    extends BaseClient
    implements storage.DatasetClient<Data>
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

    private readonly datasetEntries = new Map<string, Data>();
    private readonly client: MemoryStorageClient;

    constructor(options: DatasetClientOptions) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.cacheKey = options.cacheKey ?? this.name ?? this.id;
        this.client = options.client;
    }

    async getMetadata(): Promise<storage.DatasetInfo> {
        this.updateTimestamps(false);
        return this.toDatasetInfo();
    }

    async drop(): Promise<void> {
        const storeIndex = this.client.datasetClientCache.findIndex((store) => store.id === this.id);

        if (storeIndex !== -1) {
            const [oldClient] = this.client.datasetClientCache.splice(storeIndex, 1);
            oldClient.itemCount = 0;
            oldClient.datasetEntries.clear();
        }
    }

    async purge(): Promise<void> {
        this.itemCount = 0;
        this.datasetEntries.clear();

        this.updateTimestamps(true);
    }

    getData(options: storage.DatasetClientListOptions = {}): Promise<storage.PaginatedList<Data>> {
        const { desc, limit, offset } = s
            .object({
                desc: s.boolean().optional(),
                limit: s.number().int().optional(),
                offset: s.number().int().optional(),
            })
            .parse(options);

        return this.getDataPage({
            desc,
            offset: offset ?? 0,
            limit: Math.min(limit ?? LIST_ITEMS_LIMIT, LIST_ITEMS_LIMIT),
        });
    }

    private async getDataPage(options: storage.DatasetClientListOptions = {}): Promise<storage.PaginatedList<Data>> {
        const { limit = LIST_ITEMS_LIMIT, offset = 0, desc } = options;

        const [start, end] = this.getStartAndEndIndexes(
            desc ? Math.max(this.itemCount - offset - limit, 0) : offset,
            limit,
        );

        const items: Data[] = [];

        for (let idx = start; idx < end; idx++) {
            const entryNumber = this.generateLocalEntryName(idx);
            items.push(this.datasetEntries.get(entryNumber)!);
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
            this.datasetEntries.set(idx, entry);
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
