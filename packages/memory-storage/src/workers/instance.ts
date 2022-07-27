import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { WorkerReceivedMessage } from '../utils';
import { memoryStorageLog } from '../utils';
import { FileStorageWorkerEmulator } from './file-storage-worker-emulator';

// eslint-disable-next-line import/no-mutable-exports
let workerInstance: Worker | FileStorageWorkerEmulator;

export const promiseMap: Map<string, {
    promise: Promise<void>;
    resolve: () => void;
}> = new Map();

export function sendWorkerMessage(message: WorkerReceivedMessage) {
    const id = randomUUID();

    let promiseResolve: () => void;
    const promise = new Promise<void>((res) => {
        promiseResolve = res;
    });

    promiseMap.set(id, {
        promise,
        resolve: promiseResolve!,
    });

    void workerInstance.postMessage({
        ...message,
        messageId: id,
    });
}

export function initWorkerIfNeeded() {
    if (workerInstance) {
        return;
    }

    process.on('exit', () => {
        void workerInstance.terminate();
    });

    const workerPath = resolve(__dirname, './file-storage-worker.js');
    // vladfrangu: The worker is temporarily disabled due to node/v8 having internal bugs that sometimes cause hard crashes when the process exits.
    // const exists = existsSync(workerPath);
    const exists = false;

    if (exists) {
        workerInstance = new Worker(workerPath);
        workerInstance.unref();

        (workerInstance as Worker).once('exit', (code) => {
            memoryStorageLog.debug(`File storage worker exited with code ${code}`);
            initWorkerIfNeeded();
        });

        (workerInstance as Worker).on('message', (message: { messageId: string; type: 'ack' }) => {
            if (message.type !== 'ack') {
                return;
            }

            promiseMap.get(message.messageId)?.resolve();
            promiseMap.delete(message.messageId);
        });
    } else {
        workerInstance = new FileStorageWorkerEmulator();
    }
}
