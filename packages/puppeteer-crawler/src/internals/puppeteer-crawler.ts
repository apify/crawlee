import type {
    BrowserRequestHandler,
    BrowserCrawlerOptions,
    BrowserCrawlingContext,
    BrowserHook,
} from '@crawlee/browser';
import { BrowserCrawler, Configuration, Router } from '@crawlee/browser';
import type { BrowserPoolOptions, PuppeteerController, PuppeteerPlugin } from '@crawlee/browser-pool';
import type { Dictionary } from '@crawlee/types';
import ow from 'ow';
import type { HTTPResponse, LaunchOptions, Page } from 'puppeteer';
import type { PuppeteerLaunchContext } from './puppeteer-launcher';
import { PuppeteerLauncher } from './puppeteer-launcher';
import type { DirectNavigationOptions, PuppeteerContextUtils } from './utils/puppeteer_utils';
import { gotoExtended, registerUtilsToContext } from './utils/puppeteer_utils';

export interface PuppeteerCrawlingContext<UserData extends Dictionary = Dictionary> extends
    BrowserCrawlingContext<PuppeteerCrawler, Page, HTTPResponse, PuppeteerController, UserData>, PuppeteerContextUtils {}
export interface PuppeteerHook extends BrowserHook<PuppeteerCrawlingContext, PuppeteerGoToOptions> {}
export interface PuppeteerRequestHandler extends BrowserRequestHandler<PuppeteerCrawlingContext> {}
export type PuppeteerGoToOptions = Parameters<Page['goto']>[1];

export interface PuppeteerCrawlerOptions extends BrowserCrawlerOptions<
    PuppeteerCrawlingContext,
    { browserPlugins: [PuppeteerPlugin] }
> {
    /**
     * Options used by {@apilink launchPuppeteer} to start new Puppeteer instances.
     */
    launchContext?: PuppeteerLaunchContext;

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
    preNavigationHooks?: PuppeteerHook[];

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
    postNavigationHooks?: PuppeteerHook[];
}

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
 * The source URLs are represented using {@apilink Request} objects that are fed from
 * {@apilink RequestList} or {@apilink RequestQueue} instances provided by the {@apilink PuppeteerCrawlerOptions.requestList}
 * or {@apilink PuppeteerCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@apilink PuppeteerCrawlerOptions.requestList} and {@apilink PuppeteerCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@apilink RequestList} and automatically enqueues all of them
 * to {@apilink RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * `PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each {@apilink Request} object to crawl
 * and then calls the function provided by user as the {@apilink PuppeteerCrawlerOptions.requestHandler} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@apilink AutoscaledPool} class.
 * All {@apilink AutoscaledPool} configuration options can be passed to the {@apilink PuppeteerCrawlerOptions.autoscaledPoolOptions}
 * parameter of the `PuppeteerCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@apilink AutoscaledPoolOptions} are available directly in the `PuppeteerCrawler` constructor.
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
export class PuppeteerCrawler extends BrowserCrawler<{ browserPlugins: [PuppeteerPlugin] }, LaunchOptions, PuppeteerCrawlingContext> {
    protected static override optionsShape = {
        ...BrowserCrawler.optionsShape,
        browserPoolOptions: ow.optional.object,
    };

    /**
     * All `PuppeteerCrawler` parameters are passed via an options object.
     */
    constructor(options: PuppeteerCrawlerOptions = {}, override readonly config = Configuration.getGlobalConfig()) {
        ow(options, 'PuppeteerCrawlerOptions', ow.object.exactShape(PuppeteerCrawler.optionsShape));

        const {
            launchContext = {},
            headless,
            proxyConfiguration,
            ...browserCrawlerOptions
        } = options;

        const browserPoolOptions = {
            ...options.browserPoolOptions,
        } as BrowserPoolOptions;

        if (launchContext.proxyUrl) {
            throw new Error('PuppeteerCrawlerOptions.launchContext.proxyUrl is not allowed in PuppeteerCrawler.'
                + 'Use PuppeteerCrawlerOptions.proxyConfiguration');
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

        const puppeteerLauncher = new PuppeteerLauncher(launchContext, config);

        browserPoolOptions.browserPlugins = [
            puppeteerLauncher.createBrowserPlugin(),
        ];

        super({ ...browserCrawlerOptions, launchContext, proxyConfiguration, browserPoolOptions }, config);
    }

    protected override async _runRequestHandler(context: PuppeteerCrawlingContext) {
        registerUtilsToContext(context);
        // eslint-disable-next-line no-underscore-dangle
        await super._runRequestHandler(context);
    }

    protected override async _navigationHandler(crawlingContext: PuppeteerCrawlingContext, gotoOptions: DirectNavigationOptions) {
        return gotoExtended(crawlingContext.page, crawlingContext.request, gotoOptions);
    }
}

/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@apilink PuppeteerCrawler}.
 * Defaults to the {@apilink PuppeteerCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<PuppeteerCrawlingContext>()`.
 *
 * ```ts
 * import { PuppeteerCrawler, createPuppeteerRouter } from 'crawlee';
 *
 * const router = createPuppeteerRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new PuppeteerCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
export function createPuppeteerRouter<Context extends PuppeteerCrawlingContext = PuppeteerCrawlingContext>() {
    return Router.create<Context>();
}
