import type {
    BrowserCrawlerOptions,
    BrowserCrawlingContext,
    BrowserHook,
    BrowserRequestHandler,
    GetUserDataFromRequest,
    LoadedContext,
    RouterRoutes,
} from '@crawlee/browser';
import { BrowserCrawler, Configuration, Router } from '@crawlee/browser';
import type { BrowserPoolOptions, PlaywrightController } from '@crawlee/browser-pool';
import type { Dictionary } from '@crawlee/types';
import log from '@apify/log';
import ow from 'ow';
import type { LaunchOptions, Page, Response } from 'playwright';

import type { LightpandaLaunchContext } from './lightpanda-launcher';
import { LightpandaLauncher } from './lightpanda-launcher';
import type { LightpandaPlugin } from './lightpanda-plugin';

/**
 * The crawling context passed to every `requestHandler` call when using `LightpandaCrawler`.
 * Provides access to the standard Crawlee context properties plus the Playwright `Page` object
 * connected to the Lightpanda browser.
 */
export interface LightpandaCrawlingContext<UserData extends Dictionary = Dictionary>
    extends BrowserCrawlingContext<LightpandaCrawler, Page, Response, PlaywrightController, UserData> {}

export type LightpandaGotoOptions = Dictionary & Parameters<Page['goto']>[1];
export interface LightpandaHook extends BrowserHook<LightpandaCrawlingContext, LightpandaGotoOptions> {}
export interface LightpandaRequestHandler extends BrowserRequestHandler<LoadedContext<LightpandaCrawlingContext>> {}

export interface LightpandaCrawlerOptions
    extends BrowserCrawlerOptions<LightpandaCrawlingContext, { browserPlugins: [LightpandaPlugin] }> {
    /**
     * Options passed to the underlying `LightpandaLauncher`.
     * Use this to configure the Lightpanda server host/port, binary path, auto-start, etc.
     *
     * **Note:** Setting `launchContext.proxyUrl` directly is not supported.
     * Use the `proxyConfiguration` option instead.
     */
    launchContext?: LightpandaLaunchContext;

    /**
     * Function that is called to process each request.
     *
     * The function receives the {@apilink LightpandaCrawlingContext} as an argument, where:
     * - `request` is an instance of the {@apilink Request} object with details about the URL to open.
     * - `page` is an instance of the Playwright [`Page`](https://playwright.dev/docs/api/class-page)
     *   connected to the Lightpanda browser via CDP.
     * - `browserController` is an instance of `PlaywrightController`.
     * - `response` is the Playwright `Response` returned by `page.goto()`, or `null` on failure.
     */
    requestHandler?: LightpandaRequestHandler;

    /**
     * Async functions evaluated sequentially before navigation. Good for setting headers or cookies.
     */
    preNavigationHooks?: LightpandaHook[];

    /**
     * Async functions evaluated sequentially after navigation. Good for checking navigation outcomes.
     */
    postNavigationHooks?: LightpandaHook[];
}

/**
 * `LightpandaCrawler` is a browser crawler that uses [Lightpanda](https://lightpanda.io), a
 * lightweight headless browser designed for agentic AI workflows and high-throughput scraping.
 *
 * Lightpanda is a Zig-based headless browser that exposes a Chrome DevTools Protocol (CDP)
 * endpoint. Crawlee connects to it via Playwright's `chromium.connectOverCDP()`.
 *
 * > **Platform Note:** Lightpanda is currently only supported on **Linux**.
 *
 * > **Concurrency Note:** Lightpanda reuses the same CDP target ID for every page,
 * > so `maxConcurrency` is capped at `1` and `maxRequestRetries` defaults to `0`.
 * > Playwright's `waitForSelector` is not supported — use `page.evaluate()` instead.
 *
 * @example
 * ```ts
 * import { LightpandaCrawler } from '@crawlee/lightpanda';
 *
 * const crawler = new LightpandaCrawler({
 *   async requestHandler({ page, request, enqueueLinks, log }) {
 *     log.info(`Crawling ${request.url}`);
 *     await enqueueLinks();
 *     const title = await page.title();
 *     await this.pushData({ url: request.url, title });
 *   },
 * });
 *
 * await crawler.run(['https://example.com']);
 * ```
 *
 * @example Connecting to a pre-running Lightpanda instance
 * ```ts
 * const crawler = new LightpandaCrawler({
 *   launchContext: {
 *     lightpandaConfig: { host: '127.0.0.1', port: 9222, autoStart: false },
 *   },
 *   async requestHandler({ page, log }) {
 *     log.info(`Title: ${await page.title()}`);
 *   },
 * });
 * ```
 */
