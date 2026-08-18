import type { Cookie } from '@crawlee/types';
import type Puppeteer from 'puppeteer';
import type * as PuppeteerTypes from 'puppeteer';
import { BrowserController } from '../abstract-classes/browser-controller.js';
export interface PuppeteerNewPageOptions extends PuppeteerTypes.BrowserContextOptions {
    proxyUsername?: string;
    proxyPassword?: string;
}
export declare class PuppeteerController extends BrowserController<typeof Puppeteer, PuppeteerTypes.LaunchOptions, PuppeteerTypes.Browser, PuppeteerNewPageOptions> {
    normalizeProxyOptions(proxyUrl: string | undefined, pageOptions: any): Record<string, unknown>;
    protected _newPage(contextOptions?: PuppeteerNewPageOptions): Promise<PuppeteerTypes.Page>;
    protected _close(): Promise<void>;
    protected _kill(): Promise<void>;
    protected _getCookies(page: PuppeteerTypes.Page): Promise<Cookie[]>;
    protected _setCookies(page: PuppeteerTypes.Page, cookies: Cookie[]): Promise<void>;
}
