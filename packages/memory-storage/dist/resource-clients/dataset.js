"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatasetClient = void 0;
const shapeshift_1 = require("@sapphire/shapeshift");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const fs_extra_1 = require("fs-extra");
const consts_1 = require("../consts");
const base_client_1 = require("./common/base-client");
const instance_1 = require("../workers/instance");
const cache_helpers_1 = require("../cache-helpers");
const dataset_1 = require("../fs/dataset");
/**
 * This is what API returns in the x-apify-pagination-limit
 * header when no limit query parameter is used.
 */
const LIST_ITEMS_LIMIT = 999999999999;
/**
 * Number of characters of the dataset item file names.
 * E.g.: 000000019.json - 9 digits
 */
const LOCAL_ENTRY_NAME_DIGITS = 9;
class DatasetClient extends base_client_1.BaseClient {
    constructor(options) {
        super(options.id ?? (0, node_crypto_1.randomUUID)());
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "createdAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Date()
        });
        Object.defineProperty(this, "accessedAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Date()
        });
        Object.defineProperty(this, "modifiedAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Date()
        });
        Object.defineProperty(this, "itemCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "datasetDirectory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "datasetEntries", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "client", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.name = options.name;
        this.datasetDirectory = (0, node_path_1.resolve)(options.baseStorageDirectory, this.name ?? this.id);
        this.client = options.client;
    }
    async get() {
        const found = await (0, cache_helpers_1.findOrCacheDatasetByPossibleId)(this.client, this.name ?? this.id);
        if (found) {
            found.updateTimestamps(false);
            return found.toDatasetInfo();
        }
        return undefined;
    }
    async update(newFields = {}) {
        const parsed = shapeshift_1.s.object({
            name: shapeshift_1.s.string.lengthGreaterThan(0).optional,
        }).parse(newFields);
        // Check by id
        const existingStoreById = await (0, cache_helpers_1.findOrCacheDatasetByPossibleId)(this.client, this.name ?? this.id);
        if (!existingStoreById) {
            this.throwOnNonExisting(consts_1.StorageTypes.Dataset);
        }
        // Skip if no changes
        if (!parsed.name) {
            return existingStoreById.toDatasetInfo();
        }
        // Check that name is not in use already
        const existingStoreByName = this.client.datasetClientsHandled.find((store) => store.name?.toLowerCase() === parsed.name.toLowerCase());
        if (existingStoreByName) {
            this.throwOnDuplicateEntry(consts_1.StorageTypes.Dataset, 'name', parsed.name);
        }
        existingStoreById.name = parsed.name;
        const previousDir = existingStoreById.datasetDirectory;
        existingStoreById.datasetDirectory = (0, node_path_1.resolve)(this.client.datasetsDirectory, parsed.name ?? existingStoreById.name ?? existingStoreById.id);
        await (0, fs_extra_1.move)(previousDir, existingStoreById.datasetDirectory, { overwrite: true });
        // Update timestamps
        existingStoreById.updateTimestamps(true);
        return existingStoreById.toDatasetInfo();
    }
    async delete() {
        const storeIndex = this.client.datasetClientsHandled.findIndex((store) => store.id === this.id);
        if (storeIndex !== -1) {
            const [oldClient] = this.client.datasetClientsHandled.splice(storeIndex, 1);
            oldClient.itemCount = 0;
            oldClient.datasetEntries.clear();
            await (0, promises_1.rm)(oldClient.datasetDirectory, { recursive: true, force: true });
        }
    }
    async downloadItems() {
        throw new Error('This method is not implemented in @crawlee/memory-storage');
    }
    async listItems(options = {}) {
        const { limit = LIST_ITEMS_LIMIT, offset = 0, desc, } = shapeshift_1.s.object({
            desc: shapeshift_1.s.boolean.optional,
            limit: shapeshift_1.s.number.int.optional,
            offset: shapeshift_1.s.number.int.optional,
        }).parse(options);
        // Check by id
        const existingStoreById = await (0, cache_helpers_1.findOrCacheDatasetByPossibleId)(this.client, this.name ?? this.id);
        if (!existingStoreById) {
            this.throwOnNonExisting(consts_1.StorageTypes.Dataset);
        }
        const [start, end] = existingStoreById.getStartAndEndIndexes(desc ? Math.max(existingStoreById.itemCount - offset - limit, 0) : offset, limit);
        const items = [];
        for (let idx = start; idx < end; idx++) {
            const entryNumber = this.generateLocalEntryName(idx);
            items.push(await existingStoreById.datasetEntries.get(entryNumber).get());
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
    async pushItems(items) {
        const rawItems = shapeshift_1.s.union(shapeshift_1.s.string, shapeshift_1.s.object({}).passthrough, shapeshift_1.s.array(shapeshift_1.s.union(shapeshift_1.s.string, shapeshift_1.s.object({}).passthrough))).parse(items);
        // Check by id
        const existingStoreById = await (0, cache_helpers_1.findOrCacheDatasetByPossibleId)(this.client, this.name ?? this.id);
        if (!existingStoreById) {
            this.throwOnNonExisting(consts_1.StorageTypes.Dataset);
        }
        const normalized = this.normalizeItems(rawItems);
        const addedIds = [];
        for (const entry of normalized) {
            const idx = this.generateLocalEntryName(++existingStoreById.itemCount);
            const storageEntry = (0, dataset_1.createDatasetStorageImplementation)({
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
    /**
     * To emulate API and split arrays of items into individual dataset items,
     * we need to normalize the input items - which can be strings, objects
     * or arrays of those - into objects, so that we can save them one by one
     * later. We could potentially do this directly with strings, but let's
     * not optimize prematurely.
     */
    normalizeItems(items) {
        if (typeof items === 'string') {
            items = JSON.parse(items);
        }
        return Array.isArray(items)
            ? items.map((item) => this.normalizeItem(item))
            : [this.normalizeItem(items)];
    }
    normalizeItem(item) {
        if (typeof item === 'string') {
            item = JSON.parse(item);
        }
        if (Array.isArray(item)) {
            throw new Error(`Each dataset item can only be a single JSON object, not an array. Received: [${item.join(',\n')}]`);
        }
        if (typeof item !== 'object' || item === null) {
            throw new Error(`Each dataset item must be a JSON object. Received: ${item}`);
        }
        return item;
    }
    updateTimestamps(hasBeenModified) {
        this.accessedAt = new Date();
        if (hasBeenModified) {
            this.modifiedAt = new Date();
        }
        const data = this.toDatasetInfo();
        (0, instance_1.sendWorkerMessage)({
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
exports.DatasetClient = DatasetClient;
//# sourceMappingURL=dataset.js.map