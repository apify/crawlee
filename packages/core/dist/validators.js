"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validators = void 0;
const tslib_1 = require("tslib");
const ow_1 = tslib_1.__importDefault(require("ow"));
/** @internal */
exports.validators = {
    // Naming it browser page for future proofing with Playwright
    browserPage: (value) => ({
        validator: ow_1.default.isValid(value, ow_1.default.object.hasKeys('goto', 'evaluate', '$', 'on')),
        message: (label) => `Expected argument '${label}' to be a Puppeteer Page, got something else.`,
    }),
    proxyConfiguration: (value) => ({
        validator: ow_1.default.isValid(value, ow_1.default.object.hasKeys('newUrl', 'newProxyInfo')),
        message: (label) => `Expected argument '${label}' to be a ProxyConfiguration, got something else.`,
    }),
    requestList: (value) => ({
        validator: ow_1.default.isValid(value, ow_1.default.object.hasKeys('fetchNextRequest', 'persistState')),
        message: (label) => `Expected argument '${label}' to be a RequestList, got something else.`,
    }),
    requestQueue: (value) => ({
        validator: ow_1.default.isValid(value, ow_1.default.object.hasKeys('fetchNextRequest', 'addRequest')),
        message: (label) => `Expected argument '${label}' to be a RequestQueue, got something else.`,
    }),
};
//# sourceMappingURL=validators.js.map