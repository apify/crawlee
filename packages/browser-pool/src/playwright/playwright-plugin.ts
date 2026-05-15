import fs from 'node:fs';

import type { Browser as PlaywrightBrowser, BrowserType, ConnectOverCDPOptions, ConnectOptions } from 'playwright';

import {
    BrowserLaunchError,
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
    /** The CDP endpoint URL to connect to (required). Overrides the deprecated optional `endpointURL` from Playwright. */
    endpointURL: string;
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

        if (connectOverCDPOptions && !connectOverCDPOptions.endpointURL) {
            throw new Error("'connectOverCDPOptions.endpointURL' must be a non-empty string.");
        }

        if (connectOptions && !connectOptions.wsEndpoint) {
            throw new Error("'connectOptions.wsEndpoint' must be a non-empty string.");
        }

        const remoteBrowserIgnored = !!(baseOptions.remoteBrowser && (connectOverCDPOptions || connectOptions));
        if (remoteBrowserIgnored) {
            baseOptions.remoteBrowser = undefined;
        }

        super(library, baseOptions);
        this.connectOptions = connectOptions;
        this.connectOverCDPOptions = connectOverCDPOptions;

        if (remoteBrowserIgnored) {
            this.log.warning(
                'Both remoteBrowser and connectOverCDPOptions/connectOptions are set. ' +
                    'remoteBrowser is ignored when explicit connect options are provided.',
            );
        }

        const isRemoteConnection = this.remoteBrowser || this.connectOptions || this.connectOverCDPOptions;
        if (isRemoteConnection && options.useIncognitoPages === undefined) {
            const isWebSocket = this.connectOptions || this.remoteBrowser?.type === 'websocket';
            if (isWebSocket) {
                this.useIncognitoPages = true;
                this.log.info(
                    'Remote Playwright WebSocket connection detected — defaulting useIncognitoPages to true.',
                );
            } else {
                this.log.info(
                    'Remote Playwright CDP connection detected — pages will share cookies and storage ' +
                        'via the default browser context (useIncognitoPages defaults to false).',
                );
            }
        }
    }

    override createLaunchContext(options: CreateLaunchContextOptions<BrowserType> = {}): LaunchContext<BrowserType> {
        return super.createLaunchContext({
            ...options,
            isRemote: options.isRemote ?? !!(this.remoteBrowser || this.connectOptions || this.connectOverCDPOptions),
        });
    }

    protected async _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser> {
        if (this.remoteBrowser) {
            const type = this.remoteBrowser.type ?? 'cdp';
            let url: string;
            let context: Record<string, unknown> | undefined;
            try {
                const result = await this._resolveRemoteEndpoint({ proxyUrl: launchContext.proxyUrl });
                url = result.url;
                context = result.context;
            } catch (cause) {
                throw new BrowserLaunchError(
                    'Failed to resolve remote browser endpoint from remoteBrowser.endpoint() function.\n\u200b',
                    { cause },
                );
            }

            launchContext.extend({ _resolvedRemoteEndpoint: url, _remoteContext: context });

            try {
                if (type === 'websocket') {
                    this.log.info('Connecting to remote browser via connect (Playwright WebSocket).');
                    return await this.library.connect(url, {});
                }
                this.log.info('Connecting to remote browser via connectOverCDP.');
                const browser = await this.library.connectOverCDP(url, {});
                return this._maybeWrapWithSharedContext(browser, launchContext);
            } catch (cause) {
                await this._callRelease(url, context);
                throw new BrowserLaunchError(
                    `Failed to connect to remote browser at "${this._sanitizeEndpointForLog(url)}". ` +
                        `Connection type: ${type}. Check that the endpoint is reachable.\n\u200b`,
                    { cause },
                );
            }
        }

        // Remote CDP connection — skip all local launch/proxy logic
        if (this.connectOverCDPOptions) {
            const { endpointURL, ...options } = this.connectOverCDPOptions;
            this.log.info('Connecting to remote browser via connectOverCDP.');
            try {
                const browser = await this.library.connectOverCDP(endpointURL, options);
                return this._maybeWrapWithSharedContext(browser, launchContext);
            } catch (cause) {
                throw new BrowserLaunchError(
                    `Failed to connect to remote browser via CDP at "${this._sanitizeEndpointForLog(endpointURL)}". ` +
                        'Check that the endpoint is reachable and the browser is accepting CDP connections.\n\u200b',
                    { cause },
                );
            }
        }

        // Remote Playwright WebSocket connection — skip all local launch/proxy logic
        if (this.connectOptions) {
            const { wsEndpoint, ...options } = this.connectOptions;
            this.log.info('Connecting to remote browser via connect (Playwright WebSocket).');
            try {
                return await this.library.connect(wsEndpoint, options);
            } catch (cause) {
                throw new BrowserLaunchError(
                    `Failed to connect to remote browser via WebSocket at "${this._sanitizeEndpointForLog(wsEndpoint)}". ` +
                        'Check that the endpoint is reachable and the Playwright server is running.\n\u200b',
                    { cause },
                );
            }
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

    /**
     * When useIncognitoPages is false and we have a CDP-connected browser,
     * wrap its default context in PlaywrightBrowser so that all pages share
     * a single context (matching local persistent-context behavior).
     *
     * Playwright's browser.newPage() always creates a new context, so without
     * this wrapper, pages would never share cookies even with useIncognitoPages: false.
     */
    private _maybeWrapWithSharedContext(
        browser: PlaywrightBrowser,
        launchContext: LaunchContext<BrowserType>,
    ): PlaywrightBrowser {
        if (launchContext.useIncognitoPages) {
            return browser;
        }

        const contexts = browser.contexts();
        const defaultContext = contexts[0];

        if (!defaultContext) {
            this.log.warning(
                'Remote CDP browser has no default context — cannot share cookies between pages. ' +
                    'Falling back to standard behavior (new context per page).',
            );
            return browser;
        }

        this.log.info('Wrapping remote CDP browser default context for cookie sharing between pages.');

        return new PlaywrightBrowserWithPersistentContext({
            browserContext: defaultContext,
            version: browser.version(),
            parentBrowser: browser,
        }) as unknown as PlaywrightBrowser;
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
