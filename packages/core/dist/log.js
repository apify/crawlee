"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggerText = exports.LoggerJson = exports.Logger = exports.LogLevel = exports.Log = exports.log = void 0;
const tslib_1 = require("tslib");
const log_1 = tslib_1.__importStar(require("@apify/log"));
exports.log = log_1.default;
Object.defineProperty(exports, "Log", { enumerable: true, get: function () { return log_1.Log; } });
Object.defineProperty(exports, "LogLevel", { enumerable: true, get: function () { return log_1.LogLevel; } });
Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return log_1.Logger; } });
Object.defineProperty(exports, "LoggerJson", { enumerable: true, get: function () { return log_1.LoggerJson; } });
Object.defineProperty(exports, "LoggerText", { enumerable: true, get: function () { return log_1.LoggerText; } });
//# sourceMappingURL=log.js.map