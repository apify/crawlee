import type { Configuration, CrawlerRemoteBrowserOptions } from '@crawlee/browser';
import type { BrowserPool, BrowserPoolHooks, BrowserPoolOptions, PlaywrightPlugin } from '@crawlee/browser-pool';
import type { Page } from 'playwright';

import type { PlaywrightLaunchContext } from './playwright-launcher.js';
import { PlaywrightLauncher } from './playwright-launcher.js';

/** {@apilink BrowserCrawlerOptions.remoteBrowser|`remoteBrowser`} for Playwright, with the protocol to connect over. */
export interface PlaywrightRemoteBrowserOptions extends CrawlerRemoteBrowserOptions {
    /**
     * `'cdp'` uses `connectOverCDP()` (the default), `'playwright'` uses `connect()` (Playwright's own WebSocket
     * protocol, for endpoints started with `launchServer()`).
     */
    protocol?: 'cdp' | 'playwright';
}

/** A {@apilink BrowserPool} of Playwright browsers, as built by {@apilink playwrightBrowserPool}. */
export type PlaywrightBrowserPool = BrowserPool<{ browserPlugins: [PlaywrightPlugin] }, [PlaywrightPlugin]>;

export interface PlaywrightBrowserPoolOptions
    extends
        Omit<BrowserPoolOptions, 'browserPlugins'>,
        BrowserPoolHooks<
            ReturnType<PlaywrightPlugin['createController']>,
            ReturnType<PlaywrightPlugin['createLaunchContext']>,
            Page
        > {
    /** How to launch the browser: which Playwright browser type, proxy, user data dir, ... */
    launchContext?: PlaywrightLaunchContext;

    /**
     * Whether to run the browser in headless mode. Shorthand for `launchContext.launchOptions.headless`.
     * Defaults to `true`, and can also be set via {@apilink Configuration}.
     */
    headless?: boolean;

    /** Configuration to read the browser defaults from. Defaults to the global configuration. */
    configuration?: Configuration;

    /** Connect to a remote browser service instead of launching locally; see {@apilink BrowserCrawlerOptions.remoteBrowser}. */
    remoteBrowser?: PlaywrightRemoteBrowserOptions;
}

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
export function playwrightBrowserPool(options: PlaywrightBrowserPoolOptions = {}): PlaywrightBrowserPool {
    const { launchContext, headless, configuration, ...poolOptions } = options;

    return playwrightLauncher(launchContext, headless, configuration).createBrowserPool(poolOptions);
}

function playwrightLauncher(
    launchContext: PlaywrightLaunchContext = {},
    headless?: boolean,
    configuration?: Configuration,
): PlaywrightLauncher {
    return new PlaywrightLauncher(
        headless == null
            ? launchContext
            : { ...launchContext, launchOptions: { ...launchContext.launchOptions, headless } },
        configuration,
    );
}
