import ow from 'ow';

import { ENV_VARS } from 'apify-shared/consts';
import { PuppeteerPlugin } from 'browser-pool';
import { Browser } from 'puppeteer'; // eslint-disable-line no-unused-vars
import { DEFAULT_USER_AGENT } from './constants';
import { getTypicalChromeExecutablePath, isAtHome } from './utils';
import applyStealthToBrowser, { StealthOptions } from './stealth/stealth'; // eslint-disable-line no-unused-vars,import/named

const LAUNCH_PUPPETEER_DEFAULT_VIEWPORT = {
    width: 1366,
    height: 768,
};

/**
 * Requires `puppeteer` package, uses a replacement or throws meaningful error if not installed.
 *
 * @param {(string|Object)} launcher
 * @ignore
 */
export function getPuppeteerOrThrow(launcher = 'puppeteer') {
    if (typeof puppeteerModule === 'object') return launcher;
    try {
        // This is an optional dependency because it is quite large, only require it when used (ie. image with Chrome)
        return require(launcher); // eslint-disable-line
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            const msg = `Cannot find module '${launcher}'. Did you you install the '${launcher}' package?`;
            err.message = isAtHome()
                ? `${msg} The 'puppeteer' package is automatically bundled when using apify/actor-node-chrome-* Base image.`
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

    launchOptions.args = launchOptions.args || [];
    // Add --no-sandbox for Platform, because running Chrome in Docker
    // is a very complex problem and most likely requires sys admin privileges,
    // which is a larger security concern than --no-sandbox itself.
    // TODO Find if the arg has any impact on browser detection.
    if (isAtHome()) launchOptions.args.push('--no-sandbox');

    if (launchOptions.headless == null) {
        launchOptions.headless = getDefaultHeadlessOption();
    }

    if (useChrome && !launchOptions.executablePath) {
        launchOptions.executablePath = getChromeExecutablePath();
    }

    if (launchOptions.defaultViewport === undefined) {
        launchOptions.defaultViewport = LAUNCH_PUPPETEER_DEFAULT_VIEWPORT;
    }

    // When User-Agent is not set and we're using Chromium or headless mode,
    // it is better to use DEFAULT_USER_AGENT to reduce chance of detection
    let { userAgent } = launchContext;
    if (!userAgent && (!launchOptions.executablePath || launchOptions.headless)) {
        userAgent = DEFAULT_USER_AGENT;
    }

    if (userAgent) {
        launchOptions.args.push(`--user-agent=${userAgent}`);
    }

    return launchOptions;
}

/**
 * Apify extends the launch options of Puppeteer.
 * You can use any of the Puppeteer compatible
 * [`LaunchOptions`](https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions)
 * options by providing the `launchOptions` property.
 *
 * @typedef PuppeteerLaunchContext
 * @property {object} [launchOptions]
 *  `puppeteer.launch` [options](https://pptr.dev/#?product=Puppeteer&version=v5.5.0&show=api-puppeteerlaunchoptions)
 * @property {string} [proxyUrl]
 *   URL to a HTTP proxy server. It must define the port number,
 *   and it may also contain proxy username and password.
 *
 *   Example: `http://bob:pass123@proxy.example.com:1234`.
 * @property {string} [userAgent]
 *   The `User-Agent` HTTP header used by the browser.
 *   If not provided, the function sets `User-Agent` to a reasonable default
 *   to reduce the chance of detection of the crawler.
 * @property {boolean} [useChrome=false]
 *   If `true` and `executablePath` is not set,
 *   Puppeteer will launch full Google Chrome browser available on the machine
 *   rather than the bundled Chromium. The path to Chrome executable
 *   is taken from the `APIFY_CHROME_EXECUTABLE_PATH` environment variable if provided,
 *   or defaults to the typical Google Chrome executable location specific for the operating system.
 *   By default, this option is `false`.
 * @property {(string|Object)} [launcher]
 *   Either a require path (`string`) to a package to be used instead of default `puppeteer`,
 *   or an already required module (`Object`). This enables usage of various Puppeteer
 *   wrappers such as `puppeteer-extra`.
 *
 *   Take caution, because it can cause all kinds of unexpected errors and weird behavior.
 *   Apify SDK is not tested with any other library besides `puppeteer` itself.
 * @property {boolean} [stealth]
 *   This setting hides most of the known properties that identify headless Chrome and makes it nearly undetectable.
 *   It is recommended to use it together with the `useChrome` set to `true`.
 * @property {StealthOptions} [stealthOptions]
 *   Using this configuration, you can disable some of the hiding tricks.
 *   For these settings to take effect `stealth` must be set to true
 */

/**
 * Launches headless Chrome using Puppeteer pre-configured to work within the Apify platform.
 * The function has the same argument and the return value as `puppeteer.launch()`.
 * See <a href="https://github.com/puppeteer/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions" target="_blank">
 * Puppeteer documentation</a> for more details.
 *
 * The `launchPuppeteer()` function alters the following Puppeteer options:
 *
 * - Passes the setting from the `APIFY_HEADLESS` environment variable to the `headless` option,
 *   unless it was already defined by the caller or `APIFY_XVFB` environment variable is set to `1`.
 *   Note that Apify Actor cloud platform automatically sets `APIFY_HEADLESS=1` to all running actors.
 * - Takes the `proxyUrl` option, validates it and adds it to `args` as `--proxy-server=XXX`.
 *   The proxy URL must define a port number and have one of the following schemes: `http://`,
 *   `https://`, `socks4://` or `socks5://`.
 *   If the proxy is HTTP (i.e. has the `http://` scheme) and contains username or password,
 *   the `launchPuppeteer` functions sets up an anonymous proxy HTTP
 *   to make the proxy work with headless Chrome. For more information, read the
 *   <a href="https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212"
 *   target="_blank">blog post about proxy-chain library</a>.
 * - If `options.useApifyProxy` is `true` then the function generates a URL of
 *   [Apify Proxy](https://docs.apify.com/proxy)
 *   based on `options.apifyProxyGroups` and `options.apifyProxySession` and passes it as `options.proxyUrl`.
 * - The function adds `--no-sandbox` to `args` to enable running
 *   headless Chrome in a Docker container on the Apify platform.
 * - Sets `defaultViewport` Puppeteer option (if not already set)
 *   to a more reasonable default for screenshots and debugging.
 *   You can set `options.defaultViewport` to `null` if you prefer to let Puppeteer
 *   choose the default viewport size.
 *
 * To use this function, you need to have the [puppeteer](https://www.npmjs.com/package/puppeteer)
 * NPM package installed in your project.
 * When running on the Apify cloud, you can achieve that simply
 * by using the `apify/actor-node-chrome` base Docker image for your actor - see
 * [Apify Actor documentation](https://docs.apify.com/actor/build#base-images)
 * for details.
 *
 * For an example of usage, see the [Synchronous run Example](../examples/synchronous-run)
 * or the [Puppeteer proxy Example](../examples/puppeteer-with-proxy)
 *
 * @param {PuppeteerLaunchContext} [options]
 *   Optional settings passed to `puppeteer.launch()`. In addition to
 *   [Puppeteer's options](https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions)
 *   the object may contain our own  {@link PuppeteerLaunchContext} that enable additional features.
 * @returns {Promise<Browser>}
 *   Promise that resolves to Puppeteer's `Browser` instance.
 * @memberof module:Apify
 * @name launchPuppeteer
 * @function
 */
export const launchPuppeteer = async (launchContext = {}) => {
    ow(launchContext, ow.object.partialShape({
        proxyUrl: ow.optional.string.url,
        launcher: ow.optional.any(ow.string, ow.object),
        stealth: ow.optional.boolean,
        stealthOptions: ow.optional.object,
        useChrome: ow.optional.boolean,
        userAgent: ow.optional.string,
    }));

    const {
        stealth,
        stealthOptions,
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

    const plugin = new PuppeteerPlugin(
        getPuppeteerOrThrow(launcher),
        {
            proxyUrl,
            launchOptions: apifyOptionsToLaunchOptions(launchContext),
        },
    );
    const context = await plugin.createLaunchContext();

    const browser = await plugin.launch(context);

    if (stealth) {
        applyStealthToBrowser(browser, stealthOptions);
    }

    return browser;
};
