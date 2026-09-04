import type {
    CrawlingContext,
    DomCrawlingContext,
    ErrorHandler,
    GetUserDataFromRequest,
    HttpCrawlerOptions,
    InternalHttpHook,
    RequestHandler,
    RouterHandler,
    RouterRoutes,
    RouteSchemas,
    RoutesFromSchemas,
} from '@crawlee/http';
import { DomCrawler, Router } from '@crawlee/http';
import type { Dictionary } from '@crawlee/types';

import type { CheerioParseResult } from './cheerio-parser.js';
import { cheerioParser } from './cheerio-parser.js';

export type CheerioErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    ContextExtension = Dictionary<never>,
> = ErrorHandler<CrawlingContext, CheerioCrawlingContext<UserData, JSONData> & ContextExtension>;

export interface CheerioCrawlerOptions<
    ContextExtension = Dictionary<never>,
    ExtendedContext extends CheerioCrawlingContext = CheerioCrawlingContext & ContextExtension,
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    Routes extends Record<keyof Routes, Dictionary> = Record<string, UserData>,
    StatisticStateExtension extends object = {},
> extends HttpCrawlerOptions<
    CheerioCrawlingContext<UserData, JSONData>,
    ContextExtension,
    ExtendedContext,
    Routes,
    StatisticStateExtension
> {}

export type CheerioHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = InternalHttpHook<CheerioCrawlingContext<UserData, JSONData>>;

export interface CheerioCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> extends DomCrawlingContext<CheerioParseResult, UserData, JSONData> {}

export type CheerioRequestHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = RequestHandler<CheerioCrawlingContext<UserData, JSONData>>;

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
export class CheerioCrawler<
    ContextExtension = Dictionary<never>,
    ExtendedContext extends CheerioCrawlingContext = CheerioCrawlingContext & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<
        string,
        GetUserDataFromRequest<CheerioCrawlingContext['request']>
    >,
    StatisticStateExtension extends object = {},
> extends DomCrawler<CheerioParseResult, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    /**
     * All `CheerioCrawler` parameters are passed via an options object.
     */
    constructor(
        options?: CheerioCrawlerOptions<ContextExtension, ExtendedContext, any, any, Routes, StatisticStateExtension>,
    ) {
        super({ ...options, parser: cheerioParser() });
    }
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
export function createCheerioRouter<
    Context extends CheerioCrawlingContext = CheerioCrawlingContext,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export function createCheerioRouter<
    Context extends CheerioCrawlingContext = CheerioCrawlingContext,
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
export function createCheerioRouter<
    Context extends CheerioCrawlingContext = CheerioCrawlingContext,
    const Schemas extends RouteSchemas = RouteSchemas,
>(schemas: Schemas): RouterHandler<Context, RoutesFromSchemas<Schemas>>;
export function createCheerioRouter(routesOrSchemas?: any): any {
    return Router.create(routesOrSchemas);
}
