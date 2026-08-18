import type Puppeteer from 'puppeteer';
import type * as PuppeteerTypes from 'puppeteer';
import { BrowserPlugin } from '../abstract-classes/browser-plugin.js';
import type { LaunchContext } from '../launch-context.js';
import type { RemoteConnection, RemoteConnectionParameters } from '../remote-browser-pool.js';
import type { PuppeteerNewPageOptions } from './puppeteer-controller.js';
import { PuppeteerController } from './puppeteer-controller.js';
export declare class PuppeteerPlugin extends BrowserPlugin<typeof Puppeteer, PuppeteerTypes.LaunchOptions, PuppeteerTypes.Browser, PuppeteerNewPageOptions> {
    /** Pages share cookies/storage on the remote browser (Puppeteer defaults to non-incognito). */
    useRemoteConnection(connection: RemoteConnection, parameters?: RemoteConnectionParameters): void;
    protected _launch(launchContext: LaunchContext<typeof Puppeteer, PuppeteerTypes.LaunchOptions, PuppeteerTypes.Browser, PuppeteerNewPageOptions>): Promise<PuppeteerTypes.Browser>;
    createController(): PuppeteerController;
    protected addProxyToLaunchOptions(_launchContext: LaunchContext<typeof Puppeteer, PuppeteerTypes.LaunchOptions, PuppeteerTypes.Browser, PuppeteerNewPageOptions>): Promise<void>;
    protected isChromiumBasedBrowser(_launchContext: LaunchContext<typeof Puppeteer, PuppeteerTypes.LaunchOptions, PuppeteerTypes.Browser, PuppeteerNewPageOptions>): boolean;
}
