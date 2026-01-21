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
 *
 * Proxy authentication is handled transparently via anonymizeProxy in the plugin layer.
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
