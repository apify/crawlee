import type { BrowserLaunchContext } from '@crawlee/browser';
import { BrowserLauncher, Configuration } from '@crawlee/browser';
import ow from 'ow';
import type { BrowserType, LaunchOptions } from 'playwright';

import type { LightpandaConfig } from './lightpanda-plugin';
import { LightpandaPlugin } from './lightpanda-plugin';

/**
 * `LightpandaLaunchContext` holds all options passed when launching Lightpanda via
 * `LightpandaLauncher`. Most `BrowserLaunchContext` fields inherited from Playwright
 * are not applicable to Lightpanda and will be silently ignored.
 */
export interface LightpandaLaunchContext extends BrowserLaunchContext<LaunchOptions, BrowserType> {
    /**
     * Playwright launch options.
     * When using Lightpanda, most Playwright launch options (e.g. `headless`, `args`) are
     * not applicable because Lightpanda manages its own process. The `launchOptions` field
     * is primarily provided for API compatibility.
     */
    launchOptions?: Partial<LaunchOptions>;

    /**
     * URL to an HTTP proxy server. It must define the port number,
     * and it may also contain proxy username and password.
     *
     * This proxy URL is passed as `--http_proxy` to the Lightpanda process.
     *
     * @example
     * `http://bob:pass123@proxy.example.com:1234`
     */
    proxyUrl?: string;

    /**
     * Controls the Lightpanda process and CDP server configuration.
     */
    lightpandaConfig?: LightpandaConfig;

    /**
     * By default this function uses `require("playwright").chromium` exclusively for the
     * `connectOverCDP` call. You do not typically need to change this.
     */
    launcher?: BrowserType;
}

/**
 * `LightpandaLauncher` creates and manages `LightpandaPlugin` instances for use inside
 * Crawlee's `BrowserPool`. It resolvs the `playwright.chromium` launcher (for `connectOverCDP`)
 * and passes `lightpandaConfig` down to the plugin.
 *
 * @ignore
 */
export class LightpandaLauncher extends BrowserLauncher<LightpandaPlugin> {
    protected static override optionsShape = {
        ...BrowserLauncher.optionsShape,
        launcher: ow.optional.object,
        lightpandaConfig: ow.optional.object,
    };

    private readonly lightpandaConfig: LightpandaConfig;

    /**
     * All `LightpandaLauncher` parameters are passed via the `launchContext` object.
     */
    constructor(
        launchContext: LightpandaLaunchContext = {},
        override readonly config = Configuration.getGlobalConfig(),
    ) {
        ow(launchContext, 'LightpandaLaunchContext', ow.object.exactShape(LightpandaLauncher.optionsShape));

        const {
            launcher = BrowserLauncher.requireLauncherOrThrow<typeof import('playwright')>(
                'playwright',
                'apify/actor-node-playwright-*',
            ).chromium,
            lightpandaConfig = {},
        } = launchContext;

        const { launchOptions = {}, ...rest } = launchContext;

        super(
            {
                ...rest,
                launchOptions,
                launcher,
            },
            config,
        );

        this.lightpandaConfig = lightpandaConfig;
        this.Plugin = LightpandaPlugin;
    }

    /**
     * Creates a new `LightpandaPlugin` instance with the resolved configuration.
     */
    override createBrowserPlugin(): LightpandaPlugin {
        return new LightpandaPlugin(this.launcher as BrowserType, {
            ...this.otherLaunchContextProps,
            proxyUrl: this.proxyUrl,
            launchOptions: this.createLaunchOptions() as Partial<LaunchOptions>,
            lightpandaConfig: this.lightpandaConfig,
        });
    }
}

/**
 * Launches a Lightpanda browser and returns the Playwright `Browser` object connected via CDP.
 *
 * @example
 * ```js
 * const browser = await launchLightpanda({ lightpandaConfig: { port: 9222 } });
 * const page = await browser.newPage();
 * await page.goto('https://example.com');
 * await browser.close();
 * ```
 */
export async function launchLightpanda(launchContext: LightpandaLaunchContext = {}): Promise<unknown> {
    const launcher = new LightpandaLauncher(launchContext);
    return launcher.launch();
}
