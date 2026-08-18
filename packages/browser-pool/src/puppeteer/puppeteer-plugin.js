import { readFile } from 'node:fs/promises';
import { BrowserPlugin } from '../abstract-classes/browser-plugin.js';
import { anonymizeProxySugar } from '../anonymize-proxy.js';
import { noop } from '../utils.js';
import { PuppeteerController } from './puppeteer-controller.js';
const PROXY_SERVER_ARG = '--proxy-server=';
export class PuppeteerPlugin extends BrowserPlugin {
    /** Pages share cookies/storage on the remote browser (Puppeteer defaults to non-incognito). */
    useRemoteConnection(connection, parameters = {}) {
        super.useRemoteConnection(connection, parameters);
        if (!this.useIncognitoPages) {
            this.log.info('Remote Puppeteer connection — pages will share cookies and storage on the remote ' +
                'browser instance (useIncognitoPages defaults to false).');
        }
    }
    async _launch(launchContext) {
        let oldPuppeteerVersion = false;
        try {
            const jsonPath = require.resolve('puppeteer/package.json');
            const parsed = JSON.parse(await readFile(jsonPath, 'utf-8'));
            const version = +parsed.version.split('.')[0];
            oldPuppeteerVersion = version < 22;
        }
        catch {
            // ignore
        }
        const { useIncognitoPages, proxyUrl, ignoreProxyCertificate } = launchContext;
        let browser;
        if (this.remoteConnection) {
            browser = await this.connectToRemoteBrowser(launchContext, async (url) => {
                const connectOptions = this.remoteConnectionParameters?.connectOptions ?? {};
                this.log.info('Connecting to remote browser via connect (CDP).');
                return this.library.connect({ ...connectOptions, browserWSEndpoint: url });
            });
        }
        else {
            const { launchOptions, userDataDir, experimentalContainers } = launchContext;
            if (experimentalContainers) {
                throw new Error('Experimental containers are only available with Playwright');
            }
            launchOptions.userDataDir = launchOptions.userDataDir ?? userDataDir;
            if (launchOptions.headless === false) {
                if (Array.isArray(launchOptions.args)) {
                    launchOptions.args.push('--disable-site-isolation-trials');
                }
                else {
                    launchOptions.args = ['--disable-site-isolation-trials'];
                }
            }
            if (launchOptions.headless === true && oldPuppeteerVersion) {
                launchOptions.headless = 'new';
            }
            {
                const [anonymizedProxyUrl, close] = await anonymizeProxySugar(proxyUrl, undefined, undefined, {
                    ignoreProxyCertificate: launchContext.ignoreProxyCertificate,
                });
                if (proxyUrl) {
                    const proxyArg = `${PROXY_SERVER_ARG}${anonymizedProxyUrl ?? proxyUrl}`;
                    if (Array.isArray(launchOptions.args)) {
                        launchOptions.args.push(proxyArg);
                    }
                    else {
                        launchOptions.args = [proxyArg];
                    }
                }
                try {
                    browser = await this.library.launch(launchOptions);
                    if (anonymizedProxyUrl) {
                        browser.on('disconnected', async () => {
                            await close();
                        });
                    }
                }
                catch (error) {
                    await close();
                    this.throwAugmentedLaunchError(error, launchContext.launchOptions?.executablePath, '`apify/actor-node-puppeteer-chrome`', "Try installing a browser, if it's missing, by running `npx @puppeteer/browsers install chromium --path [path]` and pointing `executablePath` to the downloaded executable (https://pptr.dev/browsers-api)");
                }
            }
        }
        const targetCreatedHandler = async (target) => {
            try {
                const page = await target.page();
                if (page) {
                    page.on('error', (error) => {
                        this.log.exception(error, 'Page crashed.');
                        page.close().catch(noop);
                    });
                }
            }
            catch (error) {
                this.log.exception(error, 'Failed to retrieve page from target.');
            }
        };
        browser.on('targetcreated', targetCreatedHandler);
        // Clean up the listener when a remote browser disconnects to prevent leaks
        if (this.remoteConnection) {
            browser.once('disconnected', () => {
                browser.off('targetcreated', targetCreatedHandler);
            });
        }
        const boundMethods = [
            'newPage',
            'close',
            'userAgent',
            'createIncognitoBrowserContext',
            'createBrowserContext',
            'version',
            'on',
            'process',
            'pages',
        ].reduce((map, method) => {
            map[method] = browser[method]?.bind(browser);
            return map;
        }, {});
        const method = oldPuppeteerVersion ? 'createIncognitoBrowserContext' : 'createBrowserContext';
        browser = new Proxy(browser, {
            get: (target, property, receiver) => {
                if (property === 'newPage') {
                    return async (...args) => {
                        let page;
                        if (useIncognitoPages) {
                            // Skip proxy setup for remote connections — proxy is managed by the remote service.
                            const effectiveProxyUrl = this.remoteConnection ? undefined : proxyUrl;
                            const [anonymizedProxyUrl, close] = effectiveProxyUrl
                                ? await anonymizeProxySugar(effectiveProxyUrl, undefined, undefined, {
                                    ignoreProxyCertificate,
                                })
                                : [undefined, noop];
                            const proxyServer = anonymizedProxyUrl ?? effectiveProxyUrl;
                            const contextOptions = proxyServer ? { proxyServer } : {};
                            const context = (await browser[method](contextOptions));
                            try {
                                page = await context.newPage(...args);
                            }
                            catch (error) {
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
                        }
                        else {
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
    createController() {
        return new PuppeteerController(this);
    }
    async addProxyToLaunchOptions(_launchContext) {
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
    isChromiumBasedBrowser(_launchContext) {
        return true;
    }
}
