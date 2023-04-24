"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_worker_threads_1 = require("node:worker_threads");
const worker_utils_1 = require("./worker-utils");
if (node_worker_threads_1.isMainThread || !node_worker_threads_1.parentPort) {
    throw new Error('This file should only be run in a worker thread!');
}
// Keep worker alive
setInterval(() => {
    node_worker_threads_1.parentPort.postMessage('ping');
}, 30000);
node_worker_threads_1.parentPort.on('message', async (message) => {
    await (0, worker_utils_1.handleMessage)(message);
});
//# sourceMappingURL=file-storage-worker.js.map