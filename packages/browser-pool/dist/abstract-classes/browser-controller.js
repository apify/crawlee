"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserController = void 0;
const nanoid_1 = require("nanoid");
const tiny_typed_emitter_1 = require("tiny-typed-emitter");
const timeout_1 = require("@apify/timeout");
const logger_1 = require("../logger");
const utils_1 = require("./utils");
const PROCESS_KILL_TIMEOUT_MILLIS = 5000;
/**
 * The `BrowserController` serves two purposes. First, it is the base class that
 * specialized controllers like `PuppeteerController` or `PlaywrightController`
 * extend. Second, it defines the public interface of the specialized classes
 * which provide only private methods. Therefore, we do not keep documentation
 * for the specialized classes, because it's the same for all of them.
 * @hideconstructor
 */
class BrowserController extends tiny_typed_emitter_1.TypedEmitter {
    constructor(browserPlugin) {
        super();
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, nanoid_1.nanoid)()
        });
        /**
         * The `BrowserPlugin` instance used to launch the browser.
         */
        Object.defineProperty(this, "browserPlugin", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Browser representation of the underlying automation library.
         */
        Object.defineProperty(this, "browser", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined
        });
        /**
         * The configuration the browser was launched with.
         */
        Object.defineProperty(this, "launchContext", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined
        });
        Object.defineProperty(this, "isActive", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "activePages", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "totalPages", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "lastPageOpenedAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Date.now()
        });
        Object.defineProperty(this, "_activate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "isActivePromise", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Promise((resolve) => {
                this._activate = resolve;
            })
        });
        Object.defineProperty(this, "commitBrowser", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "hasBrowserPromise", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Promise((resolve) => {
                this.commitBrowser = resolve;
            })
        });
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
        this._activate();
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
        this.commitBrowser();
    }
    /**
     * Gracefully closes the browser and makes sure
     * there will be no lingering browser processes.
     *
     * Emits 'browserClosed' event.
     */
    async close() {
        await this.hasBrowserPromise;
        try {
            await this._close();
            // TODO: shouldn't this go in a finally instead?
            this.isActive = false;
        }
        catch (error) {
            logger_1.log.debug(`Could not close browser.\nCause: ${error.message}`, { id: this.id });
        }
        this.emit("browserClosed" /* BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED */, this);
        setTimeout(() => {
            this._kill().catch((err) => {
                logger_1.log.debug(`Could not kill browser.\nCause: ${err.message}`, { id: this.id });
            });
        }, PROCESS_KILL_TIMEOUT_MILLIS);
    }
    /**
     * Immediately kills the browser process.
     *
     * Emits 'browserClosed' event.
     */
    async kill() {
        await this.hasBrowserPromise;
        await this._kill();
        this.emit("browserClosed" /* BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED */, this);
    }
    /**
     * Opens new browser page.
     * @ignore
     */
    async newPage(pageOptions) {
        this.activePages++;
        this.totalPages++;
        await this.isActivePromise;
        const page = await this._newPage(pageOptions);
        (0, timeout_1.tryCancel)();
        this.lastPageOpenedAt = Date.now();
        return page;
    }
    async setCookies(page, cookies) {
        return this._setCookies(page, cookies);
    }
    async getCookies(page) {
        return this._getCookies(page);
    }
    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    // eslint-disable-next-line space-before-function-paren
    async _close() {
        (0, utils_1.throwImplementationNeeded)('_close');
    }
    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    // eslint-disable-next-line space-before-function-paren
    async _kill() {
        (0, utils_1.throwImplementationNeeded)('_kill');
    }
    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    async _newPage(pageOptions) {
        (0, utils_1.throwImplementationNeeded)('_newPage');
    }
    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    async _setCookies(page, cookies) {
        (0, utils_1.throwImplementationNeeded)('_setCookies');
    }
    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    async _getCookies(page) {
        (0, utils_1.throwImplementationNeeded)('_getCookies');
    }
    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    normalizeProxyOptions(proxyUrl, pageOptions) {
        (0, utils_1.throwImplementationNeeded)('_normalizeProxyOptions');
    }
}
exports.BrowserController = BrowserController;
//# sourceMappingURL=browser-controller.js.map