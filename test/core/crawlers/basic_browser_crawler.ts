import type { PuppeteerController, PuppeteerPlugin } from '@crawlee/browser-pool';
import type {
    BrowserCrawlerOptions,
    BrowserCrawlingContext,
    PuppeteerCrawlingContext,
    PuppeteerGoToOptions,
} from '@crawlee/puppeteer';
import { BrowserCrawler } from '@crawlee/puppeteer';
// @ts-ignore This only throws when compiled against puppeteer 25+ (ESM only), we only import types, so its alllll gooooood
import type { HTTPResponse, LaunchOptions, Page } from 'puppeteer';

export type TestCrawlingContext = BrowserCrawlingContext<Page, HTTPResponse, PuppeteerController>;

export class BrowserCrawlerTest extends BrowserCrawler<
    Page,
    HTTPResponse,
    PuppeteerController,
    { browserPlugins: [PuppeteerPlugin] },
    LaunchOptions,
    TestCrawlingContext
> {
    constructor(
        options: Partial<BrowserCrawlerOptions<Page, HTTPResponse, PuppeteerController, TestCrawlingContext>> = {},
    ) {
        super({
            ...options,
            contextPipelineBuilder: () => this.buildContextPipeline(),
        });
    }

    protected async _navigationHandler(
        ctx: PuppeteerCrawlingContext,
        gotoOptions: PuppeteerGoToOptions,
    ): Promise<HTTPResponse | null | undefined> {
        return ctx.page.goto(ctx.request.url, gotoOptions);
    }
}