export class LightpandaCrawler extends BrowserCrawler<
    { browserPlugins: [LightpandaPlugin] },
    LaunchOptions,
    LightpandaCrawlingContext
> {
    protected static override optionsShape = {
        ...BrowserCrawler.optionsShape,
        browserPoolOptions: ow.optional.object,
        launcher: ow.optional.object,
    };

    /**
     * All `LightpandaCrawler` parameters are passed via an options object.
     */
    constructor(
        options: LightpandaCrawlerOptions = {},
        override readonly config = Configuration.getGlobalConfig(),
    ) {
        ow(options, 'LightpandaCrawlerOptions', ow.object.exactShape(LightpandaCrawler.optionsShape));

        const { launchContext = {}, ...browserCrawlerOptions } = options;

        // Lightpanda reuses the same CDP target ID (FID-0000000001) for every page,
        // causing Playwright "Duplicate target" errors with concurrency > 1.
        if (browserCrawlerOptions.maxConcurrency && browserCrawlerOptions.maxConcurrency > 1) {
            log.warning(
                'LightpandaCrawler: maxConcurrency > 1 is not supported due to Lightpanda CDP target ID reuse. ' +
                    'Forcing maxConcurrency to 1.',
            );
        }
        browserCrawlerOptions.maxConcurrency = 1;
        browserCrawlerOptions.maxRequestRetries ??= 0;

        const browserPoolOptions = {
            ...options.browserPoolOptions,
        } as BrowserPoolOptions;

        if (launchContext.proxyUrl) {
            throw new Error(
                'LightpandaCrawlerOptions.launchContext.proxyUrl is not allowed. ' +
                    'Use LightpandaCrawlerOptions.proxyConfiguration instead.',
            );
        }

        // `browserPlugins` is managed internally and should not be overridden directly.
        if (browserPoolOptions.browserPlugins) {
            throw new Error(
                'browserPoolOptions.browserPlugins is disallowed. Use launchContext.lightpandaConfig instead.',
            );
        }

        const lightpandaLauncher = new LightpandaLauncher(launchContext, config);

        browserPoolOptions.browserPlugins = [lightpandaLauncher.createBrowserPlugin()];

        // Lightpanda does not support fingerprinting (it is a CDP-only connection).
        // Enabling it would corrupt launchOptions before connectOverCDP.
        browserPoolOptions.useFingerprints = false;

        super({ ...browserCrawlerOptions, launchContext, browserPoolOptions }, config);
    }

    /**
     * Navigates to the request URL using the standard Playwright `page.goto()` API.
     */
    protected override async _navigationHandler(
        crawlingContext: LightpandaCrawlingContext,
        gotoOptions: LightpandaGotoOptions,
    ): Promise<Response | null> {
        return crawlingContext.page.goto(crawlingContext.request.url, gotoOptions);
    }
}

/**
 * Creates a new {@apilink Router} instance for use with {@apilink LightpandaCrawler}.
 *
 * > Serves as a shortcut for using `Router.create<LightpandaCrawlingContext>()`.
 *
 * ```ts
 * import { LightpandaCrawler, createLightpandaRouter } from '@crawlee/lightpanda';
 *
 * const router = createLightpandaRouter();
 * router.addHandler('detail', async ({ page, log }) => { ... });
 * router.addDefaultHandler(async ({ enqueueLinks }) => { await enqueueLinks(); });
 *
 * const crawler = new LightpandaCrawler({ requestHandler: router });
 * await crawler.run(['https://example.com']);
 * ```
 */
export function createLightpandaRouter<
    Context extends LightpandaCrawlingContext = LightpandaCrawlingContext,
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, UserData>) {
    return Router.create<Context>(routes);
}
