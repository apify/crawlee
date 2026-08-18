"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StagehandPlugin = void 0;
const browser_pool_1 = require("@crawlee/browser-pool");
const core_1 = require("@crawlee/core");
// Stagehand is built on CDP (Chrome DevTools Protocol), which only works with Chromium-based browsers.
// Firefox and WebKit are not supported by Stagehand.
const playwright_1 = require("playwright");
const stagehand_controller_1 = require("./stagehand-controller");
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
 */
class StagehandPlugin extends browser_pool_1.BrowserPlugin {
    stagehandOptions;
    #stagehandInstances = new WeakMap();
    constructor(library, options = {}) {
        super(library, options);
        this.stagehandOptions = options.stagehandOptions ?? {};
    }
    /**
     * Launches a browser using Stagehand and connects Playwright to it via CDP.
     */
    async _launch(launchContext) {
        const { launchOptions = {}, proxyUrl } = launchContext;
        // Import Stagehand dynamically to avoid peer dependency issues
        const { Stagehand } = await import('@browserbasehq/stagehand');
        const isLocal = this.stagehandOptions.env === 'LOCAL' || !this.stagehandOptions.env;
        // Use anonymizeProxy to handle proxy authentication transparently
        const [anonymizedProxyUrl, closeAnonymizedProxy] = await (0, browser_pool_1.anonymizeProxySugar)(proxyUrl, undefined, undefined, {
            ignoreProxyCertificate: launchContext.ignoreProxyCertificate,
        });
        // Build model configuration
        // For LOCAL env, we merge apiKey into the model config since Stagehand expects it there
        let modelConfig = this.stagehandOptions.model;
        if (isLocal && this.stagehandOptions.apiKey) {
            const modelName = typeof modelConfig === 'string' ? modelConfig : modelConfig?.modelName;
            modelConfig = {
                ...(typeof modelConfig === 'object' ? modelConfig : {}),
                ...(modelName ? { modelName } : {}),
                apiKey: this.stagehandOptions.apiKey,
            };
        }
        // Build Stagehand configuration by spreading our options and adding launch options
        const stagehandConfig = {
            ...this.stagehandOptions,
            env: this.stagehandOptions.env ?? 'LOCAL',
            model: modelConfig,
            localBrowserLaunchOptions: isLocal
                ? {
                    headless: launchOptions.headless,
                    args: launchOptions.args,
                    executablePath: launchOptions.executablePath,
                    proxy: anonymizedProxyUrl ? { server: anonymizedProxyUrl } : launchOptions.proxy,
                    viewport: launchOptions.viewport,
                }
                : undefined,
        };
        const stagehand = new Stagehand(stagehandConfig);
        try {
            // Initialize Stagehand (launches browser)
            await stagehand.init();
            // Get CDP URL and connect Playwright to the same browser
            const cdpUrl = stagehand.connectURL();
            if (!cdpUrl) {
                throw new Error('Failed to get CDP URL from Stagehand');
            }
            const browser = await playwright_1.chromium.connectOverCDP(cdpUrl);
            // Store the Stagehand instance for AI operations
            this.#stagehandInstances.set(browser, stagehand);
            // Handle browser disconnection - cleanup both Stagehand and anonymized proxy
            browser.on('disconnected', async () => {
                await this.cleanupStagehand(browser);
                await closeAnonymizedProxy();
            });
            return browser;
        }
        catch (error) {
            // Clean up on failure
            await stagehand.close().catch(() => { });
            await closeAnonymizedProxy();
            const augmentedError = this.augmentLaunchError(error, launchContext);
            core_1.serviceLocator.getLogger().error('Stagehand browser launch failed', { message: augmentedError.message });
            throw augmentedError;
        }
    }
    /**
     * Cleans up Stagehand instance when browser disconnects.
     */
    async cleanupStagehand(browser) {
        const stagehand = this.#stagehandInstances.get(browser);
        if (stagehand) {
            try {
                await stagehand.close();
            }
            catch {
                // Ignore cleanup errors
            }
            this.#stagehandInstances.delete(browser);
        }
    }
    /**
     * Creates a controller for the Stagehand browser.
     */
    createController() {
        return new stagehand_controller_1.StagehandController(this, this.#stagehandInstances);
    }
    /**
     * Adds proxy configuration to launch options.
     */
    async addProxyToLaunchOptions(launchContext) {
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
    isChromiumBasedBrowser() {
        const name = this.library?.name?.();
        return name === 'chromium';
    }
    /**
     * Augments launch errors with helpful context.
     */
    augmentLaunchError(error, launchContext) {
        const message = error instanceof Error ? error.message : String(error);
        const model = this.stagehandOptions.model;
        let helpText = '';
        if (typeof model === 'string') {
            const modelStr = model.toLowerCase();
            if (modelStr.startsWith('openai/')) {
                helpText += '\nNote: OpenAI models require apiKey option or OPENAI_API_KEY environment variable.';
            }
            else if (modelStr.startsWith('anthropic/')) {
                helpText += '\nNote: Anthropic models require apiKey option or ANTHROPIC_API_KEY environment variable.';
            }
            else if (modelStr.startsWith('google/')) {
                helpText += '\nNote: Google models require apiKey option or GOOGLE_API_KEY environment variable.';
            }
        }
        return new Error(`Stagehand browser launch failed: ${message}\n` +
            `Executable path: ${launchContext.launchOptions?.executablePath ?? 'default'}\n` +
            `Model: ${model}${helpText}`, { cause: error });
    }
    /**
     * Gets the Stagehand instance for a given browser.
     */
    getStagehandForBrowser(browser) {
        return this.#stagehandInstances.get(browser);
    }
}
exports.StagehandPlugin = StagehandPlugin;
