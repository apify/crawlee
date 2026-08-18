import { assertBrowserPoolNotConfigured, BrowserCrawler, RequestState, Router, serviceLocator } from '@crawlee/browser';
import { parseArgument, schemas } from '@crawlee/utils/internal';
import { z } from 'zod';
import { playwrightBrowserPool, remotePlaywrightBrowserPool } from './playwright-browser-pool.js';
import { gotoExtended, playwrightUtils } from './utils/playwright-utils.js';
/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chromium, Firefox and Webkit browsers with [Playwright](https://github.com/microsoft/playwright).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `Playwright` uses headless browser to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, consider using {@apilink CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from the
 * {@apilink IRequestManager|request manager} provided via the {@apilink PlaywrightCrawlerOptions.requestManager|`requestManager`}
 * constructor option (a {@apilink RequestQueue} is itself a request manager). To read from a read-only source such
 * as a {@apilink RequestList} while still being able to enqueue new requests, combine it with a queue into a
 * {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`} and pass the
 * result as `requestManager`.
 *
 * > The {@apilink PlaywrightCrawlerOptions.requestList|`requestList`} and {@apilink PlaywrightCrawlerOptions.requestQueue|`requestQueue`}
 * > options are deprecated; they are still accepted and folded into a single `requestManager` for back-compat.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * `PlaywrightCrawler` opens a new Chrome page (i.e. tab) for each {@apilink Request} object to crawl
 * and then calls the function provided by user as the {@apilink PlaywrightCrawlerOptions.requestHandler} option.
 *
 * New pages are only opened when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the
 * `PlaywrightCrawler` constructor, or, for finer control, by injecting a pre-configured
 * {@apilink ConcurrencySystem|`concurrencySystem`}.
 *
 * Note that the pool of Playwright instances is internally managed by the [BrowserPool](https://github.com/apify/browser-pool) class.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new PlaywrightCrawler({
 *     async requestHandler({ page, request }) {
 *         // This function is called to extract data from a single web page
 *         // 'page' is an instance of Playwright.Page with page.goto(request.url) already called
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
export class PlaywrightCrawler extends BrowserCrawler {
    /**
     * @internal
     */
    static optionsShape = {
        ...BrowserCrawler.optionsShape,
        headless: z.boolean().optional(),
        launcher: schemas.anyObject.optional(),
    };
    /** @internal */
    static optionsSchema = z.strictObject(PlaywrightCrawler.optionsShape);
    /**
     * All `PlaywrightCrawler` parameters are passed via an options object.
     */
    constructor(options = {}) {
        const parsedOptions = parseArgument(options, PlaywrightCrawler.optionsSchema, 'PlaywrightCrawlerOptions');
        const { launchContext, headless, configuration, contextPipelineBuilder, ...browserCrawlerOptions } = parsedOptions;
        if (launchContext.proxyUrl) {
            throw new Error('PlaywrightCrawlerOptions.launchContext.proxyUrl is not allowed in PlaywrightCrawler.' +
                'Use PlaywrightCrawlerOptions.proxyConfiguration');
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
            browserPoolBuilder: (remoteBrowser) => remoteBrowser
                ? remotePlaywrightBrowserPool({ ...remoteBrowser, launchContext, headless, configuration })
                : playwrightBrowserPool({ launchContext, headless, configuration }),
            contextPipelineBuilder: contextPipelineBuilder ?? (() => this.buildContextPipeline()),
        });
    }
    buildContextPipeline() {
        return super.buildContextPipeline().compose({ action: this.enhanceContext.bind(this) });
    }
    async navigationHandler(crawlingContext, gotoOptions) {
        return gotoExtended(crawlingContext.page, crawlingContext.request, gotoOptions);
    }
    async enhanceContext(context) {
        const waitForSelector = async (selector, timeoutMs = 5_000) => {
            const locator = context.page.locator(selector).first();
            await locator.waitFor({ timeout: timeoutMs, state: 'attached' });
        };
        const downloads = [];
        context.page.on('download', (download) => downloads.push(download));
        return {
            injectFile: async (filePath, options) => playwrightUtils.injectFile(context.page, filePath, options),
            injectJQuery: async () => {
                if (context.request.state === RequestState.BEFORE_NAV) {
                    context.log.warning('Using injectJQuery() in preNavigationHooks leads to unstable results. Use it in a postNavigationHook or a requestHandler instead.');
                    await playwrightUtils.injectJQuery(context.page);
                    return;
                }
                await playwrightUtils.injectJQuery(context.page, { surviveNavigations: false });
            },
            blockRequests: async (options) => playwrightUtils.blockRequests(context.page, options),
            waitForSelector,
            parseWithCheerio: async (selector, timeoutMs = 5_000) => {
                if (selector) {
                    await waitForSelector(selector, timeoutMs);
                }
                return playwrightUtils.parseWithCheerio(context.page, this.ignoreShadowRoots, this.ignoreIframes);
            },
            infiniteScroll: async (options) => playwrightUtils.infiniteScroll(context.page, options),
            listDownloads: async () => downloads,
            saveSnapshot: async (options) => playwrightUtils.saveSnapshot(context.page, {
                ...options,
                configuration: serviceLocator.getConfiguration(),
            }),
            enqueueLinksByClickingElements: async (options) => playwrightUtils.enqueueLinksByClickingElements({
                ...options,
                page: context.page,
                requestManager: this.requestManager,
            }),
            compileScript: (scriptString, ctx) => playwrightUtils.compileScript(scriptString, ctx),
            closeCookieModals: async () => playwrightUtils.closeCookieModals(context.page),
            handleCloudflareChallenge: async (options) => {
                return playwrightUtils.handleCloudflareChallenge(context.page, context.request.url, options);
            },
        };
    }
}
/**
 * Returns a `postNavigationHooks`-ready hook that runs {@apilink PlaywrightContextUtils.handleCloudflareChallenge}
 * and propagates the post-challenge {@apilink Response} back into the crawling context via its return value.
 *
 * **Example usage**
 * ```ts
 * import { PlaywrightCrawler, handleCloudflareChallengeHook } from 'crawlee';
 *
 * const crawler = new PlaywrightCrawler({
 *     postNavigationHooks: [handleCloudflareChallengeHook()],
 * });
 * ```
 */
export function handleCloudflareChallengeHook(options) {
    return async (context) => {
        const response = await context.handleCloudflareChallenge(options);
        if (response !== undefined) {
            return { response };
        }
        return undefined;
    };
}
export function createPlaywrightRouter(routesOrSchemas) {
    return Router.create(routesOrSchemas);
}
