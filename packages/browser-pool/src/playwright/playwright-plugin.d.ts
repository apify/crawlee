import type { Browser as PlaywrightBrowser, BrowserType } from 'playwright';
import { BrowserPlugin } from '../abstract-classes/browser-plugin.js';
import type { LaunchContext } from '../launch-context.js';
import type { RemoteConnection, RemoteConnectionParameters } from '../remote-browser-pool.js';
import type { SafeParameters } from '../utils.js';
import { PlaywrightController } from './playwright-controller.js';
export declare class PlaywrightPlugin extends BrowserPlugin<BrowserType, SafeParameters<BrowserType['launch']>[0], PlaywrightBrowser> {
    #private;
    /**
     * Playwright remote connections only support incognito pages — `connect()` / `connectOverCDP()` don't
     * accept persistent contexts. Force it on (and inform the user) when wired for a remote connection.
     */
    useRemoteConnection(connection: RemoteConnection, parameters?: RemoteConnectionParameters): void;
    protected _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser>;
    private throwOnFailedLaunch;
    createController(): PlaywrightController;
    protected addProxyToLaunchOptions(launchContext: LaunchContext<BrowserType>): Promise<void>;
    protected isChromiumBasedBrowser(): boolean;
}
