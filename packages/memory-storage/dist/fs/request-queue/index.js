"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRequestQueueStorageImplementation = void 0;
const fs_1 = require("./fs");
const memory_1 = require("./memory");
function createRequestQueueStorageImplementation(options) {
    if (options.persistStorage) {
        return new fs_1.RequestQueueFileSystemEntry(options);
    }
    return new memory_1.RequestQueueMemoryEntry();
}
exports.createRequestQueueStorageImplementation = createRequestQueueStorageImplementation;
//# sourceMappingURL=index.js.map