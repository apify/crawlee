import type {
    AddRequestsBatchedResult,
    ContextPipeline,
    CrawlingContext,
    EnqueueLinksOptions,
    ErrorHandler,
    ExtractLinksOptions,
    GetUserDataFromRequest,
    HttpCrawlerOptions,
    InternalHttpCrawlingContext,
    InternalHttpHook,
    RequestHandler,
    RouterHandler,
    RouterRoutes,
    RouteSchemas,
    RoutesFromSchemas,
} from '@crawlee/http';
import {
    EnqueueStrategy,
    HttpCrawler,
    NavigationSkippedError,
    resolveBaseUrlForEnqueueLinksFiltering,
    Router,
} from '@crawlee/http';
import type { Dictionary } from '@crawlee/types';
import { extractUrlsFromCheerio } from '@crawlee/utils/internal';
import type { CheerioAPI, CheerioOptions } from 'cheerio';
import * as cheerio from 'cheerio';
import { parseDocument } from 'htmlparser2';

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
> extends InternalHttpCrawlingContext<UserData, JSONData> {
    /**
     * The raw HTML content of the web page as a string.
     */
    body: string;

    /**
     * The [Cheerio](https://cheerio.js.org/) object with parsed HTML.
     * Cheerio is available only for HTML and XML content types.
     */
    $: cheerio.CheerioAPI;

    /**
     * Wait for an element matching the selector to appear. Timeout is ignored.
     *
     * **Example usage:**
     * ```ts
     * async requestHandler({ waitForSelector, parseWithCheerio }) {
     *     await waitForSelector('article h1');
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    waitForSelector(selector: string, timeoutMs?: number): Promise<void>;

    /**
     * Returns Cheerio handle, this is here to unify the crawler API, so they all have this handy method.
     * It has the same return type as the `$` context property, use it only if you are abstracting your workflow to
     * support different context types in one handler.
     * When provided with the `selector` argument, it will throw if it's not available.
     *
     * **Example usage:**
     * ```ts
     * async requestHandler({ parseWithCheerio }) {
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    parseWithCheerio(selector?: string, timeoutMs?: number): Promise<CheerioAPI>;

    /**
     * Extracts URLs from the parsed HTML, without adding them to the request queue.
     */
    extractLinks(options?: ExtractLinksOptions): Promise<string[]>;

    /**
     * Helper function for extracting URLs from the parsed HTML and adding them to the request queue.
     */
    enqueueLinks(options?: EnqueueLinksOptions): Promise<AddRequestsBatchedResult>;
}

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
> extends HttpCrawler<CheerioCrawlingContext, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    /**
     * All `CheerioCrawler` parameters are passed via an options object.
     */
    constructor(
        options?: CheerioCrawlerOptions<ContextExtension, ExtendedContext, any, any, Routes, StatisticStateExtension>,
    ) {
        const { contextPipelineBuilder, ...rest } = options ?? {};

        super({
            ...rest,
            contextPipelineBuilder: contextPipelineBuilder ?? (() => this.buildContextPipeline()),
        });
    }

    protected override buildContextPipeline(): ContextPipeline<CrawlingContext, CheerioCrawlingContext> {
        return super
            .buildContextPipeline()
            .compose({
                action: async (context) => await this.parseContent(context),
            })
            .compose({ action: async (context) => await this.addHelpers(context) });
    }

    private async parseContent(crawlingContext: InternalHttpCrawlingContext) {
        try {
            const isXml = crawlingContext.contentType.type.includes('xml');
            const body = Buffer.isBuffer(crawlingContext.body)
                ? crawlingContext.body.toString(crawlingContext.contentType.encoding)
                : crawlingContext.body;
            const dom = parseDocument(body, { decodeEntities: true, xmlMode: isXml });
            const $ = cheerio.load(dom, {
                xml: { decodeEntities: true, xmlMode: isXml },
            } as CheerioOptions);

            return {
                $,
                body,
            };
        } catch (err) {
            if (err instanceof NavigationSkippedError) {
                return {
                    get body(): string {
                        throw new NavigationSkippedError(
                            'The `body` property is not available - `skipNavigation` was used',
                            { cause: err },
                        );
                    },
                    get $(): CheerioAPI {
                        throw new NavigationSkippedError(
                            'The `$` property is not available - `skipNavigation` was used',
                            { cause: err },
                        );
                    },
                };
            }

            throw err;
        }
    }

    private async addHelpers(crawlingContext: InternalHttpCrawlingContext & { $: CheerioAPI }) {
        const addRequests = crawlingContext.addRequests;

        const extractLinks = async (options?: ExtractLinksOptions): Promise<string[]> => {
            if (!crawlingContext.$) {
                throw new Error('Cannot extract links because the DOM is not available.');
            }

            return extractUrlsFromCheerio(
                crawlingContext.$,
                options?.selector ?? 'a',
                options?.baseUrl ?? crawlingContext.request.loadedUrl ?? crawlingContext.request.url,
            );
        };

        return {
            extractLinks,
            enqueueLinks: async (options: EnqueueLinksOptions = {}) => {
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
            waitForSelector: async (selector: string, _timeoutMs?: number) => {
                if (crawlingContext.$(selector).get().length === 0) {
                    throw new Error(`Selector '${selector}' not found.`);
                }
            },
            parseWithCheerio: async (selector?: string, timeoutMs?: number) => {
                if (selector) {
                    await crawlingContext.waitForSelector(selector, timeoutMs);
                }

                return crawlingContext.$;
            },
        };
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
