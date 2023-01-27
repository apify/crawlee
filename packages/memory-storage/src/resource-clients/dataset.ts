/* eslint-disable import/no-duplicates */
import type * as storage from '@crawlee/types';
import type { Dictionary } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { move } from 'fs-extra';
import type { MemoryStorage } from '../index';
import { StorageTypes } from '../consts';
import { BaseClient } from './common/base-client';
import { sendWorkerMessage } from '../workers/instance';
import { findOrCacheDatasetByPossibleId } from '../cache-helpers';
import type { StorageImplementation } from '../fs/common';
import { createDatasetStorageImplementation } from '../fs/dataset';

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

export class DatasetClient<Data extends Dictionary = Dictionary> extends BaseClient implements storage.DatasetClient<Data> {
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

    async get(): Promise<storage.DatasetInfo | undefined> {
        const found = await findOrCacheDatasetByPossibleId(this.client, this.name ?? this.id);

        if (found) {
            found.updateTimestamps(false);
            return found.toDatasetInfo();
        }

        return undefined;
    }

    async update(newFields: storage.DatasetClientUpdateOptions = {}): Promise<storage.DatasetInfo> {
        const parsed = s.object({
            name: s.string.lengthGreaterThan(0).optional,
        }).parse(newFields);

        // Check by id
        const existingStoreById = await findOrCacheDatasetByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.Dataset);
        }

        // Skip if no changes
        if (!parsed.name) {
            return existingStoreById.toDatasetInfo();
        }

        // Check that name is not in use already
        const existingStoreByName = this.client.datasetClientsHandled.find((store) => store.name?.toLowerCase() === parsed.name!.toLowerCase());

        if (existingStoreByName) {
            this.throwOnDuplicateEntry(StorageTypes.Dataset, 'name', parsed.name);
        }

        existingStoreById.name = parsed.name;

        const previousDir = existingStoreById.datasetDirectory;

        existingStoreById.datasetDirectory = resolve(this.client.datasetsDirectory, parsed.name ?? existingStoreById.name ?? existingStoreById.id);

        await move(previousDir, existingStoreById.datasetDirectory, { overwrite: true });

        // Update timestamps
        existingStoreById.updateTimestamps(true);

        return existingStoreById.toDatasetInfo();
    }

    async delete(): Promise<void> {
        const storeIndex = this.client.datasetClientsHandled.findIndex((store) => store.id === this.id);

        if (storeIndex !== -1) {
            const [oldClient] = this.client.datasetClientsHandled.splice(storeIndex, 1);
            oldClient.itemCount = 0;
            oldClient.datasetEntries.clear();

            await rm(oldClient.datasetDirectory, { recursive: true, force: true });
        }
    }

    async downloadItems(): Promise<Buffer> {
        throw new Error('This method is not implemented in @crawlee/memory-storage');
    }

    async listItems(options: storage.DatasetClientListOptions = {}): Promise<storage.PaginatedList<Data>> {
        const {
            limit = LIST_ITEMS_LIMIT,
            offset = 0,
            desc,
        } = s.object({
            desc: s.boolean.optional,
            limit: s.number.int.optional,
            offset: s.number.int.optional,
        }).parse(options);

        // Check by id
        const existingStoreById = await findOrCacheDatasetByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.Dataset);
        }

        const [start, end] = existingStoreById.getStartAndEndIndexes(
            desc ? Math.max(existingStoreById.itemCount - offset - limit, 0) : offset,
            limit,
        );

        const items: Data[] = [];

        for (let idx = start; idx < end; idx++) {
            const entryNumber = this.generateLocalEntryName(idx);
            items.push(await existingStoreById.datasetEntries.get(entryNumber)!.get());
        }

        existingStoreById.updateTimestamps(false);

        return {
            count: items.length,
            desc: desc ?? false,
            items: desc ? items.reverse() : items,
            limit,
            offset,
            total: existingStoreById.itemCount,
        };
    }

    async pushItems(items: string | Data | string[] | Data[]): Promise<void> {
        const rawItems = s.union(
            s.string,
            s.object<Data>({} as Data).passthrough,
            s.array(s.union(s.string, s.object<Data>({} as Data).passthrough)),
        ).parse(items) as Data[];

        // Check by id
        const existingStoreById = await findOrCacheDatasetByPossibleId(this.client, this.name ?? this.id);

        if (!existingStoreById) {
            this.throwOnNonExisting(StorageTypes.Dataset);
        }

        const normalized = this.normalizeItems(rawItems);

        const addedIds: string[] = [];

        for (const entry of normalized) {
            const idx = this.generateLocalEntryName(++existingStoreById.itemCount);
            const storageEntry = createDatasetStorageImplementation({
                entityId: idx,
                persistStorage: this.client.persistStorage,
                storeDirectory: existingStoreById.datasetDirectory,
            });

            await storageEntry.update(entry);

            existingStoreById.datasetEntries.set(idx, storageEntry);
            addedIds.push(idx);
        }

        existingStoreById.updateTimestamps(true);
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

    /**
     * To emulate API and split arrays of items into individual dataset items,
     * we need to normalize the input items - which can be strings, objects
     * or arrays of those - into objects, so that we can save them one by one
     * later. We could potentially do this directly with strings, but let's
     * not optimize prematurely.
     */
    private normalizeItems(items: string | Data | (string | Data)[]): Data[] {
        if (typeof items === 'string') {
            items = JSON.parse(items);
        }

        return Array.isArray(items)
            ? items.map((item) => this.normalizeItem(item))
            : [this.normalizeItem(items)];
    }

    private normalizeItem(item: string | Data): Data {
        if (typeof item === 'string') {
            item = JSON.parse(item) as Data;
        }

        if (Array.isArray(item)) {
            throw new Error(`Each dataset item can only be a single JSON object, not an array. Received: [${item.join(',\n')}]`);
        }

        if (typeof item !== 'object' || item === null) {
            throw new Error(`Each dataset item must be a JSON object. Received: ${item}`);
        }

        return item;
    }

    private updateTimestamps(hasBeenModified: boolean) {
        this.accessedAt = new Date();

        if (hasBeenModified) {
            this.modifiedAt = new Date();
        }

        const data = this.toDatasetInfo();
        sendWorkerMessage({
            action: 'update-metadata',
            data,
            entityType: 'datasets',
            entityDirectory: this.datasetDirectory,
            id: this.name ?? this.id,
            writeMetadata: this.client.writeMetadata,
            persistStorage: this.client.persistStorage,
        });
    }
}
