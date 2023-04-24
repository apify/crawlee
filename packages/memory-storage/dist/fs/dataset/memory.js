"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatasetMemoryEntry = void 0;
class DatasetMemoryEntry {
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
exports.DatasetMemoryEntry = DatasetMemoryEntry;
//# sourceMappingURL=memory.js.map