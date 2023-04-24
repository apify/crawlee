"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findRequestQueueByPossibleId = exports.findOrCacheKeyValueStoreByPossibleId = exports.findOrCacheDatasetByPossibleId = void 0;
const tslib_1 = require("tslib");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const mime_types_1 = tslib_1.__importDefault(require("mime-types"));
const json5_1 = tslib_1.__importDefault(require("json5"));
const fs_1 = require("./fs/dataset/fs");
const fs_2 = require("./fs/key-value-store/fs");
const fs_3 = require("./fs/request-queue/fs");
const utils_1 = require("./utils");
const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
async function findOrCacheDatasetByPossibleId(client, entryNameOrId) {
    // First check memory cache
    const found = client.datasetClientsHandled.find((store) => store.id === entryNameOrId || store.name?.toLowerCase() === entryNameOrId.toLowerCase());
    if (found) {
        return found;
    }
    const datasetDir = (0, node_path_1.resolve)(client.datasetsDirectory, entryNameOrId);
    try {
        // Check if directory exists
        await (0, promises_1.access)(datasetDir);
    }
    catch {
        return undefined;
    }
    // Access the dataset folder
    const directoryEntries = await (0, promises_1.opendir)(datasetDir);
    let id;
    let name;
    let itemCount = 0;
    const entries = new Set();
    let createdAt = new Date();
    let accessedAt = new Date();
    let modifiedAt = new Date();
    let hasSeenMetadataFile = false;
    for await (const entry of directoryEntries) {
        if (entry.isFile()) {
            if (entry.name === '__metadata__.json') {
                hasSeenMetadataFile = true;
                // we have found the store metadata file, build out information based on it
                const fileContent = await (0, promises_1.readFile)((0, node_path_1.resolve)(datasetDir, entry.name), 'utf8');
                if (!fileContent)
                    continue;
                const metadata = JSON.parse(fileContent);
                id = metadata.id;
                name = metadata.name;
                itemCount = metadata.itemCount;
                createdAt = new Date(metadata.createdAt);
                accessedAt = new Date(metadata.accessedAt);
                modifiedAt = new Date(metadata.modifiedAt);
                continue;
            }
            const entryName = entry.name.split('.')[0];
            entries.add(entryName);
            if (!hasSeenMetadataFile) {
                itemCount++;
            }
        }
    }
    if (id === undefined && name === undefined) {
        const isUuid = uuidRegex.test(entryNameOrId);
        if (isUuid) {
            id = entryNameOrId;
        }
        else {
            name = entryNameOrId;
        }
    }
    const newClient = new dataset_1.DatasetClient({
        baseStorageDirectory: client.datasetsDirectory,
        client,
        id,
        name,
    });
    // Overwrite properties
    newClient.accessedAt = accessedAt;
    newClient.createdAt = createdAt;
    newClient.modifiedAt = modifiedAt;
    newClient.itemCount = itemCount;
    for (const entryId of entries.values()) {
        // We create a file system entry instead of possibly making an in-memory one to allow the pre-included data to be used on demand
        const entry = new fs_1.DatasetFileSystemEntry({ storeDirectory: datasetDir, entityId: entryId, persistStorage: true });
        // eslint-disable-next-line dot-notation
        newClient['datasetEntries'].set(entryId, entry);
    }
    client.datasetClientsHandled.push(newClient);
    return newClient;
}
exports.findOrCacheDatasetByPossibleId = findOrCacheDatasetByPossibleId;
async function findOrCacheKeyValueStoreByPossibleId(client, entryNameOrId) {
    // First check memory cache
    const found = client.keyValueStoresHandled.find((store) => store.id === entryNameOrId || store.name?.toLowerCase() === entryNameOrId.toLowerCase());
    if (found) {
        return found;
    }
    const keyValueStoreDir = (0, node_path_1.resolve)(client.keyValueStoresDirectory, entryNameOrId);
    try {
        // Check if directory exists
        await (0, promises_1.access)(keyValueStoreDir);
    }
    catch {
        return undefined;
    }
    // Access the key value store folder
    const directoryEntries = await (0, promises_1.opendir)(keyValueStoreDir);
    let id;
    let name;
    let createdAt = new Date();
    let accessedAt = new Date();
    let modifiedAt = new Date();
    const internalRecords = new Map();
    let hasSeenMetadataForEntry = false;
    for await (const entry of directoryEntries) {
        if (entry.isFile()) {
            if (entry.name === '__metadata__.json') {
                // we have found the store metadata file, build out information based on it
                const fileContent = await (0, promises_1.readFile)((0, node_path_1.resolve)(keyValueStoreDir, entry.name), 'utf8');
                if (!fileContent)
                    continue;
                const metadata = JSON.parse(fileContent);
                id = metadata.id;
                name = metadata.name;
                createdAt = new Date(metadata.createdAt);
                accessedAt = new Date(metadata.accessedAt);
                modifiedAt = new Date(metadata.modifiedAt);
                continue;
            }
            if (entry.name.includes('.__metadata__.')) {
                hasSeenMetadataForEntry = true;
                // This is an entry's metadata file, we can use it to create/extend the record
                const fileContent = await (0, promises_1.readFile)((0, node_path_1.resolve)(keyValueStoreDir, entry.name), 'utf8');
                if (!fileContent)
                    continue;
                const metadata = JSON.parse(fileContent);
                const newRecord = {
                    ...internalRecords.get(metadata.key),
                    ...metadata,
                };
                internalRecords.set(metadata.key, newRecord);
                continue;
            }
            // This is an entry in the store, we can use it to create/extend the record
            const fileContent = await (0, promises_1.readFile)((0, node_path_1.resolve)(keyValueStoreDir, entry.name));
            const fileExtension = (0, node_path_1.extname)(entry.name);
            const contentType = mime_types_1.default.contentType(entry.name) || 'text/plain';
            const extension = mime_types_1.default.extension(contentType);
            // This is kept for backwards compatibility / to ignore invalid JSON files
            if (contentType.includes('application/json')) {
                const stringifiedJson = fileContent.toString('utf8');
                try {
                    json5_1.default.parse(stringifiedJson);
                }
                catch {
                    utils_1.memoryStorageLog.warning(`Key-value entry "${entry.name}" for store ${entryNameOrId} has invalid JSON content and will be ignored from the store.`);
                    continue;
                }
            }
            const nameSplit = entry.name.split('.');
            if (fileExtension) {
                nameSplit.pop();
            }
            const key = nameSplit.join('.');
            const newRecord = {
                key,
                extension,
                contentType,
                ...internalRecords.get(key),
            };
            internalRecords.set(key, newRecord);
        }
    }
    if (id === undefined && name === undefined) {
        const isUuid = uuidRegex.test(entryNameOrId);
        if (isUuid) {
            id = entryNameOrId;
        }
        else {
            name = entryNameOrId;
        }
    }
    const newClient = new key_value_store_1.KeyValueStoreClient({
        baseStorageDirectory: client.keyValueStoresDirectory,
        client,
        id,
        name,
    });
    // Overwrite properties
    newClient.accessedAt = accessedAt;
    newClient.createdAt = createdAt;
    newClient.modifiedAt = modifiedAt;
    for (const [key, record] of internalRecords) {
        // We create a file system entry instead of possibly making an in-memory one to allow the pre-included data to be used on demand
        const entry = new fs_2.KeyValueFileSystemEntry({ persistStorage: true, storeDirectory: keyValueStoreDir, writeMetadata: hasSeenMetadataForEntry });
        // eslint-disable-next-line dot-notation
        entry['rawRecord'] = { ...record };
        // eslint-disable-next-line dot-notation
        entry['filePath'] = (0, node_path_1.resolve)(keyValueStoreDir, `${record.key}.${record.extension}`);
        // eslint-disable-next-line dot-notation
        entry['fileMetadataPath'] = (0, node_path_1.resolve)(keyValueStoreDir, `${record.key}.__metadata__.json`);
        // eslint-disable-next-line dot-notation
        newClient['keyValueEntries'].set(key, entry);
    }
    client.keyValueStoresHandled.push(newClient);
    return newClient;
}
exports.findOrCacheKeyValueStoreByPossibleId = findOrCacheKeyValueStoreByPossibleId;
async function findRequestQueueByPossibleId(client, entryNameOrId) {
    // First check memory cache
    const found = client.requestQueuesHandled.find((store) => store.id === entryNameOrId || store.name?.toLowerCase() === entryNameOrId.toLowerCase());
    if (found) {
        return found;
    }
    const requestQueueDir = (0, node_path_1.resolve)(client.requestQueuesDirectory, entryNameOrId);
    try {
        // Check if directory exists
        await (0, promises_1.access)(requestQueueDir);
    }
    catch {
        return undefined;
    }
    // Access the request queue folder
    const directoryEntries = await (0, promises_1.opendir)(requestQueueDir);
    let id;
    let name;
    let createdAt = new Date();
    let accessedAt = new Date();
    let modifiedAt = new Date();
    let pendingRequestCount = 0;
    let handledRequestCount = 0;
    const entries = new Set();
    for await (const entry of directoryEntries) {
        if (entry.isFile()) {
            switch (entry.name) {
                case '__metadata__.json': {
                    // we have found the store metadata file, build out information based on it
                    const fileContent = await (0, promises_1.readFile)((0, node_path_1.resolve)(requestQueueDir, entry.name), 'utf8');
                    if (!fileContent)
                        continue;
                    const metadata = JSON.parse(fileContent);
                    id = metadata.id;
                    name = metadata.name;
                    createdAt = new Date(metadata.createdAt);
                    accessedAt = new Date(metadata.accessedAt);
                    modifiedAt = new Date(metadata.modifiedAt);
                    pendingRequestCount = metadata.pendingRequestCount;
                    handledRequestCount = metadata.handledRequestCount;
                    break;
                }
                default: {
                    const entryName = entry.name.split('.')[0];
                    entries.add(entryName);
                }
            }
        }
    }
    if (id === undefined && name === undefined) {
        const isUuid = uuidRegex.test(entryNameOrId);
        if (isUuid) {
            id = entryNameOrId;
        }
        else {
            name = entryNameOrId;
        }
    }
    const newClient = new request_queue_1.RequestQueueClient({
        baseStorageDirectory: client.requestQueuesDirectory,
        client,
        id,
        name,
    });
    // Overwrite properties
    newClient.accessedAt = accessedAt;
    newClient.createdAt = createdAt;
    newClient.modifiedAt = modifiedAt;
    newClient.pendingRequestCount = pendingRequestCount;
    newClient.handledRequestCount = handledRequestCount;
    for (const requestId of entries) {
        const entry = new fs_3.RequestQueueFileSystemEntry({
            persistStorage: true,
            requestId,
            storeDirectory: requestQueueDir,
        });
        // eslint-disable-next-line dot-notation
        newClient['requests'].set(requestId, entry);
    }
    client.requestQueuesHandled.push(newClient);
    return newClient;
}
exports.findRequestQueueByPossibleId = findRequestQueueByPossibleId;
/* eslint-disable import/first -- Fixing circulars */
const dataset_1 = require("./resource-clients/dataset");
const key_value_store_1 = require("./resource-clients/key-value-store");
const request_queue_1 = require("./resource-clients/request-queue");
//# sourceMappingURL=cache-helpers.js.map