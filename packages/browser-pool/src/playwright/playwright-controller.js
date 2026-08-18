import { tryCancel } from '@apify/timeout';
import { BrowserController } from '../abstract-classes/browser-controller.js';
import { anonymizeProxySugar } from '../anonymize-proxy.js';
export class PlaywrightController extends BrowserController {
    normalizeProxyOptions(proxyUrl, pageOptions) {
        if (!proxyUrl) {
            return {};
        }
        const url = new URL(proxyUrl);
        const username = decodeURIComponent(url.username);
        const password = decodeURIComponent(url.password);
        return {
            proxy: {
                server: `${url.protocol}//${url.host}`,
                username,
                password,
                bypass: pageOptions?.proxy?.bypass,
            },
        };
    }
    async _newPage(contextOptions) {
        if (contextOptions !== undefined && !this.launchContext.useIncognitoPages) {
            throw new Error('A new page can be created with provided context only when using incognito pages.');
        }
        let close = async () => { };
        if (this.launchContext.useIncognitoPages) {
            // Each page requires to have all the context options applied
            contextOptions = {
                ...this.launchContext.launchOptions,
                ...contextOptions,
            };
            // Remote browsers handle their own proxy — don't inject local proxy settings into context
            if (this.launchContext.isRemote) {
                delete contextOptions?.proxy;
            }
            if (contextOptions?.proxy) {
                const [anonymizedProxyUrl, closeProxy] = await anonymizeProxySugar(contextOptions.proxy.server, contextOptions.proxy.username, contextOptions.proxy.password, { ignoreProxyCertificate: this.launchContext.ignoreProxyCertificate });
                if (anonymizedProxyUrl) {
                    contextOptions.proxy = {
                        server: anonymizedProxyUrl,
                        bypass: contextOptions.proxy.bypass,
                    };
                }
                close = closeProxy;
            }
        }
        try {
            const page = await this.browser.newPage(contextOptions);
            page.once('close', async () => {
                this.activePages--;
                await close();
            });
            tryCancel();
            return page;
        }
        catch (error) {
            await close();
            throw error;
        }
    }
    async _close() {
        await this.browser.close();
    }
    async _kill() {
        // TODO: We need to be absolutely sure the browser dies.
        await this.browser.close(); // Playwright does not have the browser child process attached to normal browser server
    }
    async _getCookies(page) {
        const context = page.context();
        return context.cookies();
    }
    async _setCookies(page, cookies) {
        const context = page.context();
        return context.addCookies(cookies);
    }
}
