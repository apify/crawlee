"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaywrightPlugin = void 0;
const tslib_1 = require("tslib");
const os_1 = tslib_1.__importDefault(require("os"));
const fs_1 = tslib_1.__importDefault(require("fs"));
const net_1 = tslib_1.__importDefault(require("net"));
const path_1 = tslib_1.__importDefault(require("path"));
const playwright_browser_1 = require("./playwright-browser");
const playwright_controller_1 = require("./playwright-controller");
const browser_plugin_1 = require("../abstract-classes/browser-plugin");
const logger_1 = require("../logger");
const proxy_server_1 = require("../proxy-server");
const anonymize_proxy_1 = require("../anonymize-proxy");
const container_proxy_server_1 = require("../container-proxy-server");
const load_firefox_addon_1 = require("./load-firefox-addon");
const getFreePort = async () => {
    return new Promise((resolve, reject) => {
        const server = net_1.default.createServer().once('error', reject).listen(() => {
            resolve(server.address().port);
            server.close();
        });
    });
};
// __dirname = browser-pool/dist/playwright
//  taacPath = browser-pool/dist/tab-as-a-container
const taacPath = path_1.default.join(__dirname, '..', 'tab-as-a-container');
class PlaywrightPlugin extends browser_plugin_1.BrowserPlugin {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "_browserVersion", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_containerProxyServer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    async _launch(launchContext) {
        const { launchOptions, useIncognitoPages, proxyUrl, } = launchContext;
        let { userDataDir, } = launchContext;
        let browser;
        // Required for the `proxy` context option to work.
        launchOptions.proxy = {
            server: await (0, proxy_server_1.getLocalProxyAddress)(),
            ...launchOptions.proxy,
        };
        const [anonymizedProxyUrl, close] = await (0, anonymize_proxy_1.anonymizeProxySugar)(proxyUrl);
        if (anonymizedProxyUrl) {
            launchOptions.proxy = {
                server: anonymizedProxyUrl,
                bypass: launchOptions.proxy.bypass,
            };
        }
        try {
            if (useIncognitoPages) {
                browser = await this.library.launch(launchOptions);
                if (anonymizedProxyUrl) {
                    browser.on('disconnected', async () => {
                        await close();
                    });
                }
            }
            else {
                const experimentalContainers = launchContext.experimentalContainers && this.library.name() !== 'webkit';
                let firefoxPort;
                if (experimentalContainers) {
                    launchOptions.args = [
                        ...(launchOptions.args ?? []),
                    ];
                    // Use native headless mode so we can load an extension
                    if (launchOptions.headless && this.library.name() === 'chromium') {
                        launchOptions.args.push('--headless=chrome');
                    }
                    if (this.library.name() === 'chromium') {
                        launchOptions.args.push(`--disable-extensions-except=${taacPath}`, `--load-extension=${taacPath}`);
                    }
                    else if (this.library.name() === 'firefox') {
                        firefoxPort = await getFreePort();
                        launchOptions.args.push(`--start-debugger-server=${firefoxPort}`);
                        const prefs = {
                            'devtools.debugger.remote-enabled': true,
                            'devtools.debugger.prompt-connection': false,
                        };
                        const prefsRaw = Object.entries(prefs)
                            .map(([name, value]) => `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`)
                            .join('\n');
                        if (userDataDir === '') {
                            userDataDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'apify-playwright-firefox-taac-'));
                        }
                        fs_1.default.writeFileSync(path_1.default.join(userDataDir, 'user.js'), prefsRaw);
                    }
                }
                const browserContext = await this.library.launchPersistentContext(userDataDir, launchOptions);
                browserContext.once('close', () => {
                    if (userDataDir.includes('apify-playwright-firefox-taac-')) {
                        fs_1.default.rmSync(userDataDir, {
                            recursive: true,
                            force: true,
                        });
                    }
                });
                if (experimentalContainers) {
                    if (this.library.name() === 'firefox') {
                        const loaded = await (0, load_firefox_addon_1.loadFirefoxAddon)(firefoxPort, '127.0.0.1', taacPath);
                        if (!loaded) {
                            await browserContext.close();
                            throw new Error('Failed to load Firefox experimental containers addon');
                        }
                    }
                    // Wait for the extension to load.
                    const checker = await browserContext.newPage();
                    await checker.goto('data:text/plain,tabid');
                    await checker.waitForNavigation();
                    await checker.close();
                    this._containerProxyServer = await (0, container_proxy_server_1.createProxyServerForContainers)();
                    const page = await browserContext.newPage();
                    await page.goto(`data:text/plain,proxy#{"port":${this._containerProxyServer.port}}`);
                    await page.waitForNavigation();
                    await page.close();
                    browserContext.on('close', async () => {
                        await this._containerProxyServer.close(true);
                    });
                }
                if (anonymizedProxyUrl) {
                    browserContext.on('close', async () => {
                        await close();
                    });
                }
                if (!this._browserVersion) {
                    // Launches unused browser just to get the browser version.
                    const inactiveBrowser = await this.library.launch(launchOptions);
                    this._browserVersion = inactiveBrowser.version();
                    inactiveBrowser.close().catch((error) => {
                        logger_1.log.exception(error, 'Failed to close browser.');
                    });
                }
                browser = new playwright_browser_1.PlaywrightBrowser({ browserContext, version: this._browserVersion });
            }
        }
        catch (error) {
            await close();
            throw error;
        }
        return browser;
    }
    _createController() {
        return new playwright_controller_1.PlaywrightController(this);
    }
    async _addProxyToLaunchOptions(launchContext) {
        launchContext.launchOptions ?? (launchContext.launchOptions = {});
        const { launchOptions, proxyUrl } = launchContext;
        if (proxyUrl) {
            const url = new URL(proxyUrl);
            launchOptions.proxy = {
                server: url.origin,
                username: decodeURIComponent(url.username),
                password: decodeURIComponent(url.password),
            };
        }
    }
    _isChromiumBasedBrowser() {
        const name = this.library.name();
        return name === 'chromium';
    }
}
exports.PlaywrightPlugin = PlaywrightPlugin;
//# sourceMappingURL=playwright-plugin.js.map