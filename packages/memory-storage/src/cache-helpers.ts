import type * as storage from '@crawlee/types';
import { access, opendir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import mimeTypes from 'mime-types';
import json5 from 'json5';
import type { InternalKeyRecord } from './resource-clients/key-value-store';
import type { MemoryStorage } from './memory-storage';
import { DatasetFileSystemEntry } from './fs/dataset/fs';
import { KeyValueFileSystemEntry } from './fs/key-value-store/fs';
import { RequestQueueFileSystemEntry } from './fs/request-queue/fs';
import { memoryStorageLog } from './utils';

const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export async function findOrCacheDatasetByPossibleId(client: MemoryStorage, entryNameOrId: string) {
    // First check memory cache
    const found = client.datasetClientsHandled.find((store) => store.id === entryNameOrId || store.name?.toLowerCase() === entryNameOrId.toLowerCase());

    if (found) {
        return found;
    }

    const datasetDir = resolve(client.datasetsDirectory, entryNameOrId);

    try {
        // Check if directory exists
        await access(datasetDir);
    } catch {
        return undefined;
    }

    // Access the dataset folder
    const directoryEntries = await opendir(datasetDir);

    let id: string | undefined;
    let name: string | undefined;
    let itemCount = 0;

    const entries = new Set<string>();

    let createdAt = new Date();
    let accessedAt = new Date();
    let modifiedAt = new Date();

    let hasSeenMetadataFile = false;

    for await (const entry of directoryEntries) {
        if (entry.isFile()) {
            if (entry.name === '__metadata__.json') {
                hasSeenMetadataFile = true;

                // we have found the store metadata file, build out information based on it
                const fileContent = await readFile(resolve(datasetDir, entry.name), 'utf8');
                if (!fileContent) continue;

                const metadata = JSON.parse(fileContent) as storage.DatasetInfo;
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
        } else {
            name = entryNameOrId;
        }
    }

    const newClient = new DatasetClient({
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
        const entry = new DatasetFileSystemEntry({ storeDirectory: datasetDir, entityId: entryId, persistStorage: true });

        // eslint-disable-next-line dot-notation
        newClient['datasetEntries'].set(entryId, entry);
    }

    client.datasetClientsHandled.push(newClient);

    return newClient;
}

export async function findOrCacheKeyValueStoreByPossibleId(client: MemoryStorage, entryNameOrId: string) {
    // First check memory cache
    const found = client.keyValueStoresHandled.find((store) => store.id === entryNameOrId || store.name?.toLowerCase() === entryNameOrId.toLowerCase());

    if (found) {
        return found;
    }

    const keyValueStoreDir = resolve(client.keyValueStoresDirectory, entryNameOrId);

    try {
        // Check if directory exists
        await access(keyValueStoreDir);
    } catch {
        return undefined;
    }

    // Access the key value store folder
    const directoryEntries = await opendir(keyValueStoreDir);

    let id: string | undefined;
    let name: string | undefined;
    let createdAt = new Date();
    let accessedAt = new Date();
    let modifiedAt = new Date();

    type FsRecord = Omit<InternalKeyRecord, 'value'>;
    const internalRecords = new Map<string, FsRecord>();
    let hasSeenMetadataForEntry = false;

    for await (const entry of directoryEntries) {
        if (entry.isFile()) {
            if (entry.name === '__metadata__.json') {
                // we have found the store metadata file, build out information based on it
                const fileContent = await readFile(resolve(keyValueStoreDir, entry.name), 'utf8');
                if (!fileContent) continue;

                const metadata = JSON.parse(fileContent) as storage.KeyValueStoreInfo;
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
                const fileContent = await readFile(resolve(keyValueStoreDir, entry.name), 'utf8');
                if (!fileContent) continue;

                const metadata = JSON.parse(fileContent) as FsRecord;

                const newRecord = {
                    ...internalRecords.get(metadata.key),
                    ...metadata,
                } as FsRecord;

                internalRecords.set(metadata.key, newRecord);

                continue;
            }

            // This is an entry in the store, we can use it to create/extend the record
            const fileContent = await readFile(resolve(keyValueStoreDir, entry.name));
            const fileExtension = extname(entry.name);
            const contentType = mimeTypes.contentType(entry.name) || 'text/plain';
            const extension = mimeTypes.extension(contentType) as string;

            // This is kept for backwards compatibility / to ignore invalid JSON files
            if (contentType.includes('application/json')) {
                const stringifiedJson = fileContent.toString('utf8');

                try {
                    json5.parse(stringifiedJson);
                } catch {
                    memoryStorageLog.warning(
                        `Key-value entry "${entry.name}" for store ${entryNameOrId} has invalid JSON content and will be ignored from the store.`,
                    );
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
            } satisfies FsRecord;

            internalRecords.set(key, newRecord);
        }
    }

    if (id === undefined && name === undefined) {
        const isUuid = uuidRegex.test(entryNameOrId);

        if (isUuid) {
            id = entryNameOrId;
        } else {
            name = entryNameOrId;
        }
    }

    const newClient = new KeyValueStoreClient({
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
        const entry = new KeyValueFileSystemEntry({ persistStorage: true, storeDirectory: keyValueStoreDir, writeMetadata: hasSeenMetadataForEntry });

        // eslint-disable-next-line dot-notation
        entry['rawRecord'] = { ...record };
        // eslint-disable-next-line dot-notation
        entry['filePath'] = resolve(keyValueStoreDir, `${record.key}.${record.extension}`);
        // eslint-disable-next-line dot-notation
        entry['fileMetadataPath'] = resolve(keyValueStoreDir, `${record.key}.__metadata__.json`);

        // eslint-disable-next-line dot-notation
        newClient['keyValueEntries'].set(key, entry);
    }

    client.keyValueStoresHandled.push(newClient);

    return newClient;
}

export async function findRequestQueueByPossibleId(client: MemoryStorage, entryNameOrId: string) {
    // First check memory cache
    const found = client.requestQueuesHandled.find((store) => store.id === entryNameOrId || store.name?.toLowerCase() === entryNameOrId.toLowerCase());

    if (found) {
        return found;
    }

    const requestQueueDir = resolve(client.requestQueuesDirectory, entryNameOrId);

    try {
        // Check if directory exists
        await access(requestQueueDir);
    } catch {
        return undefined;
    }

    // Access the request queue folder
    const directoryEntries = await opendir(requestQueueDir);

    let id: string | undefined;
    let name: string | undefined;
    let createdAt = new Date();
    let accessedAt = new Date();
    let modifiedAt = new Date();
    let pendingRequestCount = 0;
    let handledRequestCount = 0;
    const entries = new Set<string>();

    for await (const entry of directoryEntries) {
        if (entry.isFile()) {
            switch (entry.name) {
                case '__metadata__.json': {
                    // we have found the store metadata file, build out information based on it
                    const fileContent = await readFile(resolve(requestQueueDir, entry.name), 'utf8');
                    if (!fileContent) continue;

                    const metadata = JSON.parse(fileContent) as storage.RequestQueueInfo;

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
        } else {
            name = entryNameOrId;
        }
    }

    const newClient = new RequestQueueClient({
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
        const entry = new RequestQueueFileSystemEntry({
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

/* eslint-disable import/first -- Fixing circulars */
import { DatasetClient } from './resource-clients/dataset';
import { KeyValueStoreClient } from './resource-clients/key-value-store';
import { RequestQueueClient } from './resource-clients/request-queue';
