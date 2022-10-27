import type { Browser, BrowserType, Page } from 'playwright';
import { tryCancel } from '@apify/timeout';
import type { Cookie } from '@crawlee/types';
import { BrowserController } from '../abstract-classes/browser-controller';
import { anonymizeProxySugar } from '../anonymize-proxy';
import type { PlaywrightPlugin } from './playwright-plugin';
import type { SafeParameters } from '../utils';

const tabIds = new WeakMap<Page, number>();
const keyFromTabId = (tabId: string | number) => `.${tabId}.`;

export class PlaywrightController extends BrowserController<BrowserType, SafeParameters<BrowserType['launch']>[0], Browser> {
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
        if (contextOptions !== undefined && !this.launchContext.useIncognitoPages && !this.launchContext.experimentalContainers) {
            throw new Error('A new page can be created with provided context only when using incognito pages or experimental containers.');
        }

        // eslint-disable-next-line @typescript-eslint/no-empty-function
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

            if (this.launchContext.experimentalContainers) {
                await page.goto('data:text/plain,tabid');
                await page.waitForNavigation();
                const { tabid, proxyip }: { tabid: number; proxyip: string } = JSON.parse(decodeURIComponent(page.url().slice('about:blank#'.length)));

                if (contextOptions?.proxy) {
                    const url = new URL(contextOptions.proxy.server);
                    url.username = contextOptions.proxy.username ?? '';
                    url.password = contextOptions.proxy.password ?? '';

                    (this.browserPlugin as PlaywrightPlugin)._containerProxyServer!.ipToProxy.set(proxyip, url.href);
                }

                if (this.browserPlugin.library.name() === 'firefox') {
                    // Playwright does not support creating new CDP sessions with Firefox
                } else {
                    const session = await page.context().newCDPSession(page);
                    await session.send('Network.enable');

                    session.on('Network.responseReceived', (responseRecevied) => {
                        const logOnly = ['Document', 'XHR', 'Fetch', 'EventSource', 'WebSocket', 'Other'];
                        if (!logOnly.includes(responseRecevied.type)) {
                            return;
                        }

                        const { response } = responseRecevied;
                        if (response.fromDiskCache || response.fromPrefetchCache || response.fromServiceWorker) {
                            return;
                        }

                        const { remoteIPAddress } = response;
                        if (remoteIPAddress && remoteIPAddress !== proxyip) {
                            // eslint-disable-next-line no-console
                            console.warn(`Request to ${response.url} was through ${remoteIPAddress} instead of ${proxyip}`);
                        }
                    });
                }

                tabIds.set(page, tabid);
            }

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
        const cookies = await context.cookies();

        if (this.launchContext.experimentalContainers) {
            const tabId = tabIds.get(page);

            if (tabId === undefined) {
                throw new Error('Failed to find tabId for page');
            }

            const key = keyFromTabId(tabId);

            return cookies
                .filter((cookie) => cookie.name.startsWith(key))
                .map((cookie) => ({
                    ...cookie,
                    name: cookie.name.slice(key.length),
                }));
        }

        return cookies;
    }

    protected async _setCookies(page: Page, cookies: Cookie[]): Promise<void> {
        const context = page.context();

        if (this.launchContext.experimentalContainers) {
            const tabId = tabIds.get(page);

            if (tabId === undefined) {
                throw new Error('Failed to find tabId for page');
            }

            const key = keyFromTabId(tabId);

            cookies = cookies.map((cookie) => ({
                ...cookie,
                name: `${key}${cookie.name}`,
            }));
        }

        return context.addCookies(cookies);
    }
}
