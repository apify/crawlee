"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuppeteerPlugin = void 0;
const browser_plugin_1 = require("../abstract-classes/browser-plugin");
const logger_1 = require("../logger");
const utils_1 = require("../utils");
const puppeteer_controller_1 = require("./puppeteer-controller");
const anonymize_proxy_1 = require("../anonymize-proxy");
const PROXY_SERVER_ARG = '--proxy-server=';
class PuppeteerPlugin extends browser_plugin_1.BrowserPlugin {
    async _launch(launchContext) {
        const { launchOptions, userDataDir, useIncognitoPages, experimentalContainers, proxyUrl, } = launchContext;
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
        let browser;
        {
            const [anonymizedProxyUrl, close] = await (0, anonymize_proxy_1.anonymizeProxySugar)(proxyUrl);
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
                throw error;
            }
        }
        browser.on('targetcreated', async (target) => {
            try {
                const page = await target.page();
                if (page) {
                    page.on('error', (error) => {
                        logger_1.log.exception(error, 'Page crashed.');
                        page.close().catch(utils_1.noop);
                    });
                }
            }
            catch (error) {
                logger_1.log.exception(error, 'Failed to retrieve page from target.');
            }
        });
        const boundMethods = ['newPage', 'close', 'userAgent', 'createIncognitoBrowserContext', 'version']
            .reduce((map, method) => {
            map[method] = browser[method]?.bind(browser);
            return map;
        }, {});
        browser = new Proxy(browser, {
            get: (target, property, receiver) => {
                if (property === 'newPage') {
                    return (async (...args) => {
                        let page;
                        if (useIncognitoPages) {
                            const [anonymizedProxyUrl, close] = await (0, anonymize_proxy_1.anonymizeProxySugar)(proxyUrl);
                            try {
                                const context = await browser.createIncognitoBrowserContext({
                                    proxyServer: anonymizedProxyUrl ?? proxyUrl,
                                });
                                page = await context.newPage(...args);
                                if (anonymizedProxyUrl) {
                                    page.on('close', async () => {
                                        await close();
                                    });
                                }
                            }
                            catch (error) {
                                await close();
                                throw error;
                            }
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
                    });
                }
                if (property in boundMethods) {
                    return boundMethods[property];
                }
                return Reflect.get(target, property, receiver);
            },
        });
        return browser;
    }
    _createController() {
        return new puppeteer_controller_1.PuppeteerController(this);
    }
    async _addProxyToLaunchOptions(_launchContext) {
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
    _isChromiumBasedBrowser(_launchContext) {
        return true;
    }
}
exports.PuppeteerPlugin = PuppeteerPlugin;
//# sourceMappingURL=puppeteer-plugin.js.map