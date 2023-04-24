import type { Dictionary, StorageClient } from '@crawlee/types';
import { Configuration } from '../configuration';
import type { Constructor } from '../typedefs';
export interface IStorage {
    id: string;
    name?: string;
}
/**
 * StorageManager takes care of opening remote or local storages.
 * @ignore
 */
export declare class StorageManager<T extends IStorage = IStorage> {
    private readonly config;
    private static readonly storageManagers;
    private readonly name;
    private readonly StorageConstructor;
    private readonly cache;
    private readonly storageOpenQueue;
    constructor(StorageConstructor: Constructor<T>, config?: Configuration);
    static openStorage<T extends IStorage>(storageClass: Constructor<T>, idOrName?: string, client?: StorageClient, config?: Configuration): Promise<T>;
    static getManager<T extends IStorage>(storageClass: Constructor<T>, config?: Configuration): StorageManager<T>;
    /** @internal */
    static clearCache(): void;
    openStorage(idOrName?: string | null, client?: StorageClient): Promise<T>;
    closeStorage(storage: {
        id: string;
        name?: string;
    }): void;
    /**
     * Helper function that first requests storage by ID and if storage doesn't exist then gets it by name.
     */
    protected _getOrCreateStorage(storageIdOrName: string, storageConstructorName: string, apiClient: StorageClient): Promise<import("@crawlee/types").DatasetCollectionData>;
    protected _getStorageClientFactories(client: StorageClient, storageConstructorName: string): {
        createStorageClient: ((id: string) => import("@crawlee/types").DatasetClient<Dictionary>) | ((id: string) => import("@crawlee/types").KeyValueStoreClient) | ((id: string, options?: import("@crawlee/types").RequestQueueOptions | undefined) => import("@crawlee/types").RequestQueueClient);
        createStorageCollectionClient: (() => import("@crawlee/types").DatasetCollectionClient) | (() => import("@crawlee/types").KeyValueStoreCollectionClient) | (() => import("@crawlee/types").RequestQueueCollectionClient);
    };
    protected _addStorageToCache(storage: T): void;
}
export interface StorageManagerOptions {
    /**
     * SDK configuration instance, defaults to the static register.
     */
    config?: Configuration;
}
//# sourceMappingURL=storage_manager.d.ts.map