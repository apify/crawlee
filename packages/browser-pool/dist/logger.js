"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = void 0;
const tslib_1 = require("tslib");
const log_1 = tslib_1.__importDefault(require("@apify/log"));
exports.log = log_1.default.child({
    prefix: 'BrowserPool',
});
//# sourceMappingURL=logger.js.map