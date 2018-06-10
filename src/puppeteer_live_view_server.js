import http from 'http';
import EventEmitter from 'events';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import WebSocket from 'ws';
import LiveViewBrowser from './puppeteer_live_view_browser';
import { layout, indexPage, detailPage } from './puppeteer_live_view_client';

const LOCAL_IPV6 = '::';
const LOCAL_IPV4 = '127.0.0.1';

let defaultServer;

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
                const { id } = msg.data;
                let page;
                let browser;
                for (const b of this.browsers) { // eslint-disable-line
                    if (b.pages.has(id)) {
                        page = b.pages.get(id);
                        browser = b;
                        break;
                    }
                }
                if (!page) return sendCommand(ws, 'error', NOT_FOUND);
                browser.screenshot(page)
                    .then((image) => {
                        const data = {
                            id,
                            url: page.url(),
                            image,
                        };
                        sendCommand(ws, 'renderPage', { html: detailPage(data) });
                    })
                    .catch(err => log.error(err));
            } else {
                sendCommand(ws, 'error', BAD_REQUEST);
            }
        });
        sendCommand(ws, 'renderIndex', { html: indexPage(this.browsers) });
        this._wsPushData(ws);
    }

    _wsPushData(ws) {
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
