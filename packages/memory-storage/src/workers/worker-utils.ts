import log from '@apify/log';
import { ensureDir } from 'fs-extra';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { WorkerDeleteEntryMessage, WorkerReceivedMessage, WorkerUpdateEntriesMessage, WorkerUpdateMetadataMessage } from '../utils';

const workerLog = log.child({ prefix: 'MemoryStorageWorker' });

export async function handleMessage(message: WorkerReceivedMessage) {
    switch (message.action) {
        case 'update-metadata':
            await updateMetadata(message);
            break;
        case 'update-entries':
            await updateItems(message);
            break;
        case 'delete-entry':
            await deleteEntry(message);
            break;
        default:
            // We're keeping this to make eslint happy + in the event we add a new action without adding checks for it
            // we should be aware of them
            workerLog.warning(`Unknown worker message action ${(message as WorkerReceivedMessage).action}`);
    }
}

async function updateMetadata(message: WorkerUpdateMetadataMessage) {
    // Ensure the directory for the entity exists
    const dir = message.entityDirectory;
    await ensureDir(dir);

    // Skip writing the actual metadata file. This is done after ensuring the directory exists so we have the directory present
    if (!message.writeMetadata) {
        return;
    }

    // Write the metadata to the file
    const filePath = resolve(dir, '__metadata__.json');
    await writeFile(filePath, JSON.stringify(message.data, null, '\t'));
}

async function updateItems(message: WorkerUpdateEntriesMessage) {
    // Ensure the directory for the entity exists
    const dir = message.entityDirectory;
    await ensureDir(dir);

    switch (message.entityType) {
        case 'requestQueues': {
            // Write the entry to the file
            const filePath = resolve(dir, `${message.data.id}.json`);
            await writeFile(filePath, JSON.stringify(message.data, null, '\t'));
            break;
        }
        case 'datasets': {
            // Save all the new items to the disk
            for (const [idx, data] of message.data) {
                await writeFile(
                    resolve(dir, `${idx}.json`),
                    JSON.stringify(data, null, '\t'),
                );
            }

            break;
        }
        case 'keyValueStores': {
            // Create files for the record
            const { action, record } = message.data;

            const itemPath = resolve(dir, `${record.key}.${record.extension}`);
            const itemMetadataPath = resolve(dir, `${record.key}.__metadata__.json`);

            switch (action) {
                case 'delete':
                    await rm(itemPath, { force: true });
                    await rm(itemMetadataPath, { force: true });
                    break;
                case 'set': {
                    await rm(itemPath, { force: true });
                    await rm(itemMetadataPath, { force: true });

                    if (message.writeMetadata) {
                        const metadataPath = itemMetadataPath;

                        await writeFile(
                            metadataPath,
                            JSON.stringify(
                                {
                                    key: record.key,
                                    contentType: record.contentType ?? 'unknown/no content type',
                                    extension: record.extension,
                                },
                                null,
                                '\t',
                            ),
                        );
                    }

                    await writeFile(itemPath, record.value);

                    break;
                }
                default:
            }

            break;
        }
        default:
    }
}

async function deleteEntry(message: WorkerDeleteEntryMessage) {
    // Ensure the directory for the entity exists
    const dir = message.entityDirectory;
    await ensureDir(dir);

    switch (message.entityType) {
        case 'requestQueues': {
            // Write the entry to the file
            const filePath = resolve(dir, `${message.data.id}.json`);

            await rm(filePath, { force: true });

            break;
        }
        default:
    }
}
