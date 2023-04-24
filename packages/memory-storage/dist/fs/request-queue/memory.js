"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestQueueMemoryEntry = void 0;
class RequestQueueMemoryEntry {
    constructor() {
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    async get() {
        return this.data;
    }
    update(data) {
        this.data = data;
    }
    delete() {
        // No-op
    }
}
exports.RequestQueueMemoryEntry = RequestQueueMemoryEntry;
//# sourceMappingURL=memory.js.map