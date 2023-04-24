import type * as storage from '@crawlee/types';
import type { Dictionary } from '@crawlee/types';
import { DatasetClient } from './resource-clients/dataset';
import { KeyValueStoreClient } from './resource-clients/key-value-store';
import { RequestQueueClient } from './resource-clients/request-queue';
export interface MemoryStorageOptions {
    /**
     * Path to directory where the data will also be saved.
     * @default process.env.CRAWLEE_STORAGE_DIR ?? './storage'
     */
    localDataDirectory?: string;
    /**
     * Whether to also write optional metadata files when storing to disk.
     * @default process.env.DEBUG?.includes('*') ?? process.env.DEBUG?.includes('crawlee:memory-storage') ?? false
     */
    writeMetadata?: boolean;
    /**
     * Whether the memory storage should also write its stored content to the disk.
     *
     * You can also disable this by setting the `CRAWLEE_PERSIST_STORAGE` environment variable to `false`.
     * @default true
     */
    persistStorage?: boolean;
}
export declare class MemoryStorage implements storage.StorageClient {
    readonly localDataDirectory: string;
    readonly datasetsDirectory: string;
    readonly keyValueStoresDirectory: string;
    readonly requestQueuesDirectory: string;
    readonly writeMetadata: boolean;
    readonly persistStorage: boolean;
    readonly keyValueStoresHandled: KeyValueStoreClient[];
    readonly datasetClientsHandled: DatasetClient[];
    readonly requestQueuesHandled: RequestQueueClient[];
    constructor(options?: MemoryStorageOptions);
    datasets(): storage.DatasetCollectionClient;
    dataset<Data extends Dictionary = Dictionary>(id: string): storage.DatasetClient<Data>;
    keyValueStores(): storage.KeyValueStoreCollectionClient;
    keyValueStore(id: string): storage.KeyValueStoreClient;
    requestQueues(): storage.RequestQueueCollectionClient;
    requestQueue(id: string, options?: storage.RequestQueueOptions): storage.RequestQueueClient;
    setStatusMessage(message: string, options?: storage.SetStatusMessageOptions): Promise<void>;
    /**
     * Cleans up the default storage directories before the run starts:
     *  - local directory containing the default dataset;
     *  - all records from the default key-value store in the local directory, except for the "INPUT" key;
     *  - local directory containing the default request queue.
     */
    purge(): Promise<void>;
    /**
     * This method should be called at the end of the process, to ensure all data is saved.
     */
    teardown(): Promise<void>;
    private handleDefaultKeyValueStore;
    private batchRemoveFiles;
}
//# sourceMappingURL=memory-storage.d.ts.map