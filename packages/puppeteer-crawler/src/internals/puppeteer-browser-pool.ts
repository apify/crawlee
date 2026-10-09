import type { Configuration, CrawlerRemoteBrowserOptions } from '@crawlee/browser';
import type { BrowserPool, BrowserPoolHooks, BrowserPoolOptions, PuppeteerPlugin } from '@crawlee/browser-pool';
import type { Page } from 'puppeteer';

import type { PuppeteerLaunchContext } from './puppeteer-launcher.js';
import { PuppeteerLauncher } from './puppeteer-launcher.js';

/** A {@apilink BrowserPool} of Puppeteer browsers, as built by {@apilink puppeteerBrowserPool}. */
export type PuppeteerBrowserPool = BrowserPool<{ browserPlugins: [PuppeteerPlugin] }, [PuppeteerPlugin]>;

export interface PuppeteerBrowserPoolOptions
    extends
        Omit<BrowserPoolOptions, 'browserPlugins'>,
        BrowserPoolHooks<
            ReturnType<PuppeteerPlugin['createController']>,
            ReturnType<PuppeteerPlugin['createLaunchContext']>,
            Page
        > {
    /** How to launch the browser: proxy, user data dir, whether to use full Chrome, ... */
    launchContext?: PuppeteerLaunchContext;

    /**
     * Whether to run the browser in headless mode. Shorthand for `launchContext.launchOptions.headless`.
     * Defaults to `true`, and can also be set via {@apilink Configuration}.
     */
    headless?: boolean | 'new' | 'old';

    /** Configuration to read the browser defaults from. Defaults to the global configuration. */
    configuration?: Configuration;

    /** Connect to a remote browser service instead of launching locally; see {@apilink BrowserCrawlerOptions.remoteBrowser}. */
    remoteBrowser?: CrawlerRemoteBrowserOptions;
}

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
export function puppeteerBrowserPool(options: PuppeteerBrowserPoolOptions = {}): PuppeteerBrowserPool {
    const { launchContext, headless, configuration, ...poolOptions } = options;

    return puppeteerLauncher(launchContext, headless, configuration).createBrowserPool(poolOptions);
}

function puppeteerLauncher(
    launchContext: PuppeteerLaunchContext = {},
    headless?: boolean | 'new' | 'old',
    configuration?: Configuration,
): PuppeteerLauncher {
    return new PuppeteerLauncher(
        headless == null
            ? launchContext
            : {
                  ...launchContext,
                  launchOptions: { ...launchContext.launchOptions, headless: headless as boolean },
              },
        configuration,
    );
}
