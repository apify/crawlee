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
    } else {
        workerInstance = new FileStorageWorkerEmulator();
    }
}
