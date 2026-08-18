import type { BrowserPoolHooks, BrowserPoolOptions, PuppeteerPlugin } from '@crawlee/browser-pool';
import type { BrowserCrawlerOptions, BrowserCrawlingContext, PuppeteerCrawlingContext, PuppeteerGoToOptions } from '@crawlee/puppeteer';
import { BrowserCrawler } from '@crawlee/puppeteer';
import type { Dictionary } from '@crawlee/types';
import type { HTTPResponse, LaunchOptions, Page } from 'puppeteer';
export type TestCrawlingContext = BrowserCrawlingContext<Page, HTTPResponse, Dictionary>;
type TestBrowserPoolOptions = BrowserPoolOptions<PuppeteerPlugin> & BrowserPoolHooks<ReturnType<PuppeteerPlugin['createController']>, ReturnType<PuppeteerPlugin['createLaunchContext']>, Page>;
export declare class BrowserCrawlerTest extends BrowserCrawler<Page, HTTPResponse, LaunchOptions, TestCrawlingContext> {
    constructor(options?: Partial<BrowserCrawlerOptions<Page, HTTPResponse, TestCrawlingContext>> & {
        /**
         * The concrete crawlers derive their plugin from a `launchContext`; this bare test subclass has no
         * launcher, so tests hand it the pool options - `browserPlugins` included - directly.
         */
        browserPoolOptions?: TestBrowserPoolOptions;
    });
    protected navigationHandler(ctx: PuppeteerCrawlingContext, gotoOptions: PuppeteerGoToOptions): Promise<HTTPResponse | null | undefined>;
}
export {};
