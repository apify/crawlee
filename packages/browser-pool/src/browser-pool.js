import { AsyncResource } from 'node:async_hooks';
import { SessionError, serviceLocator } from '@crawlee/core';
import { parseArgument, schemas } from '@crawlee/utils/internal';
import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
import { nanoid } from 'nanoid';
import pLimit from 'p-limit';
import QuickLRU from 'quick-lru';
import { TypedEmitter } from 'tiny-typed-emitter';
import { z } from 'zod';
import { addTimeoutToPromise, tryCancel } from '@apify/timeout';
import { BROWSER_POOL_EVENTS } from './events.js';
import { createFingerprintPreLaunchHook, createPostPageCreateHook, createPrePageCreateHook, } from './fingerprinting/hooks.js';
const PAGE_CLOSE_TIMEOUT_MILLIS = 5000;
const PAGE_CLOSE_KILL_TIMEOUT_MILLIS = 1000;
const BROWSER_KILLER_INTERVAL_MILLIS = 10 * 1000;
const browserPoolOptionsSchema = z.strictObject({
    browserPlugins: schemas.anyArray.refine((value) => value.length >= 1, 'Expected a non-empty array'),
    maxOpenPagesPerBrowser: schemas.anyNumber.default(20),
    retireBrowserAfterPageCount: schemas.anyNumber.default(100),
    operationTimeoutSecs: schemas.anyNumber.default(15),
    closeInactiveBrowserAfterSecs: schemas.anyNumber.default(300),
    retireInactiveBrowserAfterSecs: schemas.anyNumber.default(10),
    preLaunchHooks: schemas.anyArray.default(() => []),
    postLaunchHooks: schemas.anyArray.default(() => []),
    prePageCreateHooks: schemas.anyArray.default(() => []),
    postPageCreateHooks: schemas.anyArray.default(() => []),
    prePageCloseHooks: schemas.anyArray.default(() => []),
    postPageCloseHooks: schemas.anyArray.default(() => []),
    useFingerprints: z.boolean().default(true),
    fingerprintOptions: schemas.anyObject.default(() => ({})),
});
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
export class BrowserPool extends TypedEmitter {
    browserPlugins;
    maxOpenPagesPerBrowser;
    maxOpenBrowsers;
    retireBrowserAfterPageCount;
    operationTimeoutMillis;
    closeInactiveBrowserAfterMillis;
    useFingerprints;
    fingerprintOptions;
    preLaunchHooks;
    postLaunchHooks;
    prePageCreateHooks;
    postPageCreateHooks;
    prePageCloseHooks;
    postPageCloseHooks;
    pageCounter = 0;
    pages = new Map();
    pageIds = new WeakMap();
    startingBrowserControllers = new Set();
    activeBrowserControllers = new Set();
    retiredBrowserControllers = new Set();
    pageToBrowserController = new WeakMap();
    fingerprintInjector;
    fingerprintGenerator;
    fingerprintCache;
    #browserKillerInterval;
    #browserRetireInterval;
    #limiter = pLimit(1);
    #log;
    constructor(options) {
        super();
        this.#log = serviceLocator.getLogger().child({ prefix: 'BrowserPool' });
        this.#browserKillerInterval = setInterval(async () => this.closeInactiveRetiredBrowsers(), BROWSER_KILLER_INTERVAL_MILLIS);
        this.#browserKillerInterval.unref();
        const { browserPlugins, maxOpenPagesPerBrowser, retireBrowserAfterPageCount, operationTimeoutSecs, closeInactiveBrowserAfterSecs, retireInactiveBrowserAfterSecs, preLaunchHooks, postLaunchHooks, prePageCreateHooks, postPageCreateHooks, prePageCloseHooks, postPageCloseHooks, useFingerprints, fingerprintOptions, } = parseArgument(options, browserPoolOptionsSchema);
        const firstPluginConstructor = browserPlugins[0].constructor;
        for (let i = 1; i < browserPlugins.length; i++) {
            const providedPlugin = browserPlugins[i];
            if (!(providedPlugin instanceof firstPluginConstructor)) {
                const firstPluginName = firstPluginConstructor.name;
                const providedPluginName = providedPlugin.constructor.name;
                throw new Error(`Browser plugin at index ${i} (${providedPluginName}) is not an instance of the same plugin as the first plugin provided (${firstPluginName}).`);
            }
        }
        this.browserPlugins = browserPlugins;
        this.maxOpenPagesPerBrowser = maxOpenPagesPerBrowser;
        this.maxOpenBrowsers = Infinity;
        this.retireBrowserAfterPageCount = retireBrowserAfterPageCount;
        this.operationTimeoutMillis = operationTimeoutSecs * 1000;
        this.closeInactiveBrowserAfterMillis = closeInactiveBrowserAfterSecs * 1000;
        this.useFingerprints = useFingerprints;
        this.fingerprintOptions = fingerprintOptions;
        this.#browserRetireInterval = setInterval(async () => this.activeBrowserControllers.forEach((controller) => {
            if (controller.activePages === 0 &&
                controller.lastPageOpenedAt < Date.now() - retireInactiveBrowserAfterSecs * 1000) {
                this.retireBrowserController(controller);
            }
        }), retireInactiveBrowserAfterSecs * 1000);
        this.#browserRetireInterval.unref();
        // hooks
        this.preLaunchHooks = preLaunchHooks;
        this.postLaunchHooks = postLaunchHooks;
        this.prePageCreateHooks = prePageCreateHooks;
        this.postPageCreateHooks = postPageCreateHooks;
        this.prePageCloseHooks = prePageCloseHooks;
        this.postPageCloseHooks = postPageCloseHooks;
        // fingerprinting
        if (this.useFingerprints) {
            this.initializeFingerprinting();
        }
    }
    /**
     * Opens a new page in one of the running browsers or launches
     * a new browser and opens a page there, if no browsers are active,
     * or their page limits have been exceeded.
     *
     * **Session injection (best-effort):** When a {@apilink NewPageOptions.session|session} is
     * provided, this implementation uses it as a cache key for browser fingerprints (when
     * fingerprinting is enabled) and reads
     * {@apilink ProxyInfo.url|session.proxyInfo.url} /
     * {@apilink ProxyInfo.ignoreTlsErrors|session.proxyInfo.ignoreTlsErrors} as defaults
     * for `proxyUrl` and `ignoreTlsErrors` respectively. Explicit `proxyUrl` /
     * `ignoreTlsErrors` values in the options take precedence.
     *
     * Beyond fingerprint caching and proxy configuration, no other session
     * properties are consumed — cookie and header injection remain the
     * crawler's responsibility.
     */
    async newPage(options = {}) {
        const { id = nanoid(), pageOptions, browserPlugin = this.pickBrowserPlugin(), session, proxyUrl = session?.proxyInfo?.url, ignoreTlsErrors = session?.proxyInfo?.ignoreTlsErrors, } = options;
        if (this.pages.has(id)) {
            throw new Error(`Page with ID: ${id} already exists.`);
        }
        if (browserPlugin && !this.browserPlugins.includes(browserPlugin)) {
            throw new Error('Provided browserPlugin is not one of the plugins used by BrowserPool.');
        }
        // Bind the limiter callback to the current async-hooks context. p-limit
        // otherwise resumes queued callbacks in the previous task's
        // AsyncLocalStorage context, leaking aborted cancelTasks across unrelated
        // requests (https://github.com/apify/crawlee/issues/3670). Mirrors the
        // fix p-limit landed upstream in v5 (sindresorhus/p-limit#71); v5 is an
        // ESM-only rewrite, so we can't bump it in Crawlee v3.
        // Besides the cancelTask leak, the wrapper also keeps the per-request *storage transaction*
        // ALS-scoped: without it, a queued callback would resume in the previous request's async
        // context and run request B's storage writes inside request A's transaction.
        // TODO(crawlee@v4): bump p-limit to v5 and drop this AsyncResource.bind wrapper.
        // Limiter is necessary - https://github.com/apify/crawlee/issues/1126
        return this.#limiter(AsyncResource.bind(async () => {
            let browserController = this.pickBrowserWithFreeCapacity(browserPlugin, { proxyUrl });
            if (!browserController)
                browserController = await this.launchBrowser(id, {
                    browserPlugin,
                    proxyUrl,
                    ignoreTlsErrors,
                });
            tryCancel();
            return await this.createPageForBrowser(id, browserController, pageOptions, proxyUrl, ignoreTlsErrors);
        }));
    }
    /**
     * Unlike {@apilink newPage}, `newPageInNewBrowser` always launches a new
     * browser to open the page in. Use the `launchOptions` option to
     * configure the new browser.
     */
    async newPageInNewBrowser(options = {}) {
        const { id = nanoid(), pageOptions, launchOptions, browserPlugin = this.pickBrowserPlugin() } = options;
        if (this.pages.has(id)) {
            throw new Error(`Page with ID: ${id} already exists.`);
        }
        const browserController = await this.launchBrowser(id, { launchOptions, browserPlugin });
        tryCancel();
        return await this.createPageForBrowser(id, browserController, pageOptions);
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
        const pagePromises = this.browserPlugins.map(async (browserPlugin, idx) => {
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
    async createPageForBrowser(pageId, browserController, pageOptions = {}, proxyUrl, ignoreTlsErrors) {
        // This is needed for concurrent newPage calls to wait for the browser launch.
        // It's not ideal though, we need to come up with a better API.
        await browserController.isActivePromise;
        tryCancel();
        const finalPageOptions = browserController.launchContext.useIncognitoPages ? pageOptions : undefined;
        if (finalPageOptions) {
            Object.assign(finalPageOptions, browserController.normalizeProxyOptions(proxyUrl, pageOptions));
            if (ignoreTlsErrors) {
                Object.assign(finalPageOptions, {
                    ignoreHTTPSErrors: true,
                    acceptInsecureCerts: true,
                });
            }
        }
        await this.executeHooks(this.prePageCreateHooks, pageId, browserController, finalPageOptions);
        tryCancel();
        let page;
        try {
            page = (await addTimeoutToPromise(async () => browserController.newPage(finalPageOptions), this.operationTimeoutMillis, 'browserController.newPage() timed out.'));
            tryCancel();
            this.pages.set(pageId, page);
            this.pageIds.set(page, pageId);
            this.pageToBrowserController.set(page, browserController);
            // if you synchronously trigger a lot of page launches, browser will not get retired soon enough. Not sure if it's a problem, let's monitor it.
            if (browserController.totalPages >= this.retireBrowserAfterPageCount) {
                this.retireBrowserController(browserController);
            }
            this.overridePageClose(page);
        }
        catch (err) {
            this.retireBrowserController(browserController);
            throw new Error(`browserController.newPage() failed: ${browserController.id}\nCause:${err.message}.`);
        }
        await this.executeHooks(this.postPageCreateHooks, page, browserController);
        tryCancel();
        this.emit(BROWSER_POOL_EVENTS.PAGE_CREATED, page);
        return page;
    }
    /**
     * Removes a browser controller from the pool. The underlying
     * browser will be closed after all its pages are closed.
     *
     */
    retireBrowserController(browserController) {
        const isStarting = this.startingBrowserControllers.has(browserController);
        const isActive = this.activeBrowserControllers.has(browserController);
        const hasBeenRetiredOrKilled = !isStarting && !isActive;
        if (hasBeenRetiredOrKilled)
            return;
        this.retiredBrowserControllers.add(browserController);
        this.emit(BROWSER_POOL_EVENTS.BROWSER_RETIRED, browserController);
        this.startingBrowserControllers.delete(browserController);
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
     * Releases a page back to the pool. The page is closed and, if the
     * optional `error` is a {@apilink SessionError}, the browser controller
     * that served the page is retired so that its tainted state (cookies,
     * storage, etc.) cannot leak into future sessions.
     *
     * This is the primary way the crawler should return pages to the pool.
     *
     * @param page The page to release.
     * @param options.error The error that caused the page to be released, if any.
     */
    async closePage(page, options) {
        if (options?.error instanceof SessionError) {
            this.retireBrowserByPage(page);
        }
        // Puppeteer 25+ can hang `page.close()` indefinitely when the page's navigation was aborted, don't let it block the crawler.
        await addTimeoutToPromise(async () => page.close(), PAGE_CLOSE_TIMEOUT_MILLIS, `page.close() timed out after ${PAGE_CLOSE_TIMEOUT_MILLIS / 1000} seconds`);
    }
    /**
     * Extracts the relevant state (currently just cookies) from a page via its
     * owning {@apilink BrowserController}. Returns empty state when the page is
     * no longer associated with a controller.
     *
     * As with {@apilink BrowserPool.injectPageState}, cookies are isolated per
     * page only when the pool is configured with `useIncognitoPages: true`.
     * With the default `useIncognitoPages: false`, the extracted cookies
     * include those set by any sibling page sharing the same browser.
     */
    async extractPageState(page) {
        const controller = this.getBrowserControllerByPage(page);
        if (!controller) {
            return { cookies: [] };
        }
        return { cookies: await controller.getCookies(page) };
    }
    /**
     * Injects state into a page via its owning {@apilink BrowserController}.
     *
     * No-op when the page is no longer associated with a controller.
     *
     * Note that cookies are isolated per page only when the pool is configured
     * with `useIncognitoPages: true` — each page then gets its own browser
     * context. With the default `useIncognitoPages: false`, all pages in a
     * browser share a single context, so injected cookies are visible to every
     * page served by that browser.
     */
    async injectPageState(page, state) {
        const controller = this.getBrowserControllerByPage(page);
        if (!controller) {
            return;
        }
        await controller.setCookies(page, state.cookies);
    }
    /**
     * Removes all active browsers from the pool. The browsers will be
     * closed after all their pages are closed.
     */
    retireAllBrowsers() {
        [...this.startingBrowserControllers, ...this.activeBrowserControllers].forEach((controller) => {
            this.retireBrowserController(controller);
        });
    }
    /**
     * Closes all managed browsers without waiting for pages to close.
     * @return {Promise<void>}
     */
    async closeAllBrowsers() {
        const controllers = this.getAllBrowserControllers();
        const promises = [...controllers]
            .filter((controller) => controller.isActive)
            .map(async (controller) => controller.close());
        await Promise.all(promises);
    }
    async [Symbol.asyncDispose]() {
        await this.destroy();
    }
    /**
     * Closes all managed browsers and tears down the pool.
     */
    async destroy() {
        clearInterval(this.#browserKillerInterval);
        clearInterval(this.#browserRetireInterval);
        this.#browserKillerInterval = undefined;
        this.#browserRetireInterval = undefined;
        await this.closeAllBrowsers();
        this.teardown();
    }
    teardown() {
        this.startingBrowserControllers.clear();
        this.activeBrowserControllers.clear();
        this.retiredBrowserControllers.clear();
        this.removeAllListeners();
    }
    getAllBrowserControllers() {
        return new Set([
            ...this.startingBrowserControllers,
            ...this.activeBrowserControllers,
            ...this.retiredBrowserControllers,
        ]);
    }
    async launchBrowser(pageId, options) {
        const { browserPlugin, launchOptions, proxyUrl, ignoreTlsErrors } = options;
        const browserController = browserPlugin.createController();
        this.startingBrowserControllers.add(browserController);
        const launchContext = browserPlugin.createLaunchContext({
            id: pageId,
            launchOptions,
            proxyUrl,
        });
        // Disable SSL verification for MITM proxies
        if (ignoreTlsErrors) {
            /**
             * @see https://playwright.dev/docs/api/class-browser/#browser-new-context
             * @see https://github.com/puppeteer/puppeteer/blob/main/docs/api.md
             */
            launchContext.launchOptions.ignoreHTTPSErrors = true;
            launchContext.launchOptions.acceptInsecureCerts = true;
        }
        try {
            // If the hooks or the launch fails, we need to delete the controller,
            // because otherwise it would be stuck in limbo without a browser.
            await this.executeHooks(this.preLaunchHooks, pageId, launchContext);
            tryCancel();
            const browser = await browserPlugin.launch(launchContext);
            tryCancel();
            browserController.assignBrowser(browser, launchContext);
        }
        catch (err) {
            this.startingBrowserControllers.delete(browserController);
            throw err;
        }
        this.#log.debug('Launched new browser.', { id: browserController.id });
        browserController.proxyUrl = proxyUrl;
        try {
            // If the launch fails on the post-launch hooks, we need to clean up
            // both the controller and the browser before throwing.
            await this.executeHooks(this.postLaunchHooks, pageId, browserController);
        }
        catch (err) {
            this.startingBrowserControllers.delete(browserController);
            browserController.close().catch((closeErr) => {
                this.#log.error(`Could not close browser whose post-launch hooks failed.\nCause:${closeErr.message}`, {
                    id: browserController.id,
                });
            });
            throw err;
        }
        tryCancel();
        browserController.activate();
        this.startingBrowserControllers.delete(browserController);
        this.activeBrowserControllers.add(browserController);
        this.emit(BROWSER_POOL_EVENTS.BROWSER_LAUNCHED, browserController);
        return browserController;
    }
    /**
     * Picks plugins round robin.
     * @private
     */
    pickBrowserPlugin() {
        const pluginIndex = this.pageCounter % this.browserPlugins.length;
        this.pageCounter++;
        return this.browserPlugins[pluginIndex];
    }
    pickBrowserWithFreeCapacity(browserPlugin, options) {
        return [...this.activeBrowserControllers].find((controller) => {
            const hasCapacity = controller.activePages < this.maxOpenPagesPerBrowser;
            const isCorrectPlugin = controller.browserPlugin === browserPlugin;
            const isSameProxyUrl = controller.proxyUrl === options?.proxyUrl;
            return (isCorrectPlugin &&
                hasCapacity &&
                (!controller.launchContext.browserPerProxy ||
                    (options?.proxyUrl && isSameProxyUrl) ||
                    (!options?.proxyUrl && !controller.proxyUrl)));
        });
    }
    async closeInactiveRetiredBrowsers() {
        const closedBrowserIds = [];
        for (const controller of Array.from(this.retiredBrowserControllers)) {
            const millisSinceLastPageOpened = Date.now() - controller.lastPageOpenedAt;
            const isBrowserIdle = millisSinceLastPageOpened >= this.closeInactiveBrowserAfterMillis;
            const isBrowserEmpty = controller.activePages === 0;
            if (isBrowserIdle || isBrowserEmpty) {
                const { id } = controller;
                this.#log.debug('Closing retired browser.', { id });
                this.retiredBrowserControllers.delete(controller);
                await controller.close();
                closedBrowserIds.push(id);
            }
        }
        if (closedBrowserIds.length) {
            this.#log.debug('Closed retired browsers.', {
                count: closedBrowserIds.length,
                closedBrowserIds,
            });
        }
    }
    overridePageClose(page) {
        const originalPageClose = page.close;
        const browserController = this.pageToBrowserController.get(page);
        const pageId = this.getPageId(page);
        page.close = async (...args) => {
            await this.executeHooks(this.prePageCloseHooks, page, browserController);
            await originalPageClose.apply(page, args).catch((err) => {
                this.#log.debug(`Could not close page.\nCause:${err.message}`, { id: browserController.id });
            });
            await this.executeHooks(this.postPageCloseHooks, pageId, browserController);
            this.pages.delete(pageId);
            this.closeRetiredBrowserWithNoPages(browserController);
            this.emit(BROWSER_POOL_EVENTS.PAGE_CLOSED, page);
        };
    }
    async executeHooks(hooks, ...args) {
        for (const hook of hooks) {
            await hook(...args);
        }
    }
    closeRetiredBrowserWithNoPages(browserController) {
        if (browserController.activePages === 0 && this.retiredBrowserControllers.has(browserController)) {
            // Run this with a delay, otherwise page.close()
            // might fail with "Protocol error (Target.closeTarget): Target closed."
            setTimeout(() => {
                this.#log.debug('Closing retired browser because it has no active pages', { id: browserController.id });
                void browserController.close().finally(() => {
                    this.retiredBrowserControllers.delete(browserController);
                });
            }, PAGE_CLOSE_KILL_TIMEOUT_MILLIS);
        }
    }
    /**
     * Returns `true` if the pool can accept a new browser launch without exceeding
     * {@link BrowserPoolOptions.maxOpenBrowsers}. Counts starting, active, and retired browsers.
     */
    hasFreeBrowserSlot() {
        const total = this.startingBrowserControllers.size +
            this.activeBrowserControllers.size +
            this.retiredBrowserControllers.size;
        return total < this.maxOpenBrowsers;
    }
    /**
     * Returns `true` if any active browser has room for another page.
     */
    hasActiveBrowserWithFreeCapacity() {
        for (const controller of this.activeBrowserControllers) {
            if (controller.activePages < this.maxOpenPagesPerBrowser)
                return true;
        }
        return false;
    }
    initializeFingerprinting() {
        const { useFingerprintCache = true, fingerprintCacheSize = 10_000 } = this.fingerprintOptions;
        this.fingerprintGenerator = new FingerprintGenerator(this.fingerprintOptions.fingerprintGeneratorOptions);
        this.fingerprintInjector = new FingerprintInjector();
        if (useFingerprintCache) {
            this.fingerprintCache = new QuickLRU({ maxSize: fingerprintCacheSize });
        }
        this.addFingerprintHooks();
    }
    addFingerprintHooks() {
        this.preLaunchHooks = [
            ...this.preLaunchHooks,
            // This is flipped because of the fingerprint cache.
            // It is usual to generate proxy per browser and we want to know the proxyUrl for the caching.
            createFingerprintPreLaunchHook(this),
        ];
        this.prePageCreateHooks = [createPrePageCreateHook(), ...this.prePageCreateHooks];
        this.postPageCreateHooks = [createPostPageCreateHook(this.fingerprintInjector), ...this.postPageCreateHooks];
    }
}
