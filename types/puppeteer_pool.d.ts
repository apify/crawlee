export const BROWSER_SESSION_KEY_NAME: "APIFY_SESSION";
export default PuppeteerPool;
export type LaunchPuppeteerFunction = (options: LaunchPuppeteerOptions) => Promise<Browser>;
export type PuppeteerPoolOptions = {
    /**
     * Enables the use of a preconfigured {@link LiveViewServer} that serves snapshots
     * just before a page would be recycled by `PuppeteerPool`. If there are no clients
     * connected, it has close to zero impact on performance.
     */
    useLiveView?: boolean;
    /**
     * Maximum number of open pages (i.e. tabs) per browser. When this limit is reached, new pages are loaded in a new browser instance.
     */
    maxOpenPagesPerInstance?: number;
    /**
     * Maximum number of requests that can be processed by a single browser instance.
     * After the limit is reached, the browser is retired and new requests are
     * handled by a new browser instance.
     */
    retireInstanceAfterRequestCount?: number;
    /**
     * All browser management operations such as launching a new browser, opening a new page
     * or closing a page will timeout after the set number of seconds and the connected
     * browser will be retired.
     */
    puppeteerOperationTimeoutSecs?: number;
    /**
     * Indicates how often are the open Puppeteer instances checked whether they can be closed.
     */
    instanceKillerIntervalSecs?: number;
    /**
     * When Puppeteer instance reaches the `retireInstanceAfterRequestCount` limit then
     * it is considered retired and no more tabs will be opened. After the last tab is closed the
     * whole browser is closed too. This parameter defines a time limit between the last tab was opened and
     * before the browser is closed even if there are pending open tabs.
     */
    killInstanceAfterSecs?: number;
    /**
     * Overrides the default function to launch a new Puppeteer instance.
     * The function must return a promise resolving to
     * [`Browser`](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-browser) instance.
     * See the source code on
     * [GitHub](https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28)
     * for the default implementation.
     */
    launchPuppeteerFunction?: LaunchPuppeteerFunction;
    /**
     * Options used by {@link Apify#launchPuppeteer} to start new Puppeteer instances.
     */
    launchPuppeteerOptions?: LaunchPuppeteerOptions;
    /**
     * Enables recycling of disk cache directories by Chrome instances.
     * When a browser instance is closed, its disk cache directory is not deleted but it's used by a newly opened browser instance.
     * This is useful to reduce amount of data that needs to be downloaded to speed up crawling and reduce proxy usage.
     * Note that the new browser starts with empty cookies, local storage etc. so this setting doesn't affect anonymity of your crawler.
     *
     * Beware that the disk cache directories can consume a lot of disk space.
     * To limit the space consumed, you can pass the `--disk-cache-size=X` argument to `launchPuppeteerargs`,
     * where `X` is the approximate maximum number of bytes for disk cache.
     *
     * Do not use the `recycleDiskCache` setting together with `--disk-cache-dir`
     * argument in `launchPuppeteerargs`, the behavior is undefined.
     */
    recycleDiskCache?: boolean;
    /**
     * With this option selected, all pages will be opened in a new incognito browser context, which means
     * that they will not share cookies or cache and their resources will not be throttled by one another.
     */
    useIncognitoPages?: boolean;
    /**
     * An array of custom proxy URLs to be used by the `PuppeteerPool` instance.
     * The provided custom proxies' order will be randomized and the resulting list rotated.
     * Custom proxies are not compatible with Apify Proxy and an attempt to use both
     * configuration options will cause an error to be thrown on startup.
     */
    proxyUrls?: string[];
};
/**
 * @callback LaunchPuppeteerFunction
 * @param {LaunchPuppeteerOptions} options
 * @returns {Promise<Browser>}
 */
