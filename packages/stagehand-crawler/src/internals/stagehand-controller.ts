import { BrowserController } from '@crawlee/browser-pool';
import type { Cookie } from '@crawlee/types';
import type { Browser as PlaywrightBrowser, BrowserType, LaunchOptions, Page } from 'playwright';

import type { StagehandPlugin } from './stagehand-plugin';

/**
 * StagehandController wraps a Stagehand instance and provides browser control methods.
 * It extends BrowserController to integrate with Crawlee's browser management.
 *
 * @ignore
 */
export class StagehandController extends BrowserController<BrowserType, LaunchOptions, PlaywrightBrowser> {
    private stagehand: any | null = null;
    private readonly stagehandInstances: WeakMap<PlaywrightBrowser, any>;

    constructor(browserPlugin: StagehandPlugin, stagehandInstances: WeakMap<PlaywrightBrowser, any>) {
        super(browserPlugin);
        this.stagehandInstances = stagehandInstances;
    }

    /**
     * Gets the Stagehand instance associated with this controller's browser.
     */
    getStagehand(): any {
        if (!this.stagehand) {
            // Lazy load the Stagehand instance from the WeakMap
            this.stagehand = this.stagehandInstances.get(this.browser)!;
            if (!this.stagehand) {
                throw new Error('Stagehand instance not found for browser');
            }
        }
        return this.stagehand;
    }

    /**
     * Creates a new page using Stagehand's context.
     */
    protected async _newPage(contextOptions?: any): Promise<Page> {
        const stagehand = this.getStagehand();

        try {
            // Create new page through Stagehand's context
            const page = await stagehand.context.newPage(contextOptions);

            // Track active pages
            page.once('close', () => {
                this.activePages--;
            });

            return page;
        } catch (error) {
            throw new Error(
                `Failed to create new page with Stagehand: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
            );
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
     * Sets cookies in the browser context (abstract method implementation).
     */
    protected async _setCookies(page: Page, cookies: Cookie[]): Promise<void> {
        // Convert Crawlee cookies to Playwright cookie format
        // Note: Both Crawlee and Playwright use Unix timestamps (seconds since epoch) for expires
        const playwrightCookies = cookies.map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            expires: cookie.expires, // Already in correct format (seconds)
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
            sameSite: cookie.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
        }));

        await page.context().addCookies(playwrightCookies);
    }

    /**
     * Gets cookies from the browser context (abstract method implementation).
     */
    protected async _getCookies(page: Page): Promise<Cookie[]> {
        const playwrightCookies = await page.context().cookies();

        // Convert Playwright cookies to Crawlee cookie format
        // Note: Playwright expires is in seconds, Crawlee expects seconds as well
        return playwrightCookies.map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            expires: cookie.expires !== -1 ? cookie.expires : undefined,
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
            sameSite: cookie.sameSite,
        }));
    }

    /**
     * Closes the browser and cleans up Stagehand resources (abstract method implementation).
     */
    protected async _close(): Promise<void> {
        const stagehand = this.getStagehand();

        try {
            // Close Stagehand (this will close the browser)
            await stagehand.close();
        } catch (error) {
            // Log error but don't throw - we want cleanup to proceed
            console.error('Error closing Stagehand:', error);
        }
    }

    /**
     * Kills the browser process forcefully (abstract method implementation).
     */
    protected async _kill(): Promise<void> {
        const stagehand = this.getStagehand();

        try {
            // Force close with Stagehand
            await stagehand.close({ force: true });
        } catch (error) {
            // Ignore errors during force close
        }
    }
}
