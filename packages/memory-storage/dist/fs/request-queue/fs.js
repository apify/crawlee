"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestQueueFileSystemEntry = void 0;
const async_queue_1 = require("@sapphire/async-queue");
const fs_extra_1 = require("fs-extra");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const worker_utils_1 = require("../../workers/worker-utils");
class RequestQueueFileSystemEntry {
    constructor(options) {
        Object.defineProperty(this, "filePath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "fsQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new async_queue_1.AsyncQueue()
        });
        this.filePath = (0, node_path_1.resolve)(options.storeDirectory, `${options.requestId}.json`);
    }
    async get() {
        await this.fsQueue.wait();
        try {
            return JSON.parse(await (0, promises_1.readFile)(this.filePath, 'utf-8'));
        }
        finally {
            this.fsQueue.shift();
        }
    }
    async update(data) {
        await this.fsQueue.wait();
        try {
            await (0, fs_extra_1.ensureDir)((0, node_path_1.dirname)(this.filePath));
            await (0, worker_utils_1.lockAndWrite)(this.filePath, data);
        }
        finally {
            this.fsQueue.shift();
        }
    }
    async delete() {
        await this.fsQueue.wait();
        await (0, promises_1.rm)(this.filePath, { force: true });
        this.fsQueue.shift();
    }
}
exports.RequestQueueFileSystemEntry = RequestQueueFileSystemEntry;
//# sourceMappingURL=fs.js.map