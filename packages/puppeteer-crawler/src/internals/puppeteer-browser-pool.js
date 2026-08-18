import { PuppeteerLauncher } from './puppeteer-launcher.js';
/**
 * Builds a {@apilink BrowserPool} of Puppeteer browsers to pass to a {@apilink PuppeteerCrawler} as its
 * {@apilink BrowserCrawlerOptions.browserPool|`browserPool`}.
 *
 * It accepts every {@apilink BrowserPoolOptions|`BrowserPool` option} plus the crawler's own `launchContext` and
 * `headless`, and derives the browser plugin from them - so a pool built here always matches the crawler it is
 * given to, and configuring one never means assembling a {@apilink PuppeteerPlugin} by hand.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new PuppeteerCrawler({
 *     browserPool: puppeteerBrowserPool({ maxOpenPagesPerBrowser: 1 }),
 *     requestHandler: async ({ page }) => { ... },
 * });
 * ```
 *
 * The returned pool is *not* torn down by the crawler, which is what makes it shareable between crawlers.
 *
 * @category Browser management
 */
export function puppeteerBrowserPool(options = {}) {
    const { launchContext, headless, configuration, ...poolOptions } = options;
    return puppeteerLauncher(launchContext, headless, configuration).createBrowserPool(poolOptions);
}
/**
 * The {@apilink RemoteBrowserPool} counterpart of {@apilink puppeteerBrowserPool}: connects to a remote browser
 * service (Browserbase, Browserless, Steel, ...) with a Puppeteer plugin derived from `launchContext`.
 *
 * A {@apilink PuppeteerCrawler} accepts the same connection details directly via
 * {@apilink BrowserCrawlerOptions.remoteBrowser|`remoteBrowser`}; reach for this factory when you also need to
 * tune the wrapping pool, or to share one remote pool between crawlers.
 *
 * @category Browser management
 */
export function remotePuppeteerBrowserPool(options) {
    const { launchContext, headless, configuration, ...remoteOptions } = options;
    return puppeteerLauncher(launchContext, headless, configuration).createRemoteBrowserPool(remoteOptions);
}
function puppeteerLauncher(launchContext = {}, headless, configuration) {
    return new PuppeteerLauncher(headless == null
        ? launchContext
        : {
            ...launchContext,
            launchOptions: { ...launchContext.launchOptions, headless: headless },
        }, configuration);
}
