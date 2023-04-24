"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyValueStoreClient = void 0;
const tslib_1 = require("tslib");
const shapeshift_1 = require("@sapphire/shapeshift");
const mime_types_1 = tslib_1.__importDefault(require("mime-types"));
const node_crypto_1 = require("node:crypto");
const node_stream_1 = require("node:stream");
const node_path_1 = require("node:path");
const promises_1 = require("node:fs/promises");
const fs_extra_1 = require("fs-extra");
const body_parser_1 = require("../body-parser");
const consts_1 = require("../consts");
const utils_1 = require("../utils");
const base_client_1 = require("./common/base-client");
const instance_1 = require("../workers/instance");
const cache_helpers_1 = require("../cache-helpers");
const key_value_store_1 = require("../fs/key-value-store");
const DEFAULT_LOCAL_FILE_EXTENSION = 'bin';
class KeyValueStoreClient extends base_client_1.BaseClient {
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
        Object.defineProperty(this, "keyValueStoreDirectory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "keyValueEntries", {
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
        this.keyValueStoreDirectory = (0, node_path_1.resolve)(options.baseStorageDirectory, this.name ?? this.id);
        this.client = options.client;
    }
    async get() {
        const found = await (0, cache_helpers_1.findOrCacheKeyValueStoreByPossibleId)(this.client, this.name ?? this.id);
        if (found) {
            found.updateTimestamps(false);
            return found.toKeyValueStoreInfo();
        }
        return undefined;
    }
    async update(newFields = {}) {
        const parsed = shapeshift_1.s.object({
            name: shapeshift_1.s.string.lengthGreaterThan(0).optional,
        }).parse(newFields);
        // Check by id
        const existingStoreById = await (0, cache_helpers_1.findOrCacheKeyValueStoreByPossibleId)(this.client, this.name ?? this.id);
        if (!existingStoreById) {
            this.throwOnNonExisting(consts_1.StorageTypes.KeyValueStore);
        }
        // Skip if no changes
        if (!parsed.name) {
            return existingStoreById.toKeyValueStoreInfo();
        }
        // Check that name is not in use already
        const existingStoreByName = this.client.keyValueStoresHandled.find((store) => store.name?.toLowerCase() === parsed.name.toLowerCase());
        if (existingStoreByName) {
            this.throwOnDuplicateEntry(consts_1.StorageTypes.KeyValueStore, 'name', parsed.name);
        }
        existingStoreById.name = parsed.name;
        const previousDir = existingStoreById.keyValueStoreDirectory;
        existingStoreById.keyValueStoreDirectory = (0, node_path_1.resolve)(this.client.keyValueStoresDirectory, parsed.name ?? existingStoreById.name ?? existingStoreById.id);
        await (0, fs_extra_1.move)(previousDir, existingStoreById.keyValueStoreDirectory, { overwrite: true });
        // Update timestamps
        existingStoreById.updateTimestamps(true);
        return existingStoreById.toKeyValueStoreInfo();
    }
    async delete() {
        const storeIndex = this.client.keyValueStoresHandled.findIndex((store) => store.id === this.id);
        if (storeIndex !== -1) {
            const [oldClient] = this.client.keyValueStoresHandled.splice(storeIndex, 1);
            oldClient.keyValueEntries.clear();
            await (0, promises_1.rm)(oldClient.keyValueStoreDirectory, { recursive: true, force: true });
        }
    }
    async listKeys(options = {}) {
        const { limit = consts_1.DEFAULT_API_PARAM_LIMIT, exclusiveStartKey, } = shapeshift_1.s.object({
            limit: shapeshift_1.s.number.greaterThan(0).optional,
            exclusiveStartKey: shapeshift_1.s.string.optional,
        }).parse(options);
        // Check by id
        const existingStoreById = await (0, cache_helpers_1.findOrCacheKeyValueStoreByPossibleId)(this.client, this.name ?? this.id);
        if (!existingStoreById) {
            this.throwOnNonExisting(consts_1.StorageTypes.KeyValueStore);
        }
        const items = [];
        for (const storageEntry of existingStoreById.keyValueEntries.values()) {
            const record = await storageEntry.get();
            const size = Buffer.byteLength(record.value);
            items.push({
                key: record.key,
                size,
            });
        }
        // Lexically sort to emulate API.
        // TODO(vladfrangu): ensure the sorting works the same way as before (if it matters)
        items.sort((a, b) => {
            return a.key.localeCompare(b.key);
        });
        let truncatedItems = items;
        if (exclusiveStartKey) {
            const keyPos = items.findIndex((item) => item.key === exclusiveStartKey);
            if (keyPos !== -1)
                truncatedItems = items.slice(keyPos + 1);
        }
        const limitedItems = truncatedItems.slice(0, limit);
        const lastItemInStore = items[items.length - 1];
        const lastSelectedItem = limitedItems[limitedItems.length - 1];
        const isLastSelectedItemAbsolutelyLast = lastItemInStore === lastSelectedItem;
        const nextExclusiveStartKey = isLastSelectedItemAbsolutelyLast
            ? undefined
            : lastSelectedItem.key;
        existingStoreById.updateTimestamps(false);
        return {
            count: items.length,
            limit,
            exclusiveStartKey,
            isTruncated: !isLastSelectedItemAbsolutelyLast,
            nextExclusiveStartKey,
            items: limitedItems,
        };
    }
    async getRecord(key, options = {}) {
        shapeshift_1.s.string.parse(key);
        shapeshift_1.s.object({
            buffer: shapeshift_1.s.boolean.optional,
            // These options are ignored, but kept here
            // for validation consistency with API client.
            stream: shapeshift_1.s.boolean.optional,
            disableRedirect: shapeshift_1.s.boolean.optional,
        }).parse(options);
        // Check by id
        const existingStoreById = await (0, cache_helpers_1.findOrCacheKeyValueStoreByPossibleId)(this.client, this.name ?? this.id);
        if (!existingStoreById) {
            this.throwOnNonExisting(consts_1.StorageTypes.KeyValueStore);
        }
        const storageEntry = existingStoreById.keyValueEntries.get(key);
        if (!storageEntry) {
            return undefined;
        }
        const entry = await storageEntry.get();
        const record = {
            key: entry.key,
            value: entry.value,
            contentType: entry.contentType ?? mime_types_1.default.contentType(entry.extension),
        };
        if (options.stream) {
            record.value = node_stream_1.Readable.from(record.value);
        }
        else if (options.buffer) {
            record.value = Buffer.from(record.value);
        }
        else {
            record.value = (0, body_parser_1.maybeParseBody)(record.value, record.contentType);
        }
        existingStoreById.updateTimestamps(false);
        return record;
    }
    async setRecord(record) {
        shapeshift_1.s.object({
            key: shapeshift_1.s.string.lengthGreaterThan(0),
            value: shapeshift_1.s.union(shapeshift_1.s.null, shapeshift_1.s.string, shapeshift_1.s.number, shapeshift_1.s.instance(Buffer), shapeshift_1.s.instance(ArrayBuffer), shapeshift_1.s.typedArray(), 
            // disabling validation will make shapeshift only check the object given is an actual object, not null, nor array
            shapeshift_1.s.object({}).setValidationEnabled(false)),
            contentType: shapeshift_1.s.string.lengthGreaterThan(0).optional,
        }).parse(record);
        // Check by id
        const existingStoreById = await (0, cache_helpers_1.findOrCacheKeyValueStoreByPossibleId)(this.client, this.name ?? this.id);
        if (!existingStoreById) {
            this.throwOnNonExisting(consts_1.StorageTypes.KeyValueStore);
        }
        const { key } = record;
        let { value, contentType } = record;
        const valueIsStream = (0, utils_1.isStream)(value);
        const isValueStreamOrBuffer = valueIsStream || (0, utils_1.isBuffer)(value);
        // To allow saving Objects to JSON without providing content type
        if (!contentType) {
            if (isValueStreamOrBuffer)
                contentType = 'application/octet-stream';
            else if (typeof value === 'string')
                contentType = 'text/plain; charset=utf-8';
            else
                contentType = 'application/json; charset=utf-8';
        }
        const extension = mime_types_1.default.extension(contentType) || DEFAULT_LOCAL_FILE_EXTENSION;
        const isContentTypeJson = extension === 'json';
        if (isContentTypeJson && !isValueStreamOrBuffer && typeof value !== 'string') {
            try {
                value = JSON.stringify(value, null, 2);
            }
            catch (err) {
                const msg = `The record value cannot be stringified to JSON. Please provide other content type.\nCause: ${err.message}`;
                throw new Error(msg);
            }
        }
        if (valueIsStream) {
            const chunks = [];
            for await (const chunk of value) {
                chunks.push(chunk);
            }
            value = Buffer.concat(chunks);
        }
        const _record = {
            extension,
            key,
            value,
            contentType,
        };
        const entry = (0, key_value_store_1.createKeyValueStorageImplementation)({
            persistStorage: this.client.persistStorage,
            storeDirectory: existingStoreById.keyValueStoreDirectory,
            writeMetadata: existingStoreById.client.writeMetadata,
        });
        await entry.update(_record);
        existingStoreById.keyValueEntries.set(key, entry);
        existingStoreById.updateTimestamps(true);
    }
    async deleteRecord(key) {
        shapeshift_1.s.string.parse(key);
        // Check by id
        const existingStoreById = await (0, cache_helpers_1.findOrCacheKeyValueStoreByPossibleId)(this.client, this.name ?? this.id);
        if (!existingStoreById) {
            this.throwOnNonExisting(consts_1.StorageTypes.KeyValueStore);
        }
        const entry = existingStoreById.keyValueEntries.get(key);
        if (entry) {
            existingStoreById.keyValueEntries.delete(key);
            existingStoreById.updateTimestamps(true);
            await entry.delete();
        }
    }
    toKeyValueStoreInfo() {
        return {
            id: this.id,
            name: this.name,
            accessedAt: this.accessedAt,
            createdAt: this.createdAt,
            modifiedAt: this.modifiedAt,
            userId: '1',
        };
    }
    updateTimestamps(hasBeenModified) {
        this.accessedAt = new Date();
        if (hasBeenModified) {
            this.modifiedAt = new Date();
        }
        const data = this.toKeyValueStoreInfo();
        (0, instance_1.sendWorkerMessage)({
            action: 'update-metadata',
            data,
            entityType: 'keyValueStores',
            entityDirectory: this.keyValueStoreDirectory,
            id: this.name ?? this.id,
            writeMetadata: this.client.writeMetadata,
            persistStorage: this.client.persistStorage,
        });
    }
}
exports.KeyValueStoreClient = KeyValueStoreClient;
//# sourceMappingURL=key-value-store.js.map