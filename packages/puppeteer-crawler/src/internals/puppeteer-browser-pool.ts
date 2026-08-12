import type { Configuration } from '@crawlee/browser';
import type {
    BrowserPool,
    BrowserPoolHooks,
    BrowserPoolOptions,
    PuppeteerPlugin,
    RemoteBrowserPool,
    RemoteBrowserPoolOptions,
} from '@crawlee/browser-pool';
// @ts-ignore This only throws when compiled against puppeteer 25+ (ESM only), we only import types, so its alllll gooooood
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
}

export interface RemotePuppeteerBrowserPoolOptions
    extends
        Pick<PuppeteerBrowserPoolOptions, 'launchContext' | 'headless' | 'configuration'>,
        Omit<RemoteBrowserPoolOptions, 'browserPlugins'> {}

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
export function remotePuppeteerBrowserPool(options: RemotePuppeteerBrowserPoolOptions): RemoteBrowserPool<Page> {
    const { launchContext, headless, configuration, ...remoteOptions } = options;

    return puppeteerLauncher(launchContext, headless, configuration).createRemoteBrowserPool<Page>(remoteOptions);
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
