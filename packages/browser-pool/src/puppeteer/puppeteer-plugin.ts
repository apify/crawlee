import { readFile } from 'node:fs/promises';

import type { Dictionary } from '@crawlee/types';
import type Puppeteer from 'puppeteer';
import type * as PuppeteerTypes from 'puppeteer';

import {
    BrowserLaunchError,
    BrowserPlugin,
    type BrowserPluginOptions,
    type CreateLaunchContextOptions,
} from '../abstract-classes/browser-plugin.js';
import { anonymizeProxySugar } from '../anonymize-proxy.js';
import type { LaunchContext } from '../launch-context.js';
import { noop } from '../utils.js';
import type { PuppeteerNewPageOptions } from './puppeteer-controller.js';
import { PuppeteerController } from './puppeteer-controller.js';

const PROXY_SERVER_ARG = '--proxy-server=';

/**
 * Options for connecting to a remote browser via Puppeteer.
 * Flat object matching Puppeteer's `ConnectOptions`.
 */
export type PuppeteerConnectOverCDPOptions = Parameters<(typeof Puppeteer)['connect']>[0];

export interface PuppeteerPluginOptions extends BrowserPluginOptions<PuppeteerTypes.LaunchOptions> {
    connectOverCDPOptions?: PuppeteerConnectOverCDPOptions;
}

export class PuppeteerPlugin extends BrowserPlugin<
    typeof Puppeteer,
    PuppeteerTypes.LaunchOptions,
    PuppeteerTypes.Browser,
    PuppeteerNewPageOptions
