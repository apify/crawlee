import { readFile } from 'fs/promises';

import type { Dictionary } from '@crawlee/types';
import type Puppeteer from 'puppeteer';
import type * as PuppeteerTypes from 'puppeteer';

import type { PuppeteerNewPageOptions } from './puppeteer-controller';
import { PuppeteerController } from './puppeteer-controller';
import type { BrowserController } from '../abstract-classes/browser-controller';
import { BrowserPlugin } from '../abstract-classes/browser-plugin';
import { anonymizeProxySugar } from '../anonymize-proxy';
import type { LaunchContext } from '../launch-context';
import { log } from '../logger';
import { noop } from '../utils';

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
        let oldPuppeteerVersion = false;

        try {
            const jsonPath = require.resolve('puppeteer/package.json');
            const parsed = JSON.parse(await readFile(jsonPath, 'utf-8'));
            const version = +parsed.version.split('.')[0];
            oldPuppeteerVersion = version < 22;
        } catch {
            // ignore
        }
        const { launchOptions, userDataDir, useIncognitoPages, experimentalContainers, proxyUrl } = launchContext;

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

        let browser: PuppeteerTypes.Browser;

        {
            const [anonymizedProxyUrl, close] = await anonymizeProxySugar(proxyUrl);

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

        browser.on('targetcreated', async (target: PuppeteerTypes.Target) => {
            try {
                const page = await target.page();

                if (page) {
                    page.on('error', (error) => {
                        log.exception(error, 'Page crashed.');
                        page.close().catch(noop);
                    });
                }
            } catch (error: any) {
                log.exception(error, 'Failed to retrieve page from target.');
            }
        });

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
                            const [anonymizedProxyUrl, close] = await anonymizeProxySugar(proxyUrl);

                            try {
                                const context = (await (browser as any)[method]({
                                    proxyServer: anonymizedProxyUrl ?? proxyUrl,
                                })) as PuppeteerTypes.BrowserContext;

                                page = await context.newPage(...args);

                                if (anonymizedProxyUrl) {
                                    page.on('close', async () => {
                                        await close();
                                    });
                                }
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

    protected _createController(): BrowserController<
        typeof Puppeteer,
        PuppeteerTypes.LaunchOptions,
        PuppeteerTypes.Browser,
        PuppeteerNewPageOptions
    > {
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
