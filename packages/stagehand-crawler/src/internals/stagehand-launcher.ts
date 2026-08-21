import type { BrowserLaunchContext } from '@crawlee/browser';
import { BrowserLauncher, Configuration } from '@crawlee/browser';
import { parseArgument, schemas } from '@crawlee/utils/internal';
import type { BrowserType, LaunchOptions } from 'playwright';
import { z } from 'zod';

import type { StagehandOptions } from './stagehand-crawler';
import { StagehandPlugin } from './stagehand-plugin';

/**
 * Launch context for Stagehand crawler with AI-specific options.
 */
export interface StagehandLaunchContext extends BrowserLaunchContext<LaunchOptions, BrowserType> {
    /**
     * Playwright launch options.
     * These will be passed to Stagehand's localBrowserLaunchOptions after fingerprinting is applied.
     */
    launchOptions?: LaunchOptions & Parameters<BrowserType['launchPersistentContext']>[1];

    /**
     * Stagehand-specific configuration for AI operations.
     */
    stagehandOptions?: StagehandOptions;

    /**
     * URL to a HTTP proxy server. It must define the port number,
     * and it may also contain proxy username and password.
     *
     * Example: `http://bob:pass123@proxy.example.com:1234`.
     */
    proxyUrl?: string;

    /**
     * If `true` and `executablePath` is not set,
     * Playwright will launch full Google Chrome browser available on the machine
     * rather than the bundled Chromium.
     * @default false
     */
    useChrome?: boolean;

    /**
     * With this option selected, all pages will be opened in a new incognito browser context.
     * @default false
     */
    useIncognitoPages?: boolean;

    /**
     * Sets the User Data Directory path.
     * The user data directory contains profile data such as history, bookmarks, and cookies.
     */
    userDataDir?: string;

    /**
     * By default this function uses `require("playwright").chromium`.
     * If you want to use a different browser you can pass it by this property.
     */
    launcher?: BrowserType;
}

/**
 * StagehandLauncher is based on BrowserLauncher and creates StagehandPlugin instances.
 * It manages the lifecycle of Stagehand browsers with fingerprinting and anti-blocking features.
 *
 * @ignore
 */
export class StagehandLauncher extends BrowserLauncher<StagehandPlugin> {
    /**
     * @internal
     */
    protected static override optionsShape = {
        ...BrowserLauncher.optionsShape,
        // Passthrough schemas — the launcher module object must keep its prototype through parsing.
        launcher: schemas.anyObject.optional(),
        launchContextOptions: schemas.anyObject.optional(),
        stagehandOptions: schemas.anyObject.optional(),
    };

    /** @internal */
    protected static override optionsSchema = z.strictObject(StagehandLauncher.optionsShape);

    readonly #stagehandOptions: StagehandOptions;

    /**
     * All StagehandLauncher parameters are passed via the launchContext object.
     */
    constructor(
        launchContext: StagehandLaunchContext = {},
        override readonly configuration = Configuration.getGlobalConfiguration(),
    ) {
        const parsedContext = parseArgument(launchContext, StagehandLauncher.optionsSchema, 'StagehandLaunchContext');

        const {
            launcher = BrowserLauncher.requireLauncherOrThrow<typeof import('playwright')>(
                'playwright',
                'apify/actor-node-playwright-*',
            ).chromium,
            stagehandOptions = {},
        } = parsedContext;

        const { launchOptions = {}, ...rest } = parsedContext;

        // Call super first before initializing properties
        super(
            {
                ...rest,
                launchOptions: {
                    ...launchOptions,
                    executablePath: getDefaultExecutablePath(parsedContext, configuration),
                },
                launcher,
            },
            configuration,
        );

        this.#stagehandOptions = {
            env: 'LOCAL',
            model: 'openai/gpt-4.1-mini',
            ...stagehandOptions,
        };

        this.Plugin = StagehandPlugin;
    }

    /**
     * Creates a new StagehandPlugin instance with resolved options.
     */
    override createBrowserPlugin(): StagehandPlugin {
        return new StagehandPlugin(this.launcher as BrowserType, {
            ...this.otherLaunchContextProps,
            proxyUrl: this.proxyUrl,
            launchOptions: this.createLaunchOptions(),
            stagehandOptions: this.#stagehandOptions, // Set AFTER to override any unresolved options
        });
    }
}

/**
 * Gets the default executable path for the browser.
 * @ignore
 */
function getDefaultExecutablePath(
    launchContext: StagehandLaunchContext,
    configuration: Configuration,
): string | undefined {
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
