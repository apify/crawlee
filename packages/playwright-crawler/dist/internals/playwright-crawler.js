"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlaywrightRouter = exports.PlaywrightCrawler = void 0;
const tslib_1 = require("tslib");
const ow_1 = tslib_1.__importDefault(require("ow"));
const browser_1 = require("@crawlee/browser");
const playwright_launcher_1 = require("./playwright-launcher");
const playwright_utils_1 = require("./utils/playwright-utils");
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
 * The source URLs are represented using {@apilink Request} objects that are fed from
 * {@apilink RequestList} or {@apilink RequestQueue} instances provided by the {@apilink PlaywrightCrawlerOptions.requestList}
 * or {@apilink PlaywrightCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@apilink PlaywrightCrawlerOptions.requestList} and {@apilink PlaywrightCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@apilink RequestList} and automatically enqueues all of them
 * to {@apilink RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * `PlaywrightCrawler` opens a new Chrome page (i.e. tab) for each {@apilink Request} object to crawl
 * and then calls the function provided by user as the {@apilink PlaywrightCrawlerOptions.requestHandler} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@apilink AutoscaledPool} class.
 * All {@apilink AutoscaledPool} configuration options can be passed to the {@apilink PlaywrightCrawlerOptions.autoscaledPoolOptions}
 * parameter of the `PlaywrightCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@apilink AutoscaledPoolOptions} are available directly in the `PlaywrightCrawler` constructor.
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
class PlaywrightCrawler extends browser_1.BrowserCrawler {
    /**
     * All `PlaywrightCrawler` parameters are passed via an options object.
     */
    constructor(options = {}, config = browser_1.Configuration.getGlobalConfig()) {
        (0, ow_1.default)(options, 'PlaywrightCrawlerOptions', ow_1.default.object.exactShape(PlaywrightCrawler.optionsShape));
        const { launchContext = {}, headless, ...browserCrawlerOptions } = options;
        const browserPoolOptions = {
            ...options.browserPoolOptions,
        };
        if (launchContext.proxyUrl) {
            throw new Error('PlaywrightCrawlerOptions.launchContext.proxyUrl is not allowed in PlaywrightCrawler.'
                + 'Use PlaywrightCrawlerOptions.proxyConfiguration');
        }
        // `browserPlugins` is working when it's not overriden by `launchContext`,
        // which for crawlers it is always overriden. Hence the error to use the other option.
        if (browserPoolOptions.browserPlugins) {
            throw new Error('browserPoolOptions.browserPlugins is disallowed. Use launchContext.launcher instead.');
        }
        if (headless != null) {
            launchContext.launchOptions ?? (launchContext.launchOptions = {});
            launchContext.launchOptions.headless = headless;
        }
        const playwrightLauncher = new playwright_launcher_1.PlaywrightLauncher(launchContext, config);
        browserPoolOptions.browserPlugins = [
            playwrightLauncher.createBrowserPlugin(),
        ];
        super({ ...browserCrawlerOptions, launchContext, browserPoolOptions }, config);
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
    }
    async _runRequestHandler(context) {
        (0, playwright_utils_1.registerUtilsToContext)(context);
        // eslint-disable-next-line no-underscore-dangle
        await super._runRequestHandler(context);
    }
    async _navigationHandler(crawlingContext, gotoOptions) {
        return (0, playwright_utils_1.gotoExtended)(crawlingContext.page, crawlingContext.request, gotoOptions);
    }
}
Object.defineProperty(PlaywrightCrawler, "optionsShape", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        ...browser_1.BrowserCrawler.optionsShape,
        browserPoolOptions: ow_1.default.optional.object,
        launcher: ow_1.default.optional.object,
    }
});
exports.PlaywrightCrawler = PlaywrightCrawler;
/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@apilink PlaywrightCrawler}.
 * Defaults to the {@apilink PlaywrightCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<PlaywrightCrawlingContext>()`.
 *
 * ```ts
 * import { PlaywrightCrawler, createPlaywrightRouter } from 'crawlee';
 *
 * const router = createPlaywrightRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new PlaywrightCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
function createPlaywrightRouter(routes) {
    return browser_1.Router.create(routes);
}
exports.createPlaywrightRouter = createPlaywrightRouter;
//# sourceMappingURL=playwright-crawler.js.map