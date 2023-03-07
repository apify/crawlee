import type {
    HttpCrawlerOptions,
    InternalHttpCrawlingContext,
    InternalHttpHook,
    ErrorHandler,
    RequestHandler,
    EnqueueLinksOptions,
    RequestQueue,
    Configuration,
} from '@crawlee/http';
import { HttpCrawler, enqueueLinks, Router, resolveBaseUrlForEnqueueLinksFiltering, tryAbsoluteURL } from '@crawlee/http';
import type { Dictionary } from '@crawlee/types';
import type { CheerioOptions } from 'cheerio';
import * as cheerio from 'cheerio';
import { DomHandler } from 'htmlparser2';
import { WritableStream } from 'htmlparser2/lib/WritableStream';
import type { IncomingMessage } from 'http';

export type CheerioErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > = ErrorHandler<CheerioCrawlingContext<UserData, JSONData>>;

export interface CheerioCrawlerOptions<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > extends HttpCrawlerOptions<CheerioCrawlingContext<UserData, JSONData>> {}

export type CheerioHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > = InternalHttpHook<CheerioCrawlingContext<UserData, JSONData>>;

export interface CheerioCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > extends InternalHttpCrawlingContext<UserData, JSONData, CheerioCrawler> {
    /**
     * The [Cheerio](https://cheerio.js.org/) object with parsed HTML.
     * Cheerio is available only for HTML and XML content types.
     */
    $: cheerio.CheerioAPI;
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
export class CheerioCrawler extends HttpCrawler<CheerioCrawlingContext> {
    /**
     * All `CheerioCrawler` parameters are passed via an options object.
     */
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(options?: CheerioCrawlerOptions, config?: Configuration) {
        super(options, config);
    }

    protected override async _parseHTML(response: IncomingMessage, isXml: boolean, crawlingContext: CheerioCrawlingContext) {
        const dom = await this._parseHtmlToDom(response, isXml);

        const $ = cheerio.load(dom as string, {
            xmlMode: isXml,
            // Recent versions of cheerio use parse5 as the HTML parser/serializer. It's more strict than htmlparser2
            // and not good for scraping. It also does not have a great streaming interface.
            // Here we tell cheerio to use htmlparser2 for serialization, otherwise the conflict produces weird errors.
            _useHtmlParser2: true,
        } as CheerioOptions);

        return {
            dom,
            $,
            get body() {
                return isXml ? $!.xml() : $!.html({ decodeEntities: false });
            },
            enqueueLinks: async (enqueueOptions?: EnqueueLinksOptions) => {
                return cheerioCrawlerEnqueueLinks({
                    options: enqueueOptions,
                    $,
                    requestQueue: await this.getRequestQueue(),
                    originalRequestUrl: crawlingContext.request.url,
                    finalRequestUrl: crawlingContext.request.loadedUrl,
                });
            },
        };
    }

    protected async _parseHtmlToDom(response: IncomingMessage, isXml: boolean) {
        return new Promise((resolve, reject) => {
            const domHandler = new DomHandler((err, dom) => {
                if (err) reject(err);
                else resolve(dom);
            }, { xmlMode: isXml });
            const parser = new WritableStream(domHandler, { decodeEntities: true, xmlMode: isXml });
            parser.on('error', reject);
            response
                .on('error', reject)
                .pipe(parser);
        });
    }
}

interface EnqueueLinksInternalOptions {
    options?: EnqueueLinksOptions;
    $: cheerio.CheerioAPI | null;
    requestQueue: RequestQueue;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}

/** @internal */
export async function cheerioCrawlerEnqueueLinks({ options, $, requestQueue, originalRequestUrl, finalRequestUrl }: EnqueueLinksInternalOptions) {
    if (!$) {
        throw new Error('Cannot enqueue links because the DOM is not available.');
    }

    const baseUrl = resolveBaseUrlForEnqueueLinksFiltering({
        enqueueStrategy: options?.strategy,
        finalRequestUrl,
        originalRequestUrl,
        userProvidedBaseUrl: options?.baseUrl,
    });

    const urls = extractUrlsFromCheerio($, options?.selector ?? 'a', options?.baseUrl ?? finalRequestUrl ?? originalRequestUrl);

    return enqueueLinks({
        requestQueue,
        urls,
        baseUrl,
        ...options,
    });
}

/**
 * Extracts URLs from a given Cheerio object.
 * @ignore
 */
function extractUrlsFromCheerio($: cheerio.CheerioAPI, selector: string, baseUrl?: string): string[] {
    return $(selector)
        .map((_i, el) => $(el).attr('href'))
        .get()
        .filter((href) => !!href)
        .map((href) => {
            // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
            const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
            if (!isHrefAbsolute && !baseUrl) {
                throw new Error(`An extracted URL: ${href} is relative and options.baseUrl is not set. `
                    + 'Use options.baseUrl in enqueueLinks() to automatically resolve relative URLs.');
            }
            return baseUrl
                ? tryAbsoluteURL(href, baseUrl)
                : href;
        })
        .filter((href) => !!href) as string[];
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
export function createCheerioRouter<Context extends CheerioCrawlingContext = CheerioCrawlingContext>() {
    return Router.create<Context>();
}
