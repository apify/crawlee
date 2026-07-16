import type { Browser as PlaywrightBrowser, BrowserType } from 'playwright';

import type { LaunchContext } from '../launch-context.js';
import { RemoteBrowserConnection } from '../remote-browser-connection.js';
import type { RemoteConnection, RemoteConnectionParameters } from '../remote-browser-pool.js';
import { PlaywrightPlugin } from './playwright-plugin.js';

/**
 * A {@apilink PlaywrightPlugin} that connects to a remote browser service instead of launching locally.
 * Created by {@apilink RemoteBrowserPool} from the user-supplied plugin; all remote-session policy lives
 * in the injected {@apilink RemoteConnection}, this class only supplies the library `connect()` call.
 *
 * @internal
 */
export class RemotePlaywrightPlugin extends PlaywrightPlugin {
    private readonly remoteConnection: RemoteBrowserConnection;

    constructor(plugin: PlaywrightPlugin, connection: RemoteConnection, parameters: RemoteConnectionParameters = {}) {
        super(plugin.library, {
            userDataDir: plugin.userDataDir,
            browserPerProxy: plugin.browserPerProxy,
            ignoreProxyCertificate: plugin.ignoreProxyCertificate,
            // Playwright remote connections only support incognito pages — `connect()` / `connectOverCDP()`
            // don't accept persistent contexts.
            useIncognitoPages: true,
        });
        this.proxyUrl = plugin.proxyUrl;

        if (!plugin.useIncognitoPages) {
            this.log.info(
                'Remote Playwright connection — useIncognitoPages forced to true. ' +
                    'Pages will not share cookies/storage between each other; use the SessionPool for shared state.',
            );
        }

        this.remoteConnection = new RemoteBrowserConnection(connection, parameters);
    }

    override createLaunchContext(
        options: Parameters<PlaywrightPlugin['createLaunchContext']>[0] = {},
    ): ReturnType<PlaywrightPlugin['createLaunchContext']> {
        return super.createLaunchContext({ ...options, isRemote: true });
    }

    override async launch(
        launchContext: LaunchContext<BrowserType> = this.createLaunchContext(),
    ): Promise<PlaywrightBrowser> {
        this.log.info('Connecting to remote browser (skipping local proxy and webdriver stealth configuration).');
        return this._launch(launchContext);
    }

    protected override async _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser> {
        return this.remoteConnection.connect(launchContext, async (url) => {
            const connectOptions = (this.remoteConnection.parameters.connectOptions ?? {}) as any;
            if (this.remoteConnection.parameters.protocol === 'playwright') {
                this.log.info('Connecting to remote browser via connect (Playwright WebSocket).');
                return this.library.connect(url, connectOptions);
            }
            this.log.info('Connecting to remote browser via connectOverCDP.');
            return this.library.connectOverCDP(url, connectOptions);
        });
    }
}
