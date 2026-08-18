import { EnqueueStrategy, HttpCrawler, NavigationSkippedError, resolveBaseUrlForEnqueueLinksFiltering, Router, } from '@crawlee/http';
import { sleep } from '@crawlee/utils';
import { tryAbsoluteURL } from '@crawlee/utils/internal';
import * as cheerio from 'cheerio';
import { DOMParser } from 'linkedom/cached';
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
 * **Limitation**:
 * This crawler does not support proxies and cookies yet (each open starts with empty cookie store), and the user agent is always set to `Chrome`.
 *
 * `LinkeDOMCrawler` downloads each URL using a plain HTTP request,
 * parses the HTML content using [LinkeDOM](https://www.npmjs.com/package/linkedom)
 * and then invokes the user-provided {@apilink LinkeDOMCrawlerOptions.requestHandler} to extract page data
 * using the `window` object.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from the
 * {@apilink IRequestManager|request manager} provided via the {@apilink LinkeDOMCrawlerOptions.requestManager|`requestManager`}
 * constructor option (a {@apilink RequestQueue} is itself a request manager). To read from a read-only source such
 * as a {@apilink RequestList} while still being able to enqueue new requests, combine it with a queue into a
 * {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`} and pass the
 * result as `requestManager`.
 *
 * > The {@apilink LinkeDOMCrawlerOptions.requestList|`requestList`} and {@apilink LinkeDOMCrawlerOptions.requestQueue|`requestQueue`}
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
 * By default, `LinkeDOMCrawler` only processes web pages with the `text/html`, `application/xhtml+xml`, `text/xml`, `application/xml`,
 * and `application/json` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@apilink LinkeDOMCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For more details, see {@apilink LinkeDOMCrawlerOptions.requestHandler}.
 *
 * New requests are only dispatched when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the
 * `LinkeDOMCrawler` constructor, or, for finer control, by injecting a pre-configured
 * {@apilink ConcurrencySystem|`concurrencySystem`}.
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
export class LinkeDOMCrawler extends HttpCrawler {
    static #parser = new DOMParser();
    constructor(options = {}) {
        const { contextPipelineBuilder, ...rest } = options;
        super({
            ...rest,
            contextPipelineBuilder: contextPipelineBuilder ?? (() => this.buildContextPipeline()),
        });
    }
    buildContextPipeline() {
        return super
            .buildContextPipeline()
            .compose({
            action: async (context) => this.parseContent(context),
        })
            .compose({ action: async (context) => this.addHelpers(context) });
    }
    async parseContent(crawlingContext) {
        try {
            const isXml = crawlingContext.contentType.type.includes('xml');
            const document = LinkeDOMCrawler.#parser.parseFromString(crawlingContext.body.toString(), isXml ? 'text/xml' : 'text/html');
            return {
                window: document.defaultView,
                get body() {
                    return document.documentElement.outerHTML;
                },
                get document() {
                    // See comment about typing in LinkeDOMCrawlingContext definition
                    return document;
                },
            };
        }
        catch (err) {
            if (err instanceof NavigationSkippedError) {
                return {
                    get window() {
                        throw new NavigationSkippedError('The `window` property is not available - `skipNavigation` was used', { cause: err });
                    },
                    get body() {
                        throw new NavigationSkippedError('The `body` property is not available - `skipNavigation` was used', { cause: err });
                    },
                    get document() {
                        throw new NavigationSkippedError('The `document` property is not available - `skipNavigation` was used', { cause: err });
                    },
                };
            }
            throw err;
        }
    }
    async addHelpers(crawlingContext) {
        const addRequests = crawlingContext.addRequests;
        const extractLinks = async (options) => {
            if (!crawlingContext.window) {
                throw new Error('Cannot extract links because the DOM is not available.');
            }
            return extractUrlsFromWindow(crawlingContext.window, options?.selector ?? 'a', options?.baseUrl ?? crawlingContext.request.loadedUrl ?? crawlingContext.request.url);
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
            async waitForSelector(selector, timeoutMs = 5_000) {
                const $ = cheerio.load(crawlingContext.body);
                if ($(selector).get().length === 0) {
                    if (timeoutMs) {
                        await sleep(50);
                        await this.waitForSelector(selector, Math.max(timeoutMs - 50, 0));
                        return;
                    }
                    throw new Error(`Selector '${selector}' not found.`);
                }
            },
            async parseWithCheerio(selector, _timeoutMs = 5_000) {
                const $ = cheerio.load(crawlingContext.body);
                if (selector && $(selector).get().length === 0) {
                    throw new Error(`Selector '${selector}' not found.`);
                }
                return $;
            },
        };
    }
}
/**
 * Extracts URLs from a given Window object.
 * @ignore
 */
function extractUrlsFromWindow(window, selector, baseUrl) {
    return Array.from(window.document.querySelectorAll(selector))
        .map((e) => e.href)
        .filter((href) => href !== undefined && href !== '')
        .map((href) => {
        if (href === undefined) {
            return undefined;
        }
        return tryAbsoluteURL(href, baseUrl);
    })
        .filter((href) => href !== undefined && href !== '');
}
export function createLinkeDOMRouter(routesOrSchemas) {
    return Router.create(routesOrSchemas);
}
