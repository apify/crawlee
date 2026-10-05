// @ts-ignore This only throws when compiled against puppeteer 25+ (ESM only), we only import types, so its alllll gooooood
import type Puppeteer from 'puppeteer';
// @ts-ignore This only throws when compiled against puppeteer 25+ (ESM only), we only import types, so its alllll gooooood
import type * as PuppeteerTypes from 'puppeteer';

import type { BrowserPluginOptions, CreateLaunchContextOptions } from '../abstract-classes/browser-plugin.js';
import { connectRemoteBrowser, type RemoteBrowserOptions } from '../remote-browser-plugin.js';
import type { PuppeteerNewPageOptions } from './puppeteer-controller.js';
import { type PuppeteerLaunchContext, PuppeteerPlugin } from './puppeteer-plugin.js';

export interface RemotePuppeteerPluginOptions
    extends BrowserPluginOptions<PuppeteerTypes.LaunchOptions>, RemoteBrowserOptions {}

/**
 * A {@apilink PuppeteerPlugin} that connects to a remote browser service (Browserbase, Browserless, Steel, …)
 * over CDP instead of launching locally. `launchOptions` are ignored — the remote service owns the browser.
 */
export class RemotePuppeteerPlugin extends PuppeteerPlugin {
    readonly #remote: RemotePuppeteerPluginOptions;

    constructor(library: typeof Puppeteer, options: RemotePuppeteerPluginOptions) {
        super(library, options);
        this.#remote = options;

        if (!this.useIncognitoPages) {
            this.log.info(
                'Remote Puppeteer connection — pages will share cookies and storage on the remote ' +
                    'browser instance (useIncognitoPages defaults to false).',
            );
        }
    }

    override createLaunchContext(
        options: CreateLaunchContextOptions<
            typeof Puppeteer,
            PuppeteerTypes.LaunchOptions,
            PuppeteerTypes.Browser,
            PuppeteerNewPageOptions
        > = {},
    ): PuppeteerLaunchContext {
        return super.createLaunchContext({ ...options, isRemote: true });
    }

    /** Skips the local proxy and webdriver-stealth preparation; the remote service owns the browser. */
    override async launch(
        launchContext: PuppeteerLaunchContext = this.createLaunchContext(),
    ): Promise<PuppeteerTypes.Browser> {
        return this._launch(launchContext);
    }

    protected override async _launch(launchContext: PuppeteerLaunchContext): Promise<PuppeteerTypes.Browser> {
        const browser = await connectRemoteBrowser(this.#remote, launchContext.proxyUrl, this.log, async (url) => {
            this.log.info('Connecting to remote browser via connect (CDP).');
            return this.library.connect({ ...this.#remote.connectOptions, browserWSEndpoint: url });
        });

        return this.wrapBrowser(browser, launchContext, await this.isOldPuppeteerVersion());
    }
}
