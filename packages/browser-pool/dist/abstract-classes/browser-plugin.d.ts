import type { Dictionary } from '@crawlee/types';
import type { LaunchContextOptions } from '../launch-context';
import { LaunchContext } from '../launch-context';
import type { BrowserController } from './browser-controller';
import type { UnwrapPromise } from '../utils';
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
/** @internal */
export interface CommonBrowser {
    newPage(...args: unknown[]): Promise<CommonPage>;
}
/** @internal */
export interface CommonPage {
    close(...args: unknown[]): Promise<unknown>;
    url(): string | Promise<string>;
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
     * @experimental
     * Like `useIncognitoPages`, but for persistent contexts, so cache is used for faster loading.
     * Works best with Firefox. Unstable on Chromium.
     */
    experimentalContainers?: boolean;
    /**
     * Path to a User Data Directory, which stores browser session data like cookies and local storage.
     */
    userDataDir?: string;
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
    name: string;
    library: Library;
    launchOptions: LibraryOptions;
    proxyUrl?: string;
    userDataDir?: string;
    useIncognitoPages: boolean;
    experimentalContainers: boolean;
    constructor(library: Library, options?: BrowserPluginOptions<LibraryOptions>);
    /**
     * Creates a `LaunchContext` with all the information needed
     * to launch a browser. Aside from library specific launch options,
     * it also includes internal properties used by `BrowserPool` for
     * management of the pool and extra features.
     */
    createLaunchContext(options?: CreateLaunchContextOptions<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;
    createController(): BrowserController<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;
    /**
     * Launches the browser using provided launch context.
     */
    launch(launchContext?: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): Promise<LaunchResult>;
    private _mergeArgsToHideWebdriver;
    /**
     * @private
     */
    protected abstract _addProxyToLaunchOptions(launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): Promise<void>;
    protected abstract _isChromiumBasedBrowser(launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): boolean;
    /**
     * @private
     */
    protected abstract _launch(launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): Promise<LaunchResult>;
    /**
     * @private
     */
    protected abstract _createController(): BrowserController<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;
}
//# sourceMappingURL=browser-plugin.d.ts.map