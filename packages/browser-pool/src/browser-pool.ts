import pLimit from 'p-limit';
import { nanoid } from 'nanoid';
import ow from 'ow';
import { TypedEmitter } from 'tiny-typed-emitter';
import { addTimeoutToPromise, tryCancel } from '@apify/timeout';
import { FingerprintInjector } from 'fingerprint-injector';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import { FingerprintGenerator } from 'fingerprint-generator';
import QuickLRU from 'quick-lru';
import type { BrowserController } from './abstract-classes/browser-controller';
import type { BrowserPlugin } from './abstract-classes/browser-plugin';
import { BROWSER_POOL_EVENTS } from './events';
import type { LaunchContext } from './launch-context';
import { log } from './logger';
import type { InferBrowserPluginArray, UnwrapPromise } from './utils';
import { createFingerprintPreLaunchHook, createPrePageCreateHook, createPostPageCreateHook } from './fingerprinting/hooks';
import type { FingerprintGeneratorOptions } from './fingerprinting/types';

const PAGE_CLOSE_KILL_TIMEOUT_MILLIS = 1000;
const BROWSER_KILLER_INTERVAL_MILLIS = 10 * 1000;

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
export type PrePageCreateHook<
    BC extends BrowserController,
    PO = Parameters<BC['newPage']>[0]
> = (pageId: string, browserController: BC, pageOptions?: PO) => void | Promise<void>;

/**
 * Post-page-create hooks are called right after a new page is created
 * and all internal actions of Browser Pool are completed. This is the
 * place to make changes to a page that you would like to apply to all
 * pages. Such as injecting a JavaScript library into all pages.
 * The hooks are called with two arguments:
 * `page`: `Page` and `browserController`: {@apilink BrowserController}
 */
export type PostPageCreateHook<
    BC extends BrowserController,
    Page = UnwrapPromise<ReturnType<BC['newPage']>>,
> = (page: Page, browserController: BC) => void | Promise<void>;

/**
 * Pre-page-close hooks give you the opportunity to make last second changes
 * in a page that's about to be closed, such as saving a snapshot or updating
 * state.
 * The hooks are called with two arguments:
 * `page`: `Page` and `browserController`: {@apilink BrowserController}
 */
export type PrePageCloseHook<
    BC extends BrowserController,
    Page = UnwrapPromise<ReturnType<BC['newPage']>>,
> = (page: Page, browserController: BC) => void | Promise<void>;

/**
 * Post-page-close hooks allow you to do page related clean up.
 * The hooks are called with two arguments:
 * `pageId`: `string` and `browserController`: {@apilink BrowserController}
 */
export type PostPageCloseHook<BC extends BrowserController> = (pageId: string, browserController: BC) => void | Promise<void>;

export interface BrowserPoolHooks<
    BC extends BrowserController,
    LC extends LaunchContext,
    PR extends UnwrapPromise<ReturnType<BC['newPage']>> = UnwrapPromise<ReturnType<BC['newPage']>>,
