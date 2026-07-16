import type Puppeteer from 'puppeteer';
import type * as PuppeteerTypes from 'puppeteer';

import type { LaunchContext } from '../launch-context.js';
import { RemoteBrowserConnection } from '../remote-browser-connection.js';
import type { RemoteConnection, RemoteConnectionParameters } from '../remote-browser-pool.js';
import type { PuppeteerNewPageOptions } from './puppeteer-controller.js';
import { PuppeteerPlugin } from './puppeteer-plugin.js';

type PuppeteerLaunchContext = LaunchContext<
    typeof Puppeteer,
    PuppeteerTypes.LaunchOptions,
    PuppeteerTypes.Browser,
    PuppeteerNewPageOptions
>;

/**
 * A {@apilink PuppeteerPlugin} that connects to a remote browser service instead of launching locally.
 * Created by {@apilink RemoteBrowserPool} from the user-supplied plugin; all remote-session policy lives
 * in the injected {@apilink RemoteConnection}, this class only supplies the library `connect()` call.
 *
 * @internal
 */
export class RemotePuppeteerPlugin extends PuppeteerPlugin {
    private readonly remoteConnection: RemoteBrowserConnection;

    constructor(plugin: PuppeteerPlugin, connection: RemoteConnection, parameters: RemoteConnectionParameters = {}) {
        super(plugin.library, {
            userDataDir: plugin.userDataDir,
            useIncognitoPages: plugin.useIncognitoPages,
            browserPerProxy: plugin.browserPerProxy,
            ignoreProxyCertificate: plugin.ignoreProxyCertificate,
        });
        this.proxyUrl = plugin.proxyUrl;

        if (!this.useIncognitoPages) {
            this.log.info(
                'Remote Puppeteer connection — pages will share cookies and storage on the remote ' +
                    'browser instance (useIncognitoPages defaults to false).',
            );
        }

        this.remoteConnection = new RemoteBrowserConnection(connection, parameters);
    }

    override createLaunchContext(
        options: Parameters<PuppeteerPlugin['createLaunchContext']>[0] = {},
    ): ReturnType<PuppeteerPlugin['createLaunchContext']> {
        return super.createLaunchContext({ ...options, isRemote: true });
    }

    override async launch(
        launchContext: PuppeteerLaunchContext = this.createLaunchContext(),
    ): Promise<PuppeteerTypes.Browser> {
        this.log.info('Connecting to remote browser (skipping local proxy and webdriver stealth configuration).');
        return this._launch(launchContext);
    }

    protected override async _launch(launchContext: PuppeteerLaunchContext): Promise<PuppeteerTypes.Browser> {
        const browser = await this.remoteConnection.connect(launchContext, async (url) => {
            const connectOptions = this.remoteConnection.parameters.connectOptions ?? {};
            this.log.info('Connecting to remote browser via connect (CDP).');
            return this.library.connect({ ...connectOptions, browserWSEndpoint: url });
        });

        return this._wrapBrowser(browser, launchContext, await this._isOldPuppeteerVersion());
    }
}
