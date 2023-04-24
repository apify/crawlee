"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.launchPlaywright = exports.PlaywrightLauncher = void 0;
const tslib_1 = require("tslib");
const ow_1 = tslib_1.__importDefault(require("ow"));
const browser_pool_1 = require("@crawlee/browser-pool");
const browser_1 = require("@crawlee/browser");
/**
 * `PlaywrightLauncher` is based on the `BrowserLauncher`. It launches `playwright` browser instance.
 * @ignore
 */
class PlaywrightLauncher extends browser_1.BrowserLauncher {
    /**
     * All `PlaywrightLauncher` parameters are passed via this launchContext object.
     */
    constructor(launchContext = {}, config = browser_1.Configuration.getGlobalConfig()) {
        (0, ow_1.default)(launchContext, 'PlaywrightLauncherOptions', ow_1.default.object.exactShape(PlaywrightLauncher.optionsShape));
        const { launcher = browser_1.BrowserLauncher.requireLauncherOrThrow('playwright', 'apify/actor-node-playwright-*').chromium, } = launchContext;
        const { launchOptions = {}, ...rest } = launchContext;
        super({
            ...rest,
            launchOptions: {
                ...launchOptions,
                executablePath: getDefaultExecutablePath(launchContext, config),
            },
            launcher,
        }, config);
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        this.Plugin = browser_pool_1.PlaywrightPlugin;
    }
}
Object.defineProperty(PlaywrightLauncher, "optionsShape", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        ...browser_1.BrowserLauncher.optionsShape,
        launcher: ow_1.default.optional.object,
    }
});
exports.PlaywrightLauncher = PlaywrightLauncher;
/**
 * If actor-node-playwright-* image is used the CRAWLEE_DEFAULT_BROWSER_PATH is considered as default.
 * @returns default path to browser.
 * @ignore
 */
function getDefaultExecutablePath(launchContext, config) {
    const pathFromPlaywrightImage = config.get('defaultBrowserPath');
    const { launchOptions = {} } = launchContext;
    if (launchOptions.executablePath) {
        return launchOptions.executablePath;
    }
    if (launchContext.useChrome) {
        return undefined;
    }
    if (pathFromPlaywrightImage) {
        return pathFromPlaywrightImage;
    }
    return undefined;
}
/**
 * Launches headless browsers using Playwright pre-configured to work within the Apify platform.
 * The function has the same return value as `browserType.launch()`.
 * See [Playwright documentation](https://playwright.dev/docs/api/class-browsertype) for more details.
 *
 * The `launchPlaywright()` function alters the following Playwright options:
 *
 * - Passes the setting from the `CRAWLEE_HEADLESS` environment variable to the `headless` option,
 *   unless it was already defined by the caller or `CRAWLEE_XVFB` environment variable is set to `1`.
 *   Note that Apify Actor cloud platform automatically sets `CRAWLEE_HEADLESS=1` to all running actors.
 * - Takes the `proxyUrl` option, validates it and adds it to `launchOptions` in a proper format.
 *   The proxy URL must define a port number and have one of the following schemes: `http://`,
 *   `https://`, `socks4://` or `socks5://`.
 *   If the proxy is HTTP (i.e. has the `http://` scheme) and contains username or password,
 *   the `launchPlaywright` functions sets up an anonymous proxy HTTP
 *   to make the proxy work with headless Chrome. For more information, read the
 *   [blog post about proxy-chain library](https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212).
 *
 * To use this function, you need to have the [Playwright](https://www.npmjs.com/package/playwright)
 * NPM package installed in your project.
 * When running on the Apify Platform, you can achieve that simply
 * by using the `apify/actor-node-playwright-*` base Docker image for your actor - see
 * [Apify Actor documentation](https://docs.apify.com/actor/build#base-images)
 * for details.
 *
 * @param [launchContext]
 *   Optional settings passed to `browserType.launch()`. In addition to
 *   [Playwright's options](https://playwright.dev/docs/api/class-browsertype?_highlight=launch#browsertypelaunchoptions)
 *   the object may contain our own  {@apilink PlaywrightLaunchContext} that enable additional features.
 * @param [config]
 * @returns
 *   Promise that resolves to Playwright's `Browser` instance.
 */
async function launchPlaywright(launchContext, config = browser_1.Configuration.getGlobalConfig()) {
    const playwrightLauncher = new PlaywrightLauncher(launchContext, config);
    return playwrightLauncher.launch();
}
exports.launchPlaywright = launchPlaywright;
//# sourceMappingURL=playwright-launcher.js.map