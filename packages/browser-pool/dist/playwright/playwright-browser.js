"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaywrightBrowser = void 0;
const node_events_1 = require("node:events");
/**
 * Browser wrapper created to have consistent API with persistent and non-persistent contexts.
 */
class PlaywrightBrowser extends node_events_1.EventEmitter {
    constructor(options) {
        super();
        Object.defineProperty(this, "_browserContext", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_version", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_isConnected", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "_browserType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        const { browserContext, version } = options;
        this._browserContext = browserContext;
        this._version = version;
        this._browserContext.once('close', () => {
            this._isConnected = false;
            this.emit('disconnected');
        });
    }
    async close() {
        await this._browserContext.close();
    }
    contexts() {
        return [this._browserContext];
    }
    isConnected() {
        return this._isConnected;
    }
    version() {
        return this._version;
    }
    /** @internal */
    _setBrowserType(browserType) {
        this._browserType = browserType;
    }
    browserType() {
        return this._browserType;
    }
    async newPage(...args) {
        return this._browserContext.newPage(...args);
    }
    async newContext() {
        throw new Error('Function `newContext()` is not available in incognito mode');
    }
    async newBrowserCDPSession() {
        throw new Error('Function `newBrowserCDPSession()` is not available in incognito mode');
    }
    async startTracing() {
        throw new Error('Function `startTracing()` is not available in incognito mode');
    }
    async stopTracing() {
        throw new Error('Function `stopTracing()` is not available in incognito mode');
    }
}
exports.PlaywrightBrowser = PlaywrightBrowser;
//# sourceMappingURL=playwright-browser.js.map