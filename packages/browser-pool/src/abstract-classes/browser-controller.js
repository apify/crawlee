import { serviceLocator } from '@crawlee/core';
import { nanoid } from 'nanoid';
import { TypedEmitter } from 'tiny-typed-emitter';
import { tryCancel } from '@apify/timeout';
import { BROWSER_CONTROLLER_EVENTS } from '../events.js';
const PROCESS_KILL_TIMEOUT_MILLIS = 5000;
/**
 * The `BrowserController` serves two purposes. First, it is the base class that
 * specialized controllers like `PuppeteerController` or `PlaywrightController`
 * extend. Second, it defines the public interface of the specialized classes
 * which provide only private methods. Therefore, we do not keep documentation
 * for the specialized classes, because it's the same for all of them.
 * @hideconstructor
 */
export class BrowserController extends TypedEmitter {
    id = nanoid();
    log;
    /**
     * The `BrowserPlugin` instance used to launch the browser.
     */
    browserPlugin;
    /**
     * Browser representation of the underlying automation library.
     */
    browser = undefined;
    /**
     * The configuration the browser was launched with.
     */
    launchContext = undefined;
    /**
     * The proxy URL used by the browser controller.
     * `undefined` if no proxy is used
     */
    proxyUrl;
    isActive = false;
    activePages = 0;
    totalPages = 0;
    lastPageOpenedAt = Date.now();
    #activate;
    #isActivePromise = new Promise((resolve) => {
        this.#activate = resolve;
    });
    get isActivePromise() {
        return this.#isActivePromise;
    }
    #commitBrowser;
    #hasBrowserPromise = new Promise((resolve) => {
        this.#commitBrowser = resolve;
    });
    constructor(browserPlugin) {
        super();
        this.log = serviceLocator.getLogger().child({ prefix: 'BrowserPool' });
        this.browserPlugin = browserPlugin;
    }
    /**
     * Activates the BrowserController. If you try to open new pages before
     * activation, the pages will get queued and will only be opened after
     * activate is called.
     * @ignore
     */
    activate() {
        if (!this.browser) {
            throw new Error('Cannot activate BrowserController without an assigned browser.');
        }
        this.#activate();
        this.isActive = true;
    }
    /**
     * @ignore
     */
    assignBrowser(browser, launchContext) {
        if (this.browser) {
            throw new Error('BrowserController already has a browser instance assigned.');
        }
        this.browser = browser;
        this.launchContext = launchContext;
        this.#commitBrowser();
    }
    /**
     * Gracefully closes the browser and makes sure
     * there will be no lingering browser processes.
     *
     * Emits 'browserClosed' event.
     */
    async close() {
        await this.#hasBrowserPromise;
        try {
            await this._close();
            // TODO: shouldn't this go in a finally instead?
            this.isActive = false;
        }
        catch (error) {
            this.log.debug(`Could not close browser.\nCause: ${error.message}`, { id: this.id });
        }
        this.emit(BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED, this);
        const killTimer = setTimeout(() => {
            this._kill().catch((err) => {
                this.log.debug(`Could not kill browser.\nCause: ${err.message}`, { id: this.id });
            });
        }, PROCESS_KILL_TIMEOUT_MILLIS);
        killTimer.unref();
    }
    /**
     * Immediately kills the browser process.
     *
     * Emits 'browserClosed' event.
     */
    async kill() {
        await this.#hasBrowserPromise;
        await this._kill();
        this.emit(BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED, this);
    }
    /**
     * Opens new browser page.
     * @ignore
     */
    async newPage(pageOptions) {
        this.activePages++;
        this.totalPages++;
        await this.#isActivePromise;
        const page = await this._newPage(pageOptions);
        tryCancel();
        this.lastPageOpenedAt = Date.now();
        return page;
    }
    async setCookies(page, cookies) {
        return this._setCookies(page, cookies);
    }
    async getCookies(page) {
        return this._getCookies(page);
    }
}
