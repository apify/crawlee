import url from 'url';
import http from 'http';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import LiveViewRouter from './live_view_router';
import LiveViewBrowser from './live_view_browser';

/**
 * Enables Live View monitoring of Act execution by spawning a web server that responds with a list
 * of available browsers at its root path. Once the user chooses a browser, LiveViewServer will
 * periodically serve screenshots of the selected browser's latest loaded page.
 * @param {Number} [options.port] Listening port of the LiveViewServer. Defaults to 1234.
 */
export default class LiveViewServer {
    constructor(opts = {}) {
        checkParamOrThrow(opts, 'opts', 'Object');
        checkParamOrThrow(opts.port, 'opts.port', 'Maybe String | Number');
        this.browsers = [];
        this.port = Number(opts.port) || 1234;
        this.httpServer = null;
        this.browserCounter = 0;
        this.router = new LiveViewRouter();
    }

    /**
     * The start method should cover most use cases of starting a LiveViewServer.
     * It creates a single instance of the server on its first invocation and subsequent
     * invocations only add more browsers to the current server instance. Individual browsers
     * are assigned unique IDs that will be used in displaying the browsers in an HTML index
     * available at the server's root route.
     *
     * The ID is customizable to better identify individual browsers.
     *
     * @param {Promise<Browser>} browserPromise A Promise for a Puppeteer's Browser.
     * @param {Object} [opts] Options to pass down to LiveViewServer constructor.
     * @param {String} [opts.browserId] Custom ID to be used with the browser instance.
     * @returns {Promise} The promise will resolve when the promise for the Puppeteer's Browser resolves.
     */
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

    /**
     * Starts an HTTP server on a preconfigured port or 1234.
     */
    startServer() {
        const server = http.createServer(this._requestListener.bind(this));
        server.listen(this.port, (err) => {
            if (err) reject(err);
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
    _requestListener(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const path = parsedUrl.pathname.replace(/^\/+|\/+$/g, '');
        req.lvs = this;
        this.router.handle(path, req, res);
    }
}
