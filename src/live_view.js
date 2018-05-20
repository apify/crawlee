import http from 'http';
import url from 'url';
import log from 'apify-shared/log';
import Promise from 'bluebird';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { Router, dispatcher } from './live_view_router';
import { imgPage, errorPage } from './live_view_html';

class LiveViewBrowser {
    constructor(browser, opts = {}) {
        this.browser = browser;
        this.pages = new WeakMap();

        checkParamOrThrow(opts.id, 'opts.id', 'Maybe String');
        this.id = opts.id;

        browser.on('targetcreated', (target) => {
            if (target.type() === 'page') {
                target.page()
                    .then((page) => {
                        page.on('load', () => {
                            this.pages.set(page, true);
                        });
                    });
            }
        });
    }
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

    _screenshot(page) {
        // replace page's close function to prevent close
        // while the screenshot is being taken
        let result;
        const { close } = page;
        let closed;
        let closeArgs;
        let closeResolve;
        page.close = (...args) => {
            closed = true;
            closeArgs = args;
            return new Promise((resolve) => {
                closeResolve = resolve;
            });
        };

        const loaded = this.pages.get(page);
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 500));


        // if page is already loaded, take a screenshot
        // otherwise, wait for it to load
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

export default class LiveViewServer {
    constructor(opts = {}) {
        checkParamOrThrow(opts, 'opts', 'Object');
        checkParamOrThrow(opts.port, 'opts.port', 'Maybe String | Number');
        this.browsers = [];
        this.port = Number(opts.port) || 1234;
        this.httpServer = null;
        this.browserCounter = 0;
        this.router = new Router();
    }

    static start(browserPromise, opts = {}) {
        if (!LiveViewServer.server) {
            LiveViewServer.server = new LiveViewServer(opts);
            LiveViewServer.server.startServer();
        }
        const lvs = LiveViewServer.server;
        // TODO Ensure uniqueness of IDs.
        const browserOpts = {
            id: opts.browserId || `${++lvs.browserCounter}`,
        };

        return browserPromise
            .then((browser) => {
                const lvb = new LiveViewBrowser(browser, browserOpts);
                lvs.browsers.push(lvb);
                lvs.router.addBrowser(lvb);
            });
    }

    startServer() {
        const server = http.createServer(this._requestListener.bind(this));
        server.listen(this.port, (err) => {
            if (err) reject(err);
            log.info(`Live view server is listening on port ${this.port}.`);
            this.httpServer = server;
        });
    }

    _requestListener(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const path = parsedUrl.pathname.replace(/^\/+|\/+$/g, '');
        req.lvs = this;
        this.router.handle(path, req, res);
    }
}

