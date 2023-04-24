import { TypedEmitter } from 'tiny-typed-emitter';
import { FingerprintInjector } from 'fingerprint-injector';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import { FingerprintGenerator } from 'fingerprint-generator';
import QuickLRU from 'quick-lru';
import type { BrowserController } from './abstract-classes/browser-controller';
import type { BrowserPlugin } from './abstract-classes/browser-plugin';
import { BROWSER_POOL_EVENTS } from './events';
import type { LaunchContext } from './launch-context';
import type { InferBrowserPluginArray, UnwrapPromise } from './utils';
import type { FingerprintGeneratorOptions } from './fingerprinting/types';
export interface BrowserPoolEvents<BC extends BrowserController, Page> {
    [BROWSER_POOL_EVENTS.PAGE_CREATED]: (page: Page) => void | Promise<void>;
    [BROWSER_POOL_EVENTS.PAGE_CLOSED]: (page: Page) => void | Promise<void>;
    [BROWSER_POOL_EVENTS.BROWSER_RETIRED]: (browserController: BC) => void | Promise<void>;
    [BROWSER_POOL_EVENTS.BROWSER_LAUNCHED]: (browserController: BC) => void | Promise<void>;
}
/**
 * Settings for the fingerprint generator and virtual session management system.
 *
 * > To set the specific fingerprint generation options (operating system, device type, screen dimensions), use the `fingerprintGeneratorOptions` property.
 */
export interface FingerprintOptions {
    /**
     * Customizes the fingerprint generation by setting e.g. the device type, operating system or screen size.
     */
    fingerprintGeneratorOptions?: FingerprintGeneratorOptions;
    /**
     * Enables the virtual session management system. This ties every Crawlee session with a specific browser fingerprint,
     * so your scraping activity seems more natural to the target website.
     * @default true
     */
    useFingerprintCache?: boolean;
    /**
    * The maximum number of fingerprints that can be stored in the cache.
    *
    * Only relevant if `useFingerprintCache` is set to `true`.
    * @default 10000
    */
    fingerprintCacheSize?: number;
}
export interface BrowserPoolOptions<Plugin extends BrowserPlugin = BrowserPlugin> {
    /**
     * Browser plugins are wrappers of browser automation libraries that
     * allow `BrowserPool` to control browsers with those libraries.
     * `browser-pool` comes with a `PuppeteerPlugin` and a `PlaywrightPlugin`.
     */
    browserPlugins: readonly Plugin[];
    /**
     * Sets the maximum number of pages that can be open in a browser at the
     * same time. Once reached, a new browser will be launched to handle the excess.
     *
     * @default 20
     */
    maxOpenPagesPerBrowser?: number;
    /**
     * Browsers tend to get bloated after processing a lot of pages. This option
     * configures the number of processed pages after which the browser will
     * automatically retire and close. A new browser will launch in its place.
     *
     * @default 100
     */
    retireBrowserAfterPageCount?: number;
    /**
     * As we know from experience, async operations of the underlying libraries,
     * such as launching a browser or opening a new page, can get stuck.
     * To prevent `BrowserPool` from getting stuck, we add a timeout
     * to those operations and you can configure it with this option.
     *
     * @default 15
     */
    operationTimeoutSecs?: number;
    /**
     * Browsers normally close immediately after their last page is processed.
     * However, there could be situations where this does not happen. Browser Pool
     * makes sure all inactive browsers are closed regularly, to free resources.
     *
     * @default 300
     */
    closeInactiveBrowserAfterSecs?: number;
    /**
     * @default true
     */
    useFingerprints?: boolean;
    fingerprintOptions?: FingerprintOptions;
}
/**
 * Pre-launch hooks are executed just before a browser is launched and provide
 * a good opportunity to dynamically change the launch options.
 * The hooks are called with two arguments:
 * `pageId`: `string` and `launchContext`: {@apilink LaunchContext}
 */
export type PreLaunchHook<LC extends LaunchContext> = (pageId: string, launchContext: LC) => void | Promise<void>;
/**
 * Post-launch hooks are executed as soon as a browser is launched.
 * The hooks are called with two arguments:
 * `pageId`: `string` and `browserController`: {@apilink BrowserController}
 * To guarantee order of execution before other hooks in the same browser,
 * the {@apilink BrowserController} methods cannot be used until the post-launch
 * hooks complete. If you attempt to call `await browserController.close()` from
 * a post-launch hook, it will deadlock the process. This API is subject to change.
 */
export type PostLaunchHook<BC extends BrowserController> = (pageId: string, browserController: BC) => void | Promise<void>;
/**
 * Pre-page-create hooks are executed just before a new page is created. They
 * are useful to make dynamic changes to the browser before opening a page.
 * The hooks are called with three arguments:
 * `pageId`: `string`, `browserController`: {@apilink BrowserController} and
 * `pageOptions`: `object|undefined` - This only works if the underlying `BrowserController` supports new page options.
 * So far, new page options are only supported by `PlaywrightController` in incognito contexts.
 * If the page options are not supported by `BrowserController` the `pageOptions` argument is `undefined`.
 */
