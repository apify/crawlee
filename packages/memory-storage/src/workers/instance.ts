import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { WorkerReceivedMessage } from '../utils';
import { memoryStorageLog } from '../utils';
import { FileStorageWorkerEmulator } from './file-storage-worker-emulator';

let workerInstance: Worker | FileStorageWorkerEmulator;

export function sendWorkerMessage(message: WorkerReceivedMessage) {
    workerInstance.postMessage(message);
}

export function initWorkerIfNeeded() {
    if (workerInstance) {
        return;
    }

    process.on('exit', () => {
        void workerInstance.terminate();
    });

    const workerPath = resolve(__dirname, './file-storage-worker.js');
    const exists = existsSync(workerPath);

    if (exists) {
        workerInstance = new Worker(workerPath);
        workerInstance.unref();

        (workerInstance as Worker).once('exit', (code) => {
            memoryStorageLog.debug(`File storage worker exited with code ${code}`);
            initWorkerIfNeeded();
        });
    } else {
        workerInstance = new FileStorageWorkerEmulator();
    }
}
