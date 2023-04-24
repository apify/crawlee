// @ts-ignore optional peer dependency
import type Puppeteer from 'puppeteer';
// @ts-ignore optional peer dependency
import type * as PuppeteerTypes from 'puppeteer';
import type { BrowserController } from '../abstract-classes/browser-controller';
import { BrowserPlugin } from '../abstract-classes/browser-plugin';
import type { LaunchContext } from '../launch-context';
import type { PuppeteerNewPageOptions } from './puppeteer-controller';
export declare class PuppeteerPlugin extends BrowserPlugin<typeof Puppeteer, PuppeteerTypes.PuppeteerLaunchOptions, PuppeteerTypes.Browser, PuppeteerNewPageOptions> {
    protected _launch(launchContext: LaunchContext<typeof Puppeteer, PuppeteerTypes.PuppeteerLaunchOptions, PuppeteerTypes.Browser, PuppeteerNewPageOptions>): Promise<PuppeteerTypes.Browser>;
    protected _createController(): BrowserController<typeof Puppeteer, PuppeteerTypes.PuppeteerLaunchOptions, PuppeteerTypes.Browser, PuppeteerNewPageOptions>;
    protected _addProxyToLaunchOptions(_launchContext: LaunchContext<typeof Puppeteer, PuppeteerTypes.PuppeteerLaunchOptions, PuppeteerTypes.Browser, PuppeteerNewPageOptions>): Promise<void>;
    protected _isChromiumBasedBrowser(_launchContext: LaunchContext<typeof Puppeteer, PuppeteerTypes.PuppeteerLaunchOptions, PuppeteerTypes.Browser, PuppeteerNewPageOptions>): boolean;
}
//# sourceMappingURL=puppeteer-plugin.d.ts.map