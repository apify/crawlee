import Promise from 'bluebird';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { dispatcher } from './live_view_router';
import { imgPage, errorPage } from './live_view_html';

/**
 * LiveViewBrowser encapsulates a Puppeteer's Browser instance and provides
 * an API to safely get screenshots of the Browser's Pages.
 * @param {Browser} browser A Puppeteer Browser instance.
 * @param {String} options.id A unique ID of the LiveViewBrowser.
 */
export default class LiveViewBrowser {
    constructor(browser, opts = {}) {
        this.browser = browser;
        // pages are stored in a WeakMap to be automatically garbage collected on close()
        this.pages = new WeakMap();

        checkParamOrThrow(opts.id, 'opts.id', 'Maybe String');
        this.id = opts.id;

        // since the page can be in any state when the user requests
        // a screenshot, we need to keep track of it ourselves
        browser.on('targetcreated', (target) => {
            if (target.type() === 'page') {
                target.page()
                    .then((page) => {
                        page.on('load', () => {
                            this.pages.set(page, true); // page is loaded
                        });
                    });
            }
        });
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
    _screenshot(page) {
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
        const loaded = this.pages.get(page);
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 1000));


        // if page is already loaded, take a screenshot
        // otherwise, wait for it to load
        let result;
        if (loaded) {
            result = Promise.race([page.screenshot()], timeoutPromise);
        } else {
            result = new Promise((resolve) => {
                page.on('load', () => {
                    resolve(Promise.race([page.screenshot()], timeoutPromise));
                });
            });
        }
        result = result.then((shot) => {
            if (!shot) throw new Error('LiveView: Screenshot timed out.');
            return shot;
        });

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

