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

export type JSDOMErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > = ErrorHandler<JSDOMCrawlingContext<UserData, JSONData>>;

export interface JSDOMCrawlerOptions<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > extends HttpCrawlerOptions<JSDOMCrawlingContext<UserData, JSONData>> {}

export type JSDOMHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > = InternalHttpHook<JSDOMCrawlingContext<UserData, JSONData>>;

export interface JSDOMCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > extends InternalHttpCrawlingContext<UserData, JSONData, JSDOMCrawler> {
    window: DOMWindow;

    enqueueLinks: (options?: EnqueueLinksOptions) => Promise<BatchAddRequestsResult>;
}

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
 * `JSDOMCrawler` downloads each URL using a plain HTTP request,
 * parses the HTML content using [JSDOM](https://www.npmjs.com/package/jsdom)
 * and then invokes the user-provided {@apilink JSDOMCrawlerOptions.requestHandler} to extract page data
 * using the `window` object.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from
 * {@apilink RequestList} or {@apilink RequestQueue} instances provided by the {@apilink JSDOMCrawlerOptions.requestList}
 * or {@apilink JSDOMCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@apilink JSDOMCrawlerOptions.requestList} and {@apilink JSDOMCrawlerOptions.requestQueue} are used,
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
 * By default, `JSDOMCrawler` only processes web pages with the `text/html`
 * and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@apilink JSDOMCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For more details, see {@apilink JSDOMCrawlerOptions.requestHandler}.
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
export class JSDOMCrawler extends HttpCrawler<JSDOMCrawlingContext> {
    protected override async _parseHTML(response: IncomingMessage, isXml: boolean, crawlingContext: JSDOMCrawlingContext) {
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
            enqueueLinks: async (enqueueOptions?: EnqueueLinksOptions) => {
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
    options?: Partial<EnqueueLinksOptions>;
    window: DOMWindow | null;
    requestQueue: RequestQueue;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}

/** @internal */
export async function domCrawlerEnqueueLinks({ options, window, requestQueue, originalRequestUrl, finalRequestUrl }: EnqueueLinksInternalOptions) {
    if (!window) {
        throw new Error('Cannot enqueue links because the JSDOM is not available.');
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
export function createJSDOMRouter<Context extends JSDOMCrawlingContext = JSDOMCrawlingContext>() {
    return Router.create<Context>();
}
