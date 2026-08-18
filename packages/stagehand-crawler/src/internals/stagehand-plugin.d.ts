import type { Stagehand } from '@browserbasehq/stagehand';
import type { BrowserController, BrowserPluginOptions, LaunchContext } from '@crawlee/browser-pool';
import { BrowserPlugin } from '@crawlee/browser-pool';
import type { Browser as PlaywrightBrowser, BrowserType, LaunchOptions } from 'playwright';
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
 */
export declare class StagehandPlugin extends BrowserPlugin<BrowserType, LaunchOptions, PlaywrightBrowser> {
    #private;
    readonly stagehandOptions: StagehandOptions;
    constructor(library: BrowserType, options?: StagehandPluginOptions);
    /**
     * Launches a browser using Stagehand and connects Playwright to it via CDP.
     */
    protected _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser>;
    /**
     * Cleans up Stagehand instance when browser disconnects.
     */
    private cleanupStagehand;
    /**
     * Creates a controller for the Stagehand browser.
     */
    createController(): BrowserController<BrowserType, LaunchOptions, PlaywrightBrowser>;
    /**
     * Adds proxy configuration to launch options.
     */
    protected addProxyToLaunchOptions(launchContext: LaunchContext<BrowserType>): Promise<void>;
    /**
     * Determines if this is a Chromium-based browser.
     */
    protected isChromiumBasedBrowser(): boolean;
    /**
     * Augments launch errors with helpful context.
     */
    private augmentLaunchError;
    /**
     * Gets the Stagehand instance for a given browser.
     */
    getStagehandForBrowser(browser: PlaywrightBrowser): Stagehand | undefined;
}
