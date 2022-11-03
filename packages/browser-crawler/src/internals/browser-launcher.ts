import os from 'node:os';
import fs from 'node:fs';
import ow from 'ow';
import type { Dictionary, Constructor } from '@crawlee/utils';
import type { BrowserPlugin, BrowserPluginOptions } from '@crawlee/browser-pool';
import { Configuration } from '@crawlee/basic';

const DEFAULT_VIEWPORT = {
    width: 1366,
    height: 768,
};

export interface BrowserLaunchContext<TOptions, Launcher> extends BrowserPluginOptions<TOptions> {
    /**
     * URL to an HTTP proxy server. It must define the port number,
     * and it may also contain proxy username and password.
     *
     * @example
     * `http://bob:pass123@proxy.example.com:1234`.
     */
    proxyUrl?: string;

    /**
     * If `true` and the `executablePath` option of {@apilink BrowserLaunchContext.launchOptions|`launchOptions`} is not set,
     * the launcher will launch full Google Chrome browser available on the machine
     * rather than the bundled Chromium. The path to Chrome executable
     * is taken from the `CRAWLEE_CHROME_EXECUTABLE_PATH` environment variable if provided,
     * or defaults to the typical Google Chrome executable location specific for the operating system.
     * @default false
     */
    useChrome?: boolean;

    /**
    * With this option selected, all pages will be opened in a new incognito browser context.
    * This means they will not share cookies nor cache and their resources will not be throttled by one another.
    * @default false
    */
    useIncognitoPages?: boolean;

    /**
     * @experimental
     * Like `useIncognitoPages`, but for persistent contexts, so cache is used for faster loading.
     * Works best with Firefox. Unstable on Chromium.
     */
    experimentalContainers?: boolean;

    /**
    * Sets the [User Data Directory](https://chromium.googlesource.com/chromium/src/+/master/docs/user_data_dir.md) path.
    * The user data directory contains profile data such as history, bookmarks, and cookies, as well as other per-installation local state.
    * If not specified, a temporary directory is used instead.
    */
    userDataDir?: string;

    /**
     * The `User-Agent` HTTP header used by the browser.
     * If not provided, the function sets `User-Agent` to a reasonable default
     * to reduce the chance of detection of the crawler.
     */
    userAgent?: string;

    /**
     * The type of browser to be launched.
     * By default, `chromium` is used. Other browsers like `webkit` or `firefox` can be used.
     *
     * @example
     * ```ts
     * // import the browser from the library first
     * import { firefox } from 'playwright';
     * ```
     *
     * For more details, check out the [example](https://crawlee.dev/docs/examples/playwright-crawler-firefox).
     */
    launcher?: Launcher;
}

/**
 * Abstract class for creating browser launchers, such as `PlaywrightLauncher` and `PuppeteerLauncher`.
 * @ignore
 */
export abstract class BrowserLauncher<
    Plugin extends BrowserPlugin,
    Launcher = Plugin['library'],
    T extends Constructor<Plugin> = Constructor<Plugin>,
    LaunchOptions extends Dictionary<any> | undefined = Partial<Parameters<Plugin['launch']>[0]>,
    LaunchResult extends ReturnType<Plugin['launch']> = ReturnType<Plugin['launch']>,
> {
    launcher: Launcher;
    proxyUrl?: string;
    useChrome?: boolean;
    launchOptions: Dictionary;
    otherLaunchContextProps: Dictionary;
    // to be provided by child classes;
    Plugin!: T;
    userAgent?: string;

    protected static optionsShape = {
        proxyUrl: ow.optional.string.url,
        useChrome: ow.optional.boolean,
        useIncognitoPages: ow.optional.boolean,
        experimentalContainers: ow.optional.boolean,
        userDataDir: ow.optional.string,
        launchOptions: ow.optional.object,
        userAgent: ow.optional.string,
    };

    static requireLauncherOrThrow<T>(launcher: string, apifyImageName: string): T {
        try {
            return require(launcher); // eslint-disable-line
        } catch (err) {
            const e = err as Error & { code: string };
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
    constructor(launchContext: BrowserLaunchContext<LaunchOptions, Launcher>, readonly config = Configuration.getGlobalConfig()) {
        const {
            launcher,
            proxyUrl,
            useChrome,
            userAgent,
            launchOptions = {},
            ...otherLaunchContextProps
        } = launchContext;

        this._validateProxyUrlProtocol(proxyUrl);

        // those need to be reassigned otherwise they are {} in types
        this.launcher = launcher!;
        this.proxyUrl = proxyUrl;
        this.useChrome = useChrome;
        this.userAgent = userAgent;
        this.launchOptions = launchOptions;
        this.otherLaunchContextProps = otherLaunchContextProps as Dictionary;
    }

    /**
     * @ignore
     */
    createBrowserPlugin(): Plugin {
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
    launch(): LaunchResult {
        const plugin = this.createBrowserPlugin();
        const context = plugin.createLaunchContext();

        return plugin.launch(context) as LaunchResult;
    }

    createLaunchOptions(): Dictionary {
        const launchOptions: { args: string[] } & Dictionary = {
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

    protected _getDefaultHeadlessOption(): boolean {
        return this.config.get('headless')! && !this.config.get('xvfb', false);
    }

    protected _getChromeExecutablePath(): string {
        return this.config.get('chromeExecutablePath', this._getTypicalChromeExecutablePath());
    }

    /**
     * Gets a typical path to Chrome executable, depending on the current operating system.
     */
    protected _getTypicalChromeExecutablePath(): string {
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

            if (fs.existsSync(path00)) {
                chromeExecutablePath = path00;
            } else if (fs.existsSync(path86)) {
                chromeExecutablePath = path86;
            }
            return chromeExecutablePath;
        };
        switch (os.platform()) {
            case 'darwin':
                return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            case 'win32':
                return getWin32Path();
            default:
                return '/usr/bin/google-chrome';
        }
    }

    protected _validateProxyUrlProtocol(proxyUrl?: string): void {
        if (!proxyUrl) return;

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
