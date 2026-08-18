import type { Stagehand } from '@browserbasehq/stagehand';
import { BrowserController } from '@crawlee/browser-pool';
import type { Cookie } from '@crawlee/types';
import type { Browser as PlaywrightBrowser, BrowserType, LaunchOptions, Page } from 'playwright';
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
export declare class StagehandController extends BrowserController<BrowserType, LaunchOptions, PlaywrightBrowser> {
    #private;
    constructor(browserPlugin: StagehandPlugin, stagehandInstances: WeakMap<PlaywrightBrowser, Stagehand>);
    /**
     * Gets the Stagehand instance associated with this controller's browser.
     */
    getStagehand(): Stagehand;
    /**
     * Creates a new page using the browser's default context.
     * We use Playwright's browser API directly since we connected via CDP.
     */
    protected _newPage(_contextOptions?: unknown): Promise<Page>;
    /**
     * Waits until Stagehand knows about the page, so that `act()`/`extract()`/`observe()` can resolve it.
     *
     * Stagehand only learns about pages from CDP `Target.attachedToTarget` events on its own connection,
     * and it maps them by main frame id. We create pages through a separate `connectOverCDP()` handle, so
     * `context.newPage()` resolves before Stagehand has processed that event — the page is unresolvable for
     * a short window, and the AI methods fail with 'Failed to resolve V3 Page from Playwright page'.
     * Stagehand's own `newPage()` polls for the same reason.
     */
    private waitForStagehandToRegisterPage;
    /**
     * Reads the page's main frame id, which is the key Stagehand resolves pages by.
     */
    private getMainFrameId;
    /**
     * Normalizes proxy options for Playwright.
     */
    normalizeProxyOptions(proxyUrl: string | undefined, pageOptions: any): Record<string, unknown>;
    /**
     * Sets cookies in the browser context.
     * Uses Playwright's browser context API directly.
     */
    protected _setCookies(page: Page, cookies: Cookie[]): Promise<void>;
    /**
     * Gets cookies from the browser context.
     * Uses Playwright's browser context API directly.
     */
    protected _getCookies(page: Page): Promise<Cookie[]>;
    /**
     * Closes the browser and cleans up Stagehand resources.
     */
    protected _close(): Promise<void>;
    /**
     * Kills the browser process forcefully.
     */
    protected _kill(): Promise<void>;
}
