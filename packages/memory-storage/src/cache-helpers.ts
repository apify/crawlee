import type * as storage from '@crawlee/types';
import { access, opendir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import mimeTypes from 'mime-types';
import type { InternalKeyRecord } from './resource-clients/key-value-store';
import type { InternalRequest } from './resource-clients/request-queue';
import type { MemoryStorage } from './memory-storage';
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
    const entries = new Map<string, storage.Dictionary>();
    let createdAt = new Date();
    let accessedAt = new Date();
    let modifiedAt = new Date();

    let hasSeenMetadataFile = false;

    for await (const entry of directoryEntries) {
        if (entry.isFile()) {
            if (entry.name === '__metadata__.json') {
                hasSeenMetadataFile = true;

                // we have found the store metadata file, build out information based on it
                const metadata = JSON.parse(await readFile(resolve(datasetDir, entry.name), 'utf8')) as storage.DatasetInfo;
                id = metadata.id;
                name = metadata.name;
                itemCount = metadata.itemCount;
                createdAt = new Date(metadata.createdAt);
                accessedAt = new Date(metadata.accessedAt);
                modifiedAt = new Date(metadata.modifiedAt);

                continue;
            }

            const entryContent = JSON.parse(await readFile(resolve(datasetDir, entry.name), 'utf8')) as storage.Dictionary;
            const entryName = entry.name.split('.')[0];

            entries.set(entryName, entryContent);

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

    for (const [entryId, content] of entries) {
        // eslint-disable-next-line dot-notation
        newClient['datasetEntries'].set(entryId, { ...content });
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
    const internalRecords = new Map<string, InternalKeyRecord>();

    for await (const entry of directoryEntries) {
        if (entry.isFile()) {
            if (entry.name === '__metadata__.json') {
                // we have found the store metadata file, build out information based on it
                const metadata = JSON.parse(await readFile(resolve(keyValueStoreDir, entry.name), 'utf8')) as storage.KeyValueStoreInfo;
                id = metadata.id;
                name = metadata.name;
                createdAt = new Date(metadata.createdAt);
                accessedAt = new Date(metadata.accessedAt);
                modifiedAt = new Date(metadata.modifiedAt);

                continue;
            }

            if (entry.name.includes('.__metadata__.')) {
                // This is an entry's metadata file, we can use it to create/extend the record
                const metadata = JSON.parse(await readFile(resolve(keyValueStoreDir, entry.name), 'utf8')) as Omit<InternalKeyRecord, 'value'>;

                const newRecord = {
                    ...internalRecords.get(metadata.key),
                    ...metadata,
                } as InternalKeyRecord;

                internalRecords.set(metadata.key, newRecord);

                continue;
            }

            const fileContent = await readFile(resolve(keyValueStoreDir, entry.name));
            const fileExtension = extname(entry.name);
            const contentType = mimeTypes.contentType(entry.name) || 'text/plain';
            const extension = mimeTypes.extension(contentType) as string;

            let finalFileContent: Buffer | string = fileContent;

            if (!fileExtension) {
                memoryStorageLog.warning([
                    `Key-value entry "${entry.name}" for store ${entryNameOrId} does not have a file extension, assuming it as text.`,
                    'If you want to have correct interpretation of the file, you should add a file extension to the entry.',
                ].join('\n'));
                finalFileContent = fileContent.toString('utf8');
            } else if (contentType.includes('application/json')) {
                const stringifiedJson = fileContent.toString('utf8');
                try {
                    // Try parsing the JSON ahead of time (not ideal but solves invalid files being loaded into stores)
                    JSON.parse(stringifiedJson);
                    finalFileContent = stringifiedJson;
                } catch {
                    memoryStorageLog.warning(
                        `Key-value entry "${entry.name}" for store ${entryNameOrId} has invalid JSON content and will be ignored from the store.`,
                    );
                    continue;
                }
            } else if (contentType.includes('text/plain')) {
                finalFileContent = fileContent.toString('utf8');
            }

            const nameSplit = entry.name.split('.');

            if (fileExtension) {
                nameSplit.pop();
            }

            const key = nameSplit.join('.');

            const newRecord: InternalKeyRecord = {
                key,
                extension,
                value: finalFileContent,
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
        // eslint-disable-next-line dot-notation
        newClient['keyValueEntries'].set(key, { ...record });
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
    const entries: InternalRequest[] = [];

    for await (const entry of directoryEntries) {
        if (entry.isFile()) {
            switch (entry.name) {
                case '__metadata__.json': {
                    // we have found the store metadata file, build out information based on it
                    const metadata = JSON.parse(await readFile(resolve(requestQueueDir, entry.name), 'utf8')) as storage.RequestQueueInfo;

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
                    const request = JSON.parse(await readFile(resolve(requestQueueDir, entry.name), 'utf8')) as InternalRequest;
                    entries.push(request);
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

    for (const entry of entries) {
        // eslint-disable-next-line dot-notation
        newClient['requests'].set(entry.id, entry);
    }

    client.requestQueuesHandled.push(newClient);

    return newClient;
}

/* eslint-disable import/first -- Fixing circulars */
import { DatasetClient } from './resource-clients/dataset';
import { KeyValueStoreClient } from './resource-clients/key-value-store';
import { RequestQueueClient } from './resource-clients/request-queue';
