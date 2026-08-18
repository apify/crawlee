import { EnqueueStrategy, HttpCrawler, NavigationSkippedError, resolveBaseUrlForEnqueueLinksFiltering, Router, } from '@crawlee/http';
import { extractUrlsFromCheerio } from '@crawlee/utils/internal';
import * as cheerio from 'cheerio';
import { parseDocument } from 'htmlparser2';
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
 * The source URLs are represented using {@apilink Request} objects that are fed from the
 * {@apilink IRequestManager|request manager} provided via the {@apilink CheerioCrawlerOptions.requestManager|`requestManager`}
 * constructor option (a {@apilink RequestQueue} is itself a request manager). To read from a read-only source such
 * as a {@apilink RequestList} while still being able to enqueue new requests, combine it with a queue into a
 * {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`} and pass the
 * result as `requestManager`.
 *
 * > The {@apilink CheerioCrawlerOptions.requestList|`requestList`} and {@apilink CheerioCrawlerOptions.requestQueue|`requestQueue`}
 * > options are deprecated; they are still accepted and folded into a single `requestManager` for back-compat.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * We can use the `preNavigationHooks` to adjust the crawling context before the request is made:
 *
 * ```
 * preNavigationHooks: [
 *     (crawlingContext) => {
 *         // ...
 *     },
 * ]
 * ```
 *
 * By default, `CheerioCrawler` only processes web pages with the `text/html`, `application/xhtml+xml`, `text/xml`, `application/xml`,
 * and `application/json` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@apilink CheerioCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For more details, see {@apilink CheerioCrawlerOptions.requestHandler}.
 *
 * New requests are only dispatched when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the
 * `CheerioCrawler` constructor, or, for finer control, by injecting a pre-configured
 * {@apilink ConcurrencySystem|`concurrencySystem`}.
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
export class CheerioCrawler extends HttpCrawler {
    /**
     * All `CheerioCrawler` parameters are passed via an options object.
     */
    constructor(options) {
        const { contextPipelineBuilder, ...rest } = options ?? {};
        super({
            ...rest,
            contextPipelineBuilder: contextPipelineBuilder ?? (() => this.buildContextPipeline()),
        });
    }
    buildContextPipeline() {
        return super
            .buildContextPipeline()
            .compose({
            action: async (context) => await this.parseContent(context),
        })
            .compose({ action: async (context) => await this.addHelpers(context) });
    }
    async parseContent(crawlingContext) {
        try {
            const isXml = crawlingContext.contentType.type.includes('xml');
            const body = Buffer.isBuffer(crawlingContext.body)
                ? crawlingContext.body.toString(crawlingContext.contentType.encoding)
                : crawlingContext.body;
            const dom = parseDocument(body, { decodeEntities: true, xmlMode: isXml });
            const $ = cheerio.load(dom, {
                xml: { decodeEntities: true, xmlMode: isXml },
            });
            return {
                $,
                body,
            };
        }
        catch (err) {
            if (err instanceof NavigationSkippedError) {
                return {
                    get body() {
                        throw new NavigationSkippedError('The `body` property is not available - `skipNavigation` was used', { cause: err });
                    },
                    get $() {
                        throw new NavigationSkippedError('The `$` property is not available - `skipNavigation` was used', { cause: err });
                    },
                };
            }
            throw err;
        }
    }
    async addHelpers(crawlingContext) {
        const addRequests = crawlingContext.addRequests;
        const extractLinks = async (options) => {
            if (!crawlingContext.$) {
                throw new Error('Cannot extract links because the DOM is not available.');
            }
            return extractUrlsFromCheerio(crawlingContext.$, options?.selector ?? 'a', options?.baseUrl ?? crawlingContext.request.loadedUrl ?? crawlingContext.request.url);
        };
        return {
            extractLinks,
            enqueueLinks: async (options = {}) => {
                const baseUrl = resolveBaseUrlForEnqueueLinksFiltering({
                    enqueueStrategy: options.strategy,
                    finalRequestUrl: crawlingContext.request.loadedUrl,
                    originalRequestUrl: crawlingContext.request.url,
                    userProvidedBaseUrl: options.baseUrl,
                });
                const urls = await extractLinks(options);
                return addRequests(urls, {
                    ...options,
                    baseUrl,
                    strategy: options.strategy ?? EnqueueStrategy.SameHostname,
                });
            },
            waitForSelector: async (selector, _timeoutMs) => {
                if (crawlingContext.$(selector).get().length === 0) {
                    throw new Error(`Selector '${selector}' not found.`);
                }
            },
            parseWithCheerio: async (selector, timeoutMs) => {
                if (selector) {
                    await crawlingContext.waitForSelector(selector, timeoutMs);
                }
                return crawlingContext.$;
            },
        };
    }
}
export function createCheerioRouter(routesOrSchemas) {
    return Router.create(routesOrSchemas);
}
