import { checkParamOrThrow } from 'apify-client/build/utils';
import { notFoundPage, rootPage } from './live_view_html';

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

const rootPageHandler = (req, res) => dispatcher(res, rootPage(req.lvs.browsers));
const notFoundHandler = (req, res) => dispatcher(res, notFoundPage());

export class Router {
    constructor() {
        this.routes = {
            '': rootPageHandler,
        };
    }

    addBrowser(browser) {
        checkParamOrThrow(browser.id, 'browser.id', 'String');
        checkParamOrThrow(browser.routeHandler, 'browser.routeHandler', 'Function');
        const route = `browser/${browser.id}`;
        this.routes[route] = browser.routeHandler.bind(browser);
    }

    handle(path, req, res) {
        const handler = this.routes[path];
        if (handler) return handler(req, res);
        notFoundHandler(req, res);
    }
}

