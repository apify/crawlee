"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatasetFileSystemEntry = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const fs_extra_1 = require("fs-extra");
const async_queue_1 = require("@sapphire/async-queue");
const worker_utils_1 = require("../../workers/worker-utils");
class DatasetFileSystemEntry {
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
        this.filePath = (0, node_path_1.resolve)(options.storeDirectory, `${options.entityId}.json`);
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
exports.DatasetFileSystemEntry = DatasetFileSystemEntry;
//# sourceMappingURL=fs.js.map