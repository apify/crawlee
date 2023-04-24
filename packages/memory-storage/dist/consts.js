"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_API_PARAM_LIMIT = exports.StorageTypes = exports.REQUEST_ID_LENGTH = void 0;
/**
 * Length of id property of a Request instance in characters.
 */
exports.REQUEST_ID_LENGTH = 15;
/**
 * Types of all emulated storages (currently used for warning messages only).
 */
var StorageTypes;
(function (StorageTypes) {
    StorageTypes["RequestQueue"] = "Request queue";
    StorageTypes["KeyValueStore"] = "Key-value store";
    StorageTypes["Dataset"] = "Dataset";
})(StorageTypes = exports.StorageTypes || (exports.StorageTypes = {}));
;
/**
 * Except in dataset items, the default limit for API results is 1000.
 */
exports.DEFAULT_API_PARAM_LIMIT = 1000;
//# sourceMappingURL=consts.js.map