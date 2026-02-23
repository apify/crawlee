import type { BaseHttpClient, StorageClient } from '@crawlee/types';
import { AsyncQueue } from '@sapphire/async-queue';

import type { Configuration } from '../configuration.js';
import type { ProxyConfiguration } from '../proxy_configuration.js';
import { serviceLocator } from '../service_locator.js';
import type { Constructor } from '../typedefs.js';

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
        private readonly config: Configuration,
    ) {
        this.StorageConstructor = StorageConstructor;
        this.name = this.StorageConstructor.name as 'Dataset' | 'KeyValueStore' | 'RequestQueue';
    }

    static async openStorage<T extends IStorage>(
        storageClass: Constructor<T>,
        idOrName?: string,
        client?: StorageClient,
    ): Promise<T> {
        return this.getManager(storageClass).openStorage(idOrName, client);
    }

    static getManager<T extends IStorage>(storageClass: Constructor<T>): StorageManager<T> {
        let storageManager = serviceLocator.getStorageManager(storageClass);
        if (storageManager === undefined) {
            storageManager = new StorageManager(storageClass, serviceLocator.getConfiguration());
            serviceLocator.setStorageManager(storageClass, storageManager);
        }

        return serviceLocator.getStorageManager(storageClass) as StorageManager<T>;
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
            client ??= serviceLocator.getStorageClient();
            const storageObject = await this._getOrCreateStorage(idOrName, this.name, client);
            storage = new this.StorageConstructor(
                {
                    id: storageObject.id,
                    name: storageObject.name,
                    storageObject,
                    client,
                },
                this.config,
            );
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

    /**
     * HTTP client to be used to download the list of URLs in `RequestQueue`.
     */
    httpClient?: BaseHttpClient;
}
