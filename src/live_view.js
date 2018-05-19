import http from 'http';
import log from 'apify-shared/log';
import Promise from 'bluebird';

const encodeImg = (buffer) => {
    return `
<html>
<head>
  <meta charset="utf-8">
  <title>Page screenshot</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <meta http-equiv="refresh" content="1">
</head>
<body>
<div>
    <img src="data:image/png;base64, ${buffer.toString('base64')}" alt="Page screenshot" />
</div> 
</body>
</html>
`;
};

class LiveViewBrowser {
    constructor(browser) {
        this.browser = browser;
        this.pages = new WeakMap();

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
                const img = encodeImg(shot);
                res.setHeader('Content-Type', 'text/html');
                res.writeHead(200);
                res.end(img);
            })
            .catch((err) => {
                res.setHeader('Content-Type', 'text/plain');
                res.writeHead(500);
                res.end(err.message);
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
    constructor(options) {
        this.options = options;
        this.browsers = [];
    }

    static start(browserPromise, options) {
        const server = new LiveViewServer(options);
        server.registerBrowser(browserPromise)
            .then(server.createServer())
            .catch(err => log.error(err.message));
    }

    registerBrowser(browserPromise) {
        return browserPromise
            .then(browser => this.browsers.push(new LiveViewBrowser(browser)));
    }

    createServer() {
        return new Promise((resolve, reject) => {
            http.createServer((req, res) => {
                if (this.browsers[0]) {
                    this.browsers[0].routeHandler(req, res);
                }
            })
                .listen(1234, (err) => {
                    if (err) reject(err);
                    log.info('Live view server is listening on port 1234.');
                    resolve();
                });
        });
    }
}

