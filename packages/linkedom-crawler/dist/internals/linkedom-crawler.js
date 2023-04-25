"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLinkeDOMRouter = exports.linkedomCrawlerEnqueueLinks = exports.LinkeDOMCrawler = void 0;
const http_1 = require("@crawlee/http");
const utilities_1 = require("@apify/utilities");
const cached_1 = require("linkedom/cached");
/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests and
 * [linkedom](https://www.npmjs.com/package/linkedom) LinkeDOM implementation.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `LinkeDOMCrawler` uses raw HTTP requests to download web pages,
 * it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
 * to display the content, you might need to use {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler} instead,
 * because it loads the pages using full-featured headless Chrome browser.
 *
 * // TODO:
 * Alternatively, you can use {@apilink LinkeDOMCrawlerOptions.runScripts} to run website scripts in Node.
 * LinkeDOM does not implement all the standards, so websites can break.
 *
 * **Limitation**:
 * This crawler does not support proxies and cookies yet (each open starts with empty cookie store), and the user agent is always set to `Chrome`.
 *
 * `LinkeDOMCrawler` downloads each URL using a plain HTTP request,
 * parses the HTML content using [LinkeDOM](https://www.npmjs.com/package/linkedom)
 * and then invokes the user-provided {@apilink LinkeDOMCrawlerOptions.requestHandler} to extract page data
 * using the `window` object.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from
 * {@apilink RequestList} or {@apilink RequestQueue} instances provided by the {@apilink LinkeDOMCrawlerOptions.requestList}
 * or {@apilink LinkeDOMCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@apilink LinkeDOMCrawlerOptions.requestList} and {@apilink LinkeDOMCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@apilink RequestList} and automatically enqueues all of them
 * to {@apilink RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * We can use the `preNavigationHooks` to adjust `gotOptions`:
 *
 * ```
 * preNavigationHooks: [
 *     (crawlingContext, gotOptions) => {
 *         // ...
 *     },
 * ]
 * ```
 *
 * By default, `LinkeDOMCrawler` only processes web pages with the `text/html`
 * and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@apilink LinkeDOMCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For more details, see {@apilink LinkeDOMCrawlerOptions.requestHandler}.
 *
 * New requests are only dispatched when there is enough free CPU and memory available,
 * using the functionality provided by the {@apilink AutoscaledPool} class.
 * All {@apilink AutoscaledPool} configuration options can be passed to the `autoscaledPoolOptions`
 * parameter of the `CheerioCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@apilink AutoscaledPool} options are available directly in the `CheerioCrawler` constructor.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new LinkeDOMCrawler({
 *     async requestHandler({ request, window }) {
 *         await Dataset.pushData({
 *             url: request.url,
 *             title: window.document.title,
 *         });
 *     },
 * });
 *
 * await crawler.run([
 *     'http://crawlee.dev',
 * ]);
 * ```
 * @category Crawlers
 */
class LinkeDOMCrawler extends http_1.HttpCrawler {
    // protected virtualConsole: VirtualConsole | null = null; // FIXME
    constructor(options = {}, config) {
        const { runScripts = false, // TODO
        hideInternalConsole = false, // TODO
        lazyInitialization = false, ...httpOptions } = options;
        super(httpOptions, config);
        Object.defineProperty(this, "runScripts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "hideInternalConsole", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lazyInitialization", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.runScripts = runScripts;
        this.hideInternalConsole = hideInternalConsole;
        this.lazyInitialization = lazyInitialization;
    }
    async _parseHTML(response, isXml, crawlingContext) {
        const body = await (0, utilities_1.concatStreamToBuffer)(response);
        const document = LinkeDOMCrawler.parser.parseFromString(body.toString(), isXml ? 'text/html' : 'text/html');
        let window = this.lazyInitialization ? null : document.defaultView;
        return {
            get window() {
                return window;
            },
            initWindow: () => {
                // TODO: Throwing is maybe to harsh
                if (!this.lazyInitialization)
                    throw new Error('Window already initialized, calling initWindow() is not needed in non-lazy mode.');
                window = document.defaultView;
            },
            get document() {
                return document;
            },
            get body() {
                return document.documentElement.outerHTML;
            },
            enqueueLinks: async (enqueueOptions) => {
                return linkedomCrawlerEnqueueLinks({
                    options: enqueueOptions,
                    // @ts-ignore TODO: Fighting with TS :/
                    document,
                    requestQueue: await this.getRequestQueue(),
                    originalRequestUrl: crawlingContext.request.url,
                    finalRequestUrl: crawlingContext.request.loadedUrl,
                });
            },
        };
    }
}
Object.defineProperty(LinkeDOMCrawler, "parser", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: new cached_1.DOMParser()
});
exports.LinkeDOMCrawler = LinkeDOMCrawler;
/** @internal */
async function linkedomCrawlerEnqueueLinks({ options, document, requestQueue, originalRequestUrl, finalRequestUrl }) {
    if (!document) {
        throw new Error('Cannot enqueue links because the DOM is not available.');
    }
    const baseUrl = (0, http_1.resolveBaseUrlForEnqueueLinksFiltering)({
        enqueueStrategy: options?.strategy,
        finalRequestUrl,
        originalRequestUrl,
        userProvidedBaseUrl: options?.baseUrl,
    });
    const urls = extractUrlsFromDocument(document, options?.selector ?? 'a', options?.baseUrl ?? finalRequestUrl ?? originalRequestUrl);
    return (0, http_1.enqueueLinks)({
        requestQueue,
        urls,
        baseUrl,
        ...options,
    });
}
exports.linkedomCrawlerEnqueueLinks = linkedomCrawlerEnqueueLinks;
/**
 * Extracts URLs from a given Window object.
 * @ignore
 */
function extractUrlsFromDocument(document, selector, baseUrl) {
    return Array.from(document.querySelectorAll(selector))
        .map((e) => e.href)
        .filter((href) => href !== undefined && href !== '')
        .map((href) => {
        if (href === undefined) {
            return undefined;
        }
        return (0, http_1.tryAbsoluteURL)(href, baseUrl);
    })
        .filter((href) => href !== undefined && href !== '');
}
/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@apilink LinkeDOMCrawler}.
 * Defaults to the {@apilink LinkeDOMCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<LinkeDOMCrawlingContext>()`.
 *
 * ```ts
 * import { LinkeDOMCrawler, createLinkeDOMRouter } from 'crawlee';
 *
 * const router = createLinkeDOMRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new LinkeDOMCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
function createLinkeDOMRouter(routes) {
    return http_1.Router.create(routes);
}
exports.createLinkeDOMRouter = createLinkeDOMRouter;
//# sourceMappingURL=linkedom-crawler.js.map