import http from 'http';
import EventEmitter from 'events';
import Promise from 'bluebird';
import WebSocket from 'ws';
import log from 'apify-shared/log';
import { promisifyServerListen } from 'apify-shared/utilities';
import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { layout, indexPage, detailPage, errorPage } from './puppeteer_live_view_client';

const DEFAULT_SCREENSHOT_TIMEOUT_MILLIS = 3000;

/**
 * LiveViewBrowser encapsulates a Puppeteer's Browser instance and provides
 * an API to capture screenshots and HTML of the Browser's Pages. It uses
 * EventEmitter API to communicate relevant Page events.
 *
 * @param {Browser} browser A Puppeteer Browser instance.
 * @param {String} [options.id] A unique ID of the LiveViewBrowser.
 * @param {Number} [options.screenshotTimeoutMillis] Max time allowed for the screenshot taking process.
 * @ignore
 */
export class PuppeteerLiveViewBrowser extends EventEmitter {
    constructor(browser, opts = {}) {
        super();
        this.browser = browser;
        this.pages = new Map(); // To track all pages and their creation order for listing
        this.pageIds = new WeakMap(); // To avoid iteration over pages
        this.loadedPages = new WeakSet(); // To just track loaded state
        this.pageIdCounter = 0;

        checkParamOrThrow(opts.id, 'opts.id', 'String');
        checkParamOrThrow(opts.screenshotTimeoutMillis, 'opts.screenshotTimeoutMillis', 'Maybe Number');
        this.id = opts.id;
        this.screenshotTimeoutMillis = opts.screenshotTimeoutMillis || DEFAULT_SCREENSHOT_TIMEOUT_MILLIS;

        // Since the page can be in any state when the user requests
        // a screenshot, we need to keep track of it ourselves.
        browser.on('targetcreated', this._onTargetCreated.bind(this));
        // Clean up resources after page close
        browser.on('targetdestroyed', this._onTargetDestroyed.bind(this));
        // Clean up resources after browser close (in Server)
        browser.on('disconnected', this._onBrowserDisconnected.bind(this));
    }

    /**
     * Initiates screenshot and HTML capturing of a Page by attaching
     * a listener to Page "load" events. If the first Page is already loaded,
     * it captures immediately.
     *
     * This function is invoked as a response to a Client side command "renderPage",
     * which is issued by clicking on a Page listing on the Browser Index page.
     * Once capturing starts, new screenshot and HTML will be served to Client
     * with each Page load.
     * @param {Page} page Puppeteer Page instance.
     */
    startCapturing(page) {
        const id = this.pageIds.get(page);
        if (!id) return;
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
                    this.emit(id, {
                        id,
                        url: page.url(),
                        error: err,
                    });
                    log.error(err);
                });
        };
        // Capture immediately for loaded pages
        if (this.loadedPages.has(page)) capture();
        // Setup recurrent capturing
        page.on('load', () => {
            if (this.listenerCount(id)) capture();
        });
    }

    /**
     * Clears the capturing listener setup by startCapturing() to prevent
     * unnecessary load on both Server and Client.
     *
     * Client side, the function is invoked by clicking the "back" button
     * on a page detail (screenshot + HTML).
     *
     * @param {Page} page
     */
    stopCapturing(page) {
        const id = this.pageIds.get(page);
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
     *
     * @param {Page} page Puppeteer's Page
     * @returns {Promise<Buffer>} screenshot
     * @private
     * @ignore
     */
    _getScreenshotAndHtml(page) {
        // Replace page's close function to prevent a close
        // while the screenshot is being taken.
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

        const cleanup = () => {
            // Replace the stolen close() method or call it,
            // if it should've been called externally.
            if (closed) {
                close.apply(page, closeArgs)
                    .then(closeResolve);
            } else {
                page.close = close.bind(page);
            }
        };

        return Promise.props({
            image: page.screenshot(),
            html: page.content(),
        })
            .timeout(this.screenshotTimeoutMillis, 'Puppeteer Live View: Screenshot timed out.')
            .finally(cleanup);
    }

    /**
     * Handler invoked whenever a Target is created in a Puppeteer's Browser.
     * @param {Target} target
     * @private
     */
    _onTargetCreated(target) {
        if (target.type() !== 'page') return;
        target.page()
            .then((page) => {
                const id = `${this.id}_PAGE_${++this.pageIdCounter}`;
                this.pages.set(id, page);
                this.pageIds.set(page, id);
                this.emit('pagecreated', {
                    id,
                    browserId: this.id,
                    url: page.url(),
                });
                page.on('load', () => {
                    this.loadedPages.add(page); // Page is loaded
                });
                // Using "framenavigated" on main Frame since "targetchanged" does not seem reliable
                page.on('framenavigated', (frame) => {
                    if (frame !== page.mainFrame()) return;
                    this.loadedPages.delete(page);
                    this.emit('pagenavigated', {
                        id,
                        url: frame.url(),
                    });
                });
            })
            .catch(err => log.error(err));
    }

    /**
     * Handler invoked whenever a Target is destroyed in a Puppeteer's Browser.
     * @param {Target} target
     * @private
     */
    _onTargetDestroyed(target) {
        if (target.type() !== 'page') return;
        target.page()
            .then((page) => {
                const id = this.pageIds.get(page);
                this.pages.delete(id);
                this.emit('pagedestroyed', {
                    id,
                });
            })
            .catch(err => log.error(err));
    }

    /**
     * Handler invoked whenever a Browser is destroyed / disconnected in Puppeteer.
     * @param {Browser} browser
     * @private
     */
    _onBrowserDisconnected(browser) {
        this.emit('disconnected', browser);
    }
}

