import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import cacheContainer from '../cache_container';
import * as utils from '../utils';

const DEFAULT_ID_ENV_VAR_NAMES = {
    Dataset: ENV_VARS.DEFAULT_DATASET_ID,
    KeyValueStore: ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID,
    RequestQueue: ENV_VARS.DEFAULT_REQUEST_QUEUE_ID,
};

const MAX_OPENED_STORAGES = 1000;

/**
 * StorageManager takes care of opening remote or local storages.
 * @property {Function} StorageConstructor
 * @property {string} name
 * @property {LruCache} cache
 * @private
 */
class StorageManager {
    /**
     * @param {Function} StorageConstructor
     */
    constructor(StorageConstructor) {
        this.StorageConstructor = StorageConstructor;
        this.name = StorageConstructor.name;
        this.cache = cacheContainer.openCache(this.name, MAX_OPENED_STORAGES);
    }

    /**
     * @param {string} idOrName
     * @param {object} [options]
     * @param {boolean} [options.forceCloud]
     * @return {Promise<object>}
     */
    async openStorage(idOrName, options = {}) {
        if (!process.env[ENV_VARS.LOCAL_STORAGE_DIR] && !process.env[ENV_VARS.TOKEN]) {
            throw new Error(`Cannot use ${this.name} as neither ${ENV_VARS.LOCAL_STORAGE_DIR} nor ${ENV_VARS.TOKEN}`
                + ' environment variable is set. You need to set one these variables in order to enable data storage.');
        }

        const isLocal = !!(process.env[ENV_VARS.LOCAL_STORAGE_DIR] && !options.forceCloud);

        if (!idOrName) {
            const defaultIdEnvVarName = DEFAULT_ID_ENV_VAR_NAMES[this.name];
            idOrName = process.env[defaultIdEnvVarName];
            if (!idOrName && isLocal) idOrName = LOCAL_ENV_VARS[defaultIdEnvVarName];
            if (!idOrName) throw new Error(`The '${defaultIdEnvVarName}' environment variable is not defined.`);
        }

        const cacheKey = this._createCacheKey(idOrName, isLocal);

        let storage = this.cache.get(cacheKey);
        if (!storage) {
            const client = isLocal ? utils.apifyStorageLocal : utils.apifyClient;
            const storageObject = await this._getOrCreateStorage(idOrName, this.name, client);
            storage = new this.StorageConstructor({
                id: storageObject.id,
                name: storageObject.name,
                client,
                isLocal,
            });
            this._addStorageToCache(storage);
        }

        return storage;
    }

    /**
     * @param {object} storage
     * @param {string} storage.id
     * @param {string} [storage.name]
     * @param {boolean} [storage.isLocal]
     */
    closeStorage(storage) {
        const idKey = this._createCacheKey(storage.id, storage.isLocal);
        this.cache.remove(idKey);
        if (storage.name) {
            const nameKey = this._createCacheKey(storage.name, storage.isLocal);
            this.cache.remove(nameKey);
        }
    }

    /**
     * @param {string} idOrName
     * @param {boolean} isLocal
     * @return {string}
     */
    _createCacheKey(idOrName, isLocal) {
        return isLocal
            ? `LOCAL:${idOrName}`
            : `REMOTE:${idOrName}`;
    }

    /**
     * Helper function that first requests storage by ID and if storage doesn't exist then gets it by name.
     * @param {string} storageIdOrName
     * @param {string} storageConstructorName
     * @param {ApifyClient|ApifyStorageLocal} apiClient
     * @ignore
     */
    async _getOrCreateStorage(storageIdOrName, storageConstructorName, apiClient) {
        const {
            createStorageClient,
            createStorageCollectionClient,
        } = this._getStorageClientFactories(apiClient, storageConstructorName);

        const storageClient = createStorageClient(storageIdOrName);
        const existingStorage = await storageClient.get();
        if (existingStorage) return existingStorage;

        const storageCollectionClient = createStorageCollectionClient();
        return storageCollectionClient.getOrCreate(storageIdOrName);
    }

    /**
     * @param {ApifyClient|ApifyStorageLocal} client
     * @param {string} storageConstructorName
     * @return {{ createStorageClient: function, createStorageCollectionClient: function }}
     */
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

    /**
     * @param {object} storage
     * @param {string} storage.id
     * @param {string} [storage.name]
     * @param {boolean} [storage.isLocal]
     */
    _addStorageToCache(storage) {
        const idKey = this._createCacheKey(storage.id, storage.isLocal);
        this.cache.add(idKey, storage);
        if (storage.name) {
            const nameKey = this._createCacheKey(storage.name, storage.isLocal);
            this.cache.add(nameKey, storage);
        }
    }
}

export default StorageManager;
