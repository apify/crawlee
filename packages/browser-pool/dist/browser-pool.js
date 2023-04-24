"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserPool = void 0;
const tslib_1 = require("tslib");
const p_limit_1 = tslib_1.__importDefault(require("p-limit"));
const nanoid_1 = require("nanoid");
const ow_1 = tslib_1.__importDefault(require("ow"));
const tiny_typed_emitter_1 = require("tiny-typed-emitter");
const timeout_1 = require("@apify/timeout");
const fingerprint_injector_1 = require("fingerprint-injector");
const fingerprint_generator_1 = require("fingerprint-generator");
const quick_lru_1 = tslib_1.__importDefault(require("quick-lru"));
const logger_1 = require("./logger");
const hooks_1 = require("./fingerprinting/hooks");
const PAGE_CLOSE_KILL_TIMEOUT_MILLIS = 1000;
const BROWSER_KILLER_INTERVAL_MILLIS = 10 * 1000;
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
class BrowserPool extends tiny_typed_emitter_1.TypedEmitter {
    constructor(options) {
        super();
        Object.defineProperty(this, "browserPlugins", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxOpenPagesPerBrowser", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "retireBrowserAfterPageCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "operationTimeoutMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "closeInactiveBrowserAfterMillis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "useFingerprints", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "fingerprintOptions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "preLaunchHooks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "postLaunchHooks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "prePageCreateHooks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "postPageCreateHooks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "prePageCloseHooks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "postPageCloseHooks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pageCounter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "pages", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "pageIds", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new WeakMap()
        });
        Object.defineProperty(this, "activeBrowserControllers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "retiredBrowserControllers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "pageToBrowserController", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new WeakMap()
        });
        Object.defineProperty(this, "fingerprintInjector", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "fingerprintGenerator", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "fingerprintCache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "browserKillerInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: setInterval(() => this._closeInactiveRetiredBrowsers(), BROWSER_KILLER_INTERVAL_MILLIS)
        });
        Object.defineProperty(this, "limiter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, p_limit_1.default)(1)
        });
        this.browserKillerInterval.unref();
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            browserPlugins: ow_1.default.array.minLength(1),
            maxOpenPagesPerBrowser: ow_1.default.optional.number,
            retireBrowserAfterPageCount: ow_1.default.optional.number,
            operationTimeoutSecs: ow_1.default.optional.number,
            closeInactiveBrowserAfterSecs: ow_1.default.optional.number,
            preLaunchHooks: ow_1.default.optional.array,
            postLaunchHooks: ow_1.default.optional.array,
            prePageCreateHooks: ow_1.default.optional.array,
            postPageCreateHooks: ow_1.default.optional.array,
            prePageCloseHooks: ow_1.default.optional.array,
            postPageCloseHooks: ow_1.default.optional.array,
            useFingerprints: ow_1.default.optional.boolean,
            fingerprintOptions: ow_1.default.optional.object,
        }));
        const { browserPlugins, maxOpenPagesPerBrowser = 20, retireBrowserAfterPageCount = 100, operationTimeoutSecs = 15, closeInactiveBrowserAfterSecs = 300, preLaunchHooks = [], postLaunchHooks = [], prePageCreateHooks = [], postPageCreateHooks = [], prePageCloseHooks = [], postPageCloseHooks = [], useFingerprints = true, fingerprintOptions = {}, } = options;
        const firstPluginConstructor = browserPlugins[0].constructor;
        for (let i = 1; i < browserPlugins.length; i++) {
            const providedPlugin = browserPlugins[i];
            if (!(providedPlugin instanceof firstPluginConstructor)) {
                const firstPluginName = firstPluginConstructor.name;
                const providedPluginName = providedPlugin.constructor.name;
                // eslint-disable-next-line max-len
                throw new Error(`Browser plugin at index ${i} (${providedPluginName}) is not an instance of the same plugin as the first plugin provided (${firstPluginName}).`);
            }
        }
        this.browserPlugins = browserPlugins;
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
    async newPage(options = {}) {
        const { id = (0, nanoid_1.nanoid)(), pageOptions, browserPlugin = this._pickBrowserPlugin(), proxyUrl, } = options;
        if (this.pages.has(id)) {
            throw new Error(`Page with ID: ${id} already exists.`);
        }
        if (browserPlugin && !this.browserPlugins.includes(browserPlugin)) {
            throw new Error('Provided browserPlugin is not one of the plugins used by BrowserPool.');
        }
        // Limiter is necessary - https://github.com/apify/crawlee/issues/1126
        return this.limiter(async () => {
            let browserController = this._pickBrowserWithFreeCapacity(browserPlugin);
            if (!browserController)
                browserController = await this._launchBrowser(id, { browserPlugin });
            (0, timeout_1.tryCancel)();
            return this._createPageForBrowser(id, browserController, pageOptions, proxyUrl);
        });
    }
    /**
     * Unlike {@apilink newPage}, `newPageInNewBrowser` always launches a new
     * browser to open the page in. Use the `launchOptions` option to
     * configure the new browser.
     */
    async newPageInNewBrowser(options = {}) {
        const { id = (0, nanoid_1.nanoid)(), pageOptions, launchOptions, browserPlugin = this._pickBrowserPlugin(), } = options;
        if (this.pages.has(id)) {
            throw new Error(`Page with ID: ${id} already exists.`);
        }
        const browserController = await this._launchBrowser(id, { launchOptions, browserPlugin });
        (0, timeout_1.tryCancel)();
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
    async newPageWithEachPlugin(optionsList = []) {
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
    getBrowserControllerByPage(page) {
        return this.pageToBrowserController.get(page);
    }
    /**
     * If you provided a custom ID to one of your pages or saved the
     * randomly generated one, you can use this function to retrieve
     * the page. If the page is no longer open, the function will
     * return `undefined`.
     */
    getPage(id) {
        return this.pages.get(id);
    }
    /**
     * Page IDs are used throughout `BrowserPool` as a method of linking
     * events. You can use a page ID to track the full lifecycle of the page.
     * It is created even before a browser is launched and stays with the page
     * until it's closed.
     */
    getPageId(page) {
        return this.pageIds.get(page);
    }
    async _createPageForBrowser(pageId, browserController, pageOptions = {}, proxyUrl) {
        // This is needed for concurrent newPage calls to wait for the browser launch.
        // It's not ideal though, we need to come up with a better API.
        // eslint-disable-next-line dot-notation -- accessing private property
        await browserController['isActivePromise'];
        (0, timeout_1.tryCancel)();
        const finalPageOptions = (browserController.launchContext.useIncognitoPages || browserController.launchContext.experimentalContainers)
            ? pageOptions
            : undefined;
        if (finalPageOptions) {
            Object.assign(finalPageOptions, browserController.normalizeProxyOptions(proxyUrl, pageOptions));
        }
        await this._executeHooks(this.prePageCreateHooks, pageId, browserController, finalPageOptions);
        (0, timeout_1.tryCancel)();
        let page;
        try {
            page = await (0, timeout_1.addTimeoutToPromise)(() => browserController.newPage(finalPageOptions), this.operationTimeoutMillis, 'browserController.newPage() timed out.');
            (0, timeout_1.tryCancel)();
            this.pages.set(pageId, page);
            this.pageIds.set(page, pageId);
            this.pageToBrowserController.set(page, browserController);
            // if you synchronously trigger a lot of page launches, browser will not get retired soon enough. Not sure if it's a problem, let's monitor it.
            if (browserController.totalPages >= this.retireBrowserAfterPageCount) {
                this.retireBrowserController(browserController);
            }
            this._overridePageClose(page);
        }
        catch (err) {
            this.retireBrowserController(browserController);
            throw new Error(`browserController.newPage() failed: ${browserController.id}\nCause:${err.message}.`);
        }
        await this._executeHooks(this.postPageCreateHooks, page, browserController);
        (0, timeout_1.tryCancel)();
        this.emit("pageCreated" /* BROWSER_POOL_EVENTS.PAGE_CREATED */, page);
        return page;
    }
    /**
     * Removes a browser controller from the pool. The underlying
     * browser will be closed after all its pages are closed.
     *
     */
    retireBrowserController(browserController) {
        const hasBeenRetiredOrKilled = !this.activeBrowserControllers.has(browserController);
        if (hasBeenRetiredOrKilled)
            return;
        this.retiredBrowserControllers.add(browserController);
        this.emit("browserRetired" /* BROWSER_POOL_EVENTS.BROWSER_RETIRED */, browserController);
        this.activeBrowserControllers.delete(browserController);
    }
    /**
     * Removes a browser from the pool. It will be
     * closed after all its pages are closed.
     */
    retireBrowserByPage(page) {
        const browserController = this.getBrowserControllerByPage(page);
        if (browserController)
            this.retireBrowserController(browserController);
    }
    /**
     * Removes all active browsers from the pool. The browsers will be
     * closed after all their pages are closed.
     */
    retireAllBrowsers() {
        this.activeBrowserControllers.forEach((controller) => {
            this.retireBrowserController(controller);
        });
    }
    /**
     * Closes all managed browsers without waiting for pages to close.
     * @return {Promise<void>}
     */
    async closeAllBrowsers() {
        const controllers = this._getAllBrowserControllers();
        const promises = [...controllers]
            .filter((controller) => controller.isActive)
            .map((controller) => controller.close());
        await Promise.all(promises);
    }
    /**
     * Closes all managed browsers and tears down the pool.
     */
    async destroy() {
        clearInterval(this.browserKillerInterval);
        this.browserKillerInterval = undefined;
        await this.closeAllBrowsers();
        this._teardown();
    }
    _teardown() {
        this.activeBrowserControllers.clear();
        this.retiredBrowserControllers.clear();
        this.removeAllListeners();
    }
    _getAllBrowserControllers() {
        return new Set([...this.activeBrowserControllers, ...this.retiredBrowserControllers]);
    }
    async _launchBrowser(pageId, options) {
        const { browserPlugin, launchOptions, } = options;
        const browserController = browserPlugin.createController();
        this.activeBrowserControllers.add(browserController);
        const launchContext = browserPlugin.createLaunchContext({
            id: pageId,
            launchOptions,
        });
        try {
            // If the hooks or the launch fails, we need to delete the controller,
            // because otherwise it would be stuck in limbo without a browser.
            await this._executeHooks(this.preLaunchHooks, pageId, launchContext);
            (0, timeout_1.tryCancel)();
            const browser = await browserPlugin.launch(launchContext);
            (0, timeout_1.tryCancel)();
            browserController.assignBrowser(browser, launchContext);
        }
        catch (err) {
            this.activeBrowserControllers.delete(browserController);
            throw err;
        }
        logger_1.log.debug('Launched new browser.', { id: browserController.id });
        try {
            // If the launch fails on the post-launch hooks, we need to clean up
            // both the controller and the browser before throwing.
            await this._executeHooks(this.postLaunchHooks, pageId, browserController);
        }
        catch (err) {
            this.activeBrowserControllers.delete(browserController);
            browserController.close().catch((closeErr) => {
                logger_1.log.error(`Could not close browser whose post-launch hooks failed.\nCause:${closeErr.message}`, { id: browserController.id });
            });
            throw err;
        }
        (0, timeout_1.tryCancel)();
        browserController.activate();
        this.emit("browserLaunched" /* BROWSER_POOL_EVENTS.BROWSER_LAUNCHED */, browserController);
        return browserController;
    }
    /**
     * Picks plugins round robin.
     * @private
     */
    _pickBrowserPlugin() {
        const pluginIndex = this.pageCounter % this.browserPlugins.length;
        this.pageCounter++;
        return this.browserPlugins[pluginIndex];
    }
    _pickBrowserWithFreeCapacity(browserPlugin) {
        for (const controller of this.activeBrowserControllers) {
            const hasCapacity = controller.activePages < this.maxOpenPagesPerBrowser;
            const isCorrectPlugin = controller.browserPlugin === browserPlugin;
            if (hasCapacity && isCorrectPlugin) {
                return controller;
            }
        }
        return undefined;
    }
    async _closeInactiveRetiredBrowsers() {
        const closedBrowserIds = [];
        for (const controller of this.retiredBrowserControllers) {
            const millisSinceLastPageOpened = Date.now() - controller.lastPageOpenedAt;
            const isBrowserIdle = millisSinceLastPageOpened >= this.closeInactiveBrowserAfterMillis;
            const isBrowserEmpty = controller.activePages === 0;
            if (isBrowserIdle || isBrowserEmpty) {
                const { id } = controller;
                logger_1.log.debug('Closing retired browser.', { id });
                await controller.close();
                this.retiredBrowserControllers.delete(controller);
                closedBrowserIds.push(id);
            }
        }
        if (closedBrowserIds.length) {
            logger_1.log.debug('Closed retired browsers.', {
                count: closedBrowserIds.length,
                closedBrowserIds,
            });
        }
    }
    _overridePageClose(page) {
        const originalPageClose = page.close;
        const browserController = this.pageToBrowserController.get(page);
        const pageId = this.getPageId(page);
        page.close = async (...args) => {
            await this._executeHooks(this.prePageCloseHooks, page, browserController);
            await originalPageClose.apply(page, args)
                .catch((err) => {
                logger_1.log.debug(`Could not close page.\nCause:${err.message}`, { id: browserController.id });
            });
            await this._executeHooks(this.postPageCloseHooks, pageId, browserController);
            this.pages.delete(pageId);
            this._closeRetiredBrowserWithNoPages(browserController);
            this.emit("pageClosed" /* BROWSER_POOL_EVENTS.PAGE_CLOSED */, page);
        };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async _executeHooks(hooks, ...args) {
        for (const hook of hooks) {
            await hook(...args);
        }
    }
    _closeRetiredBrowserWithNoPages(browserController) {
        if (browserController.activePages === 0 && this.retiredBrowserControllers.has(browserController)) {
            // Run this with a delay, otherwise page.close()
            // might fail with "Protocol error (Target.closeTarget): Target closed."
            setTimeout(() => {
                logger_1.log.debug('Closing retired browser because it has no active pages', { id: browserController.id });
                browserController.close().finally(() => {
                    this.retiredBrowserControllers.delete(browserController);
                });
            }, PAGE_CLOSE_KILL_TIMEOUT_MILLIS);
        }
    }
    _initializeFingerprinting() {
        const { useFingerprintCache = true, fingerprintCacheSize = 10000 } = this.fingerprintOptions;
        this.fingerprintGenerator = new fingerprint_generator_1.FingerprintGenerator(this.fingerprintOptions.fingerprintGeneratorOptions);
        this.fingerprintInjector = new fingerprint_injector_1.FingerprintInjector();
        if (useFingerprintCache) {
            this.fingerprintCache = new quick_lru_1.default({ maxSize: fingerprintCacheSize });
        }
        this._addFingerprintHooks();
    }
    _addFingerprintHooks() {
        this.preLaunchHooks = [
            ...this.preLaunchHooks,
            // This is flipped because of the fingerprint cache.
            // It is usual to generate proxy per browser and we want to know the proxyUrl for the caching.
            (0, hooks_1.createFingerprintPreLaunchHook)(this),
        ];
        this.prePageCreateHooks = [
            (0, hooks_1.createPrePageCreateHook)(),
            ...this.prePageCreateHooks,
        ];
        this.postPageCreateHooks = [
            (0, hooks_1.createPostPageCreateHook)(this.fingerprintInjector),
            ...this.postPageCreateHooks,
        ];
    }
}
exports.BrowserPool = BrowserPool;
//# sourceMappingURL=browser-pool.js.map