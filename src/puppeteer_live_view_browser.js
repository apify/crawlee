import EventEmitter from 'events';
import Promise from 'bluebird';
import uuid from 'uuid/v4';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { imgPage, errorPage } from './puppeteer_live_view_client';
import { createTimeoutPromise } from './utils';

const DEFAULT_SCREENSHOT_TIMEOUT = 3000;

/**
 * LiveViewBrowser encapsulates a Puppeteer's Browser instance and provides
 * an API to safely get screenshots of the Browser's Pages.
 * @param {Browser} browser A Puppeteer Browser instance.
 * @param {String} [options.id] A unique ID of the LiveViewBrowser.
 * @param {Number} [options.screenshotTimeout] Max time allowed for the screenshot taking process.
 */
export default class LiveViewBrowser extends EventEmitter {
    constructor(browser, opts = {}) {
        super();
        this.browser = browser;
        this.pages = new Map(); // to track all pages and their creation order for listing
        this._pageIds = new Map(); // to avoid iteration over pages
        this._loadedPages = new WeakSet(); // to just track loaded state

        checkParamOrThrow(opts.id, 'opts.id', 'Maybe String');
        checkParamOrThrow(opts.screenshotTimeout, 'opts.screenshotTimeout', 'Maybe Number');
        this.id = opts.id || uuid();
        this.screenshotTimeout = opts.screenshotTimeout || DEFAULT_SCREENSHOT_TIMEOUT;

        // since the page can be in any state when the user requests
        // a screenshot, we need to keep track of it ourselves
        browser.on('targetcreated', (target) => {
            if (target.type() === 'page') {
                target.page()
                    .then((page) => {
                        const id = uuid();
                        this.pages.set(id, page);
                        this._pageIds.set(page, id);
                        this.emit('pagecreated', {
                            id,
                            browserId: this.id,
                            url: page.url(),
                        });
                        page.on('load', () => {
                            this._loadedPages.add(page); // page is loaded
                        });
                        page.on('framenavigated', (frame) => {
                            this.emit('pagenavigated', {
                                id,
                                url: frame.url(),
                            });
                        });
                    })
                    .catch(err => log.error(err));
            }
        });
        browser.on('targetdestroyed', (target) => {
            if (target.type() === 'page') {
                target.page()
                    .then((page) => {
                        const id = this._pageIds.get(page);
                        this.pages.delete(id);
                        this.emit('pagedestroyed', {
                            id,
                        });
                    })
                    .catch(err => log.error(err));
            }
        });
        browser.on('disconnected', b => this.emit('disconnected', b));
    }

    /**
     * Handler that gets invoked by LiveViewRouter and sends an appropriate
     * response.
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    routeHandler(req, res) {
        this.browser.pages()
            .then((pages) => {
                if (pages[pages.length - 1]) {
                    return this._screenshot(pages[pages.length - 1]);
                }
            })
            .then((shot) => {
                dispatcher(res, imgPage(shot));
            })
            .catch((err) => {
                dispatcher(res, errorPage(err.message), 500);
            });
    }

    /**
     * The screenshot method simply takes a screenshot of the provided
     * Page and returns it as a promise. Unfortunately, nothing prevents
     * the Page from being closed while the screenshot is being taken,
     * which results into error. Therefore, the method prevents the page
     * from being closed by replacing its close method and handling the
     * page close itself once the screenshot has been taken.
     * @param {Page} page Puppeteer's Page
     * @returns {Promise<Buffer>} screenshot
     * @private
     */
    screenshot(page) {
        // replace page's close function to prevent a close
        // while the screenshot is being taken
        const { close } = page;
        let closed;
        let closeArgs;
        let closeResolve;
        page.close = (...args) => {
            if (!closed) closeArgs = args;
            closed = true;
            return new Promise((resolve) => {
                closeResolve = resolve;
            });
        };

        // check if the page has been marked as loaded
        const loaded = this._loadedPages.has(page);

        // setup promises
        const timeoutPromise = createTimeoutPromise(this.screenshotTimeout, 'Puppeteer Live View: Screenshot timed out.');
        const onLoadPromise = new Promise((resolve) => {
            page.on('load', () => {
                resolve(Promise.race([page.screenshot(), timeoutPromise]));
            });
        });

        // if page is already loaded, take a screenshot
        // otherwise, wait for it to load
        const result = loaded
            ? Promise.race([page.screenshot(), timeoutPromise])
            : onLoadPromise;

        result.finally(() => {
            // replace the stolen close() method or call it,
            // if it should've been called externally
            if (closed) {
                close.apply(page, closeArgs)
                    .then(closeResolve);
            } else {
                page.close = close.bind(page);
            }
        });

        return result;
    }
}