/**
 * @typedef PuppeteerPoolOptions
 * @property {boolean} [useLiveView]
 *   Enables the use of a preconfigured {@link LiveViewServer} that serves snapshots
 *   just before a page would be recycled by `PuppeteerPool`. If there are no clients
 *   connected, it has close to zero impact on performance.
 * @property {number} [maxOpenPagesPerInstance=50]
 *   Maximum number of open pages (i.e. tabs) per browser. When this limit is reached, new pages are loaded in a new browser instance.
 * @property {number} [retireInstanceAfterRequestCount=100]
 *   Maximum number of requests that can be processed by a single browser instance.
 *   After the limit is reached, the browser is retired and new requests are
 *   handled by a new browser instance.
 * @property {number} [puppeteerOperationTimeoutSecs=15]
 *   All browser management operations such as launching a new browser, opening a new page
 *   or closing a page will timeout after the set number of seconds and the connected
 *   browser will be retired.
 * @property {number} [instanceKillerIntervalSecs=60]
 *   Indicates how often are the open Puppeteer instances checked whether they can be closed.
 * @property {number} [killInstanceAfterSecs=300]
 *   When Puppeteer instance reaches the `retireInstanceAfterRequestCount` limit then
 *   it is considered retired and no more tabs will be opened. After the last tab is closed the
 *   whole browser is closed too. This parameter defines a time limit between the last tab was opened and
 *   before the browser is closed even if there are pending open tabs.
 * @property {LaunchPuppeteerFunction} [launchPuppeteerFunction]
 *   Overrides the default function to launch a new Puppeteer instance.
 *   The function must return a promise resolving to
 *   [`Browser`](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-browser) instance.
 *   See the source code on
 *   [GitHub](https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28)
 *   for the default implementation.
 * @property {LaunchPuppeteerOptions} [launchPuppeteerOptions]
 *   Options used by {@link Apify#launchPuppeteer} to start new Puppeteer instances.
 * @property {boolean} [recycleDiskCache=false]
 *   Enables recycling of disk cache directories by Chrome instances.
 *   When a browser instance is closed, its disk cache directory is not deleted but it's used by a newly opened browser instance.
 *   This is useful to reduce amount of data that needs to be downloaded to speed up crawling and reduce proxy usage.
 *   Note that the new browser starts with empty cookies, local storage etc. so this setting doesn't affect anonymity of your crawler.
 *
 *   Beware that the disk cache directories can consume a lot of disk space.
 *   To limit the space consumed, you can pass the `--disk-cache-size=X` argument to `launchPuppeteerargs`,
 *   where `X` is the approximate maximum number of bytes for disk cache.
 *
 *   Do not use the `recycleDiskCache` setting together with `--disk-cache-dir`
 *   argument in `launchPuppeteerargs`, the behavior is undefined.
 * @property {boolean} [useIncognitoPages]
 *   With this option selected, all pages will be opened in a new incognito browser context, which means
 *   that they will not share cookies or cache and their resources will not be throttled by one another.
 * @property {string[]} [proxyUrls]
 *   An array of custom proxy URLs to be used by the `PuppeteerPool` instance.
 *   The provided custom proxies' order will be randomized and the resulting list rotated.
 *   Custom proxies are not compatible with Apify Proxy and an attempt to use both
 *   configuration options will cause an error to be thrown on startup.
 */
/**
 * Manages a pool of Chrome browser instances controlled using
 * [Puppeteer](https://github.com/GoogleChrome/puppeteer).
 *
 * `PuppeteerPool` reuses Chrome instances and tabs using specific browser rotation and retirement policies.
 * This is useful in order to facilitate rotation of proxies, cookies
 * or other settings in order to prevent detection of your web scraping bot,
 * access web pages from various countries etc.
 *
 * Additionally, the reuse of browser instances instances speeds up crawling,
 * and the retirement of instances helps mitigate effects of memory leaks in Chrome.
 *
 * `PuppeteerPool` is internally used by the {@link PuppeteerCrawler} class.
 *
 * **Example usage:**
 *
 * ```javascript
 * const puppeteerPool = new PuppeteerPool({
 *   launchPuppeteerFunction: () => {
 *     // Use a new proxy with a new IP address for each new Chrome instance
 *     return Apify.launchPuppeteer({
 *        useApifyProxy: true,
 *        apifyProxySession: Math.random(),
 *     });
 *   },
 * });
 *
 * const page1 = await puppeteerPool.newPage();
 * const page2 = await puppeteerPool.newPage();
 * const page3 = await puppeteerPool.newPage();
 *
 * // ... do something with the pages ...
 *
 * // Close all browsers.
 * await puppeteerPool.destroy();
 * ```
 */
