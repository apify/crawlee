import { URL } from 'url';
import ow from 'ow';

import { ENV_VARS } from 'apify-shared/consts';
import { PlaywrightPlugin } from 'browser-pool';
import { Browser } from 'puppeteer'; // eslint-disable-line no-unused-vars
import { getTypicalChromeExecutablePath, isAtHome } from './utils';
import applyStealthToBrowser, { StealthOptions } from './stealth/stealth'; // eslint-disable-line no-unused-vars,import/named

/**
 * Requires `playwright` browserType, uses a replacement or throws meaningful error if not installed.
 *
 * @param {(string|Object)} launcher
 * @ignore
 */
export function getPlaywrightLauncherOrThrow(launcher = require('playwright').chromium) { // eslint-disable-line
    if (typeof launcher === 'object') return launcher;
    try {
        // This is an optional dependency because it is quite large, only require it when used (ie. image with Chrome)
        return require(launcher); // eslint-disable-line
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            const msg = `Cannot find module '${launcher}'. Did you you install the '${launcher}' package?`;
            err.message = isAtHome()
                ? `${msg} The 'playwright' package is automatically bundled when using apify/actor-node-chrome-* Base image.`
                : msg;
        }

        throw err;
    }
}

/**
 *@ignore
 */
export function getDefaultHeadlessOption() {
    return process.env[ENV_VARS.HEADLESS] === '1' && process.env[ENV_VARS.XVFB] !== '1';
}

/**
 *@ignore
 */
export function getChromeExecutablePath() {
    return process.env[ENV_VARS.CHROME_EXECUTABLE_PATH] || getTypicalChromeExecutablePath();
}

export function apifyOptionsToLaunchOptions(launchContext) {
    const { launchOptions = {}, useChrome } = launchContext;

    if (launchOptions.headless == null) {
        launchOptions.headless = getDefaultHeadlessOption();
    }

    if (useChrome && !launchOptions.executablePath) {
        launchOptions.executablePath = getChromeExecutablePath();
    }

    return launchOptions;
}

/**
 * Apify extends the launch options of Playwright.
 * You can use any of the Playwright compatible
 * [`LaunchOptions`](https://playwright.dev/docs/api/class-browsertype#browsertypelaunchoptions)
 * options by providing the `launchOptions` property.
 *
 * @typedef PlaywrightLaunchContext
 * @property {object} [launchOptions]
 *  `browserType.launch` [options](https://playwright.dev/docs/api/class-browsertype?_highlight=launch#browsertypelaunchoptions)
 * @property {string} [proxyUrl]
 *   URL to a HTTP proxy server. It must define the port number,
 *   and it may also contain proxy username and password.
 *
 *   Example: `http://bob:pass123@proxy.example.com:1234`.
 * @property {boolean} [useChrome=false]
 *   If `true` and `executablePath` is not set,
 *   Puppeteer will launch full Google Chrome browser available on the machine
 *   rather than the bundled Chromium. The path to Chrome executable
 *   is taken from the `APIFY_CHROME_EXECUTABLE_PATH` environment variable if provided,
 *   or defaults to the typical Google Chrome executable location specific for the operating system.
 *   By default, this option is `false`.
 * @property {(string|Object)} [launcher]
 *   By default this function uses require("playwright").chromium`.
 *   If you want to use a different browser you can pass it by this property as `require("playwright").firefox
 */

/**
 * Launches headless browsers using Playwright pre-configured to work within the Apify platform.
 * The function has the same return value as `browserType.launch()`.
 * See <a href="https://playwright.dev/docs/api/class-browsertype" target="_blank">
 * Playwright documentation</a> for more details.
 *
 * The `launchPlaywright()` function alters the following Playwright options:
 *
 * - Passes the setting from the `APIFY_HEADLESS` environment variable to the `headless` option,
 *   unless it was already defined by the caller or `APIFY_XVFB` environment variable is set to `1`.
 *   Note that Apify Actor cloud platform automatically sets `APIFY_HEADLESS=1` to all running actors.
 * - Takes the `proxyUrl` option, validates it and adds it to `args` as `--proxy-server=XXX`.
 *   The proxy URL must define a port number and have one of the following schemes: `http://`,
 *   `https://`, `socks4://` or `socks5://`.
 *   If the proxy is HTTP (i.e. has the `http://` scheme) and contains username or password,
 *   the `launchPlaywright` functions sets up an anonymous proxy HTTP
 *   to make the proxy work with headless Chrome. For more information, read the
 *   <a href="https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212"
 *   target="_blank">blog post about proxy-chain library</a>.
 *
 * To use this function, you need to have the [Playwright](https://www.npmjs.com/package/playwright)
 * NPM package installed in your project.
 * When running on the Apify cloud, you can achieve that simply
 * by using the `apify/actor-node-chrome` base Docker image for your actor - see @TODO:
 * [Apify Actor documentation](https://docs.apify.com/actor/build#base-images)
 * for details.
 *
 *
 * @param {PlaywrightLaunchContext} [options]
 *   Optional settings passed to `browserType.launch()`. In addition to
 *   [Playwright's options](https://playwright.dev/docs/api/class-browsertype?_highlight=launch#browsertypelaunchoptions)
 *   the object may contain our own  {@link PlaywrightLaunchContext} that enable additional features.
 * @returns {Promise<Browser>}
 *   Promise that resolves to Playwright's `Browser` instance.
 * @memberof module:Apify
 * @name launchPlaywright
 * @function
 */
export const launchPlaywright = async (launchContext = {}) => {
    ow(launchContext, ow.object.partialShape({
        proxyUrl: ow.optional.string.url,
        launcher: ow.optional.any(ow.string, ow.object),
        useChrome: ow.optional.boolean,

    }));

    const {
        proxyUrl,
        launcher,
    } = launchContext;

    if (proxyUrl) {
        const parsedProxyUrl = new URL(proxyUrl);
        if (!parsedProxyUrl.host || !parsedProxyUrl.port) {
            throw new Error('Invalid "proxyUrl" option: both hostname and port must be provided.');
        }
        if (!/^(http|https|socks4|socks5)$/.test(parsedProxyUrl.protocol.replace(':', ''))) {
            throw new Error(`Invalid "proxyUrl" option: Unsupported scheme (${parsedProxyUrl.protocol.replace(':', '')}).`);
        }
    }
    const plugin = new PlaywrightPlugin(
        getPlaywrightLauncherOrThrow(launcher),
        {
            proxyUrl,
            launchOptions: apifyOptionsToLaunchOptions(launchContext),
        },
    );
    const context = await plugin.createLaunchContext();

    const browser = await plugin.launch(context);

    return browser;
};
