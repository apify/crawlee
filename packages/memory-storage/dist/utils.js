"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryStorageLog = exports.isStream = exports.isBuffer = exports.uniqueKeyToRequestId = exports.purgeNullsFromObject = void 0;
const tslib_1 = require("tslib");
const log_1 = tslib_1.__importDefault(require("@apify/log"));
const shapeshift_1 = require("@sapphire/shapeshift");
const node_crypto_1 = require("node:crypto");
const consts_1 = require("./consts");
/**
 * Removes all properties with a null value
 * from the provided object.
 */
function purgeNullsFromObject(object) {
    if (object && typeof object === 'object' && !Array.isArray(object)) {
        for (const [key, value] of Object.entries(object)) {
            if (value === null)
                Reflect.deleteProperty(object, key);
        }
    }
    return object;
}
exports.purgeNullsFromObject = purgeNullsFromObject;
/**
 * Creates a standard request ID (same as Platform).
 */
function uniqueKeyToRequestId(uniqueKey) {
    const str = (0, node_crypto_1.createHash)('sha256')
        .update(uniqueKey)
        .digest('base64')
        .replace(/(\+|\/|=)/g, '');
    return str.length > consts_1.REQUEST_ID_LENGTH ? str.slice(0, consts_1.REQUEST_ID_LENGTH) : str;
}
exports.uniqueKeyToRequestId = uniqueKeyToRequestId;
;
function isBuffer(value) {
    try {
        shapeshift_1.s.union(shapeshift_1.s.instance(Buffer), shapeshift_1.s.instance(ArrayBuffer), shapeshift_1.s.typedArray()).parse(value);
        return true;
    }
    catch {
        return false;
    }
}
exports.isBuffer = isBuffer;
function isStream(value) {
    return typeof value === 'object' && value && ['on', 'pipe'].every((key) => key in value && typeof value[key] === 'function');
}
exports.isStream = isStream;
exports.memoryStorageLog = log_1.default.child({ prefix: 'MemoryStorage' });
//# sourceMappingURL=utils.js.map