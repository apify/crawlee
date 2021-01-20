import ow from 'ow';
import { PlaywrightPlugin } from 'browser-pool';
import BrowserLauncher from './browser_launcher';

/**
 * Apify extends the launch options of Playwright.
 * You can use any of the Playwright compatible
 * [`LaunchOptions`](https://playwright.dev/docs/api/class-browsertype#browsertypelaunchoptions)
 * options by providing the `launchOptions` property.
 *
 * **Example:**
 * ```js
 * // launch a headless Chrome (not Chromium)
 * const launchContext = {
 *     // Apify helpers
 *     useChrome: true,
 *     proxyUrl: 'http://user:password@some.proxy.com'
 *     // Native Playwright options
 *     launchOptions: {
 *         headless: true,
 *         args: ['--some-flag'],
 *     }
 * }
 * ```
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
 *   Playwright will launch full Google Chrome browser available on the machine
 *   rather than the bundled Chromium. The path to Chrome executable
 *   is taken from the `APIFY_CHROME_EXECUTABLE_PATH` environment variable if provided,
 *   or defaults to the typical Google Chrome executable location specific for the operating system.
 *   By default, this option is `false`.
 * @property {Object} [launcher]
 *   By default this function uses `require("playwright").chromium`.
 *   If you want to use a different browser you can pass it by this property as e.g. `require("playwright").firefox`
 */

/**
 * `PlaywrightLauncher` is based on the `BrowserLauncher`. It launches `playwright` browser instance.
 * @ignore
 */
export class PlaywrightLauncher extends BrowserLauncher {
    static optionsShape = {
        ...BrowserLauncher.optionsShape,
        launcher: ow.optional.object,
    }

    /**
    * @param {PlaywrightLaunchContext} launchContext
    * All `PlaywrightLauncher` parameters are passed via this launchContext object.
    */
    constructor(launchContext = {}) {
        ow(launchContext, 'PlaywrightLauncherOptions', ow.object.exactShape(PlaywrightLauncher.optionsShape));

        const {
            launcher = BrowserLauncher.requireLauncherOrThrow('playwright', 'apify/actor-node-playwright-*').chromium,
        } = launchContext;

        super({
            ...launchContext,
            launcher,
        });

        this.Plugin = PlaywrightPlugin;
    }
}

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
 * - Takes the `proxyUrl` option, validates it and adds it to `launchOptions` in a proper format.
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
 * When running on the Apify Platform, you can achieve that simply
 * by using the `apify/actor-node-playwright-*` base Docker image for your actor - see
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
export const launchPlaywright = async (launchContext) => {
    const playwrightLauncher = new PlaywrightLauncher(launchContext);

    return playwrightLauncher.launch();
};
