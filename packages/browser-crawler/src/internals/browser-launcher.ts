import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';

import { Configuration, serviceLocator } from '@crawlee/basic';
import type {
    BrowserPlugin,
    BrowserPluginOptions,
    BrowserPoolHooks,
    BrowserPoolOptions,
    RemoteBrowserPoolOptions,
} from '@crawlee/browser-pool';
import { BrowserPool, RemoteBrowserPool } from '@crawlee/browser-pool';
import type { Constructor, Dictionary } from '@crawlee/types';
import { schemas } from '@crawlee/utils/internal';
import { z } from 'zod';

const DEFAULT_VIEWPORT = {
    width: 1366,
    height: 768,
};

const require = createRequire(import.meta.url);

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
     * If set to `true`, the crawler respects the proxy url generated for the given request.
     * This aligns the browser-based crawlers with the `HttpCrawler`.
     *
     * Might cause performance issues, as Crawlee might launch too many browser instances.
     */
    browserPerProxy?: boolean;

    /**
     * With this option selected, all pages will be opened in a new incognito browser context.
     * This means they will not share cookies nor cache and their resources will not be throttled by one another.
     * @default false
     */
    useIncognitoPages?: boolean;

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
     * If set to `true`, TLS certificate errors from the upstream proxy will be ignored.
     * This is useful when using HTTPS proxies with self-signed certificates.
     */
    ignoreProxyCertificate?: boolean;

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
     * For more details, check out the [example](https://crawlee.dev/js/docs/examples/playwright-crawler-firefox).
     */
    launcher?: Launcher;
}

/**
 * The {@apilink BrowserPool} options a launcher-built pool accepts: everything the pool itself takes except
 * `browserPlugins`, which the launcher derives from its launch context. The hooks are deliberately unconstrained -
 * the browser they run against is only known to the concrete `*BrowserPool()` factory, which is where the
 * caller-facing types are pinned down.
 */
export type LauncherBrowserPoolOptions = Omit<BrowserPoolOptions, 'browserPlugins'> & {
    [Hook in keyof BrowserPoolHooks<any, any, any>]?: readonly ((...args: any[]) => unknown)[];
};

/**
 * The {@apilink RemoteBrowserPool} counterpart of {@apilink LauncherBrowserPoolOptions}.
 */
export type LauncherRemoteBrowserPoolOptions = Omit<RemoteBrowserPoolOptions, 'browserPlugins'>;

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

    /**
     * @internal
     */
    protected static optionsShape = {
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
    protected static optionsSchema = z.strictObject(BrowserLauncher.optionsShape);

    static requireLauncherOrThrow<T>(launcher: string, apifyImageName: string): T {
        try {
            return require(launcher); // eslint-disable-line
        } catch (err) {
            const e = err as Error & { code: string };
            if (e.code === 'MODULE_NOT_FOUND') {
                const msg =
                    `Cannot find module '${launcher}'. Did you you install the '${launcher}' package?\n` +
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
    constructor(
        launchContext: BrowserLaunchContext<LaunchOptions, Launcher>,
        readonly configuration = Configuration.getGlobalConfiguration(),
    ) {
        const {
            launcher,
            proxyUrl,
            useChrome,
            userAgent,
            launchOptions = {},
            ...otherLaunchContextProps
        } = launchContext;

        this.validateProxyUrlProtocol(proxyUrl);

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
     * Builds a {@apilink BrowserPool} running a single plugin for this launcher's browser. Shared body of the
     * per-library `*BrowserPool()` factories, which exist so that configuring a pool never requires assembling
     * a plugin by hand — and therefore never lets the plugin drift away from the crawler it is used with.
     * @internal
     */
    createBrowserPool(options: LauncherBrowserPoolOptions = {}): BrowserPool<{ browserPlugins: [Plugin] }, [Plugin]> {
        // The hook types `BrowserPool` derives from `Plugin` are unresolvable while `Plugin` is still a free type
        // parameter, so the argument cannot be checked here. The concrete `*BrowserPool()` factories are where the
        // caller-facing hook types get pinned down.
        return new BrowserPool<{ browserPlugins: [Plugin] }, [Plugin]>({
            ...this.resolveFingerprinting(options),
            browserPlugins: [this.createBrowserPlugin()],
        } as any);
    }

    /**
     * The {@apilink RemoteBrowserPool} counterpart of {@apilink BrowserLauncher.createBrowserPool}: the launcher
     * supplies the plugin, the caller supplies the remote connection details.
     * @internal
     */
    createRemoteBrowserPool<Page>(options: LauncherRemoteBrowserPoolOptions): RemoteBrowserPool<Page> {
        return new RemoteBrowserPool<Page>({
            ...options,
            browserPlugins: [this.createBrowserPlugin()],
            browserPoolOptions: this.resolveFingerprinting(options.browserPoolOptions ?? {}),
        });
    }

    /**
     * A custom `userAgent` and Crawlee's fingerprint injection would both write the same headers, so an
     * explicitly requested user agent wins.
     */
    private resolveFingerprinting<T extends { useFingerprints?: boolean }>(options: T): T {
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

    protected getDefaultHeadlessOption(): boolean {
        return this.configuration.headless && !this.configuration.xvfb;
    }

    private getChromeExecutablePath(): string {
        return this.configuration.chromeExecutablePath ?? this.getTypicalChromeExecutablePath();
    }

    /**
     * Gets a typical path to Chrome executable, depending on the current operating system.
     */
    private getTypicalChromeExecutablePath(): string {
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

    private validateProxyUrlProtocol(proxyUrl?: string): void {
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
