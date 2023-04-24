"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lockAndWrite = exports.handleMessage = void 0;
const tslib_1 = require("tslib");
const log_1 = tslib_1.__importDefault(require("@apify/log"));
const fs_extra_1 = require("fs-extra");
const promises_1 = require("node:fs/promises");
const promises_2 = require("node:timers/promises");
const node_path_1 = require("node:path");
const node_worker_threads_1 = require("node:worker_threads");
const proper_lockfile_1 = require("proper-lockfile");
const node_fs_1 = require("node:fs");
const workerLog = log_1.default.child({ prefix: 'MemoryStorageWorker' });
async function handleMessage(message) {
    switch (message.action) {
        case 'update-metadata':
            await updateMetadata(message);
            break;
        default:
            // We're keeping this to make eslint happy + in the event we add a new action without adding checks for it
            // we should be aware of them
            workerLog.warning(`Unknown worker message action ${message.action}`);
    }
    node_worker_threads_1.parentPort?.postMessage({
        type: 'ack',
        messageId: message.messageId,
    });
}
exports.handleMessage = handleMessage;
async function updateMetadata(message) {
    // Skip writing the actual metadata file. This is done after ensuring the directory exists so we have the directory present
    if (!message.writeMetadata) {
        return;
    }
    // Ensure the directory for the entity exists
    const dir = message.entityDirectory;
    await (0, fs_extra_1.ensureDir)(dir);
    // Write the metadata to the file
    const filePath = (0, node_path_1.resolve)(dir, '__metadata__.json');
    await (0, promises_1.writeFile)(filePath, JSON.stringify(message.data, null, '\t'));
}
async function lockAndWrite(filePath, data, stringify = true, retry = 10, timeout = 10) {
    try {
        const release = await (0, proper_lockfile_1.lock)(filePath, { realpath: false });
        await new Promise((pResolve, reject) => {
            (0, node_fs_1.writeFile)(filePath, stringify ? JSON.stringify(data, null, '\t') : data, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    pResolve();
                }
            });
        });
        await release();
    }
    catch (e) {
        if (e.code === 'ELOCKED' && retry > 0) {
            await (0, promises_2.setTimeout)(timeout);
            return lockAndWrite(filePath, data, stringify, retry - 1, timeout * 2);
        }
    }
}
exports.lockAndWrite = lockAndWrite;
//# sourceMappingURL=worker-utils.js.map