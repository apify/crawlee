import type { BrowserController, BrowserPluginOptions, LaunchContext } from '@crawlee/browser-pool';
import { BrowserPlugin } from '@crawlee/browser-pool';
import type { Browser as PlaywrightBrowser, BrowserType, LaunchOptions } from 'playwright';

import { StagehandController } from './stagehand-controller';
import type { StagehandOptions } from './stagehand-crawler';

/**
 * Options for StagehandPlugin initialization.
 */
export interface StagehandPluginOptions extends BrowserPluginOptions<LaunchOptions> {
    /**
     * Stagehand-specific configuration options.
     */
    stagehandOptions?: StagehandOptions;
}

/**
 * StagehandPlugin integrates Stagehand with Crawlee's BrowserPool.
 * It manages the browser lifecycle and passes fingerprinted launch options to Stagehand.
 *
 * @ignore
 */
export class StagehandPlugin extends BrowserPlugin<BrowserType, LaunchOptions, PlaywrightBrowser> {
    private readonly stagehandOptions: StagehandOptions;
    private readonly stagehandInstances: WeakMap<PlaywrightBrowser, any> = new WeakMap();

    constructor(library: BrowserType, options: StagehandPluginOptions = {}) {
        super(library, options);
        this.stagehandOptions = options.stagehandOptions ?? {};
    }

    /**
     * Launches a browser using Stagehand with fingerprinted options from BrowserPool.
     */
    protected async _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser> {
        const { launchOptions = {}, proxyUrl } = launchContext;

        // Import Stagehand dynamically to avoid peer dependency issues
        const { Stagehand } = await import('@browserbasehq/stagehand');

        // Map Playwright launch options to Stagehand's localBrowserLaunchOptions
        // The launchOptions at this point already include fingerprinted values (user agent, viewport, args)
        const stagehandConfig: any = {
            env: this.stagehandOptions.env ?? 'LOCAL',
            model: this.stagehandOptions.model,
            verbose: this.stagehandOptions.verbose,
            selfHeal: this.stagehandOptions.selfHeal,
            domSettleTimeout: this.stagehandOptions.domSettleTimeout,
            llmClient: this.stagehandOptions.llmClient,
            systemPrompt: this.stagehandOptions.systemPrompt,
            logInferenceToFile: this.stagehandOptions.logInferenceToFile,
            cacheDir: this.stagehandOptions.cacheDir,
        };

        // For LOCAL environment, pass fingerprinted launch options
        if (this.stagehandOptions.env === 'LOCAL' || !this.stagehandOptions.env) {
            stagehandConfig.localBrowserLaunchOptions = {
                headless: launchOptions.headless,
                args: launchOptions.args,
                executablePath: launchOptions.executablePath,
                // Pass proxy configuration
                proxy: launchOptions.proxy,
            };

            // Include fingerprinted user agent and viewport if available
            // Note: These might be applied at context level by Stagehand
            if ((launchOptions as any).userAgent) {
                stagehandConfig.localBrowserLaunchOptions.userAgent = (launchOptions as any).userAgent;
            }
            if ((launchOptions as any).viewport) {
                stagehandConfig.localBrowserLaunchOptions.viewport = (launchOptions as any).viewport;
            }
        }

        // For BROWSERBASE environment, pass API credentials
        if (this.stagehandOptions.env === 'BROWSERBASE') {
            stagehandConfig.apiKey = this.stagehandOptions.apiKey;
            stagehandConfig.projectId = this.stagehandOptions.projectId;
            stagehandConfig.browserbaseSessionCreateParams = {
                // Pass proxy if provided
                ...(proxyUrl ? { proxies: [{ type: 'http', server: proxyUrl }] } : {}),
            };
        }

        // Create Stagehand instance
        const stagehand = new Stagehand(stagehandConfig);

        try {
            // Initialize Stagehand (launches browser)
            await stagehand.init();

            // In Stagehand v3, we need to connect to the CDP endpoint to get the Playwright browser
            // Get the CDP WebSocket URL
            const cdpUrl = stagehand.connectURL();

            if (!cdpUrl) {
                throw new Error('Failed to get CDP URL from Stagehand');
            }

            // Connect Playwright to the CDP endpoint
            const playwright = await import('playwright');
            const browser = await playwright.chromium.connectOverCDP(cdpUrl);

            // Store the Stagehand instance so the controller can access it
            this.stagehandInstances.set(browser, stagehand);

            return browser;
        } catch (error) {
            // Clean up on failure
            await stagehand.close().catch(() => {});
            throw this._augmentLaunchError(error, launchContext);
        }
    }

    /**
     * Creates a controller for the Stagehand browser.
     */
    protected _createController(): BrowserController<BrowserType, LaunchOptions, PlaywrightBrowser> {
        return new StagehandController(this, this.stagehandInstances) as any;
    }

    /**
     * Adds proxy configuration to launch options.
     */
    protected async _addProxyToLaunchOptions(launchContext: LaunchContext<BrowserType>): Promise<void> {
        launchContext.launchOptions ??= {};

        const { launchOptions, proxyUrl } = launchContext;

        if (proxyUrl) {
            const url = new URL(proxyUrl);

            launchOptions.proxy = {
                server: url.origin,
                username: decodeURIComponent(url.username),
                password: decodeURIComponent(url.password),
            };
        }
    }

    /**
     * Determines if this is a Chromium-based browser.
     */
    protected _isChromiumBasedBrowser(): boolean {
        const name = this.library?.name?.();
        return name === 'chromium';
    }

    /**
     * Augments launch errors with helpful context.
     */
    private _augmentLaunchError(error: unknown, launchContext: LaunchContext<BrowserType>): Error {
        const message = error instanceof Error ? error.message : String(error);

        return new Error(
            `Stagehand browser launch failed: ${message}\n` +
                `Executable path: ${launchContext.launchOptions?.executablePath ?? 'default'}\n` +
                `Environment: ${this.stagehandOptions.env ?? 'LOCAL'}\n` +
                `Tip: Make sure Stagehand and Playwright are properly installed.\n` +
                `Try running: npm install @browserbase/stagehand playwright`,
            { cause: error },
        );
    }

    /**
     * Gets the Stagehand instance for a given browser.
     */
    getStagehandForBrowser(browser: PlaywrightBrowser): any {
        return this.stagehandInstances.get(browser);
    }
}
