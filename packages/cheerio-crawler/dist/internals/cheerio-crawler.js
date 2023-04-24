"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheerioRouter = exports.cheerioCrawlerEnqueueLinks = exports.CheerioCrawler = void 0;
const tslib_1 = require("tslib");
const http_1 = require("@crawlee/http");
const cheerio = tslib_1.__importStar(require("cheerio"));
const htmlparser2_1 = require("htmlparser2");
const WritableStream_1 = require("htmlparser2/lib/WritableStream");
/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests and
 * [cheerio](https://www.npmjs.com/package/cheerio) HTML parser.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `CheerioCrawler` uses raw HTTP requests to download web pages,
 * it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
 * to display the content, you might need to use {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler} instead,
 * because it loads the pages using full-featured headless Chrome browser.
 *
 * `CheerioCrawler` downloads each URL using a plain HTTP request,
 * parses the HTML content using [Cheerio](https://www.npmjs.com/package/cheerio)
 * and then invokes the user-provided {@apilink CheerioCrawlerOptions.requestHandler} to extract page data
 * using a [jQuery](https://jquery.com/)-like interface to the parsed HTML DOM.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from
 * {@apilink RequestList} or {@apilink RequestQueue} instances provided by the {@apilink CheerioCrawlerOptions.requestList}
 * or {@apilink CheerioCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@apilink CheerioCrawlerOptions.requestList} and {@apilink CheerioCrawlerOptions.requestQueue} are used,
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
 * By default, `CheerioCrawler` only processes web pages with the `text/html`
 * and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@apilink CheerioCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For more details, see {@apilink CheerioCrawlerOptions.requestHandler}.
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
 * const crawler = new CheerioCrawler({
 *     async requestHandler({ request, response, body, contentType, $ }) {
 *         const data = [];
 *
 *         // Do some data extraction from the page with Cheerio.
 *         $('.some-collection').each((index, el) => {
 *             data.push({ title: $(el).find('.some-title').text() });
 *         });
 *
 *         // Save the data to dataset.
 *         await Dataset.pushData({
 *             url: request.url,
 *             html: body,
 *             data,
 *         })
 *     },
 * });
 *
 * await crawler.run([
 *     'http://www.example.com/page-1',
 *     'http://www.example.com/page-2',
 * ]);
 * ```
 * @category Crawlers
 */
class CheerioCrawler extends http_1.HttpCrawler {
    /**
     * All `CheerioCrawler` parameters are passed via an options object.
     */
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(options, config) {
        super(options, config);
    }
    async _parseHTML(response, isXml, crawlingContext) {
        const dom = await this._parseHtmlToDom(response, isXml);
        const $ = cheerio.load(dom, {
            xmlMode: isXml,
            // Recent versions of cheerio use parse5 as the HTML parser/serializer. It's more strict than htmlparser2
            // and not good for scraping. It also does not have a great streaming interface.
            // Here we tell cheerio to use htmlparser2 for serialization, otherwise the conflict produces weird errors.
            _useHtmlParser2: true,
        });
        return {
            dom,
            $,
            get body() {
                return isXml ? $.xml() : $.html({ decodeEntities: false });
            },
            enqueueLinks: async (enqueueOptions) => {
                return cheerioCrawlerEnqueueLinks({
                    options: enqueueOptions,
                    $,
                    requestQueue: await this.getRequestQueue(),
                    originalRequestUrl: crawlingContext.request.url,
                    finalRequestUrl: crawlingContext.request.loadedUrl,
                });
            },
        };
    }
    async _parseHtmlToDom(response, isXml) {
        return new Promise((resolve, reject) => {
            const domHandler = new htmlparser2_1.DomHandler((err, dom) => {
                if (err)
                    reject(err);
                else
                    resolve(dom);
            }, { xmlMode: isXml });
            const parser = new WritableStream_1.WritableStream(domHandler, { decodeEntities: true, xmlMode: isXml });
            parser.on('error', reject);
            response
                .on('error', reject)
                .pipe(parser);
        });
    }
    async _runRequestHandler(context) {
        context.parseWithCheerio = () => Promise.resolve(context.$);
        await super._runRequestHandler(context);
    }
}
exports.CheerioCrawler = CheerioCrawler;
/** @internal */
async function cheerioCrawlerEnqueueLinks({ options, $, requestQueue, originalRequestUrl, finalRequestUrl }) {
    if (!$) {
        throw new Error('Cannot enqueue links because the DOM is not available.');
    }
    const baseUrl = (0, http_1.resolveBaseUrlForEnqueueLinksFiltering)({
        enqueueStrategy: options?.strategy,
        finalRequestUrl,
        originalRequestUrl,
        userProvidedBaseUrl: options?.baseUrl,
    });
    const urls = extractUrlsFromCheerio($, options?.selector ?? 'a', options?.baseUrl ?? finalRequestUrl ?? originalRequestUrl);
    return (0, http_1.enqueueLinks)({
        requestQueue,
        urls,
        baseUrl,
        ...options,
    });
}
exports.cheerioCrawlerEnqueueLinks = cheerioCrawlerEnqueueLinks;
/**
 * Extracts URLs from a given Cheerio object.
 * @ignore
 */
function extractUrlsFromCheerio($, selector, baseUrl) {
    return $(selector)
        .map((_i, el) => $(el).attr('href'))
        .get()
        .filter((href) => !!href)
        .map((href) => {
        // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
        const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
        if (!isHrefAbsolute && !baseUrl) {
            throw new Error(`An extracted URL: ${href} is relative and options.baseUrl is not set. `
                + 'Use options.baseUrl in enqueueLinks() to automatically resolve relative URLs.');
        }
        return baseUrl
            ? (0, http_1.tryAbsoluteURL)(href, baseUrl)
            : href;
    })
        .filter((href) => !!href);
}
/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@apilink CheerioCrawler}.
 * Defaults to the {@apilink CheerioCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<CheerioCrawlingContext>()`.
 *
 * ```ts
 * import { CheerioCrawler, createCheerioRouter } from 'crawlee';
 *
 * const router = createCheerioRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new CheerioCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
function createCheerioRouter(routes) {
    return http_1.Router.create(routes);
}
exports.createCheerioRouter = createCheerioRouter;
//# sourceMappingURL=cheerio-crawler.js.map