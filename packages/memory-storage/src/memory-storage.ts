/* eslint-disable import/no-duplicates */
import { access, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import type * as storage from '@crawlee/types';
import type { CrawleeLogger } from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { ensureDirSync, move, moveSync, pathExistsSync } from 'fs-extra/esm';

import { promiseMap, scheduleBackgroundTask } from './background-handler/index.js';
import {
    findOrCacheDatasetByPossibleId,
    findOrCacheKeyValueStoreByPossibleId,
    findRequestQueueByPossibleId,
} from './cache-helpers.js';
import { DatasetClient } from './resource-clients/dataset.js';
import { KeyValueStoreClient } from './resource-clients/key-value-store.js';
import { RequestQueueClient } from './resource-clients/request-queue.js';

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

    /**
     * Optional logger for MemoryStorage warnings.
     */
    logger?: CrawleeLogger;
}

export class MemoryStorage implements storage.StorageClient {
    readonly localDataDirectory: string;
    readonly datasetsDirectory: string;
    readonly keyValueStoresDirectory: string;
    readonly requestQueuesDirectory: string;
    readonly writeMetadata: boolean;
    readonly persistStorage: boolean;
    readonly logger?: CrawleeLogger;

    readonly keyValueStoreCache: KeyValueStoreClient[] = [];
    readonly datasetClientCache: DatasetClient[] = [];
    readonly requestQueueCache: RequestQueueClient[] = [];

    constructor(options: MemoryStorageOptions = {}) {
        s.object({
            localDataDirectory: s.string().optional(),
            writeMetadata: s.boolean().optional(),
            persistStorage: s.boolean().optional(),
        }).parse(options);

        this.logger = options.logger;

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
        this.writeMetadata =
            options.writeMetadata ??
            process.env.DEBUG?.includes('*') ??
            process.env.DEBUG?.includes('crawlee:memory-storage') ??
            false;
        this.persistStorage =
            options.persistStorage ??
            (process.env.CRAWLEE_PERSIST_STORAGE
                ? !['false', '0', ''].includes(process.env.CRAWLEE_PERSIST_STORAGE!)
                : true);
    }

    async createDatasetClient(options: storage.CreateDatasetClientOptions = {}): Promise<storage.DatasetClient> {
        // In MemoryStorage, both id and name resolve to the same directory name.
        const name = options.name ?? options.id;

        if (name) {
            const found = await findOrCacheDatasetByPossibleId(this, name);
            if (found) {
                return found;
            }
        }

        const newStore = new DatasetClient({ name, baseStorageDirectory: this.datasetsDirectory, client: this });
        this.datasetClientCache.push(newStore);

        // Schedule the worker to write to the disk
        const datasetInfo = newStore.toDatasetInfo();

        scheduleBackgroundTask(
            {
                action: 'update-metadata',
                entityType: 'datasets',
                entityDirectory: newStore.datasetDirectory,
                id: datasetInfo.name ?? datasetInfo.id,
                data: datasetInfo,
                writeMetadata: this.writeMetadata,
                persistStorage: this.persistStorage,
            },
            this.logger,
        );

        return newStore;
    }

    async createKeyValueStoreClient(
        options: storage.CreateKeyValueStoreClientOptions = {},
    ): Promise<storage.KeyValueStoreClient> {
        // In MemoryStorage, both id and name resolve to the same directory name.
        const name = options.name ?? options.id;

        if (name) {
            const found = await findOrCacheKeyValueStoreByPossibleId(this, name);
            if (found) {
                return found;
            }
        }

        const newStore = new KeyValueStoreClient({
            name,
            baseStorageDirectory: this.keyValueStoresDirectory,
            client: this,
        });
        this.keyValueStoreCache.push(newStore);

        // Schedule the worker to write to the disk
        const kvStoreInfo = newStore.toKeyValueStoreInfo();

        scheduleBackgroundTask(
            {
                action: 'update-metadata',
                entityType: 'keyValueStores',
                entityDirectory: newStore.keyValueStoreDirectory,
                id: kvStoreInfo.name ?? kvStoreInfo.id,
                data: kvStoreInfo,
                writeMetadata: this.writeMetadata,
                persistStorage: this.persistStorage,
            },
            this.logger,
        );

        return newStore;
    }

    async createRequestQueueClient(
        options: storage.CreateRequestQueueClientOptions = {},
    ): Promise<storage.RequestQueueClient> {
        // In MemoryStorage, both id and name resolve to the same directory name.
        const name = options.name ?? options.id;

        if (name) {
            const found = await findRequestQueueByPossibleId(this, name);
            if (found) {
                return found;
            }
        }

        const newStore = new RequestQueueClient({
            name,
            baseStorageDirectory: this.requestQueuesDirectory,
            client: this,
        });
        this.requestQueueCache.push(newStore);

        // Schedule the worker to write to the disk
        const queueInfo = newStore.toRequestQueueInfo();

        scheduleBackgroundTask(
            {
                action: 'update-metadata',
                entityType: 'requestQueues',
                entityDirectory: newStore.requestQueueDirectory,
                id: queueInfo.name ?? queueInfo.id,
                data: queueInfo,
                writeMetadata: this.writeMetadata,
                persistStorage: this.persistStorage,
            },
            this.logger,
        );

        return newStore;
    }

    async storageExists(id: string, type: 'Dataset' | 'KeyValueStore' | 'RequestQueue'): Promise<boolean> {
        let clients: { id: string }[];
        let baseDir: string;

        switch (type) {
            case 'Dataset':
                clients = this.datasetClientCache;
                baseDir = this.datasetsDirectory;
                break;
            case 'KeyValueStore':
                clients = this.keyValueStoreCache;
                baseDir = this.keyValueStoresDirectory;
                break;
            case 'RequestQueue':
                clients = this.requestQueueCache;
                baseDir = this.requestQueuesDirectory;
                break;
            default:
                return false;
        }

        // Check in-memory cache first
        if (clients.some((store) => store.id === id)) {
            return true;
        }

        // Check if a directory with that ID exists on disk
        try {
            await access(resolve(baseDir, id));
            return true;
        } catch {
            return false;
        }
    }

