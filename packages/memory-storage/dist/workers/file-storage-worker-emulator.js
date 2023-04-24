"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileStorageWorkerEmulator = void 0;
const instance_1 = require("./instance");
const worker_utils_1 = require("./worker-utils");
class FileStorageWorkerEmulator {
    async postMessage(value) {
        await (0, worker_utils_1.handleMessage)(value);
        instance_1.promiseMap.get(value.messageId)?.resolve();
        instance_1.promiseMap.delete(value.messageId);
    }
    terminate() { }
    unref() { }
}
exports.FileStorageWorkerEmulator = FileStorageWorkerEmulator;
//# sourceMappingURL=file-storage-worker-emulator.js.map