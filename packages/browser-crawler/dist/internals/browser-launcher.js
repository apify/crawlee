"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserLauncher = void 0;
const tslib_1 = require("tslib");
const node_os_1 = tslib_1.__importDefault(require("node:os"));
const node_fs_1 = tslib_1.__importDefault(require("node:fs"));
const ow_1 = tslib_1.__importDefault(require("ow"));
const basic_1 = require("@crawlee/basic");
const DEFAULT_VIEWPORT = {
    width: 1366,
    height: 768,
};
/**
 * Abstract class for creating browser launchers, such as `PlaywrightLauncher` and `PuppeteerLauncher`.
 * @ignore
 */
class BrowserLauncher {
    static requireLauncherOrThrow(launcher, apifyImageName) {
        try {
            return require(launcher); // eslint-disable-line
        }
        catch (err) {
            const e = err;
            if (e.code === 'MODULE_NOT_FOUND') {
                const msg = `Cannot find module '${launcher}'. Did you you install the '${launcher}' package?\n`
                    + `Make sure you have '${launcher}' in your package.json dependencies and in your package-lock.json, if you use it.`;
                if (process.env.APIFY_IS_AT_HOME) {
                    e.message = `${msg}\nOn the Apify platform, '${launcher}' can only be used with the ${apifyImageName} Docker image.`;
                }
            }
            throw err;
        }
    }
    /**
     * All `BrowserLauncher` parameters are passed via an launchContext object.
     */
    constructor(launchContext, config = basic_1.Configuration.getGlobalConfig()) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "launcher", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "proxyUrl", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "useChrome", {
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
        Object.defineProperty(this, "otherLaunchContextProps", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // to be provided by child classes;
        Object.defineProperty(this, "Plugin", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "userAgent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        const { launcher, proxyUrl, useChrome, userAgent, launchOptions = {}, ...otherLaunchContextProps } = launchContext;
        this._validateProxyUrlProtocol(proxyUrl);
        // those need to be reassigned otherwise they are {} in types
        this.launcher = launcher;
        this.proxyUrl = proxyUrl;
        this.useChrome = useChrome;
        this.userAgent = userAgent;
        this.launchOptions = launchOptions;
        this.otherLaunchContextProps = otherLaunchContextProps;
    }
    /**
     * @ignore
     */
    createBrowserPlugin() {
        return new this.Plugin(this.launcher, {
            proxyUrl: this.proxyUrl,
            launchOptions: this.createLaunchOptions(),
            ...this.otherLaunchContextProps,
        });
    }
    /**
     * Launches a browser instance based on the plugin.
     * @returns Browser instance.
     */
    launch() {
        const plugin = this.createBrowserPlugin();
        const context = plugin.createLaunchContext();
        return plugin.launch(context);
    }
    createLaunchOptions() {
        const launchOptions = {
            args: [],
            defaultViewport: DEFAULT_VIEWPORT,
            ...this.launchOptions,
        };
        if (this.config.get('disableBrowserSandbox')) {
            launchOptions.args.push('--no-sandbox');
        }
        if (this.userAgent) {
            launchOptions.args.push(`--user-agent=${this.userAgent}`);
        }
        if (launchOptions.headless == null) {
            launchOptions.headless = this._getDefaultHeadlessOption();
        }
        if (this.useChrome && !launchOptions.executablePath) {
            launchOptions.executablePath = this._getChromeExecutablePath();
        }
        return launchOptions;
    }
    _getDefaultHeadlessOption() {
        return this.config.get('headless') && !this.config.get('xvfb', false);
    }
    _getChromeExecutablePath() {
        return this.config.get('chromeExecutablePath', this._getTypicalChromeExecutablePath());
    }
    /**
     * Gets a typical path to Chrome executable, depending on the current operating system.
     */
    _getTypicalChromeExecutablePath() {
        /**
         * Returns path of Chrome executable by its OS environment variable to deal with non-english language OS.
         * Taking also into account the old [chrome 380177 issue](https://bugs.chromium.org/p/chromium/issues/detail?id=380177).
         *
         * @ignore
         */
        const getWin32Path = () => {
            let chromeExecutablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
            const path00 = `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`;
            const path86 = `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`;
            if (node_fs_1.default.existsSync(path00)) {
                chromeExecutablePath = path00;
            }
            else if (node_fs_1.default.existsSync(path86)) {
                chromeExecutablePath = path86;
            }
            return chromeExecutablePath;
        };
        switch (node_os_1.default.platform()) {
            case 'darwin':
                return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            case 'win32':
                return getWin32Path();
            default:
                return '/usr/bin/google-chrome';
        }
    }
    _validateProxyUrlProtocol(proxyUrl) {
        if (!proxyUrl)
            return;
        if (!/^(http|https|socks4|socks5)/i.test(proxyUrl)) {
            throw new Error(`Invalid "proxyUrl". Unsupported protocol: ${proxyUrl}.`);
        }
        const url = new URL(proxyUrl);
        if (url.username || url.password) {
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                throw new Error('Invalid "proxyUrl" option: authentication is only supported for HTTP proxy type.');
            }
        }
    }
}
Object.defineProperty(BrowserLauncher, "optionsShape", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        proxyUrl: ow_1.default.optional.string.url,
        useChrome: ow_1.default.optional.boolean,
        useIncognitoPages: ow_1.default.optional.boolean,
        experimentalContainers: ow_1.default.optional.boolean,
        userDataDir: ow_1.default.optional.string,
        launchOptions: ow_1.default.optional.object,
        userAgent: ow_1.default.optional.string,
    }
});
exports.BrowserLauncher = BrowserLauncher;
//# sourceMappingURL=browser-launcher.js.map