> {
    connectOverCDPOptions?: PuppeteerConnectOverCDPOptions;

    constructor(library: typeof Puppeteer, options: PuppeteerPluginOptions = {}) {
        const { connectOverCDPOptions, ...baseOptions } = options;

        if (connectOverCDPOptions && !connectOverCDPOptions.browserWSEndpoint && !connectOverCDPOptions.browserURL) {
            throw new Error("connectOverCDPOptions must include either 'browserWSEndpoint' or 'browserURL'.");
        }

        if (baseOptions.remoteBrowser?.type === 'websocket') {
            throw new Error("Puppeteer does not support 'websocket' connection type. Use 'cdp' (default) instead.");
        }

        const remoteBrowserIgnored = !!(baseOptions.remoteBrowser && connectOverCDPOptions);
        if (remoteBrowserIgnored) {
            baseOptions.remoteBrowser = undefined;
        }

        super(library, baseOptions);
        this.connectOverCDPOptions = connectOverCDPOptions;

        if (remoteBrowserIgnored) {
            this.log.warning(
                'Both remoteBrowser and connectOverCDPOptions are set. ' +
                    'remoteBrowser is ignored when explicit connect options are provided.',
            );
        }

        // We check options.useIncognitoPages (not this.useIncognitoPages) because super() collapses undefined to false.
        // This preserves the distinction between "not set" (undefined → default to true) and "explicitly false".
        const isRemoteConnection = this.remoteBrowser || this.connectOverCDPOptions;
        if (isRemoteConnection) {
            if (options.useIncognitoPages === undefined) {
                this.useIncognitoPages = true;
                this.log.info('Remote browser detected — defaulting useIncognitoPages to true for session isolation.');
            } else if (!options.useIncognitoPages) {
                this.log.warning(
                    'useIncognitoPages is set to false with a remote browser connection. ' +
                        'Pages will share cookies and storage on the remote browser instance.',
                );
            }
        }
    }

    override createLaunchContext(
        options: CreateLaunchContextOptions<
            typeof Puppeteer,
            PuppeteerTypes.LaunchOptions,
            PuppeteerTypes.Browser,
            PuppeteerNewPageOptions
        > = {},
    ): LaunchContext<typeof Puppeteer, PuppeteerTypes.LaunchOptions, PuppeteerTypes.Browser, PuppeteerNewPageOptions> {
        return super.createLaunchContext({
            ...options,
            isRemote: options.isRemote ?? !!(this.remoteBrowser || this.connectOverCDPOptions),
        });
    }

    protected async _launch(
        launchContext: LaunchContext<
            typeof Puppeteer,
            PuppeteerTypes.LaunchOptions,
            PuppeteerTypes.Browser,
            PuppeteerNewPageOptions
        >,
    ): Promise<PuppeteerTypes.Browser> {
        let oldPuppeteerVersion = false;

        try {
            const jsonPath = require.resolve('puppeteer/package.json');
            const parsed = JSON.parse(await readFile(jsonPath, 'utf-8'));
            const version = +parsed.version.split('.')[0];
            oldPuppeteerVersion = version < 22;
        } catch {
            // ignore
        }

        const { useIncognitoPages, proxyUrl, ignoreProxyCertificate } = launchContext;

        let browser: PuppeteerTypes.Browser;

        if (this.remoteBrowser) {
            let url: string;
            let context: Record<string, unknown> | undefined;
            try {
                const result = await this._resolveRemoteEndpoint();
                url = result.url;
                context = result.context;
            } catch (cause) {
                throw new BrowserLaunchError(
                    'Failed to resolve remote browser endpoint from remoteBrowser.endpoint() function.\n\u200b',
                    { cause },
                );
            }

            launchContext.extend({ _resolvedRemoteEndpoint: url, _remoteContext: context });

            this.log.info('Connecting to remote browser via connect (CDP).');
            try {
                browser = await this.library.connect({ browserWSEndpoint: url });
            } catch (cause) {
                await this._callRelease(url, context);
                throw new BrowserLaunchError(
                    `Failed to connect to remote browser at "${this._sanitizeEndpointForLog(url)}". ` +
                        'Check that the endpoint is reachable and the browser is accepting CDP connections.\n\u200b',
                    { cause },
                );
            }
        } else if (this.connectOverCDPOptions) {
            // Remote CDP connection — skip local launch/proxy/headless logic
            const endpoint = this.connectOverCDPOptions.browserWSEndpoint || this.connectOverCDPOptions.browserURL!;
            this.log.info('Connecting to remote browser via connect (CDP).');
            try {
                browser = await this.library.connect(this.connectOverCDPOptions);
            } catch (cause) {
                const safeEndpoint = this._sanitizeEndpointForLog(endpoint);
                throw new BrowserLaunchError(
                    `Failed to connect to remote browser via CDP at "${safeEndpoint}". ` +
                        'Check that the endpoint is reachable and the browser is accepting CDP connections.\n\u200b',
                    { cause },
                );
            }
        } else {
            const { launchOptions, userDataDir, experimentalContainers } = launchContext;

            if (experimentalContainers) {
                throw new Error('Experimental containers are only available with Playwright');
            }

            launchOptions!.userDataDir = launchOptions!.userDataDir ?? userDataDir;

            if (launchOptions!.headless === false) {
                if (Array.isArray(launchOptions!.args)) {
                    launchOptions!.args.push('--disable-site-isolation-trials');
                } else {
                    launchOptions!.args = ['--disable-site-isolation-trials'];
                }
            }

            if (launchOptions!.headless === true && oldPuppeteerVersion) {
                launchOptions!.headless = 'new' as any;
            }

            {
                const [anonymizedProxyUrl, close] = await anonymizeProxySugar(proxyUrl, undefined, undefined, {
                    ignoreProxyCertificate: launchContext.ignoreProxyCertificate,
                });

                if (proxyUrl) {
                    const proxyArg = `${PROXY_SERVER_ARG}${anonymizedProxyUrl ?? proxyUrl}`;

                    if (Array.isArray(launchOptions!.args)) {
                        launchOptions!.args.push(proxyArg);
                    } else {
                        launchOptions!.args = [proxyArg];
                    }
                }

                try {
                    browser = await this.library.launch(launchOptions);

                    if (anonymizedProxyUrl) {
                        browser.on('disconnected', async () => {
                            await close();
                        });
                    }
                } catch (error: any) {
                    await close();

                    this._throwAugmentedLaunchError(
                        error,
                        launchContext.launchOptions?.executablePath,
                        '`apify/actor-node-puppeteer-chrome`',
                        "Try installing a browser, if it's missing, by running `npx @puppeteer/browsers install chromium --path [path]` and pointing `executablePath` to the downloaded executable (https://pptr.dev/browsers-api)",
                    );
                }
            }
        }

        const targetCreatedHandler = async (target: PuppeteerTypes.Target) => {
            try {
                const page = await target.page();

                if (page) {
                    page.on('error', (error) => {
                        this.log.exception(error, 'Page crashed.');
                        page.close().catch(noop);
                    });
                }
            } catch (error: any) {
                this.log.exception(error, 'Failed to retrieve page from target.');
            }
        };

        browser.on('targetcreated', targetCreatedHandler);

        // Clean up the listener when a remote browser disconnects to prevent leaks
        if (this.remoteBrowser || this.connectOverCDPOptions) {
            browser.once('disconnected', () => {
                browser.off('targetcreated', targetCreatedHandler);
            });
        }

        const boundMethods = (
            [
                'newPage',
                'close',
                'userAgent',
                'createIncognitoBrowserContext',
                'createBrowserContext',
                'version',
                'on',
                'process',
                'pages',
            ] as const
        ).reduce((map, method) => {
            map[method] = browser[method as 'close']?.bind(browser);
            return map;
        }, {} as Dictionary);
        const method = oldPuppeteerVersion ? 'createIncognitoBrowserContext' : 'createBrowserContext';

        browser = new Proxy(browser, {
            get: (target, property: keyof typeof browser, receiver) => {
                if (property === 'newPage') {
                    return async (...args: Parameters<PuppeteerTypes.BrowserContext['newPage']>) => {
                        let page: PuppeteerTypes.Page;

                        if (useIncognitoPages) {
                            // Skip proxy setup for remote connections — proxy is managed by the remote service.
                            const effectiveProxyUrl =
                                this.remoteBrowser || this.connectOverCDPOptions ? undefined : proxyUrl;
                            const [anonymizedProxyUrl, close] = effectiveProxyUrl
                                ? await anonymizeProxySugar(effectiveProxyUrl, undefined, undefined, {
                                      ignoreProxyCertificate,
                                  })
                                : ([undefined, noop] as const);

                            try {
                                const proxyServer = anonymizedProxyUrl ?? effectiveProxyUrl;
                                const contextOptions = proxyServer ? { proxyServer } : {};
                                const context = (await (browser as any)[method](
                                    contextOptions,
                                )) as PuppeteerTypes.BrowserContext;

                                page = await context.newPage(...args);

                                page.once('close', async () => {
                                    if (anonymizedProxyUrl) {
                                        await close();
                                    }
                                    await context.close().catch(noop);
                                });
                            } catch (error) {
                                await close();

                                throw error;
                            }
                        } else {
                            page = await boundMethods.newPage(...args);
                        }

                        /*
                        // DO NOT USE YET! DOING SO DISABLES CACHE WHICH IS 50% PERFORMANCE HIT!
                        if (useIncognitoPages) {
                            const context = await browser.createIncognitoBrowserContext({
                                proxyServer: proxyUrl,
                            });

                            page = await context.newPage(...args);
                        } else {
                            page = await newPage(...args);
                        }

                        if (proxyCredentials) {
                            await page.authenticate(proxyCredentials as Credentials);
                        }
                        */

                        return page;
                    };
                }

                if (property in boundMethods) {
                    return boundMethods[property];
                }

                return Reflect.get(target, property, receiver);
            },
        });

        return browser;
    }

    override createController(): PuppeteerController {
        return new PuppeteerController(this);
    }

    protected async _addProxyToLaunchOptions(
        _launchContext: LaunchContext<
            typeof Puppeteer,
            PuppeteerTypes.LaunchOptions,
            PuppeteerTypes.Browser,
            PuppeteerNewPageOptions
        >,
    ): Promise<void> {
        /*
        // DO NOT USE YET! DOING SO DISABLES CACHE WHICH IS 50% PERFORMANCE HIT!
        launchContext.launchOptions ??= {};

        const { launchOptions, proxyUrl } = launchContext;

        if (proxyUrl) {
            const url = new URL(proxyUrl);

            if (url.username || url.password) {
                launchContext.proxyCredentials = {
                    username: decodeURIComponent(url.username),
                    password: decodeURIComponent(url.password),
                };
            }

            const proxyArg = `${PROXY_SERVER_ARG}${url.origin}`;

            if (Array.isArray(launchOptions.args)) {
                launchOptions.args.push(proxyArg);
            } else {
                launchOptions.args = [proxyArg];
            }
        }
        */
    }

    protected _isChromiumBasedBrowser(
        _launchContext: LaunchContext<
            typeof Puppeteer,
            PuppeteerTypes.LaunchOptions,
            PuppeteerTypes.Browser,
            PuppeteerNewPageOptions
        >,
    ): boolean {
        return true;
    }
}
