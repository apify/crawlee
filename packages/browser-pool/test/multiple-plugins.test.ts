import { BrowserPool, PlaywrightPlugin } from '@crawlee/browser-pool';
import playwright from 'playwright';

describe('BrowserPool - Using multiple plugins', () => {
    let browserPool: BrowserPool<{ browserPlugins: [PlaywrightPlugin, PlaywrightPlugin]; closeInactiveBrowserAfterSecs: 2 }>;
    const chromePlugin = new PlaywrightPlugin(playwright.chromium);
    const firefoxPlugin = new PlaywrightPlugin(playwright.firefox);

    beforeEach(async () => {
        jest.clearAllMocks();
        browserPool = new BrowserPool({
            browserPlugins: [
                chromePlugin,
                firefoxPlugin,
            ],
            closeInactiveBrowserAfterSecs: 2,
        });
    });

    afterEach(async () => {
        await browserPool?.destroy();
    });

    test('should open new page in correct plugin', async () => {
        const page = await browserPool.newPage({
            browserPlugin: firefoxPlugin,
        });

        const controller = browserPool.getBrowserControllerByPage(page)!;
        expect(controller.launchContext.browserPlugin).toBe(firefoxPlugin);
    });

    test('should loop through plugins round-robin', async () => {
        const correctPluginOrder = [
            chromePlugin,
            firefoxPlugin,
        ];

        const pagePromises = correctPluginOrder.map(() => browserPool.newPage());

        const pages = await Promise.all(pagePromises);

        expect(pages).toHaveLength(correctPluginOrder.length);
        expect(browserPool.activeBrowserControllers.size).toEqual(2);

        for (const [idx, page] of pages.entries()) {
            const controller = browserPool.getBrowserControllerByPage(page)!;
            const { browserPlugin } = controller.launchContext;
            const correctPlugin = correctPluginOrder[idx];
            expect(browserPlugin).toBe(correctPlugin);
        }
    });

    test('newPageWithEachPlugin should open all pages', async () => {
        const [chromePage, firefoxPage] = await browserPool.newPageWithEachPlugin();
        const chromeController = browserPool.getBrowserControllerByPage(chromePage)!;
        const firefoxController = browserPool.getBrowserControllerByPage(firefoxPage)!;
        expect(chromeController.launchContext.browserPlugin).toBe(chromePlugin);
        expect(firefoxController.launchContext.browserPlugin).toBe(firefoxPlugin);
    });

    test('newPageWithEachPlugin should open in existing browsers', async () => {
        jest.spyOn(chromePlugin, 'launch');
        jest.spyOn(firefoxPlugin, 'launch');

        // launch 2 browsers
        await browserPool.newPage();
        await browserPool.newPage();
        expect(chromePlugin.launch).toHaveBeenCalledTimes(1);
        expect(firefoxPlugin.launch).toHaveBeenCalledTimes(1);
        expect(browserPool.activeBrowserControllers.size).toBe(2);

        // Open more pages
        await browserPool.newPageWithEachPlugin();
        expect(chromePlugin.launch).toHaveBeenCalledTimes(1);
        expect(firefoxPlugin.launch).toHaveBeenCalledTimes(1);
        expect(browserPool.activeBrowserControllers.size).toBe(2);
    });
});
