"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LaunchContext = void 0;
class LaunchContext {
    constructor(options) {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "browserPlugin", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "launchOptions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "useIncognitoPages", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "experimentalContainers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "userDataDir", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_proxyUrl", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_reservedFieldNames", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: [...Reflect.ownKeys(this), 'extend']
        });
        Object.defineProperty(this, "fingerprint", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        const { id, browserPlugin, launchOptions, proxyUrl, useIncognitoPages, experimentalContainers, userDataDir = '', } = options;
        this.id = id;
        this.browserPlugin = browserPlugin;
        this.launchOptions = launchOptions;
        this.useIncognitoPages = useIncognitoPages ?? false;
        this.experimentalContainers = experimentalContainers ?? false;
        this.userDataDir = userDataDir;
        this._proxyUrl = proxyUrl;
    }
    /**
     * Extend the launch context with any extra fields.
     * This is useful to keep state information relevant
     * to the browser being launched. It ensures that
     * no internal fields are overridden and should be
     * used instead of property assignment.
     */
    extend(fields) {
        Object.entries(fields).forEach(([key, value]) => {
            if (this._reservedFieldNames.includes(key)) {
                throw new Error(`Cannot extend LaunchContext with key: ${key}, because it's reserved.`);
            }
            else {
                Reflect.set(this, key, value);
            }
        });
    }
    /**
     * Sets a proxy URL for the browser.
     * Use `undefined` to unset existing proxy URL.
     */
    set proxyUrl(url) {
        if (!url) {
            return;
        }
        const urlInstance = new URL(url);
        urlInstance.pathname = '/';
        urlInstance.search = '';
        urlInstance.hash = '';
        // https://www.chromium.org/developers/design-documents/network-settings/#command-line-options-for-proxy-settings
        this._proxyUrl = urlInstance.href.slice(0, -1);
    }
    /**
     * Returns the proxy URL of the browser.
     */
    get proxyUrl() {
        return this._proxyUrl;
    }
}
exports.LaunchContext = LaunchContext;
//# sourceMappingURL=launch-context.js.map