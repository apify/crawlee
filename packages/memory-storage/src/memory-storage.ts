/* eslint-disable import/no-duplicates */
import type * as storage from '@crawlee/types';
import type { Dictionary } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { pathExists } from 'fs-extra';
import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DatasetClient } from './resource-clients/dataset';
import { DatasetCollectionClient } from './resource-clients/dataset-collection';
import { KeyValueStoreClient } from './resource-clients/key-value-store';
import { KeyValueStoreCollectionClient } from './resource-clients/key-value-store-collection';
import { RequestQueueClient } from './resource-clients/request-queue';
import { RequestQueueCollectionClient } from './resource-clients/request-queue-collection';
import { initWorkerIfNeeded } from './workers/instance';

export interface MemoryStorageOptions {
    /**
     * Path to directory where the data will also be saved.
     * @default process.env.CRAWLEE_STORAGE_DIR ?? './crawlee_storage'
     */
    localDataDirectory?: string;
    /**
     * Whether to also write optional metadata files when storing to disk.
     * @default process.env.DEBUG?.includes('*') ?? process.env.DEBUG?.includes('crawlee:memory-storage') ?? false
     */
    writeMetadata?: boolean;
}

export class MemoryStorage implements storage.StorageClient {
    readonly localDataDirectory: string;
    readonly datasetsDirectory: string;
    readonly keyValueStoresDirectory: string;
    readonly requestQueuesDirectory: string;
    readonly writeMetadata: boolean;

    readonly keyValueStoresHandled: KeyValueStoreClient[] = [];
    readonly datasetClientsHandled: DatasetClient[] = [];
    readonly requestQueuesHandled: RequestQueueClient[] = [];

    constructor(options: MemoryStorageOptions = {}) {
        s.object({
            localDataDirectory: s.string.optional,
            writeMetadata: s.boolean.optional,
        }).parse(options);

        this.localDataDirectory = options.localDataDirectory ?? process.env.CRAWLEE_STORAGE_DIR ?? './crawlee_storage';
        this.datasetsDirectory = resolve(this.localDataDirectory, 'datasets');
        this.keyValueStoresDirectory = resolve(this.localDataDirectory, 'key_value_stores');
        this.requestQueuesDirectory = resolve(this.localDataDirectory, 'request_queues');
        this.writeMetadata = options.writeMetadata ?? process.env.DEBUG?.includes('*') ?? process.env.DEBUG?.includes('crawlee:memory-storage') ?? false;

        initWorkerIfNeeded();
    }

    datasets(): storage.DatasetCollectionClient {
        return new DatasetCollectionClient({
            baseStorageDirectory: this.datasetsDirectory,
            client: this,
        });
    }

    dataset<Data extends Dictionary = Dictionary>(id: string): storage.DatasetClient<Data> {
        s.string.parse(id);

        return new DatasetClient({ id, baseStorageDirectory: this.datasetsDirectory, client: this });
    }

    keyValueStores(): storage.KeyValueStoreCollectionClient {
        return new KeyValueStoreCollectionClient({
            baseStorageDirectory: this.keyValueStoresDirectory,
            client: this,
        });
    }

    keyValueStore(id: string): storage.KeyValueStoreClient {
        s.string.parse(id);

        return new KeyValueStoreClient({ id, baseStorageDirectory: this.keyValueStoresDirectory, client: this });
    }

    requestQueues(): storage.RequestQueueCollectionClient {
        return new RequestQueueCollectionClient({
            baseStorageDirectory: this.requestQueuesDirectory,
            client: this,
        });
    }

    requestQueue(id: string, options: storage.RequestQueueOptions = {}): storage.RequestQueueClient {
        s.string.parse(id);
        s.object({
            clientKey: s.string.optional,
            timeoutSecs: s.number.optional,
        }).parse(options);

        return new RequestQueueClient({ id, baseStorageDirectory: this.requestQueuesDirectory, client: this, ...options });
    }

    /**
     * Cleans up the default storage directories before the run starts:
     *  - local directory containing the default dataset;
     *  - all records from the default key-value store in the local directory, except for the "INPUT" key;
     *  - local directory containing the default request queue.
     */
    async purge(): Promise<void> {
        const defaultDatasetPath = resolve(this.datasetsDirectory, 'default');
        await this.removeFiles(defaultDatasetPath);

        const defaultKeyValueStorePath = resolve(this.keyValueStoresDirectory, 'default');
        await this.removeFiles(defaultKeyValueStorePath);

        const defaultRequestQueuePath = resolve(this.requestQueuesDirectory, 'default');
        await this.removeFiles(defaultRequestQueuePath);
    }

    private async removeFiles(folder: string): Promise<void> {
        const storagePathExists = await pathExists(folder);

        if (storagePathExists) {
            const direntNames = await readdir(folder);
            const deletePromises = [];

            for (const direntName of direntNames) {
                const fileName = join(folder, direntName);

                if (!fileName.match(/INPUT/)) {
                    deletePromises.push(rm(fileName, { recursive: true, force: true }));
                }
            }

            await Promise.all(deletePromises);
        }
    }
}
