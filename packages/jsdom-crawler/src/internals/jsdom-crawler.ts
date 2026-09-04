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
import { DomCrawler, HttpCrawler, Router } from '@crawlee/http';
import type { Dictionary } from '@crawlee/types';
import { parseArgument } from '@crawlee/utils/internal';
import { VirtualConsole } from 'jsdom';
import { z } from 'zod';

import type { JSDOMParseResult } from './jsdom-parser.js';
import { jsdomParser } from './jsdom-parser.js';

export type JSDOMErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    ContextExtension = Dictionary<never>,
> = ErrorHandler<CrawlingContext, JSDOMCrawlingContext<UserData, JSONData> & ContextExtension>;

export interface JSDOMCrawlerOptions<
    ContextExtension = Dictionary<never>,
    ExtendedContext extends JSDOMCrawlingContext = JSDOMCrawlingContext & ContextExtension,
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    Routes extends Record<keyof Routes, Dictionary> = Record<string, UserData>,
    StatisticStateExtension extends object = {},
> extends HttpCrawlerOptions<
    JSDOMCrawlingContext<UserData, JSONData>,
    ContextExtension,
    ExtendedContext,
    Routes,
    StatisticStateExtension
> {
    /**
     * Download and run scripts.
     */
    runScripts?: boolean;
    /**
     * Suppress the logs from JSDOM internal console.
     */
    hideInternalConsole?: boolean;
}

export type JSDOMHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = InternalHttpHook<JSDOMCrawlingContext<UserData, JSONData>>;

export interface JSDOMCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> extends DomCrawlingContext<JSDOMParseResult, UserData, JSONData> {}

export type JSDOMRequestHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = RequestHandler<JSDOMCrawlingContext<UserData, JSONData>>;

/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests and
 * [jsdom](https://www.npmjs.com/package/jsdom) JSDOM implementation.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `JSDOMCrawler` uses raw HTTP requests to download web pages,
 * it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
 * to display the content, you might need to use {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler} instead,
 * because it loads the pages using full-featured headless Chrome browser.
 *
 * Alternatively, you can use {@apilink JSDOMCrawlerOptions.runScripts} to run website scripts in Node.
 * JSDOM does not implement all the standards, so websites can break.
 *
 * **Limitation**:
 * This crawler does not support proxies and cookies yet (each open starts with empty cookie store), and the user agent is always set to `Chrome`.
 *
 * `JSDOMCrawler` downloads each URL using a plain HTTP request,
 * parses the HTML content using [JSDOM](https://www.npmjs.com/package/jsdom)
 * and then invokes the user-provided {@apilink JSDOMCrawlerOptions.requestHandler} to extract page data
 * using the `window` object.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from the
 * {@apilink IRequestManager|request manager} provided via the {@apilink JSDOMCrawlerOptions.requestManager|`requestManager`}
 * constructor option (a {@apilink RequestQueue} is itself a request manager). To read from a read-only source such
 * as a {@apilink RequestList} while still being able to enqueue new requests, combine it with a queue into a
 * {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`} and pass the
 * result as `requestManager`.
 *
 * > The {@apilink JSDOMCrawlerOptions.requestList|`requestList`} and {@apilink JSDOMCrawlerOptions.requestQueue|`requestQueue`}
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
 * By default, `JSDOMCrawler` only processes web pages with the `text/html`, `application/xhtml+xml`, `text/xml`, `application/xml`,
 * and `application/json` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@apilink JSDOMCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For more details, see {@apilink JSDOMCrawlerOptions.requestHandler}.
 *
 * New requests are only dispatched when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the
 * `JSDOMCrawler` constructor, or, for finer control, by injecting a pre-configured
 * {@apilink ConcurrencySystem|`concurrencySystem`}.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new JSDOMCrawler({
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
export class JSDOMCrawler<
    ContextExtension = Dictionary<never>,
    ExtendedContext extends JSDOMCrawlingContext = JSDOMCrawlingContext & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<
        string,
        GetUserDataFromRequest<JSDOMCrawlingContext['request']>
    >,
    StatisticStateExtension extends object = {},
> extends DomCrawler<JSDOMParseResult, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    /**
     * @internal
     */
    protected static override optionsShape = {
        ...HttpCrawler.optionsShape,
        runScripts: z.boolean().optional(),
        hideInternalConsole: z.boolean().optional(),
    };

    /** @internal */
    protected static override optionsSchema = z.strictObject(JSDOMCrawler.optionsShape);

    #hideInternalConsole: boolean;
    #virtualConsole: VirtualConsole | null = null;

    constructor(
        options: JSDOMCrawlerOptions<ContextExtension, ExtendedContext, any, any, Routes, StatisticStateExtension> = {},
    ) {
        const {
            runScripts = false,
            hideInternalConsole = false,
            contextPipelineBuilder,
            ...httpOptions
        } = parseArgument(options, JSDOMCrawler.optionsSchema, 'JSDOMCrawlerOptions');

        super({
            ...httpOptions,
            contextPipelineBuilder,
            parser: jsdomParser({
                runScripts,
                virtualConsole: () => this.getVirtualConsole(),
                log: () => this.log,
            }),
        });

        this.#hideInternalConsole = hideInternalConsole;
    }

    /**
     * Returns the currently used `VirtualConsole` instance. Can be used to listen for the JSDOM's internal console messages.
     *
     * If the `hideInternalConsole` option is set to `true`, the messages aren't logged to the console by default,
     * but the virtual console can still be listened to.
     *
     * **Example usage:**
     * ```javascript
     * const console = crawler.getVirtualConsole();
     * console.on('error', (e) => {
     *     log.error(e);
     * });
     * ```
     */
    getVirtualConsole() {
        if (this.#virtualConsole) {
            return this.#virtualConsole;
        }

        this.#virtualConsole = new VirtualConsole();

        if (!this.#hideInternalConsole) {
            this.#virtualConsole.sendTo(console, { omitJSDOMErrors: true });
        }

        this.#virtualConsole.on('jsdomError', this.jsdomErrorHandler);

        return this.#virtualConsole;
    }

    private readonly jsdomErrorHandler = (error: Error) => this.log.debug('JSDOM error from console', { error });
}

/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@apilink JSDOMCrawler}.
 * Defaults to the {@apilink JSDOMCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<JSDOMCrawlingContext>()`.
 *
 * ```ts
 * import { JSDOMCrawler, createJSDOMRouter } from 'crawlee';
 *
 * const router = createJSDOMRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new JSDOMCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
export function createJSDOMRouter<
    Context extends JSDOMCrawlingContext = JSDOMCrawlingContext,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export function createJSDOMRouter<
    Context extends JSDOMCrawlingContext = JSDOMCrawlingContext,
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
export function createJSDOMRouter<
    Context extends JSDOMCrawlingContext = JSDOMCrawlingContext,
    const Schemas extends RouteSchemas = RouteSchemas,
>(schemas: Schemas): RouterHandler<Context, RoutesFromSchemas<Schemas>>;
export function createJSDOMRouter(routesOrSchemas?: any): any {
    return Router.create(routesOrSchemas);
}
