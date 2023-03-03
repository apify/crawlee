import log from '@apify/log';
import { ensureDir } from 'fs-extra';
import { writeFile as writeFileP } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { resolve } from 'node:path';
import { parentPort } from 'node:worker_threads';
import { lock } from 'proper-lockfile';
import { writeFile } from 'node:fs';
import type { WorkerReceivedMessage, WorkerUpdateMetadataMessage } from '../utils';

const workerLog = log.child({ prefix: 'MemoryStorageWorker' });

export async function handleMessage(message: WorkerReceivedMessage & { messageId: string }) {
    switch (message.action) {
        case 'update-metadata':
            await updateMetadata(message);
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
    // Skip writing the actual metadata file. This is done after ensuring the directory exists so we have the directory present
    if (!message.writeMetadata) {
        return;
    }

    // Ensure the directory for the entity exists
    const dir = message.entityDirectory;
    await ensureDir(dir);

    // Write the metadata to the file
    const filePath = resolve(dir, '__metadata__.json');
    await writeFileP(filePath, JSON.stringify(message.data, null, '\t'));
}

export async function lockAndWrite(filePath: string, data: unknown, stringify = true, retry = 10, timeout = 10): Promise<void> {
    try {
        const release = await lock(filePath, { realpath: false });
        await new Promise<void>((pResolve, reject) => {
            writeFile(filePath, stringify ? JSON.stringify(data, null, '\t') : data as Buffer, (err) => {
                if (err) {
                    reject(err);
                } else {
                    pResolve();
                }
            });
        });
        await release();
    } catch (e: any) {
        if (e.code === 'ELOCKED' && retry > 0) {
            await setTimeout(timeout);
            return lockAndWrite(filePath, data, stringify, retry - 1, timeout * 2);
        }
    }
}
