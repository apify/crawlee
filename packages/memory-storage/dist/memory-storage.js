"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryStorage = void 0;
const shapeshift_1 = require("@sapphire/shapeshift");
const fs_extra_1 = require("fs-extra");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const dataset_1 = require("./resource-clients/dataset");
const dataset_collection_1 = require("./resource-clients/dataset-collection");
const key_value_store_1 = require("./resource-clients/key-value-store");
const key_value_store_collection_1 = require("./resource-clients/key-value-store-collection");
const request_queue_1 = require("./resource-clients/request-queue");
const request_queue_collection_1 = require("./resource-clients/request-queue-collection");
const instance_1 = require("./workers/instance");
class MemoryStorage {
    constructor(options = {}) {
        Object.defineProperty(this, "localDataDirectory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "datasetsDirectory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "keyValueStoresDirectory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "requestQueuesDirectory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "writeMetadata", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "persistStorage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "keyValueStoresHandled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "datasetClientsHandled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "requestQueuesHandled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        shapeshift_1.s.object({
            localDataDirectory: shapeshift_1.s.string.optional,
            writeMetadata: shapeshift_1.s.boolean.optional,
            persistStorage: shapeshift_1.s.boolean.optional,
        }).parse(options);
        // v3.0.0 used `crawlee_storage` as the default, we changed this in v3.0.1 to just `storage`,
        // this function handles it without making BC breaks - it respects existing `crawlee_storage`
        // directories, and uses the `storage` only if it's not there.
        const defaultStorageDir = () => {
            if ((0, fs_extra_1.pathExistsSync)((0, node_path_1.resolve)('./crawlee_storage'))) {
                return './crawlee_storage';
            }
            return './storage';
        };
        this.localDataDirectory = options.localDataDirectory ?? process.env.CRAWLEE_STORAGE_DIR ?? defaultStorageDir();
        this.datasetsDirectory = (0, node_path_1.resolve)(this.localDataDirectory, 'datasets');
        this.keyValueStoresDirectory = (0, node_path_1.resolve)(this.localDataDirectory, 'key_value_stores');
        this.requestQueuesDirectory = (0, node_path_1.resolve)(this.localDataDirectory, 'request_queues');
        this.writeMetadata = options.writeMetadata ?? process.env.DEBUG?.includes('*') ?? process.env.DEBUG?.includes('crawlee:memory-storage') ?? false;
        this.persistStorage = options.persistStorage
            ?? (process.env.CRAWLEE_PERSIST_STORAGE ? !['false', '0', ''].includes(process.env.CRAWLEE_PERSIST_STORAGE) : true);
        (0, instance_1.initWorkerIfNeeded)();
    }
    datasets() {
        return new dataset_collection_1.DatasetCollectionClient({
            baseStorageDirectory: this.datasetsDirectory,
            client: this,
        });
    }
    dataset(id) {
        shapeshift_1.s.string.parse(id);
        return new dataset_1.DatasetClient({ id, baseStorageDirectory: this.datasetsDirectory, client: this });
    }
    keyValueStores() {
        return new key_value_store_collection_1.KeyValueStoreCollectionClient({
            baseStorageDirectory: this.keyValueStoresDirectory,
            client: this,
        });
    }
    keyValueStore(id) {
        shapeshift_1.s.string.parse(id);
        return new key_value_store_1.KeyValueStoreClient({ id, baseStorageDirectory: this.keyValueStoresDirectory, client: this });
    }
    requestQueues() {
        return new request_queue_collection_1.RequestQueueCollectionClient({
            baseStorageDirectory: this.requestQueuesDirectory,
            client: this,
        });
    }
    requestQueue(id, options = {}) {
        shapeshift_1.s.string.parse(id);
        shapeshift_1.s.object({
            clientKey: shapeshift_1.s.string.optional,
            timeoutSecs: shapeshift_1.s.number.optional,
        }).parse(options);
        return new request_queue_1.RequestQueueClient({ id, baseStorageDirectory: this.requestQueuesDirectory, client: this, ...options });
    }
    setStatusMessage(message, options = {}) {
        shapeshift_1.s.string.parse(message);
        shapeshift_1.s.object({
            isStatusMessageTerminal: shapeshift_1.s.boolean.optional,
        }).parse(options);
        return Promise.resolve();
    }
    /**
     * Cleans up the default storage directories before the run starts:
     *  - local directory containing the default dataset;
     *  - all records from the default key-value store in the local directory, except for the "INPUT" key;
     *  - local directory containing the default request queue.
     */
    async purge() {
        // Key-value stores
        const keyValueStores = await (0, promises_1.readdir)(this.keyValueStoresDirectory).catch(() => []);
        const keyValueStorePromises = [];
        for (const keyValueStoreFolder of keyValueStores) {
            if (keyValueStoreFolder.startsWith('__CRAWLEE_TEMPORARY') || keyValueStoreFolder.startsWith('__OLD')) {
                keyValueStorePromises.push((await this.batchRemoveFiles((0, node_path_1.resolve)(this.keyValueStoresDirectory, keyValueStoreFolder)))());
            }
            else if (keyValueStoreFolder === 'default') {
                keyValueStorePromises.push(this.handleDefaultKeyValueStore((0, node_path_1.resolve)(this.keyValueStoresDirectory, keyValueStoreFolder))());
            }
        }
        void Promise.allSettled(keyValueStorePromises);
        // Datasets
        const datasets = await (0, promises_1.readdir)(this.datasetsDirectory).catch(() => []);
        const datasetPromises = [];
        for (const datasetFolder of datasets) {
            if (datasetFolder === 'default' || datasetFolder.startsWith('__CRAWLEE_TEMPORARY')) {
                datasetPromises.push((await this.batchRemoveFiles((0, node_path_1.resolve)(this.datasetsDirectory, datasetFolder)))());
            }
        }
        void Promise.allSettled(datasetPromises);
        // Request queues
        const requestQueues = await (0, promises_1.readdir)(this.requestQueuesDirectory).catch(() => []);
        const requestQueuePromises = [];
        for (const requestQueueFolder of requestQueues) {
            if (requestQueueFolder === 'default' || requestQueueFolder.startsWith('__CRAWLEE_TEMPORARY')) {
                requestQueuePromises.push((await this.batchRemoveFiles((0, node_path_1.resolve)(this.requestQueuesDirectory, requestQueueFolder)))());
            }
        }
        void Promise.allSettled(requestQueuePromises);
    }
    /**
     * This method should be called at the end of the process, to ensure all data is saved.
     */
    async teardown() {
        const promises = [...instance_1.promiseMap.values()].map(({ promise }) => promise);
        await Promise.all(promises);
    }
    handleDefaultKeyValueStore(folder) {
        const storagePathExists = (0, fs_extra_1.pathExistsSync)(folder);
        const temporaryPath = (0, node_path_1.resolve)(folder, '../__CRAWLEE_MIGRATING_KEY_VALUE_STORE__');
        // For optimization, we want to only attempt to copy a few files from the default key-value store
        const possibleInputKeys = [
            'INPUT',
            'INPUT.json',
            'INPUT.bin',
            'INPUT.txt',
        ];
        if (storagePathExists) {
            // Create temporary folder to save important files in
            (0, fs_extra_1.ensureDirSync)(temporaryPath);
            // Go through each file and save the ones that are important
            for (const entity of possibleInputKeys) {
                const originalFilePath = (0, node_path_1.resolve)(folder, entity);
                const tempFilePath = (0, node_path_1.resolve)(temporaryPath, entity);
                try {
                    (0, node_fs_1.renameSync)(originalFilePath, tempFilePath);
                }
                catch {
                    // Ignore
                }
            }
            // Remove the original folder and all its content
            let counter = 0;
            let tempPathForOldFolder = (0, node_path_1.resolve)(folder, `../__OLD_DEFAULT_${counter}__`);
            let done = false;
            while (!done) {
                try {
                    (0, node_fs_1.renameSync)(folder, tempPathForOldFolder);
                    done = true;
                }
                catch {
                    tempPathForOldFolder = (0, node_path_1.resolve)(folder, `../__OLD_DEFAULT_${++counter}__`);
                }
            }
            // Replace the temporary folder with the original folder
            (0, node_fs_1.renameSync)(temporaryPath, folder);
            // Remove the old folder
            return async () => (await this.batchRemoveFiles(tempPathForOldFolder))();
        }
        return () => Promise.resolve();
    }
    async batchRemoveFiles(folder, counter = 0) {
        const folderExists = (0, fs_extra_1.pathExistsSync)(folder);
        if (folderExists) {
            const temporaryFolder = (0, node_path_1.resolve)(folder, `../__CRAWLEE_TEMPORARY_${counter}__`);
            try {
                // Rename the old folder to the new one to allow background deletions
                await (0, promises_1.rename)(folder, temporaryFolder);
            }
            catch {
                // Folder exists already, try again with an incremented counter
                return this.batchRemoveFiles(folder, ++counter);
            }
            return async () => {
                // Read all files in the folder
                const entries = await (0, promises_1.readdir)(temporaryFolder);
                let processed = 0;
                let promises = [];
                for (const entry of entries) {
                    processed++;
                    promises.push((0, promises_1.rm)((0, node_path_1.resolve)(temporaryFolder, entry), { force: true }));
                    // Every 2000 files, delete them
                    if (processed % 2000 === 0) {
                        await Promise.allSettled(promises);
                        promises = [];
                    }
                }
                // Ensure last promises are handled
                await Promise.allSettled(promises);
                // Delete the folder itself
                await (0, promises_1.rm)(temporaryFolder, { force: true, recursive: true });
            };
        }
        return () => Promise.resolve();
    }
}
exports.MemoryStorage = MemoryStorage;
//# sourceMappingURL=memory-storage.js.map