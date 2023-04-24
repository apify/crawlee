"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserPlugin = exports.DEFAULT_USER_AGENT = void 0;
const tslib_1 = require("tslib");
const lodash_merge_1 = tslib_1.__importDefault(require("lodash.merge"));
const launch_context_1 = require("../launch-context");
const utils_1 = require("./utils");
/**
 * The default User Agent used by `PlaywrightCrawler`, `launchPlaywright`, 'PuppeteerCrawler' and 'launchPuppeteer'
 * when Chromium/Chrome browser is launched:
 *  - in headless mode,
 *  - without using a fingerprint,
 *  - without specifying a user agent.
 * Last updated on 2022-05-05.
 *
 * After you update it here, please update it also in jsdom-crawler.ts
 */
exports.DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36';
/**
 * The `BrowserPlugin` serves two purposes. First, it is the base class that
 * specialized controllers like `PuppeteerPlugin` or `PlaywrightPlugin` extend.
 * Second, it allows the user to configure the automation libraries and
 * feed them to {@apilink BrowserPool} for use.
 */
class BrowserPlugin {
    constructor(library, options = {}) {
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: this.constructor.name
        });
        Object.defineProperty(this, "library", {
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
        Object.defineProperty(this, "proxyUrl", {
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
        const { launchOptions = {}, proxyUrl, userDataDir, useIncognitoPages = false, experimentalContainers = false, } = options;
        this.library = library;
        this.launchOptions = launchOptions;
        this.proxyUrl = proxyUrl && new URL(proxyUrl).href.slice(0, -1);
        this.userDataDir = userDataDir;
        this.useIncognitoPages = useIncognitoPages;
        this.experimentalContainers = experimentalContainers;
    }
    /**
     * Creates a `LaunchContext` with all the information needed
     * to launch a browser. Aside from library specific launch options,
     * it also includes internal properties used by `BrowserPool` for
     * management of the pool and extra features.
     */
    createLaunchContext(options = {}) {
        const { id, launchOptions = {}, proxyUrl = this.proxyUrl, useIncognitoPages = this.useIncognitoPages, userDataDir = this.userDataDir, experimentalContainers = this.experimentalContainers, } = options;
        return new launch_context_1.LaunchContext({
            id,
            launchOptions: (0, lodash_merge_1.default)({}, this.launchOptions, launchOptions),
            browserPlugin: this,
            proxyUrl,
            useIncognitoPages,
            experimentalContainers,
            userDataDir,
        });
    }
    createController() {
        return this._createController();
    }
    /**
     * Launches the browser using provided launch context.
     */
    async launch(launchContext = this.createLaunchContext()) {
        launchContext.launchOptions ?? (launchContext.launchOptions = {});
        const { proxyUrl, launchOptions } = launchContext;
        if (proxyUrl) {
            await this._addProxyToLaunchOptions(launchContext);
        }
        if (this._isChromiumBasedBrowser(launchContext)) {
            // This will set the args for chromium based browsers to hide the webdriver.
            launchOptions.args = this._mergeArgsToHideWebdriver(launchOptions.args);
            // When User-Agent is not set, and we're using Chromium in headless mode,
            // it is better to use DEFAULT_USER_AGENT to reduce chance of detection,
            // as otherwise 'HeadlessChrome' is present in User-Agent string.
            const userAgent = launchOptions.args.find((arg) => arg.startsWith('--user-agent'));
            if (launchOptions.headless && !launchContext.fingerprint && !userAgent) {
                launchOptions.args.push(`--user-agent=${exports.DEFAULT_USER_AGENT}`);
            }
        }
        return this._launch(launchContext);
    }
    _mergeArgsToHideWebdriver(originalArgs) {
        if (!originalArgs?.length) {
            return ['--disable-blink-features=AutomationControlled'];
        }
        const argumentIndex = originalArgs.findIndex((arg) => arg.startsWith('--disable-blink-features='));
        if (argumentIndex !== -1) {
            originalArgs[argumentIndex] += ',AutomationControlled';
        }
        else {
            originalArgs.push('--disable-blink-features=AutomationControlled');
        }
        return originalArgs;
    }
    ;
    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    // eslint-disable-next-line max-len
    _addProxyToLaunchOptions(launchContext) {
        (0, utils_1.throwImplementationNeeded)('_addProxyToLaunchOptions');
    }
    // @ts-expect-error Give runtime error as well as compile time
    // eslint-disable-next-line space-before-function-paren, @typescript-eslint/no-unused-vars, max-len
    _isChromiumBasedBrowser(launchContext) {
        (0, utils_1.throwImplementationNeeded)('_isChromiumBasedBrowser');
    }
    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    _launch(launchContext) {
        (0, utils_1.throwImplementationNeeded)('_launch');
    }
    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    // eslint-disable-next-line space-before-function-paren
    _createController() {
        (0, utils_1.throwImplementationNeeded)('_createController');
    }
}
exports.BrowserPlugin = BrowserPlugin;
//# sourceMappingURL=browser-plugin.js.map