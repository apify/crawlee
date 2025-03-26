import type { Dictionary, StorageClient } from '@crawlee/types';
import { AsyncQueue } from '@sapphire/async-queue';

import { Configuration } from '../configuration';
import type { ProxyConfiguration } from '../proxy_configuration';
import type { Constructor } from '../typedefs';

const DEFAULT_ID_CONFIG_KEYS = {
    Dataset: 'defaultDatasetId',
    KeyValueStore: 'defaultKeyValueStoreId',
    RequestQueue: 'defaultRequestQueueId',
} as const;

export interface IStorage {
    id: string;
    name?: string;
}

/**
 * StorageManager takes care of opening remote or local storages.
 * @ignore
 */
export class StorageManager<T extends IStorage = IStorage> {
    private readonly name: 'Dataset' | 'KeyValueStore' | 'RequestQueue';
    private readonly StorageConstructor: Constructor<T> & { name: string };
    private readonly cache = new Map<string, T>();
    private readonly storageOpenQueue = new AsyncQueue();

    constructor(
        StorageConstructor: Constructor<T>,
        private readonly config = Configuration.getGlobalConfig(),
    ) {
        this.StorageConstructor = StorageConstructor;
        this.name = this.StorageConstructor.name as 'Dataset' | 'KeyValueStore' | 'RequestQueue';
    }

    static async openStorage<T extends IStorage>(
        storageClass: Constructor<T>,
        idOrName?: string,
        client?: StorageClient,
        config = Configuration.getGlobalConfig(),
    ): Promise<T> {
        return this.getManager(storageClass, config).openStorage(idOrName, client);
    }

    static getManager<T extends IStorage>(
        storageClass: Constructor<T>,
        config = Configuration.getGlobalConfig(),
    ): StorageManager<T> {
        if (!config.storageManagers.has(storageClass)) {
            const manager = new StorageManager(storageClass, config);
            config.storageManagers.set(storageClass, manager);
        }

        return config.storageManagers.get(storageClass) as StorageManager<T>;
    }

    /** @internal */
    static clearCache(config = Configuration.getGlobalConfig()): void {
        config.storageManagers.forEach((manager) => {
            if (manager.name === 'KeyValueStore') {
                manager.cache.forEach((item) => {
                    (item as Dictionary).clearCache?.();
                });
            }
        });
        config.storageManagers.clear();
    }

    async openStorage(idOrName?: string | null, client?: StorageClient): Promise<T> {
        await this.storageOpenQueue.wait();

        if (!idOrName) {
            const defaultIdConfigKey = DEFAULT_ID_CONFIG_KEYS[this.name];
            idOrName = this.config.get(defaultIdConfigKey) as string;
        }

        const cacheKey = idOrName;
        let storage = this.cache.get(cacheKey);

        if (!storage) {
            client ??= this.config.getStorageClient();
            const storageObject = await this._getOrCreateStorage(idOrName, this.name, client);
            storage = new this.StorageConstructor({
                id: storageObject.id,
                name: storageObject.name,
                storageObject,
                client,
            });

            this._addStorageToCache(storage);
        }

        this.storageOpenQueue.shift();

        return storage;
    }

    closeStorage(storage: { id: string; name?: string }): void {
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
    protected async _getOrCreateStorage(
        storageIdOrName: string,
        storageConstructorName: string,
        apiClient: StorageClient,
    ) {
        const { createStorageClient, createStorageCollectionClient } = this._getStorageClientFactories(
            apiClient,
            storageConstructorName,
        );

        const storageClient = createStorageClient(storageIdOrName);
        const existingStorage = await storageClient.get();
        if (existingStorage) return existingStorage;

        const storageCollectionClient = createStorageCollectionClient();
        return storageCollectionClient.getOrCreate(storageIdOrName);
    }

    protected _getStorageClientFactories(client: StorageClient, storageConstructorName: string) {
        // Dataset => dataset
        const clientName = (storageConstructorName[0].toLowerCase() + storageConstructorName.slice(1)) as ClientNames;
        // dataset => datasets
        const collectionClientName = `${clientName}s` as ClientCollectionNames;

        return {
            createStorageClient: client[clientName!].bind(client),
            createStorageCollectionClient: client[collectionClientName!].bind(client),
        };
    }

    protected _addStorageToCache(storage: T): void {
        const idKey = storage.id;
        this.cache.set(idKey, storage);

        if (storage.name) {
            const nameKey = storage.name;
            this.cache.set(nameKey, storage);
        }
    }
}

type ClientNames = 'dataset' | 'keyValueStore' | 'requestQueue';
type ClientCollectionNames = 'datasets' | 'keyValueStores' | 'requestQueues';

export interface StorageManagerOptions {
    /**
     * SDK configuration instance, defaults to the static register.
     */
    config?: Configuration;

    /**
     * Optional storage client that should be used to open storages.
     */
    storageClient?: StorageClient;

    /**
     * Used to pass the proxy configuration for the `requestsFromUrl` objects.
     * Takes advantage of the internal address rotation and authentication process.
     * If undefined, the `requestsFromUrl` requests will be made without proxy.
     */
    proxyConfiguration?: ProxyConfiguration;
}
