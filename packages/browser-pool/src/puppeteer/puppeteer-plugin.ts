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

export type PuppeteerLaunchContext = LaunchContext<
    typeof Puppeteer,
    PuppeteerTypes.LaunchOptions,
    PuppeteerTypes.Browser,
    PuppeteerNewPageOptions
>;

export class PuppeteerPlugin extends BrowserPlugin<
    typeof Puppeteer,
    PuppeteerTypes.LaunchOptions,
    PuppeteerTypes.Browser,
    PuppeteerNewPageOptions
> {
    protected async _launch(launchContext: PuppeteerLaunchContext): Promise<PuppeteerTypes.Browser> {
        const oldPuppeteerVersion = await this.isOldPuppeteerVersion();
        const { launchOptions, userDataDir, experimentalContainers, proxyUrl } = launchContext;

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

        let browser: PuppeteerTypes.Browser;
        try {
            browser = await this.library.launch(launchOptions);

            if (anonymizedProxyUrl) {
                browser.on('disconnected', async () => {
                    await close();
                });
            }
        } catch (error: any) {
            await close();

            this.throwAugmentedLaunchError(
                error,
                launchContext.launchOptions?.executablePath,
                '`apify/actor-node-puppeteer-chrome`',
                "Try installing a browser, if it's missing, by running `npx @puppeteer/browsers install chromium --path [path]` and pointing `executablePath` to the downloaded executable (https://pptr.dev/browsers-api)",
            );
        }

        return this.wrapBrowser(browser, launchContext, oldPuppeteerVersion);
    }

    /** @internal */
    protected async isOldPuppeteerVersion(): Promise<boolean> {
        try {
            const jsonPath = require.resolve('puppeteer/package.json');
            const parsed = JSON.parse(await readFile(jsonPath, 'utf-8'));
            return +parsed.version.split('.')[0] < 22;
        } catch {
            return false;
        }
    }

    /**
     * Attaches page crash handling and the incognito-context-per-page `newPage` proxy. Shared by the local launch
     * and {@apilink RemotePuppeteerPlugin}.
     * @internal
     */
    protected wrapBrowser(
        browser: PuppeteerTypes.Browser,
        launchContext: PuppeteerLaunchContext,
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
                            // Proxy is managed by the remote service.
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

    protected async addProxyToLaunchOptions(
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

    protected isChromiumBasedBrowser(
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
