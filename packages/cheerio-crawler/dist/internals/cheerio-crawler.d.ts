/// <reference types="node" />
import type { HttpCrawlerOptions, InternalHttpCrawlingContext, InternalHttpHook, ErrorHandler, RequestHandler, EnqueueLinksOptions, RequestQueue, Configuration } from '@crawlee/http';
import { HttpCrawler } from '@crawlee/http';
import type { Dictionary, GetUserDataFromRequest, RouterRoutes } from '@crawlee/types';
import * as cheerio from 'cheerio';
import type { IncomingMessage } from 'http';
export type CheerioErrorHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> = ErrorHandler<CheerioCrawlingContext<UserData, JSONData>>;
export interface CheerioCrawlerOptions<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> extends HttpCrawlerOptions<CheerioCrawlingContext<UserData, JSONData>> {
}
export type CheerioHook<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> = InternalHttpHook<CheerioCrawlingContext<UserData, JSONData>>;
export interface CheerioCrawlingContext<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> extends InternalHttpCrawlingContext<UserData, JSONData, CheerioCrawler> {
    /**
     * The [Cheerio](https://cheerio.js.org/) object with parsed HTML.
     * Cheerio is available only for HTML and XML content types.
     */
    $: cheerio.CheerioAPI;
    /**
     * Returns Cheerio handle, this is here to unify the crawler API, so they all have this handy method.
     * It has the same return type as the `$` context property, use it only if you are abstracting your workflow to
     * support different context types in one handler.
     *
     * **Example usage:**
     * ```javascript
     * async requestHandler({ parseWithCheerio }) {
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    parseWithCheerio(): Promise<cheerio.CheerioAPI>;
}
export type CheerioRequestHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> = RequestHandler<CheerioCrawlingContext<UserData, JSONData>>;
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
export declare class CheerioCrawler extends HttpCrawler<CheerioCrawlingContext> {
    /**
     * All `CheerioCrawler` parameters are passed via an options object.
     */
    constructor(options?: CheerioCrawlerOptions, config?: Configuration);
    protected _parseHTML(response: IncomingMessage, isXml: boolean, crawlingContext: CheerioCrawlingContext): Promise<{
        dom: unknown;
        $: cheerio.CheerioAPI;
        readonly body: string;
        enqueueLinks: (enqueueOptions?: EnqueueLinksOptions) => Promise<import("@crawlee/types").BatchAddRequestsResult>;
    }>;
    protected _parseHtmlToDom(response: IncomingMessage, isXml: boolean): Promise<unknown>;
    protected _runRequestHandler(context: CheerioCrawlingContext): Promise<void>;
}
interface EnqueueLinksInternalOptions {
    options?: EnqueueLinksOptions;
    $: cheerio.CheerioAPI | null;
    requestQueue: RequestQueue;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}
/** @internal */
export declare function cheerioCrawlerEnqueueLinks({ options, $, requestQueue, originalRequestUrl, finalRequestUrl }: EnqueueLinksInternalOptions): Promise<import("@crawlee/types").BatchAddRequestsResult>;
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
export declare function createCheerioRouter<Context extends CheerioCrawlingContext = CheerioCrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, UserData>): import("@crawlee/http").RouterHandler<Context>;
export {};
//# sourceMappingURL=cheerio-crawler.d.ts.map