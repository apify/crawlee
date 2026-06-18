import type { PuppeteerPlugin } from '@crawlee/browser-pool';
import type {
    BrowserCrawlerOptions,
    BrowserCrawlingContext,
    PuppeteerCrawlingContext,
    PuppeteerGoToOptions,
} from '@crawlee/puppeteer';
import { BrowserCrawler } from '@crawlee/puppeteer';
import type { Dictionary } from '@crawlee/types';
import type { HTTPResponse, LaunchOptions, Page } from 'puppeteer';

export type TestCrawlingContext = BrowserCrawlingContext<Page, HTTPResponse, Dictionary>;

export class BrowserCrawlerTest extends BrowserCrawler<
    Page,
    HTTPResponse,
    { browserPlugins: [PuppeteerPlugin] },
    LaunchOptions,
    TestCrawlingContext
> {
    constructor(options: Partial<BrowserCrawlerOptions<Page, HTTPResponse, TestCrawlingContext>> = {}) {
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