export type PrePageCreateHook<BC extends BrowserController, PO = Parameters<BC['newPage']>[0]> = (pageId: string, browserController: BC, pageOptions?: PO) => void | Promise<void>;
/**
 * Post-page-create hooks are called right after a new page is created
 * and all internal actions of Browser Pool are completed. This is the
 * place to make changes to a page that you would like to apply to all
 * pages. Such as injecting a JavaScript library into all pages.
 * The hooks are called with two arguments:
 * `page`: `Page` and `browserController`: {@apilink BrowserController}
 */
export type PostPageCreateHook<BC extends BrowserController, Page = UnwrapPromise<ReturnType<BC['newPage']>>> = (page: Page, browserController: BC) => void | Promise<void>;
/**
 * Pre-page-close hooks give you the opportunity to make last second changes
 * in a page that's about to be closed, such as saving a snapshot or updating
 * state.
 * The hooks are called with two arguments:
 * `page`: `Page` and `browserController`: {@apilink BrowserController}
 */
export type PrePageCloseHook<BC extends BrowserController, Page = UnwrapPromise<ReturnType<BC['newPage']>>> = (page: Page, browserController: BC) => void | Promise<void>;
/**
 * Post-page-close hooks allow you to do page related clean up.
 * The hooks are called with two arguments:
 * `pageId`: `string` and `browserController`: {@apilink BrowserController}
 */
export type PostPageCloseHook<BC extends BrowserController> = (pageId: string, browserController: BC) => void | Promise<void>;
export interface BrowserPoolHooks<BC extends BrowserController, LC extends LaunchContext, PR extends UnwrapPromise<ReturnType<BC['newPage']>> = UnwrapPromise<ReturnType<BC['newPage']>>> {
    /**
     * Pre-launch hooks are executed just before a browser is launched and provide
     * a good opportunity to dynamically change the launch options.
     * The hooks are called with two arguments:
     * `pageId`: `string` and `launchContext`: {@apilink LaunchContext}
     */
    preLaunchHooks?: PreLaunchHook<LC>[];
    /**
     * Post-launch hooks are executed as soon as a browser is launched.
     * The hooks are called with two arguments:
     * `pageId`: `string` and `browserController`: {@apilink BrowserController}
     * To guarantee order of execution before other hooks in the same browser,
     * the {@apilink BrowserController} methods cannot be used until the post-launch
     * hooks complete. If you attempt to call `await browserController.close()` from
     * a post-launch hook, it will deadlock the process. This API is subject to change.
     */
    postLaunchHooks?: PostLaunchHook<BC>[];
    /**
     * Pre-page-create hooks are executed just before a new page is created. They
     * are useful to make dynamic changes to the browser before opening a page.
     * The hooks are called with three arguments:
     * `pageId`: `string`, `browserController`: {@apilink BrowserController} and
     * `pageOptions`: `object|undefined` - This only works if the underlying `BrowserController` supports new page options.
     * So far, new page options are only supported by `PlaywrightController` in incognito contexts.
     * If the page options are not supported by `BrowserController` the `pageOptions` argument is `undefined`.
     */
    prePageCreateHooks?: PrePageCreateHook<BC>[];
    /**
     * Post-page-create hooks are called right after a new page is created
     * and all internal actions of Browser Pool are completed. This is the
     * place to make changes to a page that you would like to apply to all
     * pages. Such as injecting a JavaScript library into all pages.
     * The hooks are called with two arguments:
     * `page`: `Page` and `browserController`: {@apilink BrowserController}
     */
    postPageCreateHooks?: PostPageCreateHook<BC, PR>[];
    /**
     * Pre-page-close hooks give you the opportunity to make last second changes
     * in a page that's about to be closed, such as saving a snapshot or updating
     * state.
     * The hooks are called with two arguments:
     * `page`: `Page` and `browserController`: {@apilink BrowserController}
     */
    prePageCloseHooks?: PrePageCloseHook<BC, PR>[];
    /**
     * Post-page-close hooks allow you to do page related clean up.
     * The hooks are called with two arguments:
     * `pageId`: `string` and `browserController`: {@apilink BrowserController}
     */
    postPageCloseHooks?: PostPageCloseHook<BC>[];
}
/**
 * The `BrowserPool` class is the most important class of the `browser-pool` module.
 * It manages opening and closing of browsers and their pages and its constructor
 * options allow easy configuration of the browsers' and pages' lifecycle.
 *
 * The most important and useful constructor options are the various lifecycle hooks.
 * Those allow you to sequentially call a list of (asynchronous) functions at each
 * stage of the browser / page lifecycle.
 *
 * **Example:**
 * ```js
 * import { BrowserPool, PlaywrightPlugin } from '@crawlee/browser-pool';
// @ts-ignore optional peer dependency
 * import playwright from 'playwright';
 *
 * const browserPool = new BrowserPool({
 *     browserPlugins: [new PlaywrightPlugin(playwright.chromium)],
 *     preLaunchHooks: [(pageId, launchContext) => {
 *         // do something before a browser gets launched
 *         launchContext.launchOptions.headless = false;
 *     }],
 *     postLaunchHooks: [(pageId, browserController) => {
 *         // manipulate the browser right after launch
 *         console.dir(browserController.browser.contexts());
 *     }],
 *     prePageCreateHooks: [(pageId, browserController) => {
 *         if (pageId === 'my-page') {
 *             // make changes right before a specific page is created
 *         }
 *     }],
 *     postPageCreateHooks: [async (page, browserController) => {
 *         // update some or all new pages
 *         await page.evaluate(() => {
 *             // now all pages will have 'foo'
 *             window.foo = 'bar'
 *         })
 *     }],
 *     prePageCloseHooks: [async (page, browserController) => {
 *         // collect information just before a page closes
 *         await page.screenshot();
 *     }],
 *     postPageCloseHooks: [(pageId, browserController) => {
 *         // clean up or log after a job is done
 *         console.log('Page closed: ', pageId)
 *     }]
 * });
 * ```
 */
