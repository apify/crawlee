import { type CrawleeLogger, CriticalError } from '@crawlee/core';
import type { Dictionary } from '@crawlee/types';
import type { LaunchContextOptions } from '../launch-context.js';
import { LaunchContext } from '../launch-context.js';
import type { RemoteConnection, RemoteConnectionParameters } from '../remote-browser-pool.js';
import { type UnwrapPromise } from '../utils.js';
import type { BrowserController } from './browser-controller.js';
/**
 * The default User Agent used by `PlaywrightCrawler`, `launchPlaywright`, 'PuppeteerCrawler' and 'launchPuppeteer'
 * when Chromium/Chrome browser is launched:
 *  - in headless mode,
 *  - without using a fingerprint,
 *  - without specifying a user agent.
 * Last updated on 2022-05-05.
 *
 * After you update it here, please update it also in jsdom-crawler.ts
 */
export declare const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36";
/**
 * Each plugin expects an instance of the object with the `.launch()` property.
 * For Puppeteer, it is the `puppeteer` module itself, whereas for Playwright
 * it is one of the browser types, such as `puppeteer.chromium`.
 * `BrowserPlugin` does not include the library. You can choose any version
 * or fork of the library. It also keeps `browser-pool` installation small.
 */
export interface CommonLibrary {
    product?: string;
    launch(opts?: Dictionary): Promise<CommonBrowser>;
    name?: () => string;
}
export interface CommonBrowser {
    newPage(...args: unknown[]): Promise<CommonPage>;
}
export interface CommonPage {
    close(...args: unknown[]): Promise<unknown>;
    url(): string | Promise<string>;
    evaluate(pageFunction: ((...args: any[]) => unknown) | string, ...args: unknown[]): Promise<unknown>;
}
export interface BrowserPluginOptions<LibraryOptions> {
    /**
     * Options that will be passed down to the automation library. E.g.
     * `puppeteer.launch(launchOptions);`. This is a good place to set
     * options that you want to apply as defaults. To dynamically override
     * those options per-browser, see the `preLaunchHooks` of {@apilink BrowserPool}.
     */
    launchOptions?: LibraryOptions;
    /**
     * Automation libraries configure proxies differently. This helper allows you
     * to set a proxy URL without worrying about specific implementations.
     * It also allows you use an authenticated proxy without extra code.
     */
    proxyUrl?: string;
    /**
     * By default pages share the same browser context.
     * If set to true each page uses its own context that is destroyed once the page is closed or crashes.
     *
     * @default false
     */
    useIncognitoPages?: boolean;
    /**
     * Path to a User Data Directory, which stores browser session data like cookies and local storage.
     */
    userDataDir?: string;
    /**
     * If set to `true`, the crawler respects the proxy url generated for the given request.
     * This aligns the browser-based crawlers with the `HttpCrawler`.
     *
     * Might cause performance issues, as Crawlee might launch too many browser instances.
     */
    browserPerProxy?: boolean;
    /**
     * If set to `true`, TLS certificate errors from the upstream proxy will be ignored.
     * This is useful when using HTTPS proxies with self-signed certificates.
     */
    ignoreProxyCertificate?: boolean;
}
export interface CreateLaunchContextOptions<Library extends CommonLibrary, LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0], LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>, NewPageOptions = Parameters<LaunchResult['newPage']>[0], NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>> extends Partial<Omit<LaunchContextOptions<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>, 'browserPlugin'>> {
}
/**
 * The `BrowserPlugin` serves two purposes. First, it is the base class that
 * specialized controllers like `PuppeteerPlugin` or `PlaywrightPlugin` extend.
 * Second, it allows the user to configure the automation libraries and
 * feed them to {@apilink BrowserPool} for use.
 */
export declare abstract class BrowserPlugin<Library extends CommonLibrary = CommonLibrary, LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0], LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>, NewPageOptions = Parameters<LaunchResult['newPage']>[0], NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>> {
    readonly name: string;
    protected readonly log: CrawleeLogger;
    readonly library: Library;
    readonly launchOptions: LibraryOptions;
    readonly proxyUrl?: string;
    readonly userDataDir?: string;
    useIncognitoPages: boolean;
    readonly browserPerProxy?: boolean;
    readonly ignoreProxyCertificate?: boolean;
    /**
     * Set by {@apilink RemoteBrowserPool} when this plugin connects to a remote browser service instead of
     * launching locally. Holds the bridge the plugin uses to resolve endpoints and release sessions; all
     * remote-session policy lives in the pool, not here.
     *
     * @internal
     */
    remoteConnection?: RemoteConnection;
    /** Static connect() parameters for a remote connection (protocol, headers, …). @internal */
    remoteConnectionParameters?: RemoteConnectionParameters;
    constructor(library: Library, options?: BrowserPluginOptions<LibraryOptions>);
    /**
     * Configures this plugin to connect to a remote browser using the given {@apilink RemoteConnection}.
     * Called by {@apilink RemoteBrowserPool}; subclasses may override to apply library-specific defaults
     * (e.g. forcing incognito pages).
     *
     * @internal
     */
    useRemoteConnection(connection: RemoteConnection, parameters?: RemoteConnectionParameters): void;
    /**
     * Resolves a remote endpoint via the injected {@apilink RemoteConnection}, stores the session token on
     * the launch context (so the controller can release it on close), and runs the library-specific `connect`.
     * On failure the session is released and the error is wrapped in a {@apilink BrowserLaunchError}.
     *
     * Subclasses implement only the `connect` callback — the resolve / token / release / error-wrap scaffolding
     * lives here so it stays identical across plugins.
     */
    protected connectToRemoteBrowser(launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>, connect: (url: string) => Promise<LaunchResult>): Promise<LaunchResult>;
    /**
     * Creates a `LaunchContext` with all the information needed
     * to launch a browser. Aside from library specific launch options,
     * it also includes internal properties used by `BrowserPool` for
     * management of the pool and extra features.
     */
    createLaunchContext(options?: CreateLaunchContextOptions<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;
    abstract createController(): BrowserController<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;
    /**
     * Launches the browser using provided launch context.
     */
    launch(launchContext?: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): Promise<LaunchResult>;
    private mergeArgsToHideWebdriver;
    protected throwAugmentedLaunchError(cause: unknown, executablePath: string | undefined, dockerImage: string, moduleInstallCommand: string): never;
    /**
     * @private
     */
    protected abstract addProxyToLaunchOptions(launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): Promise<void>;
    protected abstract isChromiumBasedBrowser(launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): boolean;
    /**
     * @private
     */
    protected abstract _launch(launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): Promise<LaunchResult>;
}
export declare class BrowserLaunchError extends CriticalError {
    constructor(...args: ConstructorParameters<typeof CriticalError>);
}
