import type { Cookie } from '@crawlee/types';
import type { Browser, BrowserType, Page } from 'playwright';

import { tryCancel } from '@apify/timeout';

import { BrowserController } from '../abstract-classes/browser-controller.js';
import { anonymizeProxySugar } from '../anonymize-proxy.js';
import type { SafeParameters } from '../utils.js';
import type { PlaywrightPlugin } from './playwright-plugin.js';

const tabIds = new WeakMap<Page, number>();
const keyFromTabId = (tabId: string | number) => `.${tabId}.`;

export class PlaywrightController extends BrowserController<
    BrowserType,
    SafeParameters<BrowserType['launch']>[0],
    Browser
> {
    normalizeProxyOptions(proxyUrl: string | undefined, pageOptions: any): Record<string, unknown> {
        if (!proxyUrl) {
            return {};
        }

        const url = new URL(proxyUrl);
        const username = decodeURIComponent(url.username);
        const password = decodeURIComponent(url.password);

        return {
            proxy: {
                server: url.origin,
                username,
                password,
                bypass: pageOptions?.proxy?.bypass,
            },
        };
    }

    protected async _newPage(contextOptions?: SafeParameters<Browser['newPage']>[0]): Promise<Page> {
        if (contextOptions !== undefined && !this.launchContext.useIncognitoPages) {
            throw new Error('A new page can be created with provided context only when using incognito pages.');
        }

        let close = async () => {};

        if (this.launchContext.useIncognitoPages && contextOptions?.proxy) {
            const [anonymizedProxyUrl, closeProxy] = await anonymizeProxySugar(
                contextOptions.proxy.server,
                contextOptions.proxy.username,
                contextOptions.proxy.password,
            );

            if (anonymizedProxyUrl) {
                contextOptions.proxy = {
                    server: anonymizedProxyUrl,
                    bypass: contextOptions.proxy.bypass,
                };
            }

            close = closeProxy;
        }

        try {
            const page = await this.browser.newPage(contextOptions);

            page.once('close', async () => {
                this.activePages--;

                await close();
            });

            tryCancel();

            return page;
        } catch (error) {
            await close();

            throw error;
        }
    }

    protected async _close(): Promise<void> {
        await this.browser.close();
    }

    protected async _kill(): Promise<void> {
        // TODO: We need to be absolutely sure the browser dies.
        await this.browser.close(); // Playwright does not have the browser child process attached to normal browser server
    }

    protected async _getCookies(page: Page): Promise<Cookie[]> {
        const context = page.context();
        return context.cookies();
    }

    protected async _setCookies(page: Page, cookies: Cookie[]): Promise<void> {
        const context = page.context();
        return context.addCookies(cookies);
    }
}
