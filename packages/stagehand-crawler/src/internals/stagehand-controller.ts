import type { Stagehand } from '@browserbasehq/stagehand';
import { BrowserController } from '@crawlee/browser-pool';
import type { Cookie } from '@crawlee/types';
import type { Browser as PlaywrightBrowser, BrowserType, LaunchOptions, Page } from 'playwright';

import log from '@apify/log';

import type { StagehandPlugin } from './stagehand-plugin';

/**
 * StagehandController manages the lifecycle of a Stagehand-controlled browser for Crawlee's BrowserPool.
 *
 * This controller bridges Crawlee's browser management system with Stagehand:
 * - Created by StagehandPlugin when a new browser is needed
 * - Provides page creation via Playwright (connected to Stagehand's browser via CDP)
 * - Exposes the Stagehand instance so crawling context can access AI methods (act/extract/observe)
 * - Handles browser cleanup by delegating to Stagehand's close method
 * - Manages proxy authentication via CDP (since Stagehand doesn't handle proxy auth natively)
 *
 * @ignore
 */
export class StagehandController extends BrowserController<BrowserType, LaunchOptions, PlaywrightBrowser> {
    private stagehand: Stagehand | null = null;
    private readonly stagehandInstances: WeakMap<PlaywrightBrowser, Stagehand>;

    constructor(browserPlugin: StagehandPlugin, stagehandInstances: WeakMap<PlaywrightBrowser, Stagehand>) {
        super(browserPlugin);
        this.stagehandInstances = stagehandInstances;
    }

    /**
     * Gets the Stagehand instance associated with this controller's browser.
     */
    getStagehand(): Stagehand {
        if (!this.stagehand) {
            this.stagehand = this.stagehandInstances.get(this.browser)!;
            if (!this.stagehand) {
                throw new Error('Stagehand instance not found for browser');
            }
        }
        return this.stagehand;
    }

    /**
     * Creates a new page using the browser's default context.
     * We use Playwright's browser API directly since we connected via CDP.
     */
    protected override async _newPage(_contextOptions?: unknown): Promise<Page> {
        try {
            // Get the default context from the Playwright browser (connected via CDP)
            const contexts = this.browser.contexts();
            if (contexts.length === 0) {
                throw new Error('No browser context available');
            }

            const context = contexts[0];
            const page = await context.newPage();

            // Set up proxy authentication if credentials are available
            // Stagehand doesn't handle proxy auth, so we do it via CDP on each page
            const proxyCredentials = (this.browserPlugin as StagehandPlugin)._proxyCredentials;
            if (proxyCredentials) {
                await this._setupProxyAuth(context, page, proxyCredentials);
            }

            // Track active pages
            page.once('close', () => {
                this.activePages--;
            });

            return page;
        } catch (error) {
            throw new Error(`Failed to create new page: ${error instanceof Error ? error.message : String(error)}`, {
                cause: error,
            });
        }
    }

    /**
     * Sets up proxy authentication via CDP for a page.
     * This is needed because Stagehand only passes --proxy-server flag to Chrome
     * but doesn't handle the authentication part.
     */
    private async _setupProxyAuth(
        context: Awaited<ReturnType<PlaywrightBrowser['contexts']>>[0],
        page: Page,
        credentials: { username: string; password: string },
    ): Promise<void> {
        try {
            const cdpSession = await context.newCDPSession(page);
            await cdpSession.send('Fetch.enable', { handleAuthRequests: true });

            cdpSession.on('Fetch.authRequired', async (event) => {
                try {
                    // Only respond with credentials for proxy auth challenges, not server auth
                    // This prevents leaking proxy credentials to malicious servers
                    if (event.authChallenge?.source === 'Proxy') {
                        await cdpSession.send('Fetch.continueWithAuth', {
                            requestId: event.requestId,
                            authChallengeResponse: {
                                response: 'ProvideCredentials',
                                username: credentials.username,
                                password: credentials.password,
                            },
                        });
                    } else {
                        // For server auth challenges, cancel the auth request
                        await cdpSession.send('Fetch.continueWithAuth', {
                            requestId: event.requestId,
                            authChallengeResponse: {
                                response: 'CancelAuth',
                            },
                        });
                    }
                } catch {
                    // Request might have been cancelled
                }
            });

            cdpSession.on('Fetch.requestPaused', async (event) => {
                try {
                    if (!event.responseStatusCode) {
                        await cdpSession.send('Fetch.continueRequest', { requestId: event.requestId });
                    } else {
                        await cdpSession.send('Fetch.continueResponse', { requestId: event.requestId });
                    }
                } catch {
                    // Request might have been cancelled
                }
            });
        } catch (error) {
            // Log but don't fail - proxy might still work for some scenarios
            log.warning('Failed to set up proxy authentication', { error });
        }
    }

    /**
     * Normalizes proxy options for Playwright.
     */
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

    /**
     * Sets cookies in the browser context.
     * Uses Playwright's browser context API directly.
     */
    protected override async _setCookies(page: Page, cookies: Cookie[]): Promise<void> {
        try {
            const context = page.context();
            await context.addCookies(cookies);
        } catch {
            // Silently skip if not supported
        }
    }

    /**
     * Gets cookies from the browser context.
     * Uses Playwright's browser context API directly.
     */
    protected override async _getCookies(page: Page): Promise<Cookie[]> {
        try {
            const context = page.context();
            const cookies = await context.cookies();
            return cookies as Cookie[];
        } catch {
            return [];
        }
    }

    /**
     * Closes the browser and cleans up Stagehand resources.
     */
    protected override async _close(): Promise<void> {
        const stagehand = this.getStagehand();

        try {
            await stagehand.close();
        } catch (error) {
            log.error('Error closing Stagehand', { error });
        }
    }

    /**
     * Kills the browser process forcefully.
     */
    protected override async _kill(): Promise<void> {
        const stagehand = this.getStagehand();

        try {
            await stagehand.close({ force: true });
        } catch {
            // Ignore errors during force close
        }
    }
}
