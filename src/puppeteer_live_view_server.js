import http from 'http';
import EventEmitter from 'events';
import Promise from 'bluebird';
import uuid from 'uuid/v4';
import WebSocket from 'ws';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { createTimeoutPromise } from './utils';
import { layout, indexPage, detailPage } from './puppeteer_live_view_client';

const LOCAL_IPV6 = '::';
const LOCAL_IPV4 = '127.0.0.1';
const DEFAULT_SCREENSHOT_TIMEOUT = 3000;

/**
 * LiveViewBrowser encapsulates a Puppeteer's Browser instance and provides
 * an API to safely get screenshots of the Browser's Pages.
 * @param {Browser} browser A Puppeteer Browser instance.
 * @param {String} [options.id] A unique ID of the LiveViewBrowser.
 * @param {Number} [options.screenshotTimeout] Max time allowed for the screenshot taking process.
 */
export class LiveViewBrowser extends EventEmitter {
    constructor(browser, opts = {}) {
        super();
        this.browser = browser;
        this.pages = new Map(); // to track all pages and their creation order for listing
        this._pageIds = new WeakMap(); // to avoid iteration over pages
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
                            if (frame === page.mainFrame()) {
                                this._loadedPages.delete(page); // page will load after nav
                                this.emit('pagenavigated', {
                                    id,
                                    url: frame.url(),
                                });
                            }
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

    startCapturing(page) {
        const id = this._pageIds.get(page);
        const capture = () => {
            log.debug(`Capturing page. ID: ${id}`);
            this._getScreenshotAndHtml(page)
                .then(({ image, html }) => {
                    this.emit(id, {
                        id,
                        url: page.url(),
                        image,
                        html,
                    });
                })
                .catch((err) => {
                    if (!err) return;
                    log.error(err);
                });
        };
        // capture immediately for loaded pages
        if (this._loadedPages.has(page)) capture();
        // setup recurrent capturing
        page.on('load', () => {
            if (this.listenerCount(id)) capture();
        });
    }

    stopCapturing(page) {
        const id = this._pageIds.get(page);
        this.removeAllListeners(id);
    }

    /**
     * The getScreenshotAndHtml method simply retrieves the page's HTML
     * content, takes a screenshot and returns both as a promise.
     * Unfortunately, nothing prevents the Page from being closed while
     * the screenshot is being taken, which results into error.
     * Therefore, the method prevents the page from being closed
     * by replacing its close method and handling the page close
     * itself once the screenshot has been taken.
     * @param {Page} page Puppeteer's Page
     * @returns {Promise<Buffer>} screenshot
     * @private
     */
    _getScreenshotAndHtml(page) {
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

        // setup promise factories
        const data = () => new Promise((resolve, reject) => {
            const result = {};
            const image = page.screenshot().then((s) => { result.image = s; });
            const html = page.content().then((s) => { result.html = s; });
            Promise.all([image, html])
                .then(() => resolve(result))
                .catch(reject);
        });
        const timeout = () => createTimeoutPromise(this.screenshotTimeout, 'Puppeteer Live View: Screenshot timed out.');
        const cleanup = () => {
            // replace the stolen close() method or call it,
            // if it should've been called externally
            if (closed) {
                close.apply(page, closeArgs)
                    .then(closeResolve);
            } else {
                page.close = close.bind(page);
            }
        };

        return Promise.race([data(), timeout()]).finally(cleanup);
    }
}


/**
 * The start method should cover most use cases of starting a PuppeteerLiveViewServer.
 * It creates a single instance of the server on its first invocation and subsequent
 * invocations only add more browsers to the current server instance. Individual browsers
 * are assigned unique IDs that will be used in displaying the browsers in an HTML index
 * available at the server's root route.
 *
 * The ID is customizable to better identify individual browsers.
 *
 * @param {Promise<Browser>} browserPromise A Promise for a Puppeteer's Browser.
 * @param {Object} [opts] Options to pass down to PuppeteerLiveViewServer constructor.
 * @param {Number} [opts.port] Listening port of the PuppeteerLiveViewServer. Defaults to 1234.
 * @param {String} [opts.browserId] Custom ID to be used with the browser instance.
 * @param {String} [opts.screenshotTimeout] Max time allowed for the screenshot taking process.
 * @returns {Promise<PuppeteerLiveViewServer>} The promise will resolve when the promise for Puppeteer's Browser resolves.
 */
let defaultServer;
export const startPuppeteerLiveView = (browserPromise, opts = {}) => {
    if (!defaultServer) {
        defaultServer = new PuppeteerLiveViewServer(opts);
        defaultServer.startServer();
    }
    const browserOpts = {
        id: opts.browserId,
        screenshotTimeout: opts.screenshotTimeout,
    };

    return browserPromise
        .then((browser) => {
            const lvb = new LiveViewBrowser(browser, browserOpts);
            defaultServer.addBrowser(lvb);
            return defaultServer;
        });
};

const sendCommand = (socket, command, data) => {
    const payload = JSON.stringify({ command, data });
    socket.send(payload, (err) => {
        if (err) log.error(err);
    });
};

/**
 * Enables Live View monitoring of Act execution by spawning a web server that responds with a list
 * of available browsers at its root path. Once the user chooses a browser, PuppeteerLiveViewServer will
 * periodically serve screenshots of the selected browser's latest loaded page.
 * @param {Number} [opts.port] Listening port of the PuppeteerLiveViewServer. Defaults to 1234.
 */
export default class PuppeteerLiveViewServer extends EventEmitter {
    constructor(opts = {}) {
        super();
        checkParamOrThrow(opts, 'opts', 'Object');
        checkParamOrThrow(opts.port, 'opts.port', 'Maybe String | Number');
        this.browsers = new Set();
        this.port = Number(opts.port) || 1234;
        this.httpServer = null;
    }

