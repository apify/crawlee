import type { PuppeteerPlugin } from '@crawlee/browser-pool';
import type { PuppeteerCrawlerOptions, PuppeteerCrawlingContext, PuppeteerGoToOptions } from '@crawlee/puppeteer';
import { BrowserCrawler } from '@crawlee/puppeteer';
import type { HTTPResponse, LaunchOptions } from 'puppeteer';

export class BrowserCrawlerTest extends BrowserCrawler<
    { browserPlugins: [PuppeteerPlugin] },
    LaunchOptions,
    PuppeteerCrawlingContext
> {
    constructor(options: Partial<PuppeteerCrawlerOptions> = {}) {
        super(options as any);
    }

    protected async _navigationHandler(
        ctx: PuppeteerCrawlingContext,
        gotoOptions: PuppeteerGoToOptions,
    ): Promise<HTTPResponse | null | undefined> {
        return ctx.page.goto(ctx.request.url, gotoOptions);
    }
}
