"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyValueMemoryEntry = void 0;
class KeyValueMemoryEntry {
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
exports.KeyValueMemoryEntry = KeyValueMemoryEntry;
//# sourceMappingURL=memory.js.map