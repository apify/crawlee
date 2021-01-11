import ow from 'ow';
import { ENV_VARS } from 'apify-shared/consts';
import { getTypicalChromeExecutablePath } from '../utils';

export default class BrowserLauncher {
    static optionsShape = {
        launcher: ow.optional.object, // @TODO: I have dropped support for string, since it is not supported by the playwright.
        proxyUrl: ow.optional.string.url,
        useChrome: ow.optional.boolean,
        launchOptions: ow.optional.object,
    }

    constructor(launchContext) {
        ow(launchContext, 'BrowserLauncherOptions', ow.object.exactShape(BrowserLauncher.optionsShape));

        const {
            launcher,
            proxyUrl,
            useChrome,
            launchOptions = {},
        } = launchContext;

        this._validateProxyUrl(proxyUrl);

        this.launcher = launcher;
        this.proxyUrl = proxyUrl;
        this.useChrome = useChrome;
        this.launchOptions = launchOptions;

        this.Plugin = null; // tight to specific library implementation;
    }

    /**
     * @return {BrowserPlugin}
     */
    createBrowserPlugin() {
        return new this.Plugin(
            this._getLauncher(this.launcher),
            {
                proxyUrl: this.proxyUrl,
                launchOptions: this.createPluginLaunchOptions(),
            },
        );
    }

    async launch() {
        const plugin = this.createBrowserPlugin();

        const context = await plugin.createLaunchContext();

        const browser = await plugin.launch(context);

        return browser;
    }

    /**
     * @returns {object}
     */
    createPluginLaunchOptions() {
        const launchOptions = {
            ...this.launchOptions,
        };

        if (launchOptions.headless == null) {
            launchOptions.headless = this._getDefaultHeadlessOption();
        }

        if (this.useChrome && !launchOptions.executablePath) {
            launchOptions.executablePath = this._getChromeExecutablePath();
        }

        return launchOptions;
    }

    /**
     * @private
     * @returns {boolean};
     */
    _getDefaultHeadlessOption() {
        return process.env[ENV_VARS.HEADLESS] === '1' && process.env[ENV_VARS.XVFB] !== '1';
    }

    /**
    * @private
    * @returns {string}
    */
    _getChromeExecutablePath() {
        return process.env[ENV_VARS.CHROME_EXECUTABLE_PATH] || getTypicalChromeExecutablePath();
    }

    /**
     * @private
     * @returns {object}
     */
    _getLauncher() {
        if (typeof this.launcher !== 'object') {
            throw new Error('Option "launcher" must be object.');
        }
        return this.launcher;
    }

    /**
     * @private
     * @param {string} proxyUrl
     * @return {void}
     */
    _validateProxyUrl(proxyUrl) {
        if (proxyUrl) {
            const parsedProxyUrl = new URL(proxyUrl);
            if (!parsedProxyUrl.host || !parsedProxyUrl.port) {
                throw new Error('Invalid "proxyUrl" option: both hostname and port must be provided.');
            }
            if (!/^(http|https|socks4|socks5)$/.test(parsedProxyUrl.protocol.replace(':', ''))) {
                throw new Error(`Invalid "proxyUrl" option: Unsupported scheme (${parsedProxyUrl.protocol.replace(':', '')}).`);
            }
        }
    }
}
