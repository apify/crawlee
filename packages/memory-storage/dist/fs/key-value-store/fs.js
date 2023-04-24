"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyValueFileSystemEntry = void 0;
const fs_extra_1 = require("fs-extra");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const win32_1 = require("node:path/win32");
const async_queue_1 = require("@sapphire/async-queue");
const utils_1 = require("../../utils");
const worker_utils_1 = require("../../workers/worker-utils");
class KeyValueFileSystemEntry {
    constructor(options) {
        Object.defineProperty(this, "storeDirectory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "writeMetadata", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "filePath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "fileMetadataPath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rawRecord", {
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
        this.storeDirectory = options.storeDirectory;
        this.writeMetadata = options.writeMetadata;
    }
    async get() {
        await this.fsQueue.wait();
        let file;
        try {
            file = await (0, promises_1.readFile)(this.filePath);
        }
        catch {
            try {
                // Try without extension
                file = await (0, promises_1.readFile)((0, node_path_1.resolve)(this.storeDirectory, this.rawRecord.key));
                utils_1.memoryStorageLog.warning([
                    `Key-value entry "${this.rawRecord.key}" for store ${(0, win32_1.basename)(this.storeDirectory)} does not have a file extension, assuming it as text.`,
                    'If you want to have correct interpretation of the file, you should add a file extension to the entry.',
                ].join('\n'));
                file = file.toString('utf-8');
            }
            catch {
                // This is impossible to happen, but just in case
                throw new Error(`Could not find file at ${this.filePath}`);
            }
        }
        finally {
            this.fsQueue.shift();
        }
        return {
            ...this.rawRecord,
            value: file,
        };
    }
    async update(data) {
        await this.fsQueue.wait();
        this.filePath ?? (this.filePath = (0, node_path_1.resolve)(this.storeDirectory, `${data.key}.${data.extension}`));
        this.fileMetadataPath ?? (this.fileMetadataPath = (0, node_path_1.resolve)(this.storeDirectory, `${data.key}.__metadata__.json`));
        const { value, ...rest } = data;
        this.rawRecord = rest;
        try {
            await (0, fs_extra_1.ensureDir)((0, node_path_1.dirname)(this.filePath));
            await (0, worker_utils_1.lockAndWrite)(this.filePath, value, false);
            if (this.writeMetadata) {
                await (0, worker_utils_1.lockAndWrite)(this.fileMetadataPath, JSON.stringify(rest), true);
            }
        }
        finally {
            this.fsQueue.shift();
        }
    }
    async delete() {
        await this.fsQueue.wait();
        await (0, promises_1.rm)(this.filePath, { force: true });
        await (0, promises_1.rm)(this.fileMetadataPath, { force: true });
        this.fsQueue.shift();
    }
}
exports.KeyValueFileSystemEntry = KeyValueFileSystemEntry;
//# sourceMappingURL=fs.js.map