"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWorkerIfNeeded = exports.sendWorkerMessage = exports.promiseMap = void 0;
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const node_worker_threads_1 = require("node:worker_threads");
const utils_1 = require("../utils");
const file_storage_worker_emulator_1 = require("./file-storage-worker-emulator");
// eslint-disable-next-line import/no-mutable-exports
let workerInstance;
exports.promiseMap = new Map();
function sendWorkerMessage(message) {
    const id = (0, node_crypto_1.randomUUID)();
    let promiseResolve;
    const promise = new Promise((res) => {
        promiseResolve = res;
    });
    exports.promiseMap.set(id, {
        promise,
        resolve: promiseResolve,
    });
    void workerInstance.postMessage({
        ...message,
        messageId: id,
    });
}
exports.sendWorkerMessage = sendWorkerMessage;
function initWorkerIfNeeded() {
    if (workerInstance) {
        return;
    }
    process.on('exit', () => {
        void workerInstance.terminate();
    });
    const workerPath = (0, node_path_1.resolve)(__dirname, './file-storage-worker.js');
    // vladfrangu: The worker is temporarily disabled due to node/v8 having internal bugs that sometimes cause hard crashes when the process exits.
    // const exists = existsSync(workerPath);
    const exists = false;
    if (exists) {
        workerInstance = new node_worker_threads_1.Worker(workerPath);
        workerInstance.unref();
        workerInstance.once('exit', (code) => {
            utils_1.memoryStorageLog.debug(`File storage worker exited with code ${code}`);
            initWorkerIfNeeded();
        });
        workerInstance.on('message', (message) => {
            if (message.type !== 'ack') {
                return;
            }
            exports.promiseMap.get(message.messageId)?.resolve();
            exports.promiseMap.delete(message.messageId);
        });
    }
    else {
        workerInstance = new file_storage_worker_emulator_1.FileStorageWorkerEmulator();
    }
}
exports.initWorkerIfNeeded = initWorkerIfNeeded;
//# sourceMappingURL=instance.js.map