/* eslint-disable import/no-duplicates */
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import type * as storage from '@crawlee/types';
import type { Dictionary } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import { scheduleBackgroundTask } from '../background-handler/index.js';
import type { StorageImplementation } from '../fs/common.js';
import { createDatasetStorageImplementation } from '../fs/dataset/index.js';
import type { MemoryStorage } from '../index.js';
import { BaseClient } from './common/base-client.js';

/**
 * This is what API returns in the x-apify-pagination-limit
 * header when no limit query parameter is used.
 */
const LIST_ITEMS_LIMIT = 999_999_999_999;

/**
 * Number of characters of the dataset item file names.
 * E.g.: 000000019.json - 9 digits
 */
const LOCAL_ENTRY_NAME_DIGITS = 9;

export interface DatasetClientOptions {
    id?: string;
    name?: string;
    baseStorageDirectory: string;
    client: MemoryStorage;
}

export class DatasetClient<Data extends Dictionary = Dictionary>
    extends BaseClient
    implements storage.DatasetClient<Data>
{
    name?: string;
    createdAt = new Date();
    accessedAt = new Date();
    modifiedAt = new Date();
    itemCount = 0;
    datasetDirectory: string;

    private readonly datasetEntries = new Map<string, StorageImplementation<Data>>();
    private readonly client: MemoryStorage;

    constructor(options: DatasetClientOptions) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.datasetDirectory = resolve(options.baseStorageDirectory, this.name ?? this.id);
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

            await rm(oldClient.datasetDirectory, { recursive: true, force: true });
        }
    }

    async purge(): Promise<void> {
        this.itemCount = 0;
        this.datasetEntries.clear();

        // Remove item files from disk but keep the directory
        if (this.client.persistStorage) {
            const { readdir } = await import('node:fs/promises');
            const entries = await readdir(this.datasetDirectory).catch(() => []);
            for (const entry of entries) {
                if (entry !== '__metadata__.json') {
                    await rm(resolve(this.datasetDirectory, entry), { force: true });
                }
            }
        }

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
            items.push(await this.datasetEntries.get(entryNumber)!.get());
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
            const storageEntry = createDatasetStorageImplementation({
                entityId: idx,
                persistStorage: this.client.persistStorage,
                storeDirectory: this.datasetDirectory,
            });

            await storageEntry.update(entry);

            this.datasetEntries.set(idx, storageEntry);
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

        const data = this.toDatasetInfo();
        scheduleBackgroundTask(
            {
                action: 'update-metadata',
                data,
                entityType: 'datasets',
                entityDirectory: this.datasetDirectory,
                id: this.name ?? this.id,
                writeMetadata: this.client.writeMetadata,
                persistStorage: this.client.persistStorage,
            },
            this.client.logger,
        );
    }
}