let liveViewServer;
/**
 * The registerBrowserForLiveView method should cover most use cases of starting a PuppeteerLiveViewServer.
 * It creates a single instance of the server on its first invocation and subsequent
 * invocations only add more browsers to the current server instance. Individual browsers
 * are assigned unique IDs that will be used in displaying the browsers in an HTML index
 * available at the server's root route.
 *
 * The ID is customizable to better identify individual browsers.
 *
 * The promise will resolve when the server starts listening or when the Puppeteer Browser
 * becomes available. Whichever comes later.
 *
 * @param {Promise<Browser>} browserPromise A Promise for a Puppeteer's Browser.
 * @param {Object} [opts] Options to pass down to PuppeteerLiveViewBrowser constructor.
 * @param {String} [opts.id] Custom ID to be used with the browser instance.
 * @param {String} [opts.screenshotTimeoutMillis] Max time allowed for the screenshot taking process.
 * @returns {Promise<PuppeteerLiveViewServer>}
 * @ignore
 */
export const registerBrowserForLiveView = (browserPromise, opts = {}) => {
    let serverPromise = Promise.resolve();
    if (!liveViewServer) {
        liveViewServer = new PuppeteerLiveViewServer();
        serverPromise = liveViewServer.startServer();
    }
    const optsCopy = Object.assign({}, opts);
    if (!optsCopy.id) optsCopy.id = `BROWSER_${++liveViewServer.browserIdCounter}`;

    browserPromise
        .then((browser) => {
            const lvb = new PuppeteerLiveViewBrowser(browser, optsCopy);
            liveViewServer.addBrowser(lvb);
            return liveViewServer;
        });

    return Promise.all([serverPromise, browserPromise]).then(() => liveViewServer); // Return PuppeteerLiveViewServer instance
};

/**
 * sendCommand() encapsulates simple WebSocket communication logic.
 *
 * @example
 *
 * A command is sent as JSON:
 *
 * {
 *   "command": "renderPage",
 *   "data": {
 *     "param1": "value1".
 *     "param2": "value2"
 *   }
 * }
 *
 * @param {WebSocket} socket
 * @param {String} command Name of requested command.
 * @param {Object} data Data to be sent.
 * @ignore
 */
const sendCommand = (socket, command, data) => {
    const payload = JSON.stringify({ command, data });
    socket.send(payload, (err) => {
        if (err) log.error(err);
    });
};

/**
 * Enables live monitoring of actor execution by spawning a web server that responds with a list
 * of available browsers at its root path. Once the user chooses a browser, PuppeteerLiveViewServer will
 * periodically serve screenshots of the selected browser's latest loaded page.
 *
 * The server will be started on a port defined by the `CONTAINER_PORT` environment variable,
 * or a randomly-selected port.
 * @ignore
 */
export default class PuppeteerLiveViewServer extends EventEmitter {
    constructor() {
        super();

        const containerPort = process.env[ENV_VARS.CONTAINER_PORT] || LOCAL_ENV_VARS[ENV_VARS.CONTAINER_PORT];
        this.liveViewPort = parseInt(containerPort, 10);
        if (!(this.liveViewPort >= 0 && this.liveViewPort <= 65535)) {
            throw new Error(`Cannot start LiveViewServer - invalid port specified by the ${
                ENV_VARS.CONTAINER_PORT} environment variable (was "${containerPort}").`);
        }

        this.liveViewUrl = process.env[ENV_VARS.CONTAINER_URL] || LOCAL_ENV_VARS[ENV_VARS.CONTAINER_URL];

        this.browsers = new Set();
        this.browserIdCounter = 0;
        this.httpServer = null;
    }

