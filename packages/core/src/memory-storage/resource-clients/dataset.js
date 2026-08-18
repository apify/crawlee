import { randomUUID } from 'node:crypto';
import { parseArgument, schemas } from '@crawlee/utils/internal';
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
export class DatasetBackend extends BaseClient {
    name;
    /**
     * The key used for cache lookup. For named storages, this equals the name. For alias (unnamed)
     * storages, this is the alias string. Falls back to id.
     */
    cacheKey;
    createdAt = new Date();
    accessedAt = new Date();
    modifiedAt = new Date();
    itemCount = 0;
    #datasetEntries = new Map();
    // kept as TS-private: storage-backend tests read this field at runtime
    storageBackend;
    constructor(options) {
        super(options.id ?? randomUUID());
        this.name = options.name;
        this.cacheKey = options.cacheKey ?? this.name ?? this.id;
        this.storageBackend = options.storageBackend;
    }
    async getMetadata() {
        this.updateTimestamps(false);
        return this.toDatasetInfo();
    }
    async drop() {
        if (this.storageBackend.evictBackend('Dataset', this.id)) {
            this.itemCount = 0;
            this.#datasetEntries.clear();
        }
    }
    async purge() {
        this.itemCount = 0;
        this.#datasetEntries.clear();
        this.updateTimestamps(true);
    }
    getData(options = {}) {
        const { desc, limit, offset } = parseArgument(options, schemas.datasetListItemsOptions);
        return this.getDataPage({
            desc,
            offset: offset ?? 0,
            limit: Math.min(limit ?? LIST_ITEMS_LIMIT, LIST_ITEMS_LIMIT),
        });
    }
    async getDataPage(options = {}) {
        const { limit = LIST_ITEMS_LIMIT, offset = 0, desc } = options;
        const [start, end] = this.getStartAndEndIndexes(desc ? Math.max(this.itemCount - offset - limit, 0) : offset, limit);
        const items = [];
        for (let idx = start; idx < end; idx++) {
            const entryNumber = this.generateLocalEntryName(idx);
            items.push(this.#datasetEntries.get(entryNumber));
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
    async pushData(items) {
        for (const entry of items) {
            const idx = this.generateLocalEntryName(++this.itemCount);
            this.#datasetEntries.set(idx, JSON.parse(JSON.stringify(entry)));
        }
        this.updateTimestamps(true);
    }
    toDatasetInfo() {
        return {
            id: this.id,
            accessedAt: this.accessedAt,
            createdAt: this.createdAt,
            itemCount: this.itemCount,
            modifiedAt: this.modifiedAt,
            name: this.name,
        };
    }
    generateLocalEntryName(idx) {
        return idx.toString().padStart(LOCAL_ENTRY_NAME_DIGITS, '0');
    }
    getStartAndEndIndexes(offset, limit = this.itemCount) {
        const start = offset + 1;
        const end = Math.min(offset + limit, this.itemCount) + 1;
        return [start, end];
    }
    updateTimestamps(hasBeenModified) {
        this.accessedAt = new Date();
        if (hasBeenModified) {
            this.modifiedAt = new Date();
        }
    }
}
