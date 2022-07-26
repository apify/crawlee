/* eslint-disable import/no-duplicates */
import type * as storage from '@crawlee/types';
import type { Dictionary } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { ensureDir, pathExistsSync } from 'fs-extra';
import { opendir, rm, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatasetClient } from './resource-clients/dataset';
import { DatasetCollectionClient } from './resource-clients/dataset-collection';
import { KeyValueStoreClient } from './resource-clients/key-value-store';
import { KeyValueStoreCollectionClient } from './resource-clients/key-value-store-collection';
import { RequestQueueClient } from './resource-clients/request-queue';
import { RequestQueueCollectionClient } from './resource-clients/request-queue-collection';
import { initWorkerIfNeeded, promiseMap } from './workers/instance';

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

        // v3.0.0 used `crawlee_storage` as the default, we changed this in v3.0.1 to just `storage`,
        // this function handles it without making BC breaks - it respects existing `crawlee_storage`
        // directories, and uses the `storage` only if it's not there.
        const defaultStorageDir = () => {
            if (pathExistsSync(resolve('./crawlee_storage'))) {
                return './crawlee_storage';
            }

            return './storage';
        };

        this.localDataDirectory = options.localDataDirectory ?? process.env.CRAWLEE_STORAGE_DIR ?? defaultStorageDir();
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
        await rm(defaultDatasetPath, { recursive: true, force: true });

        const defaultKeyValueStorePath = resolve(this.keyValueStoresDirectory, 'default');
        const temporaryKeyValueStorePath = resolve(this.keyValueStoresDirectory, '__CRAWLEE_TEMPORARY__');
        await this.removeFiles(defaultKeyValueStorePath, temporaryKeyValueStorePath);

        const defaultRequestQueuePath = resolve(this.requestQueuesDirectory, 'default');
        await rm(defaultRequestQueuePath, { recursive: true, force: true });
    }

    /**
     * This method should be called at the end of the process, to ensure all data is saved.
     */
    async waitForFilesToSync(): Promise<void> {
        const promises = [...promiseMap.values()].map(({ promise }) => promise);

        await Promise.all(promises);
    }

    private async removeFiles(folder: string, temporaryPath: string): Promise<void> {
        const storagePathExists = pathExistsSync(folder);

        if (storagePathExists) {
            // Create temporary folder to save important files in
            await ensureDir(temporaryPath);

            // Go through each file and save the ones that are important
            for await (const entity of await opendir(folder)) {
                if (entity.name.match(/INPUT/)) {
                    const originalFilePath = resolve(folder, entity.name);
                    const tempFilePath = resolve(folder, entity.name);

                    await rename(originalFilePath, tempFilePath);
                }
            }

            // Remove the original folder and all its content
            const tempPathForOldFolder = resolve(folder, '../__OLD_DEFAULT__');
            await rename(folder, tempPathForOldFolder);
            void rm(tempPathForOldFolder, { force: true, recursive: true });

            // Replace the temporary folder with the original folder
            await rename(temporaryPath, folder);
        }
    }
}
