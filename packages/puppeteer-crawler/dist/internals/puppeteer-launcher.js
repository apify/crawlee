"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.launchPuppeteer = exports.PuppeteerLauncher = void 0;
const tslib_1 = require("tslib");
const ow_1 = tslib_1.__importDefault(require("ow"));
const browser_pool_1 = require("@crawlee/browser-pool");
const browser_1 = require("@crawlee/browser");
/**
 * `PuppeteerLauncher` is based on the `BrowserLauncher`. It launches `puppeteer` browser instance.
 * @ignore
 */
class PuppeteerLauncher extends browser_1.BrowserLauncher {
    /**
     * All `PuppeteerLauncher` parameters are passed via an launchContext object.
     */
    constructor(launchContext = {}, config = browser_1.Configuration.getGlobalConfig()) {
        (0, ow_1.default)(launchContext, 'PuppeteerLauncher', ow_1.default.object.exactShape(PuppeteerLauncher.optionsShape));
        const { launcher = browser_1.BrowserLauncher.requireLauncherOrThrow('puppeteer', 'apify/actor-node-puppeteer-chrome'), ...browserLauncherOptions } = launchContext;
        super({
            ...browserLauncherOptions,
            launcher,
        }, config);
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        this.Plugin = browser_pool_1.PuppeteerPlugin;
    }
}
Object.defineProperty(PuppeteerLauncher, "optionsShape", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        ...browser_1.BrowserLauncher.optionsShape,
        launcher: ow_1.default.optional.object,
    }
});
exports.PuppeteerLauncher = PuppeteerLauncher;
/**
 * Launches headless Chrome using Puppeteer pre-configured to work within the Apify platform.
 * The function has the same argument and the return value as `puppeteer.launch()`.
 * See [Puppeteer documentation](https://github.com/puppeteer/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions) for more details.
 *
 * The `launchPuppeteer()` function alters the following Puppeteer options:
 *
 * - Passes the setting from the `CRAWLEE_HEADLESS` environment variable to the `headless` option,
 *   unless it was already defined by the caller or `CRAWLEE_XVFB` environment variable is set to `1`.
 *   Note that Apify Actor cloud platform automatically sets `CRAWLEE_HEADLESS=1` to all running actors.
 * - Takes the `proxyUrl` option, validates it and adds it to `args` as `--proxy-server=XXX`.
 *   The proxy URL must define a port number and have one of the following schemes: `http://`,
 *   `https://`, `socks4://` or `socks5://`.
 *   If the proxy is HTTP (i.e. has the `http://` scheme) and contains username or password,
 *   the `launchPuppeteer` functions sets up an anonymous proxy HTTP
 *   to make the proxy work with headless Chrome. For more information, read the
 *   [blog post about proxy-chain library](https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212).
 *
 * To use this function, you need to have the [puppeteer](https://www.npmjs.com/package/puppeteer)
 * NPM package installed in your project.
 * When running on the Apify cloud, you can achieve that simply
 * by using the `apify/actor-node-chrome` base Docker image for your actor - see
 * [Apify Actor documentation](https://docs.apify.com/actor/build#base-images)
 * for details.
 *
 * @param [launchContext]
 *   All `PuppeteerLauncher` parameters are passed via an launchContext object.
 *   If you want to pass custom `puppeteer.launch(options)` options you can use the `PuppeteerLaunchContext.launchOptions` property.
 * @param [config]
 * @returns
 *   Promise that resolves to Puppeteer's `Browser` instance.
 */
async function launchPuppeteer(launchContext, config = browser_1.Configuration.getGlobalConfig()) {
    const puppeteerLauncher = new PuppeteerLauncher(launchContext, config);
    return puppeteerLauncher.launch();
}
exports.launchPuppeteer = launchPuppeteer;
//# sourceMappingURL=puppeteer-launcher.js.map