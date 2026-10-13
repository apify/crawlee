import type { Browser as PlaywrightBrowser, BrowserType } from 'playwright';

import type { BrowserPluginOptions, CreateLaunchContextOptions } from '../abstract-classes/browser-plugin.js';
import type { LaunchContext } from '../launch-context.js';
import { connectRemoteBrowser, type RemoteBrowserOptions } from '../remote-browser-plugin.js';
import type { SafeParameters } from '../utils.js';
import { PlaywrightPlugin } from './playwright-plugin.js';

export interface RemotePlaywrightPluginOptions
    extends BrowserPluginOptions<SafeParameters<BrowserType['launch']>[0]>, RemoteBrowserOptions {
    /**
     * Which protocol to connect with. `'cdp'` uses `connectOverCDP()` (the default), `'playwright'` uses
     * `connect()` (Playwright's own WebSocket protocol, for endpoints started with `launchServer()`).
     */
    protocol?: 'cdp' | 'playwright';
}

/**
 * A {@apilink PlaywrightPlugin} that connects to a remote browser service (Browserbase, Browserless, Steel, …)
 * instead of launching locally. `launchOptions` are ignored — the remote service owns the browser.
 *
 * Remote connections only support incognito pages (`connect()` / `connectOverCDP()` don't accept persistent
 * contexts), so `useIncognitoPages` is always `true`.
 */
export class RemotePlaywrightPlugin extends PlaywrightPlugin {
    readonly #remote: RemotePlaywrightPluginOptions;

    constructor(library: BrowserType, options: RemotePlaywrightPluginOptions) {
        super(library, { ...options, useIncognitoPages: true });
        this.#remote = options;

        if (options.useIncognitoPages === false) {
            this.log.info(
                'Remote Playwright connection — useIncognitoPages forced to true. ' +
                    'Pages will not share cookies/storage between each other; use the SessionPool for shared state.',
            );
        }
    }

    override createLaunchContext(options: CreateLaunchContextOptions<BrowserType> = {}): LaunchContext<BrowserType> {
        return super.createLaunchContext({ ...options, isRemote: true });
    }

    /** Skips the local proxy and webdriver-stealth preparation; the remote service owns the browser. */
    override async launch(
        launchContext: LaunchContext<BrowserType> = this.createLaunchContext(),
    ): Promise<PlaywrightBrowser> {
        return this._launch(launchContext);
    }

    protected override async _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser> {
        const { protocol, connectOptions = {} } = this.#remote;

        return connectRemoteBrowser(this.#remote, launchContext.proxyUrl, this.log, async (url) => {
            if (protocol === 'playwright') {
                this.log.info('Connecting to remote browser via connect (Playwright WebSocket).');
                return this.library.connect(url, connectOptions);
            }
            this.log.info('Connecting to remote browser via connectOverCDP.');
            return this.library.connectOverCDP(url, connectOptions);
        });
    }
}