    /**
     * Adds an instance of PuppeteerLiveViewBrowser (not Puppeteer.Browser)
     * to the server's list of managed browsers.
     *
     * @param {PuppeteerLiveViewBrowser} browser
     */
    addBrowser(browser) {
        this.browsers.add(browser);
        this.emit('browsercreated', browser);
        browser.on('disconnected', () => this.deleteBrowser(browser));
    }

    /**
     * Removes an instance of PuppeteerLiveViewBrowser (not Puppeteer.Browser)
     * from the server's list of managed browsers.
     * @param {PuppeteerLiveViewBrowser} browser
     */
    deleteBrowser(browser) {
        this.browsers.delete(browser);
        this.emit('browserdestroyed', browser);
        browser.removeAllListeners();
    }

    /**
     * Starts an HTTP and a WebSocket server on a port defined in `CONTAINER_PORT` environment
     * variable or a randomly-selected port.
     *
     * @return {Promise} resolves when HTTP server starts listening
     */
    startServer() {
        const server = http.createServer(this._httpRequestListener.bind(this));
        const wss = new WebSocket.Server({ server });

        wss.on('connection', this._wsRequestListener.bind(this));

        return promisifyServerListen(server)(this.liveViewPort)
            .then(() => {
                log.info(`Live view is now available at ${this.liveViewUrl}`);
                this.httpServer = server;
            });
    }

    /**
     * Request handler function that returns a simple HTML index page
     * with embedded JavaScript that will establish a WebSocket connection
     * between the server and the client.
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     * @private
     * @ignore
     */
    _httpRequestListener(req, res) {
        const body = layout(this.liveViewUrl);
        res.writeHead(200, {
            'Content-Type': 'text/html',
            'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
    }

    /**
     * This function fires with each new WebSocket connection and manages
     * the socket's messages.
     * @param {WebSocket} ws
     * @private
     * @ignore
     */
    _wsRequestListener(ws) {
        const BAD_REQUEST = {
            message: 'Bad Request',
            status: 400,
        };
        const NOT_FOUND = {
            message: 'Not Found',
            status: 404,
        };

        // Traverses browsers to find a page with ID
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

        const COMMANDS = {
            renderIndex: () => sendCommand(ws, 'renderIndex', { html: indexPage(this.browsers) }),
            // When the user selects a Page from the Index
            renderPage: (msg) => {
                const { id } = msg.data || {};
                const [browser, page] = findPage(id);
                if (!page) return sendCommand(ws, 'error', NOT_FOUND);
                browser.startCapturing(page);
                browser.on(id, (pageData) => {
                    if (pageData.error) sendCommand(ws, 'renderPage', { html: errorPage(pageData) });
                    else sendCommand(ws, 'renderPage', { html: detailPage(pageData) });
                });
            },
            // When the user clicks on the back button
            quitPage: (msg) => {
                const { id } = msg.data || {};
                const [browser, page] = findPage(id);
                if (!page) return; // no need to send error
                browser.stopCapturing(page);
            },
        };

        log.debug('WebSocket connection to Puppeteer Live View established.');
        ws.on('message', (msg) => {
            try {
                msg = JSON.parse(msg);
            } catch (err) {
                return sendCommand(ws, 'error', BAD_REQUEST);
            }
            // Validate command and send response
            const { command } = msg;
            const fn = COMMANDS[command];
            if (!fn || typeof fn !== 'function') return sendCommand(ws, 'error', BAD_REQUEST);
            fn(msg);
        });
        this._setupCommandHandles(ws);
        // Send first Index after WS connection is established
        sendCommand(ws, 'renderIndex', { html: indexPage(this.browsers) });
    }

    /**
     * Invoked from the _wsRequestListener, this function only groups
     * all browser related event handling into a single package.
     * @param {WebSocket} ws
     * @private
     * @ignore
     */
    _setupCommandHandles(ws) {
        const attachListeners = (browser) => {
            const createListener = p => sendCommand(ws, 'createPage', p);
            const destroyListener = p => sendCommand(ws, 'destroyPage', p);
            const updateListener = p => sendCommand(ws, 'updatePage', p);
            browser.on('pagecreated', createListener);
            browser.on('pagedestroyed', destroyListener);
            browser.on('pagenavigated', updateListener);
            // Clean up to prevent listeners firing into closed sockets (on page refresh)
            ws.on('close', () => {
                browser.removeListener('pagecreated', createListener);
                browser.removeListener('pagedestroyed', destroyListener);
                browser.removeListener('pagenavigated', updateListener);
            });
        };
        // Since this function fires when a socket opens, some browsers
        // and pages already exist and we need to get messages about those too.
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
        // Clean up to prevent listeners firing into closed sockets (on page refresh)
        ws.on('close', () => {
            this.removeListener('browsercreated', createListener);
            this.removeListener('browserdestroyed', destroyListener);
        });
    }
}
