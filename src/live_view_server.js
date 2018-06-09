import http from 'http';
import uuid from 'uuid/v4';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import WebSocket from 'ws';
import LiveViewRouter from './live_view_router';
import LiveViewBrowser from './live_view_browser';
import { layout } from './live_view_html';

const BAD_REQUEST = {
    error: 'Invalid WebSocket message.',
    status: 400,
};
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
            defaultServer.browsers.set(uuid(), lvb);
            return defaultServer;
        });
};

/**
 * Enables Live View monitoring of Act execution by spawning a web server that responds with a list
 * of available browsers at its root path. Once the user chooses a browser, PuppeteerLiveViewServer will
 * periodically serve screenshots of the selected browser's latest loaded page.
 * @param {Number} [opts.port] Listening port of the PuppeteerLiveViewServer. Defaults to 1234.
 */
export default class PuppeteerLiveViewServer {
    constructor(opts = {}) {
        checkParamOrThrow(opts, 'opts', 'Object');
        checkParamOrThrow(opts.port, 'opts.port', 'Maybe String | Number');
        this.browsers = new Map();
        this.port = Number(opts.port) || 1234;
        this.httpServer = null;
    }


    // static start(browserPromise, opts = {}) {
    //     if (!PuppeteerLiveViewServer.server) {
    //         PuppeteerLiveViewServer.server = new PuppeteerLiveViewServer(opts);
    //         PuppeteerLiveViewServer.server.startServer();
    //     }
    //     const lvs = PuppeteerLiveViewServer.server;
    //     const browserOpts = {
    //         id: opts.browserId,
    //         screenshotTimeout: opts.screenshotTimeout,
    //     };
    //
    //     return browserPromise
    //         .then((browser) => {
    //             const lvb = new LiveViewBrowser(browser, browserOpts);
    //             lvs.browsers.push(lvb);
    //             lvs.router.addBrowser(lvb);
    //         });
    // }

    /**
     * Starts an HTTP server on a preconfigured port or 1234.
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
        log.debug('WebSocket connection to Puppeteer Live View established.');
        ws.on('message', (msg) => {
            try {
                msg = JSON.parse(msg);
            } catch (err) {
                return ws.send(BAD_REQUEST);
            }
            const { command } = msg;

            if (command === 'renderIndex') {
                ws.send('INDEX');
            } else if (command === 'renderPage') {
                const { id } = msg;
                ws.send('PAGE');
            } else {
                return ws.send(BAD_REQUEST);
            }
        });
        ws.send('INDEX');
    }
}