> {
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
export class BrowserPool<
    Options extends BrowserPoolOptions = BrowserPoolOptions,
    BrowserPlugins extends BrowserPlugin[] = InferBrowserPluginArray<Options['browserPlugins']>,
    BrowserControllerReturn extends BrowserController = ReturnType<BrowserPlugins[number]['createController']>,
    LaunchContextReturn extends LaunchContext = ReturnType<BrowserPlugins[number]['createLaunchContext']>,
    PageOptions = Parameters<BrowserControllerReturn['newPage']>[0],
    PageReturn extends UnwrapPromise<ReturnType<BrowserControllerReturn['newPage']>> = UnwrapPromise<ReturnType<BrowserControllerReturn['newPage']>>,
> extends TypedEmitter<BrowserPoolEvents<BrowserControllerReturn, PageReturn>> {
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
    pageCounter = 0;
    pages = new Map<string, PageReturn>();
    pageIds = new WeakMap<PageReturn, string>();
    activeBrowserControllers = new Set<BrowserControllerReturn>();
    retiredBrowserControllers = new Set<BrowserControllerReturn>();
    pageToBrowserController = new WeakMap<PageReturn, BrowserControllerReturn>();
    fingerprintInjector?: FingerprintInjector;
    fingerprintGenerator?: FingerprintGenerator;
    fingerprintCache?: QuickLRU<string, BrowserFingerprintWithHeaders>;

    private browserKillerInterval? = setInterval(
        () => this._closeInactiveRetiredBrowsers(),
        BROWSER_KILLER_INTERVAL_MILLIS,
    );

    private limiter = pLimit(1);

    constructor(options: Options & BrowserPoolHooks<BrowserControllerReturn, LaunchContextReturn, PageReturn>) {
        super();

        this.browserKillerInterval!.unref();

        ow(options, ow.object.exactShape({
            browserPlugins: ow.array.minLength(1),
            maxOpenPagesPerBrowser: ow.optional.number,
            retireBrowserAfterPageCount: ow.optional.number,
            operationTimeoutSecs: ow.optional.number,
            closeInactiveBrowserAfterSecs: ow.optional.number,
            preLaunchHooks: ow.optional.array,
            postLaunchHooks: ow.optional.array,
            prePageCreateHooks: ow.optional.array,
            postPageCreateHooks: ow.optional.array,
            prePageCloseHooks: ow.optional.array,
            postPageCloseHooks: ow.optional.array,
            useFingerprints: ow.optional.boolean,
            fingerprintOptions: ow.optional.object,
        }));

        const {
            browserPlugins,
            maxOpenPagesPerBrowser = 20,
            retireBrowserAfterPageCount = 100,
            operationTimeoutSecs = 15,
            closeInactiveBrowserAfterSecs = 300,
            preLaunchHooks = [],
            postLaunchHooks = [],
            prePageCreateHooks = [],
            postPageCreateHooks = [],
            prePageCloseHooks = [],
            postPageCloseHooks = [],
            useFingerprints = true,
            fingerprintOptions = {},
        } = options;

        const firstPluginConstructor = browserPlugins[0].constructor as typeof BrowserPlugin;

        for (let i = 1; i < browserPlugins.length; i++) {
            const providedPlugin = browserPlugins[i];

            if (!(providedPlugin instanceof firstPluginConstructor)) {
                const firstPluginName = firstPluginConstructor.name;
                const providedPluginName = (providedPlugin as BrowserPlugin).constructor.name;

                // eslint-disable-next-line max-len
                throw new Error(`Browser plugin at index ${i} (${providedPluginName}) is not an instance of the same plugin as the first plugin provided (${firstPluginName}).`);
            }
        }

        this.browserPlugins = browserPlugins as unknown as BrowserPlugins;
        this.maxOpenPagesPerBrowser = maxOpenPagesPerBrowser;
        this.retireBrowserAfterPageCount = retireBrowserAfterPageCount;
        this.operationTimeoutMillis = operationTimeoutSecs * 1000;
        this.closeInactiveBrowserAfterMillis = closeInactiveBrowserAfterSecs * 1000;
        this.useFingerprints = useFingerprints;
        this.fingerprintOptions = fingerprintOptions;

        // hooks
        this.preLaunchHooks = preLaunchHooks;
        this.postLaunchHooks = postLaunchHooks;
        this.prePageCreateHooks = prePageCreateHooks;
        this.postPageCreateHooks = postPageCreateHooks;
        this.prePageCloseHooks = prePageCloseHooks;
        this.postPageCloseHooks = postPageCloseHooks;

        // fingerprinting
        if (this.useFingerprints) {
            this._initializeFingerprinting();
        }
    }

    /**
     * Opens a new page in one of the running browsers or launches
     * a new browser and opens a page there, if no browsers are active,
     * or their page limits have been exceeded.
     */
    async newPage(options: BrowserPoolNewPageOptions<PageOptions, BrowserPlugins[number]> = {}): Promise<PageReturn> {
        const {
            id = nanoid(),
            pageOptions,
            browserPlugin = this._pickBrowserPlugin(),
            proxyUrl,
        } = options;

        if (this.pages.has(id)) {
            throw new Error(`Page with ID: ${id} already exists.`);
        }

        if (browserPlugin && !this.browserPlugins.includes(browserPlugin)) {
            throw new Error('Provided browserPlugin is not one of the plugins used by BrowserPool.');
        }

        // Limiter is necessary - https://github.com/apify/crawlee/issues/1126
        return this.limiter(async () => {
            let browserController = this._pickBrowserWithFreeCapacity(browserPlugin);
            if (!browserController) browserController = await this._launchBrowser(id, { browserPlugin });
            tryCancel();

            return this._createPageForBrowser(id, browserController, pageOptions, proxyUrl);
        });
    }

    /**
     * Unlike {@apilink newPage}, `newPageInNewBrowser` always launches a new
     * browser to open the page in. Use the `launchOptions` option to
     * configure the new browser.
     */
    async newPageInNewBrowser(options: BrowserPoolNewPageInNewBrowserOptions<PageOptions, BrowserPlugins[number]> = {}): Promise<PageReturn> {
        const {
            id = nanoid(),
            pageOptions,
            launchOptions,
            browserPlugin = this._pickBrowserPlugin(),
        } = options;

        if (this.pages.has(id)) {
            throw new Error(`Page with ID: ${id} already exists.`);
        }

        const browserController = await this._launchBrowser(id, { launchOptions, browserPlugin });
        tryCancel();
        return this._createPageForBrowser(id, browserController, pageOptions);
    }

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
    async newPageWithEachPlugin(
        optionsList: Omit<BrowserPoolNewPageOptions<PageOptions, BrowserPlugins[number]>, 'browserPlugin'>[] = [],
    ): Promise<PageReturn[]> {
        const pagePromises = this.browserPlugins.map((browserPlugin, idx) => {
            const userOptions = optionsList[idx] || {};
            return this.newPage({
                ...userOptions,
                browserPlugin,
            });
        });
        return Promise.all(pagePromises);
    }

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
    getBrowserControllerByPage(page: PageReturn): BrowserControllerReturn | undefined {
        return this.pageToBrowserController.get(page);
    }

    /**
     * If you provided a custom ID to one of your pages or saved the
     * randomly generated one, you can use this function to retrieve
     * the page. If the page is no longer open, the function will
     * return `undefined`.
     */
    getPage(id: string): PageReturn | undefined {
        return this.pages.get(id);
    }

    /**
     * Page IDs are used throughout `BrowserPool` as a method of linking
     * events. You can use a page ID to track the full lifecycle of the page.
     * It is created even before a browser is launched and stays with the page
     * until it's closed.
     */
    getPageId(page: PageReturn): string | undefined {
        return this.pageIds.get(page);
    }

    private async _createPageForBrowser(
        pageId: string,
        browserController: BrowserControllerReturn,
        pageOptions: PageOptions = {} as PageOptions,
        proxyUrl?: string,
    ) {
        // This is needed for concurrent newPage calls to wait for the browser launch.
        // It's not ideal though, we need to come up with a better API.
        // eslint-disable-next-line dot-notation -- accessing private property
        await browserController['isActivePromise'];
        tryCancel();

        const finalPageOptions = (browserController.launchContext.useIncognitoPages || browserController.launchContext.experimentalContainers)
            ? pageOptions
            : undefined;

        if (finalPageOptions) {
            Object.assign(finalPageOptions, browserController.normalizeProxyOptions(proxyUrl, pageOptions));
        }

        await this._executeHooks(this.prePageCreateHooks, pageId, browserController, finalPageOptions);
        tryCancel();

        let page: PageReturn;

        try {
            page = await addTimeoutToPromise(
                () => browserController.newPage(finalPageOptions),
                this.operationTimeoutMillis,
                'browserController.newPage() timed out.',
            ) as PageReturn;
            tryCancel();

            this.pages.set(pageId, page);
            this.pageIds.set(page, pageId);
            this.pageToBrowserController.set(page, browserController);

            // if you synchronously trigger a lot of page launches, browser will not get retired soon enough. Not sure if it's a problem, let's monitor it.
            if (browserController.totalPages >= this.retireBrowserAfterPageCount) {
                this.retireBrowserController(browserController);
            }

            this._overridePageClose(page);
        } catch (err) {
            this.retireBrowserController(browserController);
            throw new Error(`browserController.newPage() failed: ${browserController.id}\nCause:${(err as Error).message}.`);
        }

        await this._executeHooks(this.postPageCreateHooks, page, browserController);
        tryCancel();

        this.emit(BROWSER_POOL_EVENTS.PAGE_CREATED, page);

        return page;
    }

    /**
     * Removes a browser controller from the pool. The underlying
     * browser will be closed after all its pages are closed.
     *
     */
    retireBrowserController(browserController: BrowserControllerReturn): void {
        const hasBeenRetiredOrKilled = !this.activeBrowserControllers.has(browserController);
        if (hasBeenRetiredOrKilled) return;

        this.retiredBrowserControllers.add(browserController);
        this.emit(BROWSER_POOL_EVENTS.BROWSER_RETIRED, browserController);
        this.activeBrowserControllers.delete(browserController);
    }

    /**
     * Removes a browser from the pool. It will be
     * closed after all its pages are closed.
     */
    retireBrowserByPage(page: PageReturn): void {
        const browserController = this.getBrowserControllerByPage(page);
        if (browserController) this.retireBrowserController(browserController);
    }

    /**
     * Removes all active browsers from the pool. The browsers will be
     * closed after all their pages are closed.
     */
    retireAllBrowsers(): void {
        this.activeBrowserControllers.forEach((controller) => {
            this.retireBrowserController(controller);
        });
    }

    /**
     * Closes all managed browsers without waiting for pages to close.
     * @return {Promise<void>}
     */
    async closeAllBrowsers(): Promise<void> {
        const controllers = this._getAllBrowserControllers();
        const promises = [...controllers]
            .filter((controller) => controller.isActive)
            .map((controller) => controller.close());

        await Promise.all(promises);
    }

    /**
     * Closes all managed browsers and tears down the pool.
     */
    async destroy(): Promise<void> {
        clearInterval(this.browserKillerInterval!);
        this.browserKillerInterval = undefined;

        await this.closeAllBrowsers();

        this._teardown();
    }

    private _teardown() {
        this.activeBrowserControllers.clear();
        this.retiredBrowserControllers.clear();

        this.removeAllListeners();
    }

    private _getAllBrowserControllers() {
        return new Set([...this.activeBrowserControllers, ...this.retiredBrowserControllers]);
    }

    private async _launchBrowser(pageId: string, options: InternalLaunchBrowserOptions<BrowserPlugins[number]>) {
        const {
            browserPlugin,
            launchOptions,
        } = options;

        const browserController = browserPlugin.createController() as BrowserControllerReturn;
        this.activeBrowserControllers.add(browserController);

        const launchContext = browserPlugin.createLaunchContext({
            id: pageId,
            launchOptions,
        });

        try {
            // If the hooks or the launch fails, we need to delete the controller,
            // because otherwise it would be stuck in limbo without a browser.
            await this._executeHooks(this.preLaunchHooks, pageId, launchContext);
            tryCancel();
            const browser = await browserPlugin.launch(launchContext);
            tryCancel();
            browserController.assignBrowser(browser, launchContext);
        } catch (err) {
            this.activeBrowserControllers.delete(browserController);
            throw err;
        }

        log.debug('Launched new browser.', { id: browserController.id });

        try {
            // If the launch fails on the post-launch hooks, we need to clean up
            // both the controller and the browser before throwing.
            await this._executeHooks(this.postLaunchHooks, pageId, browserController);
        } catch (err) {
            this.activeBrowserControllers.delete(browserController);
            browserController.close().catch((closeErr) => {
                log.error(
                    `Could not close browser whose post-launch hooks failed.\nCause:${closeErr.message}`,
                    { id: browserController.id },
                );
            });
            throw err;
        }

        tryCancel();
        browserController.activate();
        this.emit(BROWSER_POOL_EVENTS.BROWSER_LAUNCHED, browserController);

        return browserController;
    }

    /**
     * Picks plugins round robin.
     * @private
     */
    private _pickBrowserPlugin() {
        const pluginIndex = this.pageCounter % this.browserPlugins.length;
        this.pageCounter++;

        return this.browserPlugins[pluginIndex];
    }

    private _pickBrowserWithFreeCapacity(browserPlugin: BrowserPlugin) {
        for (const controller of this.activeBrowserControllers) {
            const hasCapacity = controller.activePages < this.maxOpenPagesPerBrowser;
            const isCorrectPlugin = controller.browserPlugin === browserPlugin;
            if (hasCapacity && isCorrectPlugin) {
                return controller;
            }
        }
        return undefined;
    }

    private async _closeInactiveRetiredBrowsers() {
        const closedBrowserIds: string[] = [];

        for (const controller of this.retiredBrowserControllers) {
            const millisSinceLastPageOpened = Date.now() - controller.lastPageOpenedAt;
            const isBrowserIdle = millisSinceLastPageOpened >= this.closeInactiveBrowserAfterMillis;
            const isBrowserEmpty = controller.activePages === 0;

            if (isBrowserIdle || isBrowserEmpty) {
                const { id } = controller;
                log.debug('Closing retired browser.', { id });
                await controller.close();
                this.retiredBrowserControllers.delete(controller);
                closedBrowserIds.push(id);
            }
        }

        if (closedBrowserIds.length) {
            log.debug('Closed retired browsers.', {
                count: closedBrowserIds.length,
                closedBrowserIds,
            });
        }
    }

    private _overridePageClose(page: PageReturn) {
        const originalPageClose = page.close;
        const browserController = this.pageToBrowserController.get(page)!;
        const pageId = this.getPageId(page)!;

        page.close = async (...args: unknown[]) => {
            await this._executeHooks(this.prePageCloseHooks, page, browserController);

            await originalPageClose.apply(page, args)
                .catch((err: Error) => {
                    log.debug(`Could not close page.\nCause:${err.message}`, { id: browserController.id });
                });

            await this._executeHooks(this.postPageCloseHooks, pageId, browserController);

            this.pages.delete(pageId);
            this._closeRetiredBrowserWithNoPages(browserController);

            this.emit(BROWSER_POOL_EVENTS.PAGE_CLOSED, page);
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async _executeHooks(hooks: ((...args: any[]) => unknown)[], ...args: unknown[]) {
        for (const hook of hooks) {
            await hook(...args);
        }
    }

    private _closeRetiredBrowserWithNoPages(browserController: BrowserControllerReturn) {
        if (browserController.activePages === 0 && this.retiredBrowserControllers.has(browserController)) {
            // Run this with a delay, otherwise page.close()
            // might fail with "Protocol error (Target.closeTarget): Target closed."
            setTimeout(() => {
                log.debug('Closing retired browser because it has no active pages', { id: browserController.id });
                browserController.close().finally(() => {
                    this.retiredBrowserControllers.delete(browserController);
                });
            }, PAGE_CLOSE_KILL_TIMEOUT_MILLIS);
        }
    }

    private _initializeFingerprinting(): void {
        const { useFingerprintCache = true, fingerprintCacheSize = 10_000 } = this.fingerprintOptions;
        this.fingerprintGenerator = new FingerprintGenerator(this.fingerprintOptions.fingerprintGeneratorOptions);
        this.fingerprintInjector = new FingerprintInjector();

        if (useFingerprintCache) {
            this.fingerprintCache = new QuickLRU({ maxSize: fingerprintCacheSize });
        }

        this._addFingerprintHooks();
    }

    private _addFingerprintHooks() {
        this.preLaunchHooks = [
            ...this.preLaunchHooks,
            // This is flipped because of the fingerprint cache.
            // It is usual to generate proxy per browser and we want to know the proxyUrl for the caching.
            createFingerprintPreLaunchHook(this),
        ];
        this.prePageCreateHooks = [
            createPrePageCreateHook(),
            ...this.prePageCreateHooks,
        ];
        this.postPageCreateHooks = [
            createPostPageCreateHook(this.fingerprintInjector!),
            ...this.postPageCreateHooks,
        ];
    }
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

interface InternalLaunchBrowserOptions<BP extends BrowserPlugin> {
    browserPlugin: BP;
    launchOptions?: BP['launchOptions'];
}
