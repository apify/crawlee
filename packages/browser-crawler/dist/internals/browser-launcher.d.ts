import type { Dictionary, Constructor } from '@crawlee/utils';
import type { BrowserPlugin, BrowserPluginOptions } from '@crawlee/browser-pool';
import { Configuration } from '@crawlee/basic';
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
// @ts-ignore optional peer dependency
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
export declare abstract class BrowserLauncher<Plugin extends BrowserPlugin, Launcher = Plugin['library'], T extends Constructor<Plugin> = Constructor<Plugin>, LaunchOptions extends Dictionary<any> | undefined = Partial<Parameters<Plugin['launch']>[0]>, LaunchResult extends ReturnType<Plugin['launch']> = ReturnType<Plugin['launch']>> {
    readonly config: Configuration;
    launcher: Launcher;
    proxyUrl?: string;
    useChrome?: boolean;
    launchOptions: Dictionary;
    otherLaunchContextProps: Dictionary;
    Plugin: T;
    userAgent?: string;
    protected static optionsShape: {
        proxyUrl: import("ow").StringPredicate & import("ow").BasePredicate<string | undefined>;
        useChrome: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        useIncognitoPages: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        experimentalContainers: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        userDataDir: import("ow").StringPredicate & import("ow").BasePredicate<string | undefined>;
        launchOptions: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        userAgent: import("ow").StringPredicate & import("ow").BasePredicate<string | undefined>;
    };
    static requireLauncherOrThrow<T>(launcher: string, apifyImageName: string): T;
    /**
     * All `BrowserLauncher` parameters are passed via an launchContext object.
     */
    constructor(launchContext: BrowserLaunchContext<LaunchOptions, Launcher>, config?: Configuration);
    /**
     * @ignore
     */
    createBrowserPlugin(): Plugin;
    /**
     * Launches a browser instance based on the plugin.
     * @returns Browser instance.
     */
    launch(): LaunchResult;
    createLaunchOptions(): Dictionary;
    protected _getDefaultHeadlessOption(): boolean;
    protected _getChromeExecutablePath(): string;
    /**
     * Gets a typical path to Chrome executable, depending on the current operating system.
     */
    protected _getTypicalChromeExecutablePath(): string;
    protected _validateProxyUrlProtocol(proxyUrl?: string): void;
}
//# sourceMappingURL=browser-launcher.d.ts.map