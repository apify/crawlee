import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { Configuration, serviceLocator } from '@crawlee/basic';
import { BrowserPool, RemoteBrowserPool } from '@crawlee/browser-pool';
import { schemas } from '@crawlee/utils/internal';
import { z } from 'zod';
const DEFAULT_VIEWPORT = {
    width: 1366,
    height: 768,
};
const require = createRequire(import.meta.url);
/**
 * Abstract class for creating browser launchers, such as `PlaywrightLauncher` and `PuppeteerLauncher`.
 * @ignore
 */
export class BrowserLauncher {
    configuration;
    launcher;
    proxyUrl;
    useChrome;
    launchOptions;
    otherLaunchContextProps;
    // to be provided by child classes;
    Plugin;
    userAgent;
    /**
     * @internal
     */
    static optionsShape = {
        proxyUrl: z.url().optional(),
        useChrome: z.boolean().optional(),
        useIncognitoPages: z.boolean().optional(),
        browserPerProxy: z.boolean().optional(),
        ignoreProxyCertificate: z.boolean().optional(),
        userDataDir: z.string().optional(),
        launchOptions: schemas.anyObject.optional(),
        userAgent: z.string().optional(),
    };
    /** @internal */
    static optionsSchema = z.strictObject(BrowserLauncher.optionsShape);
    static requireLauncherOrThrow(launcher, apifyImageName) {
        try {
            return require(launcher); // eslint-disable-line
        }
        catch (err) {
            const e = err;
            if (e.code === 'MODULE_NOT_FOUND') {
                const msg = `Cannot find module '${launcher}'. Did you you install the '${launcher}' package?\n` +
                    `Make sure you have '${launcher}' in your package.json dependencies and in your package-lock.json, if you use it.`;
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
    constructor(launchContext, configuration = Configuration.getGlobalConfiguration()) {
        this.configuration = configuration;
        const { launcher, proxyUrl, useChrome, userAgent, launchOptions = {}, ...otherLaunchContextProps } = launchContext;
        this.validateProxyUrlProtocol(proxyUrl);
        // those need to be reassigned otherwise they are {} in types
        this.launcher = launcher;
        this.proxyUrl = proxyUrl;
        this.useChrome = useChrome;
        this.userAgent = userAgent;
        this.launchOptions = launchOptions;
        this.otherLaunchContextProps = otherLaunchContextProps;
    }
    /**
     * @ignore
     */
    createBrowserPlugin() {
        return new this.Plugin(this.launcher, {
            proxyUrl: this.proxyUrl,
            launchOptions: this.createLaunchOptions(),
            ...this.otherLaunchContextProps,
        });
    }
    /**
     * Builds a {@apilink BrowserPool} running a single plugin for this launcher's browser. Shared body of the
     * per-library `*BrowserPool()` factories, which exist so that configuring a pool never requires assembling
     * a plugin by hand — and therefore never lets the plugin drift away from the crawler it is used with.
     * @internal
     */
    createBrowserPool(options = {}) {
        // The hook types `BrowserPool` derives from `Plugin` are unresolvable while `Plugin` is still a free type
        // parameter, so the argument cannot be checked here. The concrete `*BrowserPool()` factories are where the
        // caller-facing hook types get pinned down.
        return new BrowserPool({
            ...this.resolveFingerprinting(options),
            browserPlugins: [this.createBrowserPlugin()],
        });
    }
    /**
     * The {@apilink RemoteBrowserPool} counterpart of {@apilink BrowserLauncher.createBrowserPool}: the launcher
     * supplies the plugin, the caller supplies the remote connection details.
     * @internal
     */
    createRemoteBrowserPool(options) {
        return new RemoteBrowserPool({
            ...options,
            browserPlugins: [this.createBrowserPlugin()],
            browserPoolOptions: this.resolveFingerprinting(options.browserPoolOptions ?? {}),
        });
    }
    /**
     * A custom `userAgent` and Crawlee's fingerprint injection would both write the same headers, so an
     * explicitly requested user agent wins.
     */
    resolveFingerprinting(options) {
        if (!this.userAgent) {
            return options;
        }
        if (options.useFingerprints) {
            serviceLocator
                .getLogger()
                .child({ prefix: 'BrowserLauncher' })
                .info('Custom user agent provided, disabling automatic browser fingerprint injection!');
        }
        return { ...options, useFingerprints: false };
    }
    /**
     * Launches a browser instance based on the plugin.
     * @returns Browser instance.
     */
    launch() {
        const plugin = this.createBrowserPlugin();
        const context = plugin.createLaunchContext();
        return plugin.launch(context);
    }
    createLaunchOptions() {
        const launchOptions = {
            args: [],
            defaultViewport: DEFAULT_VIEWPORT,
            ...this.launchOptions,
        };
        if (this.configuration.disableBrowserSandbox) {
            launchOptions.args.push('--no-sandbox');
        }
        if (this.userAgent) {
            launchOptions.args.push(`--user-agent=${this.userAgent}`);
        }
        if (launchOptions.headless == null) {
            launchOptions.headless = this.getDefaultHeadlessOption();
        }
        if (this.useChrome && !launchOptions.executablePath) {
            launchOptions.executablePath = this.getChromeExecutablePath();
        }
        return launchOptions;
    }
    getDefaultHeadlessOption() {
        return this.configuration.headless && !this.configuration.xvfb;
    }
    getChromeExecutablePath() {
        return this.configuration.chromeExecutablePath ?? this.getTypicalChromeExecutablePath();
    }
    /**
     * Gets a typical path to Chrome executable, depending on the current operating system.
     */
    getTypicalChromeExecutablePath() {
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
            }
            else if (fs.existsSync(path86)) {
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
    validateProxyUrlProtocol(proxyUrl) {
        if (!proxyUrl)
            return;
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
