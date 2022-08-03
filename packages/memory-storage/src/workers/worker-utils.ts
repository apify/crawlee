import log from '@apify/log';
import { ensureDir } from 'fs-extra';
import { rm, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { resolve } from 'node:path';
import { parentPort } from 'node:worker_threads';
import { lock } from 'proper-lockfile';
import type { WorkerDeleteEntryMessage, WorkerReceivedMessage, WorkerUpdateEntriesMessage, WorkerUpdateMetadataMessage } from '../utils';

const workerLog = log.child({ prefix: 'MemoryStorageWorker' });

export async function handleMessage(message: WorkerReceivedMessage & { messageId: string }) {
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

    parentPort?.postMessage({
        type: 'ack',
        messageId: message.messageId,
    });
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

async function lockAndWrite(filePath: string, data: unknown, stringify = true, retry = 10, timeout = 10): Promise<void> {
    try {
        const release = await lock(filePath, { realpath: false });
        await writeFile(filePath, stringify ? JSON.stringify(data, null, '\t') : data as Buffer);
        await release();
    } catch (e: any) {
        if (e.code === 'ELOCKED' && retry > 0) {
            await setTimeout(timeout);
            return lockAndWrite(filePath, data, stringify, retry - 1, timeout * 2);
        }
    }
}

async function updateItems(message: WorkerUpdateEntriesMessage) {
    // Ensure the directory for the entity exists
    const dir = message.entityDirectory;
    await ensureDir(dir);

    switch (message.entityType) {
        case 'requestQueues': {
            // Write the entry to the file
            const filePath = resolve(dir, `${message.data.id}.json`);
            await lockAndWrite(filePath, message.data);
            break;
        }
        case 'datasets': {
            // Save all the new items to the disk
            for (const [idx, data] of message.data) {
                const filePath = resolve(dir, `${idx}.json`);
                await lockAndWrite(filePath, data);
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
                        await lockAndWrite(
                            itemMetadataPath,
                            {
                                key: record.key,
                                contentType: record.contentType ?? 'unknown/no content type',
                                extension: record.extension,
                            },
                        );
                    }

                    await lockAndWrite(itemPath, record.value, false);

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
