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

            // Track active pages - check if page has event emitter methods
            // CDP-connected browsers might not support all events
            if (typeof page.once === 'function') {
                try {
                    page.once('close', () => {
                        this.activePages--;
                    });
                } catch {
                    // Stagehand pages via CDP don't support the 'close' event
                    // This is expected behavior, we just can't track page closure
                }
            }

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
     *
     * NOTE: Stagehand v3 removed cookie management APIs when migrating away from Playwright.
     * Cookie persistence is not currently supported. See: https://github.com/browserbase/stagehand/issues/1250
     */
    protected async _setCookies(_page: Page, _cookies: Cookie[]): Promise<void> {
        // Stagehand v3 doesn't provide cookie management APIs yet
        // This is a known limitation tracked in GitHub issue #1250
        // For now, we silently skip cookie operations to allow the crawler to function

        // TODO: Implement when Stagehand v3 adds cookie management support
        // Potential approach: Use CDP directly via stagehand.context or page CDP session
    }

    /**
     * Gets cookies from the browser context (abstract method implementation).
     *
     * NOTE: Stagehand v3 removed cookie management APIs when migrating away from Playwright.
     * Cookie persistence is not currently supported. See: https://github.com/browserbase/stagehand/issues/1250
     */
    protected async _getCookies(_page: Page): Promise<Cookie[]> {
        // Stagehand v3 doesn't provide cookie management APIs yet
        // Return empty array to allow crawler to function
        return [];

        // TODO: Implement when Stagehand v3 adds cookie management support
        // Potential approach: Use CDP directly via stagehand.context or page CDP session
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
