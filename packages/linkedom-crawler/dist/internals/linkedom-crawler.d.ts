/// <reference types="node" />
import type { HttpCrawlerOptions, InternalHttpCrawlingContext, InternalHttpHook, ErrorHandler, RequestHandler, EnqueueLinksOptions, RequestQueue, Configuration } from '@crawlee/http';
import { HttpCrawler } from '@crawlee/http';
import type { Dictionary, GetUserDataFromRequest, RouterRoutes } from '@crawlee/types';
import type { IncomingMessage } from 'http';
import type { HTMLDocument } from 'linkedom/types/html/document';
export type LinkeDOMErrorHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> = ErrorHandler<LinkeDOMCrawlingContext<UserData, JSONData>>;
export interface LinkeDOMCrawlerOptions<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> extends HttpCrawlerOptions<LinkeDOMCrawlingContext<UserData, JSONData>> {
    /**
     * Download and run scripts.
     */
    runScripts?: boolean;
    /**
     * Suppress the logs from LinkeDOM internal console.
     */
    hideInternalConsole?: boolean;
    /**
     * FIXME https://github.com/WebReflection/linkedom/blob/main/esm/interface/document.js#L79
     */
    lazyInitialization?: boolean;
}
export interface LinkeDOMCrawlerEnqueueLinksOptions extends Omit<EnqueueLinksOptions, 'urls' | 'requestQueue'> {
}
export type LinkeDOMHook<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> = InternalHttpHook<LinkeDOMCrawlingContext<UserData, JSONData>>;
export interface LinkeDOMCrawlingContext<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> extends InternalHttpCrawlingContext<UserData, JSONData, LinkeDOMCrawler> {
    window: Window | null;
}
export type LinkeDOMRequestHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> = RequestHandler<LinkeDOMCrawlingContext<UserData, JSONData>>;
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
export declare class LinkeDOMCrawler extends HttpCrawler<LinkeDOMCrawlingContext> {
    private static parser;
    protected runScripts: boolean;
    protected hideInternalConsole: boolean;
    protected lazyInitialization: boolean;
    constructor(options?: LinkeDOMCrawlerOptions, config?: Configuration);
    protected _parseHTML(response: IncomingMessage, isXml: boolean, crawlingContext: LinkeDOMCrawlingContext): Promise<{
        readonly window: (Window & typeof globalThis) | null;
        initWindow: () => void;
        readonly document: import("linkedom/types/esm/html/document").HTMLDocument;
        readonly body: string;
        enqueueLinks: (enqueueOptions?: LinkeDOMCrawlerEnqueueLinksOptions) => Promise<import("@crawlee/types").BatchAddRequestsResult>;
    }>;
}
interface EnqueueLinksInternalOptions {
    options?: LinkeDOMCrawlerEnqueueLinksOptions;
    document: HTMLDocument;
    requestQueue: RequestQueue;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}
/** @internal */
export declare function linkedomCrawlerEnqueueLinks({ options, document, requestQueue, originalRequestUrl, finalRequestUrl }: EnqueueLinksInternalOptions): Promise<import("@crawlee/types").BatchAddRequestsResult>;
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
export declare function createLinkeDOMRouter<Context extends LinkeDOMCrawlingContext = LinkeDOMCrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, UserData>): import("@crawlee/http").RouterHandler<Context>;
export {};
//# sourceMappingURL=linkedom-crawler.d.ts.map