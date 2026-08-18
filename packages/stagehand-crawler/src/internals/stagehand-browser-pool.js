"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stagehandBrowserPool = stagehandBrowserPool;
exports.remoteStagehandBrowserPool = remoteStagehandBrowserPool;
const stagehand_launcher_1 = require("./stagehand-launcher");
/**
 * Builds a {@apilink BrowserPool} of Stagehand browsers to pass to a {@apilink StagehandCrawler} as its
 * {@apilink BrowserCrawlerOptions.browserPool|`browserPool`}.
 *
 * It accepts every {@apilink BrowserPoolOptions|`BrowserPool` option} plus the crawler's own `launchContext`,
 * `stagehandOptions` and `headless`, and derives the browser plugin from them - so a pool built here always
 * matches the crawler it is given to, and configuring one never means assembling a {@apilink StagehandPlugin}
 * by hand.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new StagehandCrawler({
 *     browserPool: stagehandBrowserPool({
 *         maxOpenPagesPerBrowser: 1,
 *         stagehandOptions: { env: 'LOCAL', model: 'openai/gpt-4.1-mini' },
 *     }),
 *     requestHandler: async ({ page }) => { ... },
 * });
 * ```
 *
 * The returned pool is *not* torn down by the crawler, which is what makes it shareable between crawlers.
 *
 * @category Browser management
 */
function stagehandBrowserPool(options = {}) {
    const { launchContext, stagehandOptions, headless, configuration, ...poolOptions } = options;
    return stagehandLauncher(launchContext, stagehandOptions, headless, configuration).createBrowserPool(poolOptions);
}
/**
 * The {@apilink RemoteBrowserPool} counterpart of {@apilink stagehandBrowserPool}: connects to a remote browser
 * service with a Stagehand plugin derived from `launchContext` and `stagehandOptions`.
 *
 * A {@apilink StagehandCrawler} accepts the same connection details directly via
 * {@apilink BrowserCrawlerOptions.remoteBrowser|`remoteBrowser`}; reach for this factory when you also need to
 * tune the wrapping pool, or to share one remote pool between crawlers.
 *
 * @category Browser management
 */
function remoteStagehandBrowserPool(options) {
    const { launchContext, stagehandOptions, headless, configuration, ...remoteOptions } = options;
    return stagehandLauncher(launchContext, stagehandOptions, headless, configuration).createRemoteBrowserPool(remoteOptions);
}
function stagehandLauncher(launchContext = {}, stagehandOptions = {}, headless, configuration) {
    return new stagehand_launcher_1.StagehandLauncher({
        ...launchContext,
        stagehandOptions,
        ...(headless == null ? {} : { launchOptions: { ...launchContext.launchOptions, headless } }),
    }, configuration);
}
