"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageManager = void 0;
const async_queue_1 = require("@sapphire/async-queue");
const configuration_1 = require("../configuration");
const DEFAULT_ID_CONFIG_KEYS = {
    Dataset: 'defaultDatasetId',
    KeyValueStore: 'defaultKeyValueStoreId',
    RequestQueue: 'defaultRequestQueueId',
};
/**
 * StorageManager takes care of opening remote or local storages.
 * @ignore
 */
class StorageManager {
    constructor(StorageConstructor, config = configuration_1.Configuration.getGlobalConfig()) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "StorageConstructor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "storageOpenQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new async_queue_1.AsyncQueue()
        });
        this.StorageConstructor = StorageConstructor;
        this.name = this.StorageConstructor.name;
    }
    static openStorage(storageClass, idOrName, client, config = configuration_1.Configuration.getGlobalConfig()) {
        return this.getManager(storageClass, config).openStorage(idOrName, client);
    }
    static getManager(storageClass, config = configuration_1.Configuration.getGlobalConfig()) {
        if (!this.storageManagers.has(storageClass)) {
            const manager = new StorageManager(storageClass, config);
            this.storageManagers.set(storageClass, manager);
        }
        return this.storageManagers.get(storageClass);
    }
    /** @internal */
    static clearCache() {
        this.storageManagers.forEach((manager) => {
            if (manager.name === 'KeyValueStore') {
                manager.cache.forEach((item) => {
                    item.clearCache?.();
                });
            }
        });
        this.storageManagers.clear();
    }
    async openStorage(idOrName, client) {
        await this.storageOpenQueue.wait();
        if (!idOrName) {
            const defaultIdConfigKey = DEFAULT_ID_CONFIG_KEYS[this.name];
            idOrName = this.config.get(defaultIdConfigKey);
        }
        const cacheKey = idOrName;
        let storage = this.cache.get(cacheKey);
        if (!storage) {
            client ?? (client = this.config.getStorageClient());
            const storageObject = await this._getOrCreateStorage(idOrName, this.name, client);
            storage = new this.StorageConstructor({
                id: storageObject.id,
                name: storageObject.name,
                client,
            });
            this._addStorageToCache(storage);
        }
        this.storageOpenQueue.shift();
        return storage;
    }
    closeStorage(storage) {
        const idKey = storage.id;
        this.cache.delete(idKey);
        if (storage.name) {
            const nameKey = storage.name;
            this.cache.delete(nameKey);
        }
    }
    /**
     * Helper function that first requests storage by ID and if storage doesn't exist then gets it by name.
     */
    async _getOrCreateStorage(storageIdOrName, storageConstructorName, apiClient) {
        const { createStorageClient, createStorageCollectionClient, } = this._getStorageClientFactories(apiClient, storageConstructorName);
        const storageClient = createStorageClient(storageIdOrName);
        const existingStorage = await storageClient.get();
        if (existingStorage)
            return existingStorage;
        const storageCollectionClient = createStorageCollectionClient();
        return storageCollectionClient.getOrCreate(storageIdOrName);
    }
    _getStorageClientFactories(client, storageConstructorName) {
        // Dataset => dataset
        const clientName = storageConstructorName[0].toLowerCase() + storageConstructorName.slice(1);
        // dataset => datasets
        const collectionClientName = `${clientName}s`;
        return {
            createStorageClient: client[clientName].bind(client),
            createStorageCollectionClient: client[collectionClientName].bind(client),
        };
    }
    _addStorageToCache(storage) {
        const idKey = storage.id;
        this.cache.set(idKey, storage);
        if (storage.name) {
            const nameKey = storage.name;
            this.cache.set(nameKey, storage);
        }
    }
}
Object.defineProperty(StorageManager, "storageManagers", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: new Map()
});
exports.StorageManager = StorageManager;
//# sourceMappingURL=storage_manager.js.map