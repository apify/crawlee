"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyValueStoreCollectionClient = void 0;
const shapeshift_1 = require("@sapphire/shapeshift");
const node_path_1 = require("node:path");
const cache_helpers_1 = require("../cache-helpers");
const instance_1 = require("../workers/instance");
const key_value_store_1 = require("./key-value-store");
class KeyValueStoreCollectionClient {
    constructor({ baseStorageDirectory, client }) {
        Object.defineProperty(this, "keyValueStoresDirectory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "client", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.keyValueStoresDirectory = (0, node_path_1.resolve)(baseStorageDirectory);
        this.client = client;
    }
    async list() {
        return {
            total: this.client.keyValueStoresHandled.length,
            count: this.client.keyValueStoresHandled.length,
            offset: 0,
            limit: this.client.keyValueStoresHandled.length,
            desc: false,
            items: this.client.keyValueStoresHandled.map((store) => store.toKeyValueStoreInfo())
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
    }
    async getOrCreate(name) {
        shapeshift_1.s.string.optional.parse(name);
        if (name) {
            const found = await (0, cache_helpers_1.findOrCacheKeyValueStoreByPossibleId)(this.client, name);
            if (found) {
                return found.toKeyValueStoreInfo();
            }
        }
        const newStore = new key_value_store_1.KeyValueStoreClient({ name, baseStorageDirectory: this.keyValueStoresDirectory, client: this.client });
        this.client.keyValueStoresHandled.push(newStore);
        // Schedule the worker to write to the disk
        const kvStoreInfo = newStore.toKeyValueStoreInfo();
        // eslint-disable-next-line dot-notation
        (0, instance_1.sendWorkerMessage)({
            action: 'update-metadata',
            entityType: 'keyValueStores',
            entityDirectory: newStore.keyValueStoreDirectory,
            id: kvStoreInfo.name ?? kvStoreInfo.id,
            data: kvStoreInfo,
            writeMetadata: this.client.writeMetadata,
            persistStorage: this.client.persistStorage,
        });
        return kvStoreInfo;
    }
}
exports.KeyValueStoreCollectionClient = KeyValueStoreCollectionClient;
//# sourceMappingURL=key-value-store-collection.js.map