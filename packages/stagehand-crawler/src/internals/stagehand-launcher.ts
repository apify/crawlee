import type { BrowserLaunchContext } from '@crawlee/browser';
import { BrowserLauncher, Configuration } from '@crawlee/browser';
import ow from 'ow';
import type { BrowserType, LaunchOptions } from 'playwright';

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
    protected static override optionsShape = {
        ...BrowserLauncher.optionsShape,
        launcher: ow.optional.object,
        launchContextOptions: ow.optional.object,
        stagehandOptions: ow.optional.object,
    };

    private readonly stagehandOptions: StagehandOptions;

    /**
     * All StagehandLauncher parameters are passed via the launchContext object.
     */
    constructor(
        launchContext: StagehandLaunchContext = {},
        override readonly config = Configuration.getGlobalConfig(),
    ) {
        ow(launchContext, 'StagehandLaunchContext', ow.object.exactShape(StagehandLauncher.optionsShape));

        const {
            launcher = BrowserLauncher.requireLauncherOrThrow<typeof import('playwright')>(
                'playwright',
                'apify/actor-node-playwright-*',
            ).chromium,
            stagehandOptions = {},
        } = launchContext;

        const { launchOptions = {}, ...rest } = launchContext;

        // Call super first before initializing properties
        super(
            {
                ...rest,
                launchOptions: {
                    ...launchOptions,
                    executablePath: getDefaultExecutablePath(launchContext, config),
                },
                launcher,
            },
            config,
        );

        // Apply defaults to Stagehand options (env and model are the main ones we customize)
        this.stagehandOptions = {
            env: 'LOCAL',
            model: 'openai/gpt-4o',
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
            stagehandOptions: this.stagehandOptions, // Set AFTER to override any unresolved options
        });
    }
}

/**
 * Gets the default executable path for the browser.
 * @ignore
 */
function getDefaultExecutablePath(launchContext: StagehandLaunchContext, config: Configuration): string | undefined {
    const pathFromPlaywrightImage = config.get('defaultBrowserPath');
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
