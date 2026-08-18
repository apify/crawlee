"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StagehandController = void 0;
const browser_pool_1 = require("@crawlee/browser-pool");
const core_1 = require("@crawlee/core");
const utils_1 = require("@crawlee/utils");
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
class StagehandController extends browser_pool_1.BrowserController {
    #stagehand = null;
    #stagehandInstances;
    constructor(browserPlugin, stagehandInstances) {
        super(browserPlugin);
        this.#stagehandInstances = stagehandInstances;
    }
    /**
     * Gets the Stagehand instance associated with this controller's browser.
     */
    getStagehand() {
        if (!this.#stagehand) {
            this.#stagehand = this.#stagehandInstances.get(this.browser);
            if (!this.#stagehand) {
                throw new Error('Stagehand instance not found for browser');
            }
        }
        return this.#stagehand;
    }
    /**
     * Creates a new page using the browser's default context.
     * We use Playwright's browser API directly since we connected via CDP.
     */
    async _newPage(_contextOptions) {
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
            try {
                await this.waitForStagehandToRegisterPage(page);
            }
            catch (error) {
                await page.close().catch(() => { });
                throw error;
            }
            return page;
        }
        catch (error) {
            throw new Error(`Failed to create new page: ${error instanceof Error ? error.message : String(error)}`, {
                cause: error,
            });
        }
    }
    /**
     * Waits until Stagehand knows about the page, so that `act()`/`extract()`/`observe()` can resolve it.
     *
     * Stagehand only learns about pages from CDP `Target.attachedToTarget` events on its own connection,
     * and it maps them by main frame id. We create pages through a separate `connectOverCDP()` handle, so
     * `context.newPage()` resolves before Stagehand has processed that event — the page is unresolvable for
     * a short window, and the AI methods fail with 'Failed to resolve V3 Page from Playwright page'.
     * Stagehand's own `newPage()` polls for the same reason.
     */
    async waitForStagehandToRegisterPage(page, timeoutMs = 10_000) {
        const stagehand = this.getStagehand();
        const mainFrameId = await this.getMainFrameId(page);
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (stagehand.context.resolvePageByMainFrameId(mainFrameId)) {
                return;
            }
            await (0, utils_1.sleep)(25);
        }
        // Stagehand skips registration entirely when it cannot install its helper script into the page's CDP
        // session, so this is not always just a slow attach - it can never resolve.
        throw new Error(`Stagehand did not register the page within ${timeoutMs}ms`);
    }
    /**
     * Reads the page's main frame id, which is the key Stagehand resolves pages by.
     */
    async getMainFrameId(page) {
        const cdpSession = await page.context().newCDPSession(page);
        try {
            const { frameTree } = await cdpSession.send('Page.getFrameTree');
            return frameTree.frame.id;
        }
        finally {
            await cdpSession.detach().catch(() => { });
        }
    }
    /**
     * Normalizes proxy options for Playwright.
     */
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
    /**
     * Sets cookies in the browser context.
     * Uses Playwright's browser context API directly.
     */
    async _setCookies(page, cookies) {
        try {
            const context = page.context();
            await context.addCookies(cookies);
        }
        catch {
            // Silently skip if not supported
        }
    }
    /**
     * Gets cookies from the browser context.
     * Uses Playwright's browser context API directly.
     */
    async _getCookies(page) {
        try {
            const context = page.context();
            const cookies = await context.cookies();
            return cookies;
        }
        catch {
            return [];
        }
    }
    /**
     * Closes the browser and cleans up Stagehand resources.
     */
    async _close() {
        const stagehand = this.getStagehand();
        try {
            await stagehand.close();
        }
        catch (error) {
            core_1.serviceLocator.getLogger().error('Error closing Stagehand', { error });
        }
    }
    /**
     * Kills the browser process forcefully.
     */
    async _kill() {
        const stagehand = this.getStagehand();
        try {
            await stagehand.close({ force: true });
        }
        catch {
            // Ignore errors during force close
        }
    }
}
exports.StagehandController = StagehandController;
