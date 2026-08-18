"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StagehandLauncher = void 0;
const browser_1 = require("@crawlee/browser");
const internal_1 = require("@crawlee/utils/internal");
const zod_1 = require("zod");
const stagehand_plugin_1 = require("./stagehand-plugin");
/**
 * StagehandLauncher is based on BrowserLauncher and creates StagehandPlugin instances.
 * It manages the lifecycle of Stagehand browsers with fingerprinting and anti-blocking features.
 *
 * @ignore
 */
class StagehandLauncher extends browser_1.BrowserLauncher {
    configuration;
    /**
     * @internal
     */
    static optionsShape = {
        ...browser_1.BrowserLauncher.optionsShape,
        // Passthrough schemas — the launcher module object must keep its prototype through parsing.
        launcher: internal_1.schemas.anyObject.optional(),
        launchContextOptions: internal_1.schemas.anyObject.optional(),
        stagehandOptions: internal_1.schemas.anyObject.optional(),
    };
    /** @internal */
    static optionsSchema = zod_1.z.strictObject(StagehandLauncher.optionsShape);
    #stagehandOptions;
    /**
     * All StagehandLauncher parameters are passed via the launchContext object.
     */
    constructor(launchContext = {}, configuration = browser_1.Configuration.getGlobalConfiguration()) {
        const parsedContext = (0, internal_1.parseArgument)(launchContext, StagehandLauncher.optionsSchema, 'StagehandLaunchContext');
        const { launcher = browser_1.BrowserLauncher.requireLauncherOrThrow('playwright', 'apify/actor-node-playwright-*').chromium, stagehandOptions = {}, } = parsedContext;
        const { launchOptions = {}, ...rest } = parsedContext;
        // Call super first before initializing properties
        super({
            ...rest,
            launchOptions: {
                ...launchOptions,
                executablePath: getDefaultExecutablePath(parsedContext, configuration),
            },
            launcher,
        }, configuration);
        this.configuration = configuration;
        this.#stagehandOptions = {
            env: 'LOCAL',
            model: 'openai/gpt-4.1-mini',
            ...stagehandOptions,
        };
        this.Plugin = stagehand_plugin_1.StagehandPlugin;
    }
    /**
     * Creates a new StagehandPlugin instance with resolved options.
     */
    createBrowserPlugin() {
        return new stagehand_plugin_1.StagehandPlugin(this.launcher, {
            ...this.otherLaunchContextProps,
            proxyUrl: this.proxyUrl,
            launchOptions: this.createLaunchOptions(),
            stagehandOptions: this.#stagehandOptions, // Set AFTER to override any unresolved options
        });
    }
}
exports.StagehandLauncher = StagehandLauncher;
/**
 * Gets the default executable path for the browser.
 * @ignore
 */
function getDefaultExecutablePath(launchContext, configuration) {
    const pathFromPlaywrightImage = configuration.defaultBrowserPath;
    const { launchOptions = {} } = launchContext;
    if (launchOptions.executablePath) {
        return launchOptions.executablePath;
    }
    if (launchContext.useChrome) {
        return undefined;
    }
    if (pathFromPlaywrightImage) {
        return pathFromPlaywrightImage;
    }
    return undefined;
}
