import { assertBrowserPoolNotConfigured, BrowserCrawler, RequestState, Router } from '@crawlee/browser';
import { serviceLocator } from '@crawlee/core';
import { parseArgument } from '@crawlee/utils/internal';
import { z } from 'zod';
import { puppeteerBrowserPool, remotePuppeteerBrowserPool } from './puppeteer-browser-pool.js';
import { gotoExtended, puppeteerUtils } from './utils/puppeteer_utils.js';
/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chrome with [Puppeteer](https://github.com/puppeteer/puppeteer).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `PuppeteerCrawler` uses headless Chrome to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, consider using {@apilink CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from the
 * {@apilink IRequestManager|request manager} provided via the {@apilink PuppeteerCrawlerOptions.requestManager|`requestManager`}
 * constructor option (a {@apilink RequestQueue} is itself a request manager). To read from a read-only source such
 * as a {@apilink RequestList} while still being able to enqueue new requests, combine it with a queue into a
 * {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`} and pass the
 * result as `requestManager`.
 *
 * > The {@apilink PuppeteerCrawlerOptions.requestList|`requestList`} and {@apilink PuppeteerCrawlerOptions.requestQueue|`requestQueue`}
 * > options are deprecated; they are still accepted and folded into a single `requestManager` for back-compat.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * `PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each {@apilink Request} object to crawl
 * and then calls the function provided by user as the {@apilink PuppeteerCrawlerOptions.requestHandler} option.
 *
 * New pages are only opened when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the
 * `PuppeteerCrawler` constructor, or, for finer control, by injecting a pre-configured
 * {@apilink ConcurrencySystem|`concurrencySystem`}.
 *
 * Note that the pool of Puppeteer instances is internally managed by the [BrowserPool](https://github.com/apify/browser-pool) class.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new PuppeteerCrawler({
 *     async requestHandler({ page, request }) {
 *         // This function is called to extract data from a single web page
 *         // 'page' is an instance of Puppeteer.Page with page.goto(request.url) already called
 *         // 'request' is an instance of Request class with information about the page to load
 *         await Dataset.pushData({
 *             title: await page.title(),
 *             url: request.url,
 *             succeeded: true,
 *         })
 *     },
 *     async failedRequestHandler({ request }) {
 *         // This function is called when the crawling of a request failed too many times
 *         await Dataset.pushData({
 *             url: request.url,
 *             succeeded: false,
 *             errors: request.errorMessages,
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
export class PuppeteerCrawler extends BrowserCrawler {
    /**
     * @internal
     */
    static optionsShape = {
        ...BrowserCrawler.optionsShape,
        // Deliberately looser than the declared type: Puppeteer's own accepted string values have moved over
        // time (`'new'`/`'old'`, now `'shell'`), and the value is forwarded to it verbatim.
        headless: z.union([z.boolean(), z.string()]).optional(),
    };
    /** @internal */
    static optionsSchema = z.strictObject(PuppeteerCrawler.optionsShape);
    /**
     * All `PuppeteerCrawler` parameters are passed via an options object.
     */
    constructor(options = {}) {
        const parsedOptions = parseArgument(options, PuppeteerCrawler.optionsSchema, 'PuppeteerCrawlerOptions');
        const { launchContext, headless, configuration, proxyConfiguration, contextPipelineBuilder, ...browserCrawlerOptions } = parsedOptions;
        if (launchContext.proxyUrl) {
            throw new Error('PuppeteerCrawlerOptions.launchContext.proxyUrl is not allowed in PuppeteerCrawler.' +
                'Use PuppeteerCrawlerOptions.proxyConfiguration');
        }
        if (options.browserPool) {
            // The raw options, not the parsed ones: `launchContext` has a default, so by now it is always set.
            assertBrowserPoolNotConfigured(new.target.name, {
                launchContext: options.launchContext,
                headless: options.headless,
            });
        }
        super({
            ...browserCrawlerOptions,
            launchContext,
            configuration,
            proxyConfiguration,
            browserPoolBuilder: (remoteBrowser) => remoteBrowser
                ? remotePuppeteerBrowserPool({ ...remoteBrowser, launchContext, headless, configuration })
                : puppeteerBrowserPool({ launchContext, headless, configuration }),
            contextPipelineBuilder: contextPipelineBuilder ?? (() => this.buildContextPipeline()),
        });
    }
    buildContextPipeline() {
        return super.buildContextPipeline().compose({ action: this.enhanceContext.bind(this) });
    }
    async enhanceContext(context) {
        const waitForSelector = async (selector, timeoutMs = 5_000) => {
            await context.page.waitForSelector(selector, { timeout: timeoutMs });
        };
        return {
            injectFile: async (filePath, options) => puppeteerUtils.injectFile(context.page, filePath, options),
            injectJQuery: async () => {
                if (context.request.state === RequestState.BEFORE_NAV) {
                    context.log.warning('Using injectJQuery() in preNavigationHooks leads to unstable results. Use it in a postNavigationHook or a requestHandler instead.');
                    await puppeteerUtils.injectJQuery(context.page);
                    return;
                }
                await puppeteerUtils.injectJQuery(context.page, { surviveNavigations: false });
            },
            waitForSelector,
            parseWithCheerio: async (selector, timeoutMs = 5_000) => {
                if (selector) {
                    await waitForSelector(selector, timeoutMs);
                }
                return puppeteerUtils.parseWithCheerio(context.page, this.ignoreShadowRoots, this.ignoreIframes);
            },
            enqueueLinksByClickingElements: async (options) => puppeteerUtils.enqueueLinksByClickingElements({
                page: context.page,
                requestManager: this.requestManager,
                ...options,
            }),
            blockRequests: async (options) => puppeteerUtils.blockRequests(context.page, options),
            compileScript: (scriptString, ctx) => puppeteerUtils.compileScript(scriptString, ctx),
            addInterceptRequestHandler: async (handler) => puppeteerUtils.addInterceptRequestHandler(context.page, handler),
            removeInterceptRequestHandler: async (handler) => puppeteerUtils.removeInterceptRequestHandler(context.page, handler),
            infiniteScroll: async (options) => puppeteerUtils.infiniteScroll(context.page, options),
            saveSnapshot: async (options) => puppeteerUtils.saveSnapshot(context.page, {
                ...options,
                configuration: serviceLocator.getConfiguration(),
            }),
            closeCookieModals: async () => puppeteerUtils.closeCookieModals(context.page),
        };
    }
    async navigationHandler(crawlingContext, gotoOptions) {
        return gotoExtended(crawlingContext.page, crawlingContext.request, gotoOptions);
    }
}
export function createPuppeteerRouter(routesOrSchemas) {
    return Router.create(routesOrSchemas);
}
