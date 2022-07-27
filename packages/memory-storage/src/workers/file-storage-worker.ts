import { isMainThread, parentPort } from 'node:worker_threads';
import type { WorkerReceivedMessage } from '../utils';
import { handleMessage } from './worker-utils';

if (isMainThread || !parentPort) {
    throw new Error('This file should only be run in a worker thread!');
}

// Keep worker alive
setInterval(() => {
    parentPort!.postMessage('ping');
}, 30_000);

parentPort!.on('message', async (message: WorkerReceivedMessage & { messageId: string }) => {
    await handleMessage(message);
});
