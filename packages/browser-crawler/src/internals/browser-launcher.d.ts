import { Configuration } from '@crawlee/basic';
import type { BrowserPlugin, BrowserPluginOptions, BrowserPoolHooks, BrowserPoolOptions, RemoteBrowserPoolOptions } from '@crawlee/browser-pool';
import { BrowserPool, RemoteBrowserPool } from '@crawlee/browser-pool';
import type { Constructor, Dictionary } from '@crawlee/types';
import { z } from 'zod';
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
export declare abstract class BrowserLauncher<Plugin extends BrowserPlugin, Launcher = Plugin['library'], T extends Constructor<Plugin> = Constructor<Plugin>, LaunchOptions extends Dictionary<any> | undefined = Partial<Parameters<Plugin['launch']>[0]>, LaunchResult extends ReturnType<Plugin['launch']> = ReturnType<Plugin['launch']>> {
    readonly configuration: Configuration;
    launcher: Launcher;
    proxyUrl?: string;
    useChrome?: boolean;
    launchOptions: Dictionary;
    otherLaunchContextProps: Dictionary;
    Plugin: T;
    userAgent?: string;
    /**
     * @internal
     */
    protected static optionsShape: {
        proxyUrl: z.ZodOptional<z.ZodURL>;
        useChrome: z.ZodOptional<z.ZodBoolean>;
        useIncognitoPages: z.ZodOptional<z.ZodBoolean>;
        browserPerProxy: z.ZodOptional<z.ZodBoolean>;
        ignoreProxyCertificate: z.ZodOptional<z.ZodBoolean>;
        userDataDir: z.ZodOptional<z.ZodString>;
        launchOptions: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        userAgent: z.ZodOptional<z.ZodString>;
    };
    /** @internal */
    protected static optionsSchema: z.ZodObject<{
        proxyUrl: z.ZodOptional<z.ZodURL>;
        useChrome: z.ZodOptional<z.ZodBoolean>;
        useIncognitoPages: z.ZodOptional<z.ZodBoolean>;
        browserPerProxy: z.ZodOptional<z.ZodBoolean>;
        ignoreProxyCertificate: z.ZodOptional<z.ZodBoolean>;
        userDataDir: z.ZodOptional<z.ZodString>;
        launchOptions: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        userAgent: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    static requireLauncherOrThrow<T>(launcher: string, apifyImageName: string): T;
    /**
     * All `BrowserLauncher` parameters are passed via an launchContext object.
     */
    constructor(launchContext: BrowserLaunchContext<LaunchOptions, Launcher>, configuration?: Configuration);
    /**
     * @ignore
     */
    createBrowserPlugin(): Plugin;
    /**
     * Builds a {@apilink BrowserPool} running a single plugin for this launcher's browser. Shared body of the
     * per-library `*BrowserPool()` factories, which exist so that configuring a pool never requires assembling
     * a plugin by hand — and therefore never lets the plugin drift away from the crawler it is used with.
     * @internal
     */
    createBrowserPool(options?: LauncherBrowserPoolOptions): BrowserPool<{
        browserPlugins: [Plugin];
    }, [Plugin]>;
    /**
     * The {@apilink RemoteBrowserPool} counterpart of {@apilink BrowserLauncher.createBrowserPool}: the launcher
     * supplies the plugin, the caller supplies the remote connection details.
     * @internal
     */
    createRemoteBrowserPool<Page>(options: LauncherRemoteBrowserPoolOptions): RemoteBrowserPool<Page>;
    /**
     * A custom `userAgent` and Crawlee's fingerprint injection would both write the same headers, so an
     * explicitly requested user agent wins.
     */
    private resolveFingerprinting;
    /**
     * Launches a browser instance based on the plugin.
     * @returns Browser instance.
     */
    launch(): LaunchResult;
    createLaunchOptions(): Dictionary;
    protected getDefaultHeadlessOption(): boolean;
    private getChromeExecutablePath;
    /**
     * Gets a typical path to Chrome executable, depending on the current operating system.
     */
    private getTypicalChromeExecutablePath;
    private validateProxyUrlProtocol;
}
