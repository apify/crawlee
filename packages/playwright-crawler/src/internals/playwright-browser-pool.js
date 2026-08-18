import { PlaywrightLauncher } from './playwright-launcher.js';
/**
 * Builds a {@apilink BrowserPool} of Playwright browsers to pass to a {@apilink PlaywrightCrawler} as its
 * {@apilink BrowserCrawlerOptions.browserPool|`browserPool`}.
 *
 * It accepts every {@apilink BrowserPoolOptions|`BrowserPool` option} plus the crawler's own `launchContext` and
 * `headless`, and derives the browser plugin from them - so a pool built here always matches the crawler it is
 * given to, and configuring one never means assembling a {@apilink PlaywrightPlugin} by hand.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new PlaywrightCrawler({
 *     browserPool: playwrightBrowserPool({
 *         maxOpenPagesPerBrowser: 1,
 *         launchContext: { launcher: firefox },
 *     }),
 *     requestHandler: async ({ page }) => { ... },
 * });
 * ```
 *
 * The returned pool is *not* torn down by the crawler, which is what makes it shareable between crawlers.
 *
 * @category Browser management
 */
export function playwrightBrowserPool(options = {}) {
    const { launchContext, headless, configuration, ...poolOptions } = options;
    return playwrightLauncher(launchContext, headless, configuration).createBrowserPool(poolOptions);
}
/**
 * The {@apilink RemoteBrowserPool} counterpart of {@apilink playwrightBrowserPool}: connects to a remote browser
 * service (Browserbase, Browserless, Steel, ...) with a Playwright plugin derived from `launchContext`.
 *
 * A {@apilink PlaywrightCrawler} accepts the same connection details directly via
 * {@apilink BrowserCrawlerOptions.remoteBrowser|`remoteBrowser`}; reach for this factory when you also need to
 * tune the wrapping pool, or to share one remote pool between crawlers.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new PlaywrightCrawler({
 *     browserPool: remotePlaywrightBrowserPool({
 *         endpoint: 'wss://production-sfo.browserless.io?token=xxx',
 *         maxOpenBrowsers: 2,
 *         browserPoolOptions: { useFingerprints: false },
 *     }),
 *     requestHandler: async ({ page }) => { ... },
 * });
 * ```
 *
 * @category Browser management
 */
export function remotePlaywrightBrowserPool(options) {
    const { launchContext, headless, configuration, ...remoteOptions } = options;
    return playwrightLauncher(launchContext, headless, configuration).createRemoteBrowserPool(remoteOptions);
}
function playwrightLauncher(launchContext = {}, headless, configuration) {
    return new PlaywrightLauncher(headless == null
        ? launchContext
        : { ...launchContext, launchOptions: { ...launchContext.launchOptions, headless } }, configuration);
}
