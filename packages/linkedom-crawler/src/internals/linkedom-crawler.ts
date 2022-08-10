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
import { DOMParser } from 'linkedom';
import type { IncomingMessage } from 'http';

export type LinkeDOMErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > = ErrorHandler<LinkeDOMCrawlingContext<UserData, JSONData>>;

export interface LinkeDOMCrawlerOptions<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > extends HttpCrawlerOptions<LinkeDOMCrawlingContext<UserData, JSONData>> {}

export type LinkeDOMHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > = InternalHttpHook<LinkeDOMCrawlingContext<UserData, JSONData>>;

export interface LinkeDOMCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > extends InternalHttpCrawlingContext<UserData, JSONData, LinkeDOMCrawler> {
    window: Window;

    enqueueLinks: (options?: LinkeDOMCrawlerEnqueueLinksOptions) => Promise<BatchAddRequestsResult>;
}

export type LinkeDOMRequestHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = Dictionary,
    > = RequestHandler<LinkeDOMCrawlingContext<UserData, JSONData>>;
export interface LinkeDOMCrawlerEnqueueLinksOptions extends Omit<EnqueueLinksOptions, 'urls' | 'requestQueue'> {}

/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests and
 * [linkedom](https://www.npmjs.com/package/linkedom) DOM implementation.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `LinkeDOMCrawler` uses raw HTTP requests to download web pages,
 * it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
 * to display the content, you might need to use {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler} instead,
 * because it loads the pages using full-featured headless Chrome browser.
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
 *             title: window.title,
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

    protected override async _parseHTML(response: IncomingMessage, isXml: boolean, crawlingContext: LinkeDOMCrawlingContext) {
        const body = await concatStreamToBuffer(response);

        const document = LinkeDOMCrawler.parser.parseFromString(body.toString(), isXml ? 'text/html' : 'text/html');

        return {
            window: document.defaultView,
            get body() {
                return document.documentElement.outerHTML;
            },
            enqueueLinks: async (enqueueOptions?: LinkeDOMCrawlerEnqueueLinksOptions) => {
                return linkedomCrawlerEnqueueLinks({
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
    options?: LinkeDOMCrawlerEnqueueLinksOptions;
    window: Window | null;
    requestQueue: RequestQueue;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}

/** @internal */
export async function linkedomCrawlerEnqueueLinks({ options, window, requestQueue, originalRequestUrl, finalRequestUrl }: EnqueueLinksInternalOptions) {
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
function extractUrlsFromWindow(window: Window, selector: string, baseUrl: string): string[] {
    return Array.from(window.document.querySelectorAll(selector))
        .map((e: any) => e.href)
        .filter((href) => href !== undefined)
        .map((href: string | undefined) => {
            if (href === undefined) {
                return;
            }

            try {
                return (new URL(href, baseUrl)).href;
            } catch {
                return undefined;
            }
        })
        .filter((href) => href !== undefined) as string[];
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
export function createLinkeDOMRouter<Context extends LinkeDOMCrawlingContext = LinkeDOMCrawlingContext>() {
    return Router.create<Context>();
}