export declare class BrowserPool<Options extends BrowserPoolOptions = BrowserPoolOptions, BrowserPlugins extends BrowserPlugin[] = InferBrowserPluginArray<Options['browserPlugins']>, BrowserControllerReturn extends BrowserController = ReturnType<BrowserPlugins[number]['createController']>, LaunchContextReturn extends LaunchContext = ReturnType<BrowserPlugins[number]['createLaunchContext']>, PageOptions = Parameters<BrowserControllerReturn['newPage']>[0], PageReturn extends UnwrapPromise<ReturnType<BrowserControllerReturn['newPage']>> = UnwrapPromise<ReturnType<BrowserControllerReturn['newPage']>>> extends TypedEmitter<BrowserPoolEvents<BrowserControllerReturn, PageReturn>> {
    browserPlugins: BrowserPlugins;
    maxOpenPagesPerBrowser: number;
    retireBrowserAfterPageCount: number;
    operationTimeoutMillis: number;
    closeInactiveBrowserAfterMillis: number;
    useFingerprints?: boolean;
    fingerprintOptions: FingerprintOptions;
    preLaunchHooks: PreLaunchHook<LaunchContextReturn>[];
    postLaunchHooks: PostLaunchHook<BrowserControllerReturn>[];
    prePageCreateHooks: PrePageCreateHook<BrowserControllerReturn, PageOptions>[];
    postPageCreateHooks: PostPageCreateHook<BrowserControllerReturn, PageReturn>[];
    prePageCloseHooks: PrePageCloseHook<BrowserControllerReturn, PageReturn>[];
    postPageCloseHooks: PostPageCloseHook<BrowserControllerReturn>[];
    pageCounter: number;
    pages: Map<string, PageReturn>;
    pageIds: WeakMap<PageReturn, string>;
    activeBrowserControllers: Set<BrowserControllerReturn>;
    retiredBrowserControllers: Set<BrowserControllerReturn>;
    pageToBrowserController: WeakMap<PageReturn, BrowserControllerReturn>;
    fingerprintInjector?: FingerprintInjector;
    fingerprintGenerator?: FingerprintGenerator;
    fingerprintCache?: QuickLRU<string, BrowserFingerprintWithHeaders>;
    private browserKillerInterval?;
    private limiter;
    constructor(options: Options & BrowserPoolHooks<BrowserControllerReturn, LaunchContextReturn, PageReturn>);
    /**
     * Opens a new page in one of the running browsers or launches
     * a new browser and opens a page there, if no browsers are active,
     * or their page limits have been exceeded.
     */
    newPage(options?: BrowserPoolNewPageOptions<PageOptions, BrowserPlugins[number]>): Promise<PageReturn>;
    /**
     * Unlike {@apilink newPage}, `newPageInNewBrowser` always launches a new
     * browser to open the page in. Use the `launchOptions` option to
     * configure the new browser.
     */
    newPageInNewBrowser(options?: BrowserPoolNewPageInNewBrowserOptions<PageOptions, BrowserPlugins[number]>): Promise<PageReturn>;
    /**
     * Opens new pages with all available plugins and returns an array
     * of pages in the same order as the plugins were provided to `BrowserPool`.
     * This is useful when you want to run a script in multiple environments
     * at the same time, typically in testing or website analysis.
     *
     * **Example:**
     * ```js
     * const browserPool = new BrowserPool({
     *     browserPlugins: [
     *         new PlaywrightPlugin(playwright.chromium),
     *         new PlaywrightPlugin(playwright.firefox),
     *         new PlaywrightPlugin(playwright.webkit),
     *     ]
     * });
     *
     * const pages = await browserPool.newPageWithEachPlugin();
     * const [chromiumPage, firefoxPage, webkitPage] = pages;
     * ```
     */
    newPageWithEachPlugin(optionsList?: Omit<BrowserPoolNewPageOptions<PageOptions, BrowserPlugins[number]>, 'browserPlugin'>[]): Promise<PageReturn[]>;
    /**
     * Retrieves a {@apilink BrowserController} for a given page. This is useful
     * when you're working only with pages and need to access the browser
     * manipulation functionality.
     *
     * You could access the browser directly from the page,
     * but that would circumvent `BrowserPool` and most likely
     * cause weird things to happen, so please always use `BrowserController`
     * to control your browsers. The function returns `undefined` if the
     * browser is closed.
     *
     * @param page - Browser plugin page
     */
    getBrowserControllerByPage(page: PageReturn): BrowserControllerReturn | undefined;
    /**
     * If you provided a custom ID to one of your pages or saved the
     * randomly generated one, you can use this function to retrieve
     * the page. If the page is no longer open, the function will
     * return `undefined`.
     */
    getPage(id: string): PageReturn | undefined;
    /**
     * Page IDs are used throughout `BrowserPool` as a method of linking
     * events. You can use a page ID to track the full lifecycle of the page.
     * It is created even before a browser is launched and stays with the page
     * until it's closed.
     */
    getPageId(page: PageReturn): string | undefined;
    private _createPageForBrowser;
    /**
     * Removes a browser controller from the pool. The underlying
     * browser will be closed after all its pages are closed.
     *
     */
    retireBrowserController(browserController: BrowserControllerReturn): void;
    /**
     * Removes a browser from the pool. It will be
     * closed after all its pages are closed.
     */
    retireBrowserByPage(page: PageReturn): void;
    /**
     * Removes all active browsers from the pool. The browsers will be
     * closed after all their pages are closed.
     */
    retireAllBrowsers(): void;
    /**
     * Closes all managed browsers without waiting for pages to close.
     * @return {Promise<void>}
     */
    closeAllBrowsers(): Promise<void>;
    /**
     * Closes all managed browsers and tears down the pool.
     */
    destroy(): Promise<void>;
    private _teardown;
    private _getAllBrowserControllers;
    private _launchBrowser;
    /**
     * Picks plugins round robin.
     * @private
     */
    private _pickBrowserPlugin;
    private _pickBrowserWithFreeCapacity;
    private _closeInactiveRetiredBrowsers;
    private _overridePageClose;
    private _executeHooks;
    private _closeRetiredBrowserWithNoPages;
    private _initializeFingerprinting;
    private _addFingerprintHooks;
}
export interface BrowserPoolNewPageOptions<PageOptions, BP extends BrowserPlugin> {
    /**
     * Assign a custom ID to the page. If you don't a random string ID
     * will be generated.
     */
    id?: string;
    /**
     * Some libraries (Playwright) allow you to open new pages with specific
     * options. Use this property to set those options.
     */
    pageOptions?: PageOptions;
    /**
     * Choose a plugin to open the page with. If none is provided,
     * one of the pool's available plugins will be used.
     *
     * It must be one of the plugins browser pool was created with.
     * If you wish to start a browser with a different configuration,
     * see the `newPageInNewBrowser` function.
     */
    browserPlugin?: BP;
    /**
     * Proxy URL.
     */
    proxyUrl?: string;
}
export interface BrowserPoolNewPageInNewBrowserOptions<PageOptions, BP extends BrowserPlugin> {
    /**
     * Assign a custom ID to the page. If you don't a random string ID
     * will be generated.
     */
    id?: string;
    /**
     * Some libraries (Playwright) allow you to open new pages with specific
     * options. Use this property to set those options.
     */
    pageOptions?: PageOptions;
    /**
     *  Provide a plugin to launch the browser. If none is provided,
     *  one of the pool's available plugins will be used.
     *
     *  If you configured `BrowserPool` to rotate multiple libraries,
     *  such as both Puppeteer and Playwright, you should always set
     *  the `browserPlugin` when using the `launchOptions` option.
     *
     *  The plugin will not be added to the list of plugins used by
     *  the pool. You can either use one of those, to launch a specific
     *  browser, or provide a completely new configuration.
     */
    browserPlugin?: BP;
    /**
     * Options that will be used to launch the new browser.
     */
    launchOptions?: BP['launchOptions'];
}
//# sourceMappingURL=browser-pool.d.ts.map