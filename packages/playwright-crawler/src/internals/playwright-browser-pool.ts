import type { Configuration } from '@crawlee/browser';
import type {
    BrowserPool,
    BrowserPoolHooks,
    BrowserPoolOptions,
    PlaywrightPlugin,
    RemoteBrowserPool,
    RemoteBrowserPoolOptions,
} from '@crawlee/browser-pool';
import type { Page } from 'playwright';

import type { PlaywrightLaunchContext } from './playwright-launcher.js';
import { PlaywrightLauncher } from './playwright-launcher.js';

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
}

export interface RemotePlaywrightBrowserPoolOptions
    extends
        Pick<PlaywrightBrowserPoolOptions, 'launchContext' | 'headless' | 'configuration'>,
        Omit<RemoteBrowserPoolOptions, 'browserPlugins'> {}

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
export function remotePlaywrightBrowserPool(options: RemotePlaywrightBrowserPoolOptions): RemoteBrowserPool<Page> {
    const { launchContext, headless, configuration, ...remoteOptions } = options;

    return playwrightLauncher(launchContext, headless, configuration).createRemoteBrowserPool<Page>(remoteOptions);
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
