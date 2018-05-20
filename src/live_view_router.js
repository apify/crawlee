import { checkParamOrThrow } from 'apify-client/build/utils';
import { notFoundPage, rootPage } from './live_view_html';

/**
 * Initiates server response with predefined Content-Type and Content-Length headers.
 * @param {http.ServerResponse} res
 * @param {String | Buffer} body
 * @param {Number} [status]
 */
export const dispatcher = (res, body, status) => {
    checkParamOrThrow(res, 'res', 'Object');
    checkParamOrThrow(body, 'body', 'Maybe String | Buffer');
    checkParamOrThrow(status, 'opts.status', 'Maybe Number');
    res.writeHead(status || 200, {
        'Content-Type': 'text/html',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
};

/**
 * Individual route handlers that use HTML templates to serialize responses.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
const rootPageHandler = (req, res) => dispatcher(res, rootPage(req.lvs.browsers));
const notFoundHandler = (req, res) => dispatcher(res, notFoundPage(), 404);

/**
 * LiveViewRouter class encapsulates routing logic of the LiveViewServer.
 */
export default class LiveViewRouter {
    constructor() {
        this.routes = {
            '': rootPageHandler,
        };
    }

    /**
     * Creates a route that points to the given LiveViewBrowser by its id.
     * @param {LiveViewBrowser} browser
     */
    addBrowser(browser) {
        checkParamOrThrow(browser.id, 'browser.id', 'String');
        checkParamOrThrow(browser.routeHandler, 'browser.routeHandler', 'Function');
        const route = `browser/${browser.id}`;
        this.routes[route] = browser.routeHandler.bind(browser);
    }

    /**
     * The main route handling function of LiveViewRouter. Attempts to invoke a specific route
     * handler. If none is found, invokes 404 handler.
     * @param {String} path
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    handle(path, req, res) {
        const handler = this.routes[path];
        if (handler) return handler(req, res);
        notFoundHandler(req, res);
    }
}

