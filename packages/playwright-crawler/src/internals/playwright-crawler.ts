import ow from 'ow';
import type { LaunchOptions, Page, Response } from 'playwright';
import type { BrowserPoolOptions, PlaywrightController, PlaywrightPlugin } from '@crawlee/browser-pool';
import type { BrowserCrawlerOptions, BrowserCrawlingContext, BrowserRequestHandler, BrowserHook } from '@crawlee/browser';
import { BrowserCrawler, Configuration, Router } from '@crawlee/browser';
import type { Dictionary } from '@crawlee/types';
import type { PlaywrightLaunchContext } from './playwright-launcher';
import { PlaywrightLauncher } from './playwright-launcher';
import type { DirectNavigationOptions, PlaywrightContextUtils } from './utils/playwright-utils';
import { gotoExtended, registerUtilsToContext } from './utils/playwright-utils';

export interface PlaywrightCrawlingContext<UserData extends Dictionary = Dictionary> extends
    BrowserCrawlingContext<PlaywrightCrawler, Page, Response, PlaywrightController, UserData>, PlaywrightContextUtils {}
export interface PlaywrightHook extends BrowserHook<PlaywrightCrawlingContext, PlaywrightGotoOptions> {}
export interface PlaywrightRequestHandler extends BrowserRequestHandler<PlaywrightCrawlingContext> {}
export type PlaywrightGotoOptions = Parameters<Page['goto']>[1];

export interface PlaywrightCrawlerOptions extends BrowserCrawlerOptions<
    PlaywrightCrawlingContext,
    { browserPlugins: [PlaywrightPlugin] }
> {
    /**
     * The same options as used by {@apilink launchPlaywright}.
     */
    launchContext?: PlaywrightLaunchContext;

    /**
     * Function that is called to process each request.
     *
     * The function receives the {@apilink PlaywrightCrawlingContext} as an argument, where:
     * - `request` is an instance of the {@apilink Request} object with details about the URL to open, HTTP method etc.
     * - `page` is an instance of the `Playwright`
     * [`Page`](https://playwright.dev/docs/api/class-page)
     * - `browserController` is an instance of the
     * [`BrowserController`](https://github.com/apify/browser-pool#browsercontroller),
     * - `response` is an instance of the `Playwright`
     * [`Response`](https://playwright.dev/docs/api/class-response),
     * which is the main resource response as returned by `page.goto(request.url)`.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     * If all the retries fail, the crawler calls the function
     * provided to the `failedRequestHandler` parameter.
     * To make this work, you should **always**
     * let your function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@apilink Request.pushErrorMessage} function.
     */
    requestHandler?: PlaywrightRequestHandler;

    /**
     * Function that is called to process each request.
     *
     * The function receives the {@apilink PlaywrightCrawlingContext} as an argument, where:
     * - `request` is an instance of the {@apilink Request} object with details about the URL to open, HTTP method etc.
     * - `page` is an instance of the `Playwright`
     * [`Page`](https://playwright.dev/docs/api/class-page)
     * - `browserController` is an instance of the
     * [`BrowserController`](https://github.com/apify/browser-pool#browsercontroller),
     * - `response` is an instance of the `Playwright`
     * [`Response`](https://playwright.dev/docs/api/class-response),
     * which is the main resource response as returned by `page.goto(request.url)`.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     * If all the retries fail, the crawler calls the function
     * provided to the `failedRequestHandler` parameter.
     * To make this work, you should **always**
     * let your function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@apilink Request.pushErrorMessage} function.
     *
     * @deprecated `handlePageFunction` has been renamed to `requestHandler` and will be removed in a future version.
     * @ignore
     */
    handlePageFunction?: PlaywrightRequestHandler;

    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function accepts two parameters, `crawlingContext` and `gotoOptions`,
     * which are passed to the `page.goto()` function the crawler calls to navigate.
     * Example:
     * ```
     * preNavigationHooks: [
     *     async (crawlingContext, gotoOptions) => {
     *         const { page } = crawlingContext;
     *         await page.evaluate((attr) => { window.foo = attr; }, 'bar');
     *     },
     * ]
     * ```
     *
     * Modyfing `pageOptions` is supported only in Playwright incognito.
     * See {@apilink PrePageCreateHook}
     */
    preNavigationHooks?: PlaywrightHook[];

    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts `crawlingContext` as the only parameter.
     * Example:
     * ```
     * postNavigationHooks: [
     *     async (crawlingContext) => {
     *         const { page } = crawlingContext;
     *         if (hasCaptcha(page)) {
     *             await solveCaptcha (page);
     *         }
     *     },
     * ]
     * ```
     */
    postNavigationHooks?: PlaywrightHook[];
}

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
export class PlaywrightCrawler extends BrowserCrawler<{ browserPlugins: [PlaywrightPlugin] }, LaunchOptions, PlaywrightCrawlingContext> {
    protected static override optionsShape = {
        ...BrowserCrawler.optionsShape,
        browserPoolOptions: ow.optional.object,
        launcher: ow.optional.object,
    };

    /**
     * All `PlaywrightCrawler` parameters are passed via an options object.
     */
    constructor(options: PlaywrightCrawlerOptions = {}, override readonly config = Configuration.getGlobalConfig()) {
        ow(options, 'PlaywrightCrawlerOptions', ow.object.exactShape(PlaywrightCrawler.optionsShape));

        const {
            launchContext = {},
            headless,
            ...browserCrawlerOptions
        } = options;

        const browserPoolOptions = {
            ...options.browserPoolOptions,
        } as BrowserPoolOptions;

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
            launchContext.launchOptions ??= {} as LaunchOptions;
            launchContext.launchOptions.headless = headless;
        }

        const playwrightLauncher = new PlaywrightLauncher(launchContext, config);

        browserPoolOptions.browserPlugins = [
            playwrightLauncher.createBrowserPlugin(),
        ];

        super({ ...browserCrawlerOptions, launchContext, browserPoolOptions }, config);
    }

    protected override async _runRequestHandler(context: PlaywrightCrawlingContext) {
        registerUtilsToContext(context);
        // eslint-disable-next-line no-underscore-dangle
        await super._runRequestHandler(context);
    }

    protected override async _navigationHandler(crawlingContext: PlaywrightCrawlingContext, gotoOptions: DirectNavigationOptions) {
        return gotoExtended(crawlingContext.page, crawlingContext.request, gotoOptions);
    }
}

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
export function createPlaywrightRouter<Context extends PlaywrightCrawlingContext = PlaywrightCrawlingContext>() {
    return Router.create<Context>();
}
