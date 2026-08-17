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
import type { CheerioAPI } from 'cheerio';
import { sleep } from '@crawlee/utils';
import { tryAbsoluteURL } from '@crawlee/utils/internal';
import * as cheerio from 'cheerio';
import { DOMParser } from 'linkedom/cached';

export type LinkeDOMErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    ContextExtension = Dictionary<never>,
> = ErrorHandler<CrawlingContext, LinkeDOMCrawlingContext<UserData, JSONData> & ContextExtension>;

export interface LinkeDOMCrawlerOptions<
    ContextExtension = Dictionary<never>,
    ExtendedContext extends LinkeDOMCrawlingContext = LinkeDOMCrawlingContext & ContextExtension,
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    Routes extends Record<keyof Routes, Dictionary> = Record<string, UserData>,
    StatisticStateExtension extends object = {},
> extends HttpCrawlerOptions<
    LinkeDOMCrawlingContext<UserData, JSONData>,
    ContextExtension,
    ExtendedContext,
    Routes,
    StatisticStateExtension
> {}

export type LinkeDOMHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = InternalHttpHook<LinkeDOMCrawlingContext<UserData, JSONData>>;

export interface LinkeDOMCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> extends InternalHttpCrawlingContext<UserData, JSONData> {
    window: Window;
    // Technically the document is not of type Document but of type either HTMLDocument or XMLDocument
    // from linkedom/types/{html/xml}/document, depending on the content type of the response
    // Using union of the real types would make writing the crawlers inconvenient,
    // so we specify the type as the native Document type from lib.dom.d.ts
    // even though it's not technically 100% correct
    document: Document;

    /**
     * Wait for an element matching the selector to appear.
     * Timeout defaults to 5s.
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
     * Returns Cheerio handle, allowing to work with the data same way as with {@apilink CheerioCrawler}.
     * When provided with the `selector` argument, it will first look for the selector with a 5s timeout.
     *
     * **Example usage:**
     * ```javascript
     * async requestHandler({ parseWithCheerio }) {
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    parseWithCheerio(selector?: string, timeoutMs?: number): Promise<CheerioAPI>;

    /**
     * Extracts URLs from the parsed DOM, without adding them to the request queue.
     */
    extractLinks(options?: ExtractLinksOptions): Promise<string[]>;

    /**
     * Helper function for extracting URLs from the parsed DOM and adding them to the request queue.
     */
    enqueueLinks(options?: EnqueueLinksOptions): Promise<AddRequestsBatchedResult>;
}

export type LinkeDOMRequestHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = RequestHandler<LinkeDOMCrawlingContext<UserData, JSONData>>;

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

export class LinkeDOMCrawler<
    ContextExtension = Dictionary<never>,
    ExtendedContext extends LinkeDOMCrawlingContext = LinkeDOMCrawlingContext & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<
        string,
        GetUserDataFromRequest<LinkeDOMCrawlingContext['request']>
    >,
    StatisticStateExtension extends object = {},
> extends HttpCrawler<LinkeDOMCrawlingContext, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    static #parser = new DOMParser();

    constructor(
        options: LinkeDOMCrawlerOptions<
            ContextExtension,
            ExtendedContext,
            any,
            any,
            Routes,
            StatisticStateExtension
        > = {},
    ) {
        const { contextPipelineBuilder, ...rest } = options;

        super({
            ...rest,
            contextPipelineBuilder: contextPipelineBuilder ?? (() => this.buildContextPipeline()),
        });
    }

    protected override buildContextPipeline(): ContextPipeline<CrawlingContext, LinkeDOMCrawlingContext> {
        return super
            .buildContextPipeline()
            .compose({
                action: async (context) => this.parseContent(context),
            })
            .compose({ action: async (context) => this.addHelpers(context) });
    }

    private async parseContent(crawlingContext: InternalHttpCrawlingContext) {
        try {
            const isXml = crawlingContext.contentType.type.includes('xml');
            const document = LinkeDOMCrawler.#parser.parseFromString(
                crawlingContext.body.toString(),
                isXml ? 'text/xml' : 'text/html',
            );

            return {
                window: document.defaultView,
                get body() {
                    return document.documentElement.outerHTML;
                },
                get document() {
                    // See comment about typing in LinkeDOMCrawlingContext definition
                    return document as unknown as Document;
                },
            };
        } catch (err) {
            if (err instanceof NavigationSkippedError) {
                return {
                    get window(): Window {
                        throw new NavigationSkippedError(
                            'The `window` property is not available - `skipNavigation` was used',
                            { cause: err },
                        );
                    },
                    get body(): string {
                        throw new NavigationSkippedError(
                            'The `body` property is not available - `skipNavigation` was used',
                            { cause: err },
                        );
                    },
                    get document(): Document {
                        throw new NavigationSkippedError(
                            'The `document` property is not available - `skipNavigation` was used',
                            { cause: err },
                        );
                    },
                };
            }

            throw err;
        }
    }

    private async addHelpers(crawlingContext: InternalHttpCrawlingContext & { body: string; window: Window }) {
        const addRequests = crawlingContext.addRequests;

        const extractLinks = async (options?: ExtractLinksOptions): Promise<string[]> => {
            if (!crawlingContext.window) {
                throw new Error('Cannot extract links because the DOM is not available.');
            }

            return extractUrlsFromWindow(
                crawlingContext.window,
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
            async waitForSelector(selector: string, timeoutMs = 5_000) {
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
            async parseWithCheerio(selector?: string, _timeoutMs = 5_000) {
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
function extractUrlsFromWindow(window: Window, selector: string, baseUrl: string): string[] {
    return Array.from(window.document.querySelectorAll(selector))
        .map((e: any) => e.href)
        .filter((href) => href !== undefined && href !== '')
        .map((href: string | undefined) => {
            if (href === undefined) {
                return undefined;
            }
            return tryAbsoluteURL(href, baseUrl);
        })
        .filter((href) => href !== undefined && href !== '') as string[];
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
export function createLinkeDOMRouter<
    Context extends LinkeDOMCrawlingContext = LinkeDOMCrawlingContext,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export function createLinkeDOMRouter<
    Context extends LinkeDOMCrawlingContext = LinkeDOMCrawlingContext,
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
export function createLinkeDOMRouter<
    Context extends LinkeDOMCrawlingContext = LinkeDOMCrawlingContext,
    const Schemas extends RouteSchemas = RouteSchemas,
>(schemas: Schemas): RouterHandler<Context, RoutesFromSchemas<Schemas>>;
export function createLinkeDOMRouter(routesOrSchemas?: any): any {
    return Router.create(routesOrSchemas);
}
