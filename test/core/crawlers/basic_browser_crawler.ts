import type { BrowserPlugin, BrowserPoolHooks, BrowserPoolOptions, PuppeteerPlugin } from '@crawlee/browser-pool';
import { BrowserPool, RemoteBrowserPool } from '@crawlee/browser-pool';
import type {
    BrowserCrawlerOptions,
    BrowserCrawlingContext,
    PuppeteerCrawlingContext,
    PuppeteerGoToOptions,
} from '@crawlee/puppeteer';
import { BrowserCrawler } from '@crawlee/puppeteer';
import type { Dictionary } from '@crawlee/types';
// @ts-ignore This only throws when compiled against puppeteer 25+ (ESM only), we only import types, so its alllll gooooood
import type { HTTPResponse, LaunchOptions, Page } from 'puppeteer';

export type TestCrawlingContext = BrowserCrawlingContext<Page, HTTPResponse, Dictionary>;

type TestBrowserPoolOptions = BrowserPoolOptions<PuppeteerPlugin> &
    BrowserPoolHooks<
        ReturnType<PuppeteerPlugin['createController']>,
        ReturnType<PuppeteerPlugin['createLaunchContext']>,
        Page
    >;

export class BrowserCrawlerTest extends BrowserCrawler<Page, HTTPResponse, LaunchOptions, TestCrawlingContext> {
    constructor(
        options: Partial<BrowserCrawlerOptions<Page, HTTPResponse, TestCrawlingContext>> & {
            /**
             * The concrete crawlers derive their plugin from a `launchContext`; this bare test subclass has no
             * launcher, so tests hand it the pool options - `browserPlugins` included - directly.
             */
            browserPoolOptions?: TestBrowserPoolOptions;
        } = {},
    ) {
        const { browserPoolOptions, ...browserCrawlerOptions } = options;

        super({
            ...browserCrawlerOptions,
            browserPoolBuilder: (remoteBrowser) =>
                remoteBrowser
                    ? new RemoteBrowserPool<Page>({
                          ...remoteBrowser,
                          browserPlugins: browserPoolOptions!.browserPlugins as unknown as BrowserPlugin[],
                      })
                    : new BrowserPool(browserPoolOptions!),
            contextPipelineBuilder: () => this.buildContextPipeline(),
        });
    }

    protected async navigationHandler(
        ctx: PuppeteerCrawlingContext,
        gotoOptions: PuppeteerGoToOptions,
    ): Promise<HTTPResponse | null | undefined> {
        return ctx.page.goto(ctx.request.url, gotoOptions);
    }
}