declare class PuppeteerPool {
    /**
     * @param {PuppeteerPoolOptions} [options]
     *   All `PuppeteerPool` parameters are passed
     *   via an options object.
     */
    constructor(options?: PuppeteerPoolOptions | undefined);
    sessionPool: any;
    reusePages: boolean;
    maxOpenPagesPerInstance: any;
    retireInstanceAfterRequestCount: any;
    puppeteerOperationTimeoutMillis: number;
    killInstanceAfterMillis: any;
    /**
     * @type {*}
     * @ignore
     */
    recycledDiskCacheDirs: any;
    useIncognitoPages: any;
    proxyUrls: any[] | null;
    liveViewServer: LiveViewServer | null;
    launchPuppeteerFunction: () => Promise<any>;
    browserCounter: number;
    activeInstances: {};
    retiredInstances: {};
    lastUsedProxyUrlIndex: number;
    instanceKillerInterval: NodeJS.Timeout;
    idlePages: any[];
    closedPages: WeakSet<object>;
    pagesToInstancesMap: WeakMap<object, any>;
    liveViewSnapshotsInProgress: WeakMap<object, any>;
    sigintListener: () => void;
    _retireBrowserWithSession(session: any): Promise<void>;
    /**
     * Launches new browser instance.
     *
     * @ignore
     */
    _launchInstance(): PuppeteerInstance;
    /**
     * Takes care of async processes in PuppeteerInstance construction with a Browser.
     * @param {Promise<Browser>} browserPromise
     * @param {PuppeteerInstance} instance
     * @returns {Promise<void>}
     * @ignore
     */
    _initBrowser(browserPromise: Promise<Browser>, instance: PuppeteerInstance): Promise<void>;
    /**
     * Retires some of the instances for example due to many uses.
     *
     * @ignore
     */
    _retireInstance(instance: any): void;
    /**
     * Kills all the retired instances that:
     * - have all tabs closed
     * - or are inactive for more then killInstanceAfterMillis.
     *
     * @ignore
     */
    _killRetiredInstances(): void;
    /**
     * Kills given browser instance.
     *
     * @ignore
     */
    _killInstance(instance: any): Promise<void>;
    /**
     * Kills all running PuppeteerInstances.
     * @ignore
     */
    _killAllInstances(): void;
    /**
     * Updates the instance metadata when a new page is opened.
     *
     * @param {PuppeteerInstance} instance
     * @ignore
     */
    _incrementPageCount(instance: PuppeteerInstance): void;
    /**
     * Produces a new page instance either by reusing an idle page that currently isn't processing
     * any request or by spawning a new page (new browser tab) in one of the available
     * browsers when no idle pages are available.
     *
     * To spawn a new browser tab for each page, set the `reusePages` constructor option to false.
     *
     * @return {Promise<Page>}
     */
    newPage(): Promise<Page>;
    /**
     * Opens new tab in one of the browsers in the pool and returns a `Promise`
     * that resolves to an instance of a Puppeteer
     * [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page).
     *
     * @return {Promise<Page>}
     * @ignore
     */
    _openNewTab(): Promise<Page>;
    /**
     * Adds the necessary boilerplate to allow page reuse and also
     * captures page.close() errors to prevent meaningless log clutter.
     * @param {Page} page
     * @ignore
     */
    _decoratePage(page: Page): Page;
    /**
     * Tells Chromium to focus oldest tab. This is to work around Chromium
     * throttling CPU and network in inactive tabs.
     *
     * @param {Browser} browser
     * @ignore
     */
    _focusOldestTab(browser: Browser): Promise<void>;
    /**
     * Closes all open browsers.
     * @return {Promise<void>}
     */
    destroy(): Promise<void>;
    /**
     * Finds a PuppeteerInstance given a Puppeteer Browser running in the instance.
     * @param {Browser} browser
     * @return {Promise<*>}
     * @ignore
     */
    _findInstanceByBrowser(browser: Browser): Promise<any>;
    /**
     * Manually retires a Puppeteer
     * [`Browser`](https://pptr.dev/#?product=Puppeteer&show=api-class-browser)
     * instance from the pool. The browser will continue to process open pages so that they may gracefully finish.
     * This is unlike `browser.close()` which will forcibly terminate the browser and all open pages will be closed.
     * @param {Browser} browser
     * @return {Promise<void>}
     */
    retire(browser: Browser): Promise<void>;
    /**
     * Closes the page, unless the `reuseTabs` option is set to true.
     * Then it would only flag the page for a future reuse, without actually closing it.
     *
     * NOTE: LiveView snapshotting is tied to this function. When `useLiveView` option
     * is set to true, a snapshot of the page will be taken just before closing the page
     * or flagging it for reuse.
     *
     * @param {Page} page
     * @return {Promise<void>}
     */
    recyclePage(page: Page): Promise<void>;
    /**
     * Tells the connected LiveViewServer to serve a snapshot when available.
     *
     * @param {Page} page
     * @return {Promise<void>}
     */
    serveLiveViewSnapshot(page: Page): Promise<void>;
    _findInstancesBySession(session: any): any[];
    _killInstanceWithNoPages(instance: any): void;
}
import { LaunchPuppeteerOptions } from "./puppeteer";
import { Browser } from "puppeteer";
import LiveViewServer from "./live_view/live_view_server";
/**
 * Internal representation of Puppeteer instance.
 *
 * @ignore
 */
declare class PuppeteerInstance {
    constructor(id: any, browserPromise: any);
    id: any;
    activePages: number;
    totalPages: number;
    browserPromise: any;
    lastPageOpenedAt: number;
    killed: boolean;
    childProcess: any;
    recycleDiskCacheDir: any;
}
import { Page } from "puppeteer";
