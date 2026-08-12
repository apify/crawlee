import type { Configuration } from '@crawlee/browser';
import type {
    BrowserPool,
    BrowserPoolHooks,
    BrowserPoolOptions,
    RemoteBrowserPool,
    RemoteBrowserPoolOptions,
} from '@crawlee/browser-pool';
import type { Page } from 'playwright';

import type { StagehandOptions } from './stagehand-crawler';
import type { StagehandLaunchContext } from './stagehand-launcher';
import { StagehandLauncher } from './stagehand-launcher';
import type { StagehandPlugin } from './stagehand-plugin';

/** A {@apilink BrowserPool} of Stagehand browsers, as built by {@apilink stagehandBrowserPool}. */
export type StagehandBrowserPool = BrowserPool<{ browserPlugins: [StagehandPlugin] }, [StagehandPlugin]>;

export interface StagehandBrowserPoolOptions
    extends
        Omit<BrowserPoolOptions, 'browserPlugins'>,
        BrowserPoolHooks<
            ReturnType<StagehandPlugin['createController']>,
            ReturnType<StagehandPlugin['createLaunchContext']>,
            Page
        > {
    /** How to launch the browser: which Playwright browser type, proxy, user data dir, ... */
    launchContext?: StagehandLaunchContext;

    /** Stagehand configuration for the AI behavior and Browserbase integration. */
    stagehandOptions?: StagehandOptions;

    /**
     * Whether to run the browser in headless mode. Shorthand for `launchContext.launchOptions.headless`.
     * Defaults to `true`, and can also be set via {@apilink Configuration}.
     */
    headless?: boolean;

    /** Configuration to read the browser defaults from. Defaults to the global configuration. */
    configuration?: Configuration;
}

export interface RemoteStagehandBrowserPoolOptions
    extends
        Pick<StagehandBrowserPoolOptions, 'launchContext' | 'stagehandOptions' | 'headless' | 'configuration'>,
        Omit<RemoteBrowserPoolOptions, 'browserPlugins'> {}

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
export function stagehandBrowserPool(options: StagehandBrowserPoolOptions = {}): StagehandBrowserPool {
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
export function remoteStagehandBrowserPool(options: RemoteStagehandBrowserPoolOptions): RemoteBrowserPool<Page> {
    const { launchContext, stagehandOptions, headless, configuration, ...remoteOptions } = options;

    return stagehandLauncher(launchContext, stagehandOptions, headless, configuration).createRemoteBrowserPool<Page>(
        remoteOptions,
    );
}

function stagehandLauncher(
    launchContext: StagehandLaunchContext = {},
    stagehandOptions: StagehandOptions = {},
    headless?: boolean,
    configuration?: Configuration,
): StagehandLauncher {
    return new StagehandLauncher(
        {
            ...launchContext,
            stagehandOptions,
            ...(headless == null ? {} : { launchOptions: { ...launchContext.launchOptions, headless } }),
        },
        configuration,
    );
}