    async setStatusMessage(message: string, options: storage.SetStatusMessageOptions = {}): Promise<void> {
        s.string().parse(message);
        s.object({
            isStatusMessageTerminal: s.boolean().optional(),
        }).parse(options);

        return Promise.resolve();
    }

    /**
     * Cleans up the default storage directories before the run starts:
     *  - local directory containing the default dataset;
     *  - all records from the default key-value store in the local directory, except for the "INPUT" key;
     *  - local directory containing the default request queue.
     */
    async purge(): Promise<void> {
        // Key-value stores
        const keyValueStores = await readdir(this.keyValueStoresDirectory).catch(() => []);
        const keyValueStorePromises: Promise<void>[] = [];

        for (const keyValueStoreFolder of keyValueStores) {
            if (keyValueStoreFolder.startsWith('__CRAWLEE_TEMPORARY') || keyValueStoreFolder.startsWith('__OLD')) {
                keyValueStorePromises.push(
                    (await this.batchRemoveFiles(resolve(this.keyValueStoresDirectory, keyValueStoreFolder)))(),
                );
            } else if (keyValueStoreFolder === 'default') {
                keyValueStorePromises.push(
                    this.handleDefaultKeyValueStore(resolve(this.keyValueStoresDirectory, keyValueStoreFolder))(),
                );
            }
        }

        void Promise.allSettled(keyValueStorePromises);

        // Datasets
        const datasets = await readdir(this.datasetsDirectory).catch(() => []);
        const datasetPromises: Promise<void>[] = [];

        for (const datasetFolder of datasets) {
            if (datasetFolder === 'default' || datasetFolder.startsWith('__CRAWLEE_TEMPORARY')) {
                datasetPromises.push((await this.batchRemoveFiles(resolve(this.datasetsDirectory, datasetFolder)))());
            }
        }

        void Promise.allSettled(datasetPromises);

        // Request queues
        const requestQueues = await readdir(this.requestQueuesDirectory).catch(() => []);
        const requestQueuePromises: Promise<void>[] = [];

        for (const requestQueueFolder of requestQueues) {
            if (requestQueueFolder === 'default' || requestQueueFolder.startsWith('__CRAWLEE_TEMPORARY')) {
                requestQueuePromises.push(
                    (await this.batchRemoveFiles(resolve(this.requestQueuesDirectory, requestQueueFolder)))(),
                );
            }
        }

        void Promise.allSettled(requestQueuePromises);
    }

    /**
     * This method should be called at the end of the process, to ensure all data is saved.
     */
    async teardown(): Promise<void> {
        const promises = [...promiseMap.values()].map(async ({ promise }) => promise);

        await Promise.all(promises);
    }

    private handleDefaultKeyValueStore(folder: string): () => Promise<void> {
        const storagePathExists = pathExistsSync(folder);
        const temporaryPath = resolve(folder, '../__CRAWLEE_MIGRATING_KEY_VALUE_STORE__');

        // For optimization, we want to only attempt to copy a few files from the default key-value store
        const possibleInputKeys = ['INPUT', 'INPUT.json', 'INPUT.bin', 'INPUT.txt'];

        if (storagePathExists) {
            // Create temporary folder to save important files in
            ensureDirSync(temporaryPath);

            // Go through each file and save the ones that are important
            for (const entity of possibleInputKeys) {
                const originalFilePath = resolve(folder, entity);
                const tempFilePath = resolve(temporaryPath, entity);

                try {
                    moveSync(originalFilePath, tempFilePath);
                } catch {
                    // Ignore
                }
            }

            // Remove the original folder and all its content
            let counter = 0;
            let tempPathForOldFolder = resolve(folder, `../__OLD_DEFAULT_${counter}__`);
            let done = false;

            while (!done) {
                try {
                    moveSync(folder, tempPathForOldFolder);
                    done = true;
                } catch {
                    tempPathForOldFolder = resolve(folder, `../__OLD_DEFAULT_${++counter}__`);
                }
            }

            // Replace the temporary folder with the original folder
            moveSync(temporaryPath, folder);

            // Remove the old folder
            return async () => (await this.batchRemoveFiles(tempPathForOldFolder))();
        }

        return async () => Promise.resolve();
    }

    private async batchRemoveFiles(folder: string, counter = 0): Promise<() => Promise<void>> {
        const folderExists = pathExistsSync(folder);

        if (folderExists) {
            const temporaryFolder = resolve(folder, `../__CRAWLEE_TEMPORARY_${counter}__`);

            try {
                // Rename the old folder to the new one to allow background deletions
                await move(folder, temporaryFolder);
            } catch {
                // Folder exists already, try again with an incremented counter
                return this.batchRemoveFiles(folder, ++counter);
            }

            return async () => {
                // Read all files in the folder
                const entries = await readdir(temporaryFolder);

                let processed = 0;
                let promises: Promise<void>[] = [];

                for (const entry of entries) {
                    processed++;
                    promises.push(rm(resolve(temporaryFolder, entry), { force: true }));

                    // Every 2000 files, delete them
                    if (processed % 2000 === 0) {
                        await Promise.allSettled(promises);
                        promises = [];
                    }
                }

                // Ensure last promises are handled
                await Promise.allSettled(promises);

                // Delete the folder itself
                await rm(temporaryFolder, { force: true, recursive: true });
            };
        }

        return async () => Promise.resolve();
    }
}
