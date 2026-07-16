import type { PuppeteerPlugin } from '@crawlee/browser-pool';
import type { PuppeteerCrawlerOptions, PuppeteerCrawlingContext, PuppeteerGoToOptions } from '@crawlee/puppeteer';
import { BrowserCrawler } from '@crawlee/puppeteer';
// @ts-expect-error This throws a compilation error due to puppeteer 25+ being ESM only but we only import types, so its alllll gooooood
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
