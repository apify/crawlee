import type { Stagehand, V3Options } from '@browserbasehq/stagehand';
import type { BrowserController, BrowserPluginOptions, LaunchContext } from '@crawlee/browser-pool';
import { anonymizeProxySugar, BrowserPlugin } from '@crawlee/browser-pool';
import type { Browser as PlaywrightBrowser, BrowserType, LaunchOptions } from 'playwright';
// Stagehand is built on CDP (Chrome DevTools Protocol), which only works with Chromium-based browsers.
// Firefox and WebKit are not supported by Stagehand.
import { chromium } from 'playwright';

import log from '@apify/log';

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
 *
 * Architecture:
 * - Stagehand launches and manages the browser
 * - We connect Playwright to the same browser via CDP to get a compatible handle
 * - AI operations (extract, act, observe) pass the specific page via the `page` option
 *   for correct concurrent page support
 *
 * Limitations:
 * - Only Chromium is supported (Stagehand uses CDP)
 * - Some fingerprinting options may not be fully applied (Stagehand controls browser launch)
 *
 * @ignore
 */
export class StagehandPlugin extends BrowserPlugin<BrowserType, LaunchOptions, PlaywrightBrowser> {
    readonly stagehandOptions: StagehandOptions;
    private readonly stagehandInstances: WeakMap<PlaywrightBrowser, Stagehand> = new WeakMap();

    constructor(library: BrowserType, options: StagehandPluginOptions = {}) {
        super(library, options);
        this.stagehandOptions = options.stagehandOptions ?? {};
    }

    /**
     * Launches a browser using Stagehand and connects Playwright to it via CDP.
     */
    protected async _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser> {
        const { launchOptions = {}, proxyUrl } = launchContext;

        // Import Stagehand dynamically to avoid peer dependency issues
        const { Stagehand } = await import('@browserbasehq/stagehand');

        // Build model configuration - explicit modelApiKey takes precedence over env vars
        let modelConfig = this.stagehandOptions.model;
        if (this.stagehandOptions.modelApiKey) {
            const modelName =
                typeof modelConfig === 'string' ? modelConfig : (modelConfig?.modelName ?? 'openai/gpt-4o');

            // Always use modelApiKey when explicitly provided (takes precedence over env vars)
            modelConfig = {
                ...(typeof modelConfig === 'object' ? modelConfig : {}),
                modelName,
                apiKey: this.stagehandOptions.modelApiKey,
            } as any;
        }
        // If modelApiKey is not provided, Stagehand's dependencies will read from env vars automatically

        // Use anonymizeProxy to handle proxy authentication transparently
        // This creates a local proxy server that handles auth, avoiding CDP complexity
        const [anonymizedProxyUrl, closeAnonymizedProxy] = await anonymizeProxySugar(proxyUrl);

        // Build Stagehand configuration
        const stagehandConfig: V3Options = {
            env: this.stagehandOptions.env ?? 'LOCAL',
            model: modelConfig,
            verbose: this.stagehandOptions.verbose,
            selfHeal: this.stagehandOptions.selfHeal,
            domSettleTimeout: this.stagehandOptions.domSettleTimeout,
            llmClient: this.stagehandOptions.llmClient,
            systemPrompt: this.stagehandOptions.systemPrompt,
            logInferenceToFile: this.stagehandOptions.logInferenceToFile,
            cacheDir: this.stagehandOptions.cacheDir,
        };

        // For LOCAL environment, pass launch options
        if (this.stagehandOptions.env === 'LOCAL' || !this.stagehandOptions.env) {
            // Use anonymized proxy URL if available (handles auth transparently)
            const proxyConfig = anonymizedProxyUrl ? { server: anonymizedProxyUrl } : launchOptions.proxy;

            stagehandConfig.localBrowserLaunchOptions = {
                headless: launchOptions.headless,
                args: launchOptions.args,
                executablePath: launchOptions.executablePath,
                proxy: proxyConfig,
                // Pass fingerprinted viewport if available
                viewport: (launchOptions as Record<string, unknown>).viewport as { width: number; height: number },
            };
        }

        // For BROWSERBASE environment, pass API credentials
        if (this.stagehandOptions.env === 'BROWSERBASE') {
            stagehandConfig.apiKey = this.stagehandOptions.apiKey;
            stagehandConfig.projectId = this.stagehandOptions.projectId;
        }

        const stagehand = new Stagehand(stagehandConfig);

        try {
            // Initialize Stagehand (launches browser)
            await stagehand.init();

            // Get CDP URL and connect Playwright to the same browser
            const cdpUrl = stagehand.connectURL();
            if (!cdpUrl) {
                throw new Error('Failed to get CDP URL from Stagehand');
            }

            const browser = await chromium.connectOverCDP(cdpUrl);

            // Store the Stagehand instance for AI operations
            this.stagehandInstances.set(browser, stagehand);

            // Handle browser disconnection - cleanup both Stagehand and anonymized proxy
            browser.on('disconnected', async () => {
                await this._cleanupStagehand(browser);
                await closeAnonymizedProxy();
            });

            return browser;
        } catch (error) {
            // Clean up on failure
            await stagehand.close().catch(() => {});
            await closeAnonymizedProxy();

            const augmentedError = this._augmentLaunchError(error, launchContext);
            log.error('Stagehand browser launch failed', { message: augmentedError.message });
            throw augmentedError;
        }
    }

    /**
     * Cleans up Stagehand instance when browser disconnects.
     */
    private async _cleanupStagehand(browser: PlaywrightBrowser): Promise<void> {
        const stagehand = this.stagehandInstances.get(browser);
        if (stagehand) {
            try {
                await stagehand.close();
            } catch {
                // Ignore cleanup errors
            }
            this.stagehandInstances.delete(browser);
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
        const model = this.stagehandOptions.model ?? 'openai/gpt-4o';

        let helpText = '';

        if (typeof model === 'string') {
            const modelStr = model.toLowerCase();
            if (modelStr.startsWith('openai/')) {
                helpText += '\nNote: OpenAI models require OPENAI_API_KEY environment variable.';
            } else if (modelStr.startsWith('anthropic/')) {
                helpText += '\nNote: Anthropic models require ANTHROPIC_API_KEY environment variable.';
            } else if (modelStr.startsWith('google/')) {
                helpText += '\nNote: Google models require GOOGLE_API_KEY environment variable.';
            }
        }

        return new Error(
            `Stagehand browser launch failed: ${message}\n` +
                `Executable path: ${launchContext.launchOptions?.executablePath ?? 'default'}\n` +
                `Model: ${model}${helpText}`,
            { cause: error },
        );
    }

    /**
     * Gets the Stagehand instance for a given browser.
     */
    getStagehandForBrowser(browser: PlaywrightBrowser): Stagehand | undefined {
        return this.stagehandInstances.get(browser);
    }
}
