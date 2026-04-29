import type {
    BaseHttpClient,
    DatasetClient,
    KeyValueStoreClient,
    RequestQueueClient,
    StorageClient,
    StorageIdentifier,
} from '@crawlee/types';
import { AsyncQueue } from '@sapphire/async-queue';

import type { Configuration } from '../configuration.js';
import type { ProxyConfiguration } from '../proxy_configuration.js';
import { serviceLocator } from '../service_locator.js';
import type { Constructor } from '../typedefs.js';

export type { StorageIdentifier } from '@crawlee/types';

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
        identifier?: string | StorageIdentifier,
        client?: StorageClient,
    ): Promise<T> {
        return this.getManager(storageClass).openStorage(identifier, client);
    }

    static getManager<T extends IStorage>(storageClass: Constructor<T>): StorageManager<T> {
        let storageManager = serviceLocator.getStorageManager(storageClass);
        if (storageManager === undefined) {
            storageManager = new StorageManager(storageClass, serviceLocator.getConfiguration());
            serviceLocator.setStorageManager(storageClass, storageManager);
        }

        return serviceLocator.getStorageManager(storageClass) as StorageManager<T>;
    }

    async openStorage(identifier?: string | StorageIdentifier | null, client?: StorageClient): Promise<T> {
        await this.storageOpenQueue.wait();

        const resolvedIdentifier = await this._resolveIdentifier(identifier, client);

        const cacheKey = resolvedIdentifier.id ?? resolvedIdentifier.name!;
        let storage = this.cache.get(cacheKey);

        if (!storage) {
            client ??= serviceLocator.getStorageClient();
            const subClient = await this._createSubClient(resolvedIdentifier, this.name, client);
            const storageInfo = await (
                subClient as DatasetClient | KeyValueStoreClient | RequestQueueClient
            ).getMetadata();
            storage = new this.StorageConstructor(
                {
                    id: storageInfo.id,
                    name: storageInfo.name,
                    client: subClient,
                },
                this.config,
            );
            this._addStorageToCache(storage);
        }

        this.storageOpenQueue.shift();

        return storage;
    }

    /**
     * Resolves the user-provided identifier to an unambiguous `StorageIdentifier`.
     *
     * - `null`/`undefined` → uses the default storage ID from config
     * - `StorageIdentifier` object → passed through (with default ID fallback if empty)
     * - `string` → tries to find an existing storage with that ID first;
     *   if none exists, treats the string as a name
     */
    private async _resolveIdentifier(
        identifier?: string | StorageIdentifier | null,
        client?: StorageClient,
    ): Promise<StorageIdentifier> {
        if (typeof identifier === 'string') {
            client ??= serviceLocator.getStorageClient();

            if (client.storageExists && (await client.storageExists(identifier, this.name))) {
                return { id: identifier };
            }

            return { name: identifier };
        }

        if (identifier?.id) {
            return { id: identifier.id };
        }

        if (identifier?.name) {
            return { name: identifier.name };
        }

        const defaultIdConfigKey = DEFAULT_ID_CONFIG_KEYS[this.name];
        const defaultId = this.config[defaultIdConfigKey] as string;

        return { id: defaultId };
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
     * Creates a sub-client for the given storage type using the new factory-based StorageClient interface.
     */
    protected async _createSubClient(
        identifier: StorageIdentifier,
        storageConstructorName: string,
        apiClient: StorageClient,
    ): Promise<DatasetClient | KeyValueStoreClient | RequestQueueClient> {
        switch (storageConstructorName) {
            case 'Dataset':
                return apiClient.createDatasetClient(identifier);
            case 'KeyValueStore':
                return apiClient.createKeyValueStoreClient(identifier);
            case 'RequestQueue':
                return apiClient.createRequestQueueClient(identifier);
            default:
                throw new Error(`Unknown storage type: ${storageConstructorName}`);
        }
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
