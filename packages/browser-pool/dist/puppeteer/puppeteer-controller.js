"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuppeteerController = void 0;
const timeout_1 = require("@apify/timeout");
const browser_controller_1 = require("../abstract-classes/browser-controller");
const logger_1 = require("../logger");
const anonymize_proxy_1 = require("../anonymize-proxy");
const PROCESS_KILL_TIMEOUT_MILLIS = 5000;
class PuppeteerController extends browser_controller_1.BrowserController {
    normalizeProxyOptions(proxyUrl, pageOptions) {
        if (!proxyUrl) {
            return {};
        }
        const url = new URL(proxyUrl);
        const username = decodeURIComponent(url.username);
        const password = decodeURIComponent(url.password);
        return {
            proxyServer: url.origin,
            proxyUsername: username,
            proxyPassword: password,
            proxyBypassList: pageOptions?.proxyBypassList,
        };
    }
    async _newPage(contextOptions) {
        if (contextOptions !== undefined) {
            if (!this.launchContext.useIncognitoPages) {
                throw new Error('A new page can be created with provided context only when using incognito pages or experimental containers.');
            }
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            let close = async () => { };
            if (contextOptions.proxyServer) {
                const [anonymizedProxyUrl, closeProxy] = await (0, anonymize_proxy_1.anonymizeProxySugar)(contextOptions.proxyServer, contextOptions.proxyUsername, contextOptions.proxyPassword);
                if (anonymizedProxyUrl) {
                    contextOptions.proxyServer = anonymizedProxyUrl;
                    delete contextOptions.proxyUsername;
                    delete contextOptions.proxyPassword;
                }
                close = closeProxy;
            }
            try {
                const context = await this.browser.createIncognitoBrowserContext(contextOptions);
                (0, timeout_1.tryCancel)();
                const page = await context.newPage();
                (0, timeout_1.tryCancel)();
                /*
                // DO NOT USE YET! DOING SO DISABLES CACHE WHICH IS 50% PERFORMANCE HIT!
                if (contextOptions.proxyUsername || contextOptions.proxyPassword) {
                    await page.authenticate({
                        username: contextOptions.proxyUsername ?? '',
                        password: contextOptions.proxyPassword ?? '',
                    });
                    tryCancel();
                }
                */
                page.once('close', async () => {
                    this.activePages--;
                    try {
                        await context.close();
                    }
                    catch (error) {
                        logger_1.log.exception(error, 'Failed to close context.');
                    }
                    finally {
                        await close();
                    }
                });
                return page;
            }
            catch (error) {
                await close();
                throw error;
            }
        }
        const page = await this.browser.newPage();
        (0, timeout_1.tryCancel)();
        page.once('close', () => {
            this.activePages--;
        });
        return page;
    }
    async _close() {
        await this.browser.close();
    }
    async _kill() {
        const browserProcess = this.browser.process();
        if (!browserProcess) {
            logger_1.log.debug('Browser was connected using the `puppeteer.connect` method no browser to kill.');
            return;
        }
        const timeout = setTimeout(() => {
            // This is here because users reported that it happened
            // that error `TypeError: Cannot read property 'kill' of null` was thrown.
            // Likely Chrome process wasn't started due to some error ...
            browserProcess?.kill('SIGKILL');
        }, PROCESS_KILL_TIMEOUT_MILLIS);
        try {
            await this.browser.close();
            clearTimeout(timeout);
        }
        catch (error) {
            logger_1.log.debug('Browser was already killed.', { error });
        }
    }
    _getCookies(page) {
        return page.cookies();
    }
    _setCookies(page, cookies) {
        return page.setCookie(...cookies);
    }
}
exports.PuppeteerController = PuppeteerController;
//# sourceMappingURL=puppeteer-controller.js.map