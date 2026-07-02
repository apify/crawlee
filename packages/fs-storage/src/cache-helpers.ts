import { access, opendir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

import type * as storage from '@crawlee/types';
import json5 from 'json5';
import mimeTypes from 'mime-types';

import { DatasetFileSystemEntry } from './fs/dataset/fs.js';
import { KeyValueFileSystemEntry } from './fs/key-value-store/fs.js';
import { RequestQueueFileSystemEntry } from './fs/request-queue/fs.js';
import { type FileSystemStorageClient } from './file-system-storage.js';

const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * A named storage is persisted in a directory named after its *name*, while its *id* lives inside
 * that directory's `__metadata__.json`. Looking a storage up by id therefore cannot rely on the
 * directory name — this scans the sibling directories under `baseDirectory` and returns the name of
 * the directory whose metadata `id` matches, so callers can resolve `Dataset.open("<id>")` (and
 * `storageExists("<id>")`) for a storage that was originally opened by name.
 */
async function resolveDirNameByMetadataId(baseDirectory: string, id: string): Promise<string | undefined> {
    let directories;
    try {
        directories = await opendir(baseDirectory);
    } catch {
        return undefined;
    }

    for await (const directory of directories) {
        if (!directory.isDirectory()) {
            continue;
        }

        try {
            const fileContent = await readFile(resolve(baseDirectory, directory.name, '__metadata__.json'), 'utf8');
            if ((JSON.parse(fileContent) as { id?: string }).id === id) {
                return directory.name;
            }
        } catch {
            // No metadata file (or unreadable) — this directory can't be matched by id.
        }
    }

    return undefined;
}

export async function findOrCacheDatasetByPossibleId(client: FileSystemStorageClient, entryNameOrId: string) {
    // First check memory cache — match by id, name, or directoryName (which covers alias lookups)
    const found = client.datasetClientCache.find(
        (store) =>
            store.id === entryNameOrId ||
            store.name?.toLowerCase() === entryNameOrId.toLowerCase() ||
            store.directoryName.toLowerCase() === entryNameOrId.toLowerCase(),
    );

    if (found) {
        return found;
    }

    let datasetDir = resolve(client.datasetsDirectory, entryNameOrId);

    try {
        // Check if directory exists
        await access(datasetDir);
    } catch {
        // No directory named after the string — it may be an id of a storage opened by name, whose
        // directory is named after the name. Fall back to matching the id inside the metadata files.
        const dirName = await resolveDirNameByMetadataId(client.datasetsDirectory, entryNameOrId);
        if (dirName === undefined) {
            return undefined;
        }
        datasetDir = resolve(client.datasetsDirectory, dirName);
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
        const entry = new DatasetFileSystemEntry({
            storeDirectory: datasetDir,
            entityId: entryId,
        });

        // eslint-disable-next-line dot-notation
        newClient['datasetEntries'].set(entryId, entry);
    }

    client.datasetClientCache.push(newClient);

    return newClient;
}

export async function findOrCacheKeyValueStoreByPossibleId(client: FileSystemStorageClient, entryNameOrId: string) {
    // First check memory cache — match by id, name, or directoryName (which covers alias lookups)
    const found = client.keyValueStoreCache.find(
        (store) =>
            store.id === entryNameOrId ||
            store.name?.toLowerCase() === entryNameOrId.toLowerCase() ||
            store.directoryName.toLowerCase() === entryNameOrId.toLowerCase(),
    );

    if (found) {
        return found;
    }

    let keyValueStoreDir = resolve(client.keyValueStoresDirectory, entryNameOrId);

    try {
        // Check if directory exists
        await access(keyValueStoreDir);
    } catch {
        // No directory named after the string — it may be an id of a storage opened by name, whose
        // directory is named after the name. Fall back to matching the id inside the metadata files.
        const dirName = await resolveDirNameByMetadataId(client.keyValueStoresDirectory, entryNameOrId);
        if (dirName === undefined) {
            return undefined;
        }
        keyValueStoreDir = resolve(client.keyValueStoresDirectory, dirName);
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
                    client.logger?.warning(
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
        const entry = new KeyValueFileSystemEntry({
            storeDirectory: keyValueStoreDir,
            writeMetadata: hasSeenMetadataForEntry,
            logger: client.logger,
        });

        // eslint-disable-next-line dot-notation
        entry['rawRecord'] = { ...record };
        // eslint-disable-next-line dot-notation
        entry['filePath'] = resolve(keyValueStoreDir, `${record.key}.${record.extension}`);
        // eslint-disable-next-line dot-notation
        entry['fileMetadataPath'] = resolve(keyValueStoreDir, `${record.key}.__metadata__.json`);

        // eslint-disable-next-line dot-notation
        newClient['keyValueEntries'].set(key, entry);
    }

    client.keyValueStoreCache.push(newClient);

    return newClient;
}

export async function findRequestQueueByPossibleId(client: FileSystemStorageClient, entryNameOrId: string) {
    // First check memory cache — match by id, name, or directoryName (which covers alias lookups)
    const found = client.requestQueueCache.find(
        (store) =>
            store.id === entryNameOrId ||
            store.name?.toLowerCase() === entryNameOrId.toLowerCase() ||
            store.directoryName.toLowerCase() === entryNameOrId.toLowerCase(),
    );

    if (found) {
        return found;
    }

    let requestQueueDir = resolve(client.requestQueuesDirectory, entryNameOrId);

    try {
        // Check if directory exists
        await access(requestQueueDir);
    } catch {
        // No directory named after the string — it may be an id of a storage opened by name, whose
        // directory is named after the name. Fall back to matching the id inside the metadata files.
        const dirName = await resolveDirNameByMetadataId(client.requestQueuesDirectory, entryNameOrId);
        if (dirName === undefined) {
            return undefined;
        }
        requestQueueDir = resolve(client.requestQueuesDirectory, dirName);
    }

    // Access the request queue folder
    const directoryEntries = await opendir(requestQueueDir);

    let id: string | undefined;
    let name: string | undefined;
    let createdAt = new Date();
    let accessedAt = new Date();
    let modifiedAt = new Date();
    const entries = new Set<string>();
    let forefrontRequestIds: string[] = [];

    // The request counts are derived from the request files actually present on disk rather than read
    // from the metadata file: metadata is only persisted when `writeMetadata` is enabled (off by
    // default), whereas request files are always persisted. Trusting the metadata counts would reset
    // them to 0 on reload whenever `writeMetadata` is off, even though the requests survive on disk.
    let pendingRequestCount = 0;
    let handledRequestCount = 0;

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
                    forefrontRequestIds = (metadata as any)?.forefrontRequestIds ?? [];

                    break;
                }
                default: {
                    // Skip non-JSON and files that start with a dot
                    if (entry.name.startsWith('.') || !entry.name.endsWith('.json')) {
                        continue;
                    }

                    const entryName = entry.name.split('.')[0];

                    try {
                        // Try parsing the file to ensure it's even valid to begin with
                        const fileContent = await readFile(resolve(requestQueueDir, entry.name), 'utf8');
                        const parsed = JSON.parse(fileContent) as { orderNo?: number | null };

                        entries.add(entryName);

                        // A handled request has `orderNo === null`; anything else is still pending.
                        if (parsed.orderNo === null) {
                            handledRequestCount += 1;
                        } else {
                            pendingRequestCount += 1;
                        }
                    } catch {
                        client.logger?.warning(
                            `Request queue entry "${entry.name}" for store ${entryNameOrId} has invalid JSON content and will be ignored from the store.`,
                        );
                    }
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
    // Drop any persisted forefront ids whose request file is missing or unparseable on disk (and was
    // therefore not added to `entries`). Keeping them would leave a dangling id in `forefrontRequestIds`
    // that `listPendingHead` would resolve to a missing request and dereference as `undefined`.
    // @ts-expect-error - Assigning to private property
    newClient.forefrontRequestIds = forefrontRequestIds.filter((requestId) => entries.has(requestId));

    for (const requestId of entries) {
        const entry = new RequestQueueFileSystemEntry({
            requestId,
            storeDirectory: requestQueueDir,
        });

        // eslint-disable-next-line dot-notation
        newClient['requests'].set(requestId, entry);
    }

    client.requestQueueCache.push(newClient);

    return newClient;
}

/* eslint-disable import/first -- Fixing circulars */
import { DatasetClient } from './resource-clients/dataset.js';
import type { InternalKeyRecord } from './resource-clients/key-value-store.js';
import { KeyValueStoreClient } from './resource-clients/key-value-store.js';
import { RequestQueueClient } from './resource-clients/request-queue.js';
