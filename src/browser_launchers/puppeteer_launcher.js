import ow from 'ow';
import { PuppeteerNode } from 'puppeteer'; // eslint-disable-line no-unused-vars,import/named
import { PuppeteerPlugin } from 'browser-pool';
import BrowserLauncher from './browser_launcher';
import { isAtHome } from '../utils';
import log from '../utils_log';

import { DEFAULT_USER_AGENT } from '../constants';

import applyStealthToBrowser, { StealthOptions } from '../stealth/stealth'; // eslint-disable-line no-unused-vars,import/named

const LAUNCH_PUPPETEER_DEFAULT_VIEWPORT = {
    width: 1366,
    height: 768,
};
/**
 * Apify extends the launch options of Puppeteer.
 * You can use any of the Puppeteer compatible
 * [`LaunchOptions`](https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions)
 * options by providing the `launchOptions` property.
 *
 * **Example:**
 * ```js
 * // launch a headless Chrome (not Chromium)
 * const launchContext = {
 *     // Apify helpers
 *     useChrome: true,
 *     proxyUrl: 'http://user:password@some.proxy.com'
 *     // Native Puppeteer options
 *     launchOptions: {
 *         headless: true,
 *         args: ['--some-flag'],
 *     }
 * }
 * ```
 *
 * @typedef PuppeteerLaunchContext
 * @property {Parameters<PuppeteerNode['launch']>[0]} [launchOptions]
 *  `puppeteer.launch` [options](https://pptr.dev/#?product=Puppeteer&version=v13.5.1&show=api-puppeteerlaunchoptions)
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
 * @property {*} [launcher]
 *   Already required module (`Object`). This enables usage of various Puppeteer
 *   wrappers such as `puppeteer-extra`.
 *
 *   Take caution, because it can cause all kinds of unexpected errors and weird behavior.
 *   Apify SDK is not tested with any other library besides `puppeteer` itself.
 * @property {boolean} [useIncognitoPages=false]
 *   With this option selected, all pages will be opened in a new incognito browser context.
 *   This means they will not share cookies nor cache and their resources will not be throttled by one another.
 * @property {boolean} [stealth]
 * @deprecated
 *   This setting hides most of the known properties that identify headless Chrome and makes it nearly undetectable.
 *   It is recommended to use it together with the `useChrome` set to `true`.
 * @property {StealthOptions} [stealthOptions]
 * @deprecated
 *   Using this configuration, you can disable some of the hiding tricks.
 *   For these settings to take effect `stealth` must be set to true
 */

/**
 * `PuppeteerLauncher` is based on the `BrowserLauncher`. It launches `puppeteer` browser instance.
 * @ignore
 */
export class PuppeteerLauncher extends BrowserLauncher {
    static optionsShape = {
        ...BrowserLauncher.optionsShape,
        launcher: ow.optional.object,
        userAgent: ow.optional.string,
        stealth: ow.optional.boolean,
        stealthOptions: ow.optional.object,
    };

    /**
    * @param {PuppeteerLaunchContext} launchContext
    * All `PuppeteerLauncher` parameters are passed via an launchContext object.
    */
    constructor(launchContext = {}) {
        ow(launchContext, 'PuppeteerLauncher', ow.object.exactShape(PuppeteerLauncher.optionsShape));

        const {
            launcher = BrowserLauncher.requireLauncherOrThrow('puppeteer', 'apify/actor-node-puppeteer-chrome'),
            userAgent,
            stealth = false,
            stealthOptions = {},
            ...browserLauncherOptions
        } = launchContext;

        super({
            ...browserLauncherOptions,
            launcher,
        });
        this.userAgent = userAgent;
        this.stealth = stealth;
        /** @type {StealthOptions} */
        this.stealthOptions = {
            hideWebDriver: true,
            ...stealthOptions,
        };

        this.Plugin = PuppeteerPlugin;
    }

    async launch() {
        const browser = await super.launch();

        if (this.stealth) {
            const { hideWebDriver, ...newStealthOptions } = this.stealthOptions;
            log.deprecated(
                'Puppeteer "stealth" and "stealthOptions" are deprecated.'
                + ' You should use fingerprints instead.'
                + ' Checkout the fingerprints guide: https://sdk.apify.com/docs/guides/avoid-blocking',
            );
            applyStealthToBrowser(browser, newStealthOptions);
        }

        return browser;
    }

    createLaunchOptions() {
        const launchOptions = super.createLaunchOptions();
        launchOptions.args = launchOptions.args || [];

        if (isAtHome()) launchOptions.args.push('--no-sandbox');

        if (launchOptions.defaultViewport === undefined) {
            launchOptions.defaultViewport = LAUNCH_PUPPETEER_DEFAULT_VIEWPORT;
        }

        // When User-Agent is not set and we're using Chromium or headless mode,
        // it is better to use DEFAULT_USER_AGENT to reduce chance of detection
        let { userAgent } = this;
        if (!userAgent && (!launchOptions.executablePath || launchOptions.headless)) {
            userAgent = DEFAULT_USER_AGENT;
        }

        if (userAgent) {
            launchOptions.args.push(`--user-agent=${userAgent}`);
        }

        if (this.stealthOptions && this.stealthOptions.hideWebDriver) {
            const idx = launchOptions.args.findIndex((arg) => arg.startsWith('--disable-blink-features='));
            if (idx !== -1) {
                const arg = launchOptions.args[idx];
                launchOptions.args[idx] = `${arg},AutomationControlled`;
            } else {
                launchOptions.args.push('--disable-blink-features=AutomationControlled');
            }
        }

        return launchOptions;
    }
}

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
 * @param {PuppeteerLaunchContext} [launchContext]
 * All `PuppeteerLauncher` parameters are passed via an launchContext object.
 * If you want to pass custom `puppeteer.launch(options)` options you can use the `PuppeteerLaunchContext.launchOptions` property.
 * @returns {Promise<*>}
 *   Promise that resolves to Puppeteer's `Browser` instance.
 * @memberof module:Apify
 * @name launchPuppeteer
 * @function
 */
export const launchPuppeteer = async (launchContext) => {
    const puppeteerLauncher = new PuppeteerLauncher(launchContext);

    return puppeteerLauncher.launch();
};
