import type { BrowserController, BrowserPluginOptions, LaunchContext } from '@crawlee/browser-pool';
import { BrowserPlugin } from '@crawlee/browser-pool';
import type { Browser as PlaywrightBrowser, BrowserType, LaunchOptions } from 'playwright';
// Stagehand is built on CDP (Chrome DevTools Protocol), which only works with Chromium-based browsers.
// Firefox and WebKit are not supported by Stagehand.
import { chromium } from 'playwright';

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

            // Stagehand manages its own browser instance. We connect to it via CDP to get a Playwright Browser handle.
            // Note: CDP only works with Chromium, so Firefox/WebKit are not supported.
            const cdpUrl = stagehand.connectURL();

            if (!cdpUrl) {
                throw new Error('Failed to get CDP URL from Stagehand');
            }

            const browser = await chromium.connectOverCDP(cdpUrl);

            // Store the Stagehand instance so the controller can access it
            this.stagehandInstances.set(browser, stagehand);

            return browser;
        } catch (error) {
            // Clean up on failure
            await stagehand.close().catch(() => {});

            // Augment the error with helpful context
            const augmentedError = this._augmentLaunchError(error, launchContext);

            // Log the error to make it visible since BrowserPool might swallow it
            console.error('❌ Stagehand browser launch failed:', augmentedError.message);

            throw augmentedError;
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
     * Augments launch errors with helpful context and Stagehand-specific guidance.
     */
    private _augmentLaunchError(error: unknown, launchContext: LaunchContext<BrowserType>): Error {
        const message = error instanceof Error ? error.message : String(error);
        const model = this.stagehandOptions.model ?? 'openai/gpt-4o';
        const env = this.stagehandOptions.env ?? 'LOCAL';

        let helpText = '';

        // Add model-specific help if error might be API key related
        if (typeof model === 'string') {
            const modelStr = model.toLowerCase();
            if (modelStr.startsWith('openai/')) {
                helpText += '\nNote: OpenAI models require OPENAI_API_KEY environment variable.';
                helpText += '\nExample: export OPENAI_API_KEY="sk-..."';
            } else if (modelStr.startsWith('anthropic/')) {
                helpText += '\nNote: Anthropic models require ANTHROPIC_API_KEY environment variable.';
                helpText += '\nExample: export ANTHROPIC_API_KEY="sk-ant-..."';
            } else if (modelStr.startsWith('google/')) {
                helpText += '\nNote: Google models require GOOGLE_API_KEY environment variable.';
            }
        }

        return new Error(
            `Stagehand browser launch failed: ${message}\n` +
                `Executable path: ${launchContext.launchOptions?.executablePath ?? 'default'}\n` +
                `Environment: ${env}\n` +
                `Model: ${model}${helpText}`,
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
