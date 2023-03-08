import { tryCancel } from '@apify/timeout';
import type { Cookie } from '@crawlee/types';
import type Puppeteer from 'puppeteer';
import type * as PuppeteerTypes from 'puppeteer';
import { BrowserController } from '../abstract-classes/browser-controller';
import { log } from '../logger';
import { anonymizeProxySugar } from '../anonymize-proxy';

export interface PuppeteerNewPageOptions extends PuppeteerTypes.BrowserContextOptions {
    proxyUsername?: string;
    proxyPassword?: string;
}

const PROCESS_KILL_TIMEOUT_MILLIS = 5000;

export class PuppeteerController extends BrowserController<
    typeof Puppeteer,
    PuppeteerTypes.PuppeteerLaunchOptions,
    PuppeteerTypes.Browser,
    PuppeteerNewPageOptions
> {
    normalizeProxyOptions(proxyUrl: string | undefined, pageOptions: any): Record<string, unknown> {
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

    protected async _newPage(contextOptions?: PuppeteerNewPageOptions): Promise<PuppeteerTypes.Page> {
        if (contextOptions !== undefined) {
            if (!this.launchContext.useIncognitoPages) {
                throw new Error('A new page can be created with provided context only when using incognito pages or experimental containers.');
            }

            // eslint-disable-next-line @typescript-eslint/no-empty-function
            let close = async () => {};
            if (contextOptions.proxyServer) {
                const [anonymizedProxyUrl, closeProxy] = await anonymizeProxySugar(
                    contextOptions.proxyServer,
                    contextOptions.proxyUsername,
                    contextOptions.proxyPassword,
                );

                if (anonymizedProxyUrl) {
                    contextOptions.proxyServer = anonymizedProxyUrl;
                    delete contextOptions.proxyUsername;
                    delete contextOptions.proxyPassword;
                }

                close = closeProxy;
            }

            try {
                const context = await this.browser.createIncognitoBrowserContext(contextOptions);
                tryCancel();
                const page = await context.newPage();
                tryCancel();

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
                    } catch (error: any) {
                        log.exception(error, 'Failed to close context.');
                    } finally {
                        await close();
                    }
                });

                return page;
            } catch (error) {
                await close();

                throw error;
            }
        }

        const page = await this.browser.newPage();
        tryCancel();

        page.once('close', () => {
            this.activePages--;
        });

        return page;
    }

    protected async _close(): Promise<void> {
        await this.browser.close();
    }

    protected async _kill(): Promise<void> {
        const browserProcess = this.browser.process();

        if (!browserProcess) {
            log.debug('Browser was connected using the `puppeteer.connect` method no browser to kill.');
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
        } catch (error) {
            log.debug('Browser was already killed.', { error });
        }
    }

    protected _getCookies(page: PuppeteerTypes.Page): Promise<Cookie[]> {
        return page.cookies();
    }

    protected _setCookies(page: PuppeteerTypes.Page, cookies: Cookie[]): Promise<void> {
        return page.setCookie(...cookies);
    }
}
