import type { BrowserLaunchContext } from '@crawlee/browser';
import { BrowserLauncher, Configuration } from '@crawlee/browser';
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
export declare class StagehandLauncher extends BrowserLauncher<StagehandPlugin> {
    #private;
    readonly configuration: Configuration;
    /**
     * @internal
     */
    protected static optionsShape: {
        launcher: z.ZodOptional<z.ZodCustom<import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary, import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary>>;
        launchContextOptions: z.ZodOptional<z.ZodCustom<import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary, import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary>>;
        stagehandOptions: z.ZodOptional<z.ZodCustom<import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary, import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary>>;
        proxyUrl: z.ZodOptional<z.ZodURL>;
        useChrome: z.ZodOptional<z.ZodBoolean>;
        useIncognitoPages: z.ZodOptional<z.ZodBoolean>;
        browserPerProxy: z.ZodOptional<z.ZodBoolean>;
        ignoreProxyCertificate: z.ZodOptional<z.ZodBoolean>;
        userDataDir: z.ZodOptional<z.ZodString>;
        launchOptions: z.ZodOptional<z.ZodCustom<import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary, import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary>>;
        userAgent: z.ZodOptional<z.ZodString>;
    };
    /** @internal */
    protected static optionsSchema: z.ZodObject<{
        launcher: z.ZodOptional<z.ZodCustom<import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary, import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary>>;
        launchContextOptions: z.ZodOptional<z.ZodCustom<import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary, import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary>>;
        stagehandOptions: z.ZodOptional<z.ZodCustom<import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary, import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary>>;
        proxyUrl: z.ZodOptional<z.ZodURL>;
        useChrome: z.ZodOptional<z.ZodBoolean>;
        useIncognitoPages: z.ZodOptional<z.ZodBoolean>;
        browserPerProxy: z.ZodOptional<z.ZodBoolean>;
        ignoreProxyCertificate: z.ZodOptional<z.ZodBoolean>;
        userDataDir: z.ZodOptional<z.ZodString>;
        launchOptions: z.ZodOptional<z.ZodCustom<import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary, import("@crawlee/types", { with: { "resolution-mode": "import" } }).Dictionary>>;
        userAgent: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    /**
     * All StagehandLauncher parameters are passed via the launchContext object.
     */
    constructor(launchContext?: StagehandLaunchContext, configuration?: Configuration);
    /**
     * Creates a new StagehandPlugin instance with resolved options.
     */
    createBrowserPlugin(): StagehandPlugin;
}
