import fs from 'node:fs';

import type { Browser as PlaywrightBrowser, BrowserType, ConnectOverCDPOptions, ConnectOptions } from 'playwright';

import {
    BrowserPlugin,
    type BrowserPluginOptions,
    type CreateLaunchContextOptions,
} from '../abstract-classes/browser-plugin.js';
import { anonymizeProxySugar } from '../anonymize-proxy.js';
import type { createProxyServerForContainers } from '../container-proxy-server.js';
import type { LaunchContext } from '../launch-context.js';
import { getLocalProxyAddress } from '../proxy-server.js';
import type { SafeParameters } from '../utils.js';
import { PlaywrightBrowser as PlaywrightBrowserWithPersistentContext } from './playwright-browser.js';
import { PlaywrightController } from './playwright-controller.js';

/**
 * Options for connecting to a remote browser via CDP.
 * Mirrors `browserType.connectOverCDP(endpointURL, options?)`.
 */
export interface PlaywrightConnectOverCDPOptions extends ConnectOverCDPOptions {
    /** The CDP endpoint URL to connect to (required). */
    wsEndpoint: string;
}

/**
 * Options for connecting to a remote browser via WebSocket.
 * Mirrors `browserType.connect(wsEndpoint, options?)`.
 */
export interface PlaywrightConnectOptions extends ConnectOptions {
    /** The WebSocket endpoint URL to connect to (required). */
    wsEndpoint: string;
}

export interface PlaywrightPluginOptions extends BrowserPluginOptions<SafeParameters<BrowserType['launch']>[0]> {
    connectOptions?: PlaywrightConnectOptions;
    connectOverCDPOptions?: PlaywrightConnectOverCDPOptions;
}

export class PlaywrightPlugin extends BrowserPlugin<
    BrowserType,
    SafeParameters<BrowserType['launch']>[0],
    PlaywrightBrowser
> {
    private _browserVersion?: string;
    _containerProxyServer?: Awaited<ReturnType<typeof createProxyServerForContainers>>;

    connectOptions?: PlaywrightConnectOptions;
    connectOverCDPOptions?: PlaywrightConnectOverCDPOptions;

    constructor(library: BrowserType, options: PlaywrightPluginOptions = {}) {
        const { connectOptions, connectOverCDPOptions, ...baseOptions } = options;

        if (connectOptions && connectOverCDPOptions) {
            throw new Error("Cannot set both 'connectOptions' and 'connectOverCDPOptions' — pick one protocol.");
        }

        super(library, baseOptions);
        this.connectOptions = connectOptions;
        this.connectOverCDPOptions = connectOverCDPOptions;

        if (this.connectOptions || this.connectOverCDPOptions) {
            if (options.useIncognitoPages === undefined) {
                this.useIncognitoPages = true;
                this.log.info('Remote browser detected — defaulting useIncognitoPages to true for session isolation.');
            } else if (options.useIncognitoPages === false) {
                this.log.warning(
                    'useIncognitoPages is set to false with a remote browser connection. ' +
                        'Pages will share cookies and storage on the remote browser instance.',
                );
            }
        }
    }

    override createLaunchContext(options: CreateLaunchContextOptions<BrowserType> = {}): LaunchContext<BrowserType> {
        return super.createLaunchContext({
            ...options,
            isRemote: options.isRemote ?? !!(this.connectOptions || this.connectOverCDPOptions),
        });
    }

    protected async _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser> {
        // Remote CDP connection — skip all local launch/proxy logic
        if (this.connectOverCDPOptions) {
            this.log.info('Connecting to remote browser via connectOverCDP.');
            const { wsEndpoint, ...options } = this.connectOverCDPOptions;
            return this.library.connectOverCDP(wsEndpoint, options);
        }

        // Remote Playwright WebSocket connection — skip all local launch/proxy logic
        if (this.connectOptions) {
            this.log.info('Connecting to remote browser via connect (Playwright WebSocket).');
            const { wsEndpoint, ...options } = this.connectOptions;
            return this.library.connect(wsEndpoint, options);
        }

        const { launchOptions, useIncognitoPages, userDataDir, proxyUrl } = launchContext;
        let browser: PlaywrightBrowser;

        // Required for the `proxy` context option to work.
        launchOptions!.proxy = {
            server: await getLocalProxyAddress(),
            ...launchOptions!.proxy,
        };

        // WebKit does not support --no-sandbox
        if (this.library.name() === 'webkit') {
            launchOptions!.args = launchOptions!.args?.filter((arg) => arg !== '--no-sandbox');
        }

        const [anonymizedProxyUrl, close] = await anonymizeProxySugar(proxyUrl, undefined, undefined, {
            ignoreProxyCertificate: launchContext.ignoreProxyCertificate,
        });
        if (anonymizedProxyUrl) {
            launchOptions!.proxy = {
                server: anonymizedProxyUrl,
                bypass: launchOptions!.proxy.bypass,
            };
        }

        try {
            if (useIncognitoPages) {
                browser = await this.library.launch(launchOptions).catch((error) => {
                    return this._throwOnFailedLaunch(launchContext, error);
                });

                if (anonymizedProxyUrl) {
                    browser.on('disconnected', async () => {
                        await close();
                    });
                }
            } else {
                const browserContext = await this.library
                    .launchPersistentContext(userDataDir, launchOptions)
                    .catch((error) => {
                        return this._throwOnFailedLaunch(launchContext, error);
                    });

                browserContext.once('close', () => {
                    if (userDataDir.includes('apify-playwright-firefox-taac-')) {
                        fs.rmSync(userDataDir, {
                            recursive: true,
                            force: true,
                        });
                    }
                });

                if (anonymizedProxyUrl) {
                    browserContext.on('close', async () => {
                        await close();
                    });
                }

                if (!this._browserVersion) {
                    // Launches unused browser just to get the browser version.
                    const inactiveBrowser = await this.library.launch(launchOptions);
                    this._browserVersion = inactiveBrowser.version();

                    inactiveBrowser.close().catch((error) => {
                        this.log.exception(error, 'Failed to close browser.');
                    });
                }

                browser = new PlaywrightBrowserWithPersistentContext({
                    browserContext,
                    version: this._browserVersion,
                }) as unknown as PlaywrightBrowser;
            }
        } catch (error) {
            await close();

            throw error;
        }

        return browser;
    }

    private _throwOnFailedLaunch(launchContext: LaunchContext<BrowserType>, cause: unknown): never {
        this._throwAugmentedLaunchError(
            cause,
            launchContext.launchOptions?.executablePath,
            '`apify/actor-node-playwright-*` (with a correct browser name)',
            'Try installing the required dependencies by running `npx playwright install --with-deps` (https://playwright.dev/docs/browsers).',
        );
    }

    override createController(): PlaywrightController {
        return new PlaywrightController(this as any);
    }

    protected async _addProxyToLaunchOptions(launchContext: LaunchContext<BrowserType>): Promise<void> {
        launchContext.launchOptions ??= {};

        const { launchOptions, proxyUrl } = launchContext;

        if (proxyUrl) {
            const url = new URL(proxyUrl);

            launchOptions.proxy = {
                server: url.origin,
                username: decodeURIComponent(url.username),
                password: decodeURIComponent(url.password),
            };
        }
    }

    protected _isChromiumBasedBrowser(): boolean {
        const name = this.library.name();
        return name === 'chromium';
    }
}