    addBrowser(browser) {
        this.browsers.add(browser);
        this.emit('browsercreated', browser);
        browser.on('disconnected', () => this.deleteBrowser(browser));
    }

    deleteBrowser(browser) {
        this.browsers.delete(browser);
        this.emit('browserdestroyed', browser);
        browser.removeAllListeners();
    }

    /**
     * Starts an HTTP and a WebSocket server on a preconfigured port or 1234.
     */
    startServer() {
        const server = http.createServer(this._httpRequestListener.bind(this));
        const wss = new WebSocket.Server({ server });
        wss.on('connection', this._wsRequestListener.bind(this));
        server.listen(this.port, (err) => {
            if (err) return log.error(err);
            log.info(`Live view server is listening on port ${this.port}.`);
            this.httpServer = server;
        });
    }

    /**
     * Request handler function that delegates to LiveViewRouter.
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     * @private
     */
    _httpRequestListener(req, res) {
        const { port, address } = this.httpServer.address();

        const body = layout({
            host: address === LOCAL_IPV6 ? LOCAL_IPV4 : address,
            port,
        });
        res.writeHead(200, {
            'Content-Type': 'text/html',
            'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
    }

    _wsRequestListener(ws) {
        const BAD_REQUEST = {
            message: 'Bad Request',
            status: 400,
        };
        const NOT_FOUND = {
            message: 'Not Found',
            status: 404,
        };

        const findPage = (id) => {
            let page;
            let browser;
            for (const b of this.browsers) { // eslint-disable-line
                if (b.pages.has(id)) {
                    page = b.pages.get(id);
                    browser = b;
                    break;
                }
            }
            return [browser, page];
        };


        log.debug('WebSocket connection to Puppeteer Live View established.');
        ws.on('message', (msg) => {
            try {
                msg = JSON.parse(msg);
            } catch (err) {
                return ws.send(BAD_REQUEST);
            }
            const { command } = msg;

            if (command === 'renderIndex') {
                sendCommand(ws, 'renderIndex', { html: indexPage(this.browsers) });
            } else if (command === 'renderPage') {
                const { id } = msg.data || {};
                const [browser, page] = findPage(id);
                if (!page) return sendCommand(ws, 'error', NOT_FOUND);
                browser.startCapturing(page);
                browser.on(id, pageData => sendCommand(ws, 'renderPage', { html: detailPage(pageData) }));
            } else if (command === 'quitPage') {
                const { id } = msg.data || {};
                const [browser, page] = findPage(id);
                if (!page) return; // no need to send error
                browser.stopCapturing(page);
            } else {
                sendCommand(ws, 'error', BAD_REQUEST);
            }
        });
        this._setupCommandHandles(ws);
        sendCommand(ws, 'renderIndex', { html: indexPage(this.browsers) });
    }

    _setupCommandHandles(ws) {
        const attachListeners = (browser) => {
            const createListener = p => sendCommand(ws, 'createPage', p);
            const destroyListener = p => sendCommand(ws, 'destroyPage', p);
            const updateListener = p => sendCommand(ws, 'updatePage', p);
            browser.on('pagecreated', createListener);
            browser.on('pagedestroyed', destroyListener);
            browser.on('pagenavigated', updateListener);
            // clean up to prevent listeners firing into closed sockets (on page refresh)
            ws.on('close', () => {
                browser.removeListener('pagecreated', createListener);
                browser.removeListener('pagedestroyed', destroyListener);
                browser.removeListener('pagenavigated', updateListener);
            });
        };

        this.browsers.forEach(attachListeners);
        const createListener = (browser) => {
            attachListeners(browser);
            sendCommand(ws, 'createBrowser', { id: browser.id });
        };
        const destroyListener = (browser) => {
            sendCommand(ws, 'destroyBrowser', { id: browser.id });
        };
        this.on('browsercreated', createListener);
        this.on('browserdestroyed', destroyListener);
        // clean up to prevent listeners firing into closed sockets (on page refresh)
        ws.on('close', () => {
            this.removeListener('browsercreated', createListener);
            this.removeListener('browserdestroyed', destroyListener);
        });
    }
}
