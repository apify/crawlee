"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseClient = void 0;
class BaseClient {
    constructor(id) {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.id = id;
    }
    throwOnNonExisting(clientType) {
        throw new Error(`${clientType} with id: ${this.id} does not exist.`);
    }
    throwOnDuplicateEntry(clientType, keyName, value) {
        throw new Error(`${clientType} with ${keyName}: ${value} already exists.`);
    }
}
exports.BaseClient = BaseClient;
//# sourceMappingURL=base-client.js.map