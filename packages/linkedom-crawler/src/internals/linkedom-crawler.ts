import type { IncomingMessage } from 'node:http';

import type {
    EnqueueLinksOptions,
    ErrorHandler,
    GetUserDataFromRequest,
    HttpCrawlerOptions,
    InternalHttpCrawlingContext,
    InternalHttpHook,
    RequestHandler,
    RequestProvider,
    RouterRoutes,
    SkippedRequestCallback,
} from '@crawlee/http';
import {
    enqueueLinks,
    HttpCrawler,
    resolveBaseUrlForEnqueueLinksFiltering,
    Router,
    tryAbsoluteURL,
} from '@crawlee/http';
import type { Dictionary } from '@crawlee/types';
import { type CheerioRoot, type RobotsTxtFile, sleep } from '@crawlee/utils';
import * as cheerio from 'cheerio';
// @ts-expect-error This throws a compilation error due to TypeScript not inferring the module has CJS versions too
import { DOMParser } from 'linkedom/cached';

import { concatStreamToBuffer } from '@apify/utilities';

export type LinkeDOMErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = ErrorHandler<LinkeDOMCrawlingContext<UserData, JSONData>>;

export interface LinkeDOMCrawlerOptions<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> extends HttpCrawlerOptions<LinkeDOMCrawlingContext<UserData, JSONData>> {}

export interface LinkeDOMCrawlerEnqueueLinksOptions extends Omit<EnqueueLinksOptions, 'urls' | 'requestQueue'> {}

export type LinkeDOMHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = InternalHttpHook<LinkeDOMCrawlingContext<UserData, JSONData>>;

export interface LinkeDOMCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> extends InternalHttpCrawlingContext<UserData, JSONData, LinkeDOMCrawler> {
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
    parseWithCheerio(selector?: string, timeoutMs?: number): Promise<CheerioRoot>;
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

export class LinkeDOMCrawler extends HttpCrawler<LinkeDOMCrawlingContext> {
    private static parser = new DOMParser();

    protected override async _parseHTML(
        response: IncomingMessage,
        isXml: boolean,
        crawlingContext: LinkeDOMCrawlingContext,
    ) {
        const body = await concatStreamToBuffer(response);

        const document = LinkeDOMCrawler.parser.parseFromString(body.toString(), isXml ? 'text/xml' : 'text/html');

        return {
            window: document.defaultView,
            get body() {
                return document.documentElement.outerHTML;
            },
            get document() {
                // See comment about typing in LinkeDOMCrawlingContext definition
                return document as unknown as Document;
            },
            enqueueLinks: async (enqueueOptions?: LinkeDOMCrawlerEnqueueLinksOptions) => {
                return linkedomCrawlerEnqueueLinks({
                    options: enqueueOptions,
                    window: document.defaultView,
                    requestQueue: await this.getRequestQueue(),
                    robotsTxtFile: await this.getRobotsTxtFileForUrl(crawlingContext.request.url),
                    onSkippedRequest: this.onSkippedRequest,
                    originalRequestUrl: crawlingContext.request.url,
                    finalRequestUrl: crawlingContext.request.loadedUrl,
                });
            },
        };
    }

    override async _runRequestHandler(context: LinkeDOMCrawlingContext) {
        context.waitForSelector = async (selector: string, timeoutMs = 5_000) => {
            const $ = cheerio.load(context.body);

            if ($(selector).get().length === 0) {
                if (timeoutMs) {
                    await sleep(50);
                    await context.waitForSelector(selector, Math.max(timeoutMs - 50, 0));
                    return;
                }

                throw new Error(`Selector '${selector}' not found.`);
            }
        };
        context.parseWithCheerio = async (selector?: string, _timeoutMs = 5_000) => {
            const $ = cheerio.load(context.body);

            if (selector && $(selector).get().length === 0) {
                throw new Error(`Selector '${selector}' not found.`);
            }

            return $;
        };

        await super._runRequestHandler(context);
    }
}

interface EnqueueLinksInternalOptions {
    options?: LinkeDOMCrawlerEnqueueLinksOptions;
    window: Window | null;
    requestQueue: RequestProvider;
    robotsTxtFile?: RobotsTxtFile;
    onSkippedRequest?: SkippedRequestCallback;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}

/** @internal */
export async function linkedomCrawlerEnqueueLinks({
    options,
    window,
    requestQueue,
    robotsTxtFile,
    onSkippedRequest,
    originalRequestUrl,
    finalRequestUrl,
}: EnqueueLinksInternalOptions) {
    if (!window) {
        throw new Error('Cannot enqueue links because the DOM is not available.');
    }

    const baseUrl = resolveBaseUrlForEnqueueLinksFiltering({
        enqueueStrategy: options?.strategy,
        finalRequestUrl,
        originalRequestUrl,
        userProvidedBaseUrl: options?.baseUrl,
    });

    const urls = extractUrlsFromWindow(
        window,
        options?.selector ?? 'a',
        options?.baseUrl ?? finalRequestUrl ?? originalRequestUrl,
    );

    return enqueueLinks({
        requestQueue,
        robotsTxtFile,
        onSkippedRequest,
        urls,
        baseUrl,
        ...options,
    });
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
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, UserData>) {
    return Router.create<Context>(routes);
}
