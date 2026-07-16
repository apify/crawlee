import { readFile } from 'node:fs/promises';

import type { Dictionary } from '@crawlee/types';
import type Puppeteer from 'puppeteer';
import type * as PuppeteerTypes from 'puppeteer';

import { BrowserPlugin } from '../abstract-classes/browser-plugin.js';
import { anonymizeProxySugar } from '../anonymize-proxy.js';
import type { LaunchContext } from '../launch-context.js';
import { noop } from '../utils.js';
import type { PuppeteerNewPageOptions } from './puppeteer-controller.js';
import { PuppeteerController } from './puppeteer-controller.js';

const PROXY_SERVER_ARG = '--proxy-server=';

export class PuppeteerPlugin extends BrowserPlugin<
    typeof Puppeteer,
    PuppeteerTypes.LaunchOptions,
    PuppeteerTypes.Browser,
    PuppeteerNewPageOptions
> {
    protected async _launch(
        launchContext: LaunchContext<
            typeof Puppeteer,
            PuppeteerTypes.LaunchOptions,
            PuppeteerTypes.Browser,
            PuppeteerNewPageOptions
        >,
    ): Promise<PuppeteerTypes.Browser> {
        const oldPuppeteerVersion = await this._isOldPuppeteerVersion();

        const { proxyUrl, launchOptions, userDataDir, experimentalContainers } = launchContext;

        let browser: PuppeteerTypes.Browser;

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

        return this._wrapBrowser(browser, launchContext, oldPuppeteerVersion);
    }

    /** Whether the installed puppeteer is older than v22 (different headless and incognito-context APIs). */
    protected async _isOldPuppeteerVersion(): Promise<boolean> {
        try {
            const jsonPath = require.resolve('puppeteer/package.json');
            const parsed = JSON.parse(await readFile(jsonPath, 'utf-8'));
            const version = +parsed.version.split('.')[0];
            return version < 22;
        } catch {
            return false;
        }
    }

    /**
     * Attaches page-crash handling and wraps `newPage` so incognito pages get their own context (with a
     * per-context proxy locally). Shared by the local launch path and {@apilink RemotePuppeteerPlugin}.
     */
    protected _wrapBrowser(
        browser: PuppeteerTypes.Browser,
        launchContext: LaunchContext<
            typeof Puppeteer,
            PuppeteerTypes.LaunchOptions,
            PuppeteerTypes.Browser,
            PuppeteerNewPageOptions
        >,
        oldPuppeteerVersion: boolean,
    ): PuppeteerTypes.Browser {
        const { useIncognitoPages, proxyUrl, ignoreProxyCertificate, isRemote } = launchContext;

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
        if (isRemote) {
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
                            const effectiveProxyUrl = isRemote ? undefined : proxyUrl;
                            const [anonymizedProxyUrl, close] = effectiveProxyUrl
                                ? await anonymizeProxySugar(effectiveProxyUrl, undefined, undefined, {
                                      ignoreProxyCertificate,
                                  })
                                : ([undefined, noop] as const);

                            const proxyServer = anonymizedProxyUrl ?? effectiveProxyUrl;
                            const contextOptions = proxyServer ? { proxyServer } : {};
                            const context = (await (browser as any)[method](
                                contextOptions,
                            )) as PuppeteerTypes.BrowserContext;

                            try {
                                page = await context.newPage(...args);
                            } catch (error) {
                                await context.close().catch(noop);
                                await close();

                                throw error;
                            }

                            page.once('close', async () => {
                                if (anonymizedProxyUrl) {
                                    await close();
                                }
                                await context.close().catch(noop);
                            });
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
