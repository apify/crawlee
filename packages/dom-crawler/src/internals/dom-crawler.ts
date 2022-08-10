import type {
    HttpCrawlerOptions,
    InternalHttpCrawlingContext,
    InternalHttpHook,
    ErrorHandler,
    RequestHandler,
    EnqueueLinksOptions,
    RequestQueue,
} from '@crawlee/http';
import { HttpCrawler, enqueueLinks, Router, resolveBaseUrlForEnqueueLinksFiltering } from '@crawlee/http';
import type { BatchAddRequestsResult, Dictionary } from '@crawlee/types';
import { concatStreamToBuffer } from '@apify/utilities';
import type { DOMWindow } from 'jsdom';
import { JSDOM } from 'jsdom';
import type { IncomingMessage } from 'http';

export type DOMErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > = ErrorHandler<DOMCrawlingContext<UserData, JSONData>>;

export interface DOMCrawlerOptions<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > extends HttpCrawlerOptions<DOMCrawlingContext<UserData, JSONData>> {}

export type DOMHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > = InternalHttpHook<DOMCrawlingContext<UserData, JSONData>>;

export interface DOMCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > extends InternalHttpCrawlingContext<UserData, JSONData, DOMCrawler> {
    window: DOMWindow;

    enqueueLinks: (options?: DOMCrawlerEnqueueLinksOptions) => Promise<BatchAddRequestsResult>;
}

export type DOMRequestHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > = RequestHandler<DOMCrawlingContext<UserData, JSONData>>;
export interface DOMCrawlerEnqueueLinksOptions extends Omit<EnqueueLinksOptions, 'urls' | 'requestQueue'> {}

/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests and
 * [jsdom](https://www.npmjs.com/package/jsdom) DOM implementation.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `DOMCrawler` uses raw HTTP requests to download web pages,
 * it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
 * to display the content, you might need to use {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler} instead,
 * because it loads the pages using full-featured headless Chrome browser.
 *
 * `DOMCrawler` downloads each URL using a plain HTTP request,
 * parses the HTML content using [JSDOM](https://www.npmjs.com/package/jsdom)
 * and then invokes the user-provided {@apilink DOMCrawlerOptions.requestHandler} to extract page data
 * using the `window` object.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from
 * {@apilink RequestList} or {@apilink RequestQueue} instances provided by the {@apilink DOMCrawlerOptions.requestList}
 * or {@apilink DOMCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@apilink DOMCrawlerOptions.requestList} and {@apilink DOMCrawlerOptions.requestQueue} are used,
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
 * By default, `DOMCrawler` only processes web pages with the `text/html`
 * and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@apilink DOMCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For more details, see {@apilink DOMCrawlerOptions.requestHandler}.
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
 * const crawler = new DOMCrawler({
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
export class DOMCrawler extends HttpCrawler<DOMCrawlingContext> {
    protected override async _parseHTML(response: IncomingMessage, isXml: boolean, crawlingContext: DOMCrawlingContext) {
        const body = await concatStreamToBuffer(response);

        const { window } = new JSDOM(body, {
            url: response.url,
            contentType: isXml ? 'text/xml' : 'text/html',
        });

        return {
            window,
            get body() {
                return window.document.documentElement.outerHTML;
            },
            enqueueLinks: async (enqueueOptions?: DOMCrawlerEnqueueLinksOptions) => {
                return domCrawlerEnqueueLinks({
                    options: enqueueOptions,
                    window,
                    requestQueue: await this.getRequestQueue(),
                    originalRequestUrl: crawlingContext.request.url,
                    finalRequestUrl: crawlingContext.request.loadedUrl,
                });
            },
        };
    }
}

interface EnqueueLinksInternalOptions {
    options?: DOMCrawlerEnqueueLinksOptions;
    window: DOMWindow | null;
    requestQueue: RequestQueue;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}

/** @internal */
export async function domCrawlerEnqueueLinks({ options, window, requestQueue, originalRequestUrl, finalRequestUrl }: EnqueueLinksInternalOptions) {
    if (!window) {
        throw new Error('Cannot enqueue links because the DOM is not available.');
    }

    const baseUrl = resolveBaseUrlForEnqueueLinksFiltering({
        enqueueStrategy: options?.strategy,
        finalRequestUrl,
        originalRequestUrl,
        userProvidedBaseUrl: options?.baseUrl,
    });

    const urls = extractUrlsFromWindow(window, options?.selector ?? 'a', options?.baseUrl ?? finalRequestUrl ?? originalRequestUrl);

    return enqueueLinks({
        requestQueue,
        urls,
        baseUrl,
        ...options,
    });
}

/**
 * Extracts URLs from a given Window object.
 * @ignore
 */
function extractUrlsFromWindow(window: DOMWindow, selector: string, baseUrl: string): string[] {
    return Array.from(window.document.querySelectorAll(selector))
        .map((e: any) => e.href)
        .filter((href) => href !== undefined && href !== '')
        .map((href: string | undefined) => {
            if (href === undefined) {
                return undefined;
            }

            try {
                return (new URL(href, baseUrl)).href;
            } catch {
                return undefined;
            }
        })
        .filter((href) => href !== undefined && href !== '') as string[];
}

/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@apilink DOMCrawler}.
 * Defaults to the {@apilink DOMCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<DOMCrawlingContext>()`.
 *
 * ```ts
 * import { DOMCrawler, createDOMRouter } from 'crawlee';
 *
 * const router = createDOMRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new DOMCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
export function createDOMRouter<Context extends DOMCrawlingContext = DOMCrawlingContext>() {
    return Router.create<Context>();
}
