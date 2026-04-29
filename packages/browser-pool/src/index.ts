/**
 * The `browser-pool` module exports three constructors. One for `BrowserPool`
 * itself and two for the included Puppeteer and Playwright plugins.
 *
 * **Example:**
 * ```js
 * import {
 *  BrowserPool,
 *  PuppeteerPlugin,
 *  PlaywrightPlugin
 * } from '@crawlee/browser-pool';
 * import puppeteer from 'puppeteer';
 * import playwright from 'playwright';
 *
 * const browserPool = new BrowserPool({
 *     browserPlugins: [
 *         new PuppeteerPlugin(puppeteer),
 *         new PlaywrightPlugin(playwright.chromium),
 *     ]
 * });
 * ```
 *
 * @module browser-pool
 */
export * from './browser-pool.js';
export * from './playwright/playwright-plugin.js';
export * from './puppeteer/puppeteer-plugin.js';
export * from './events.js';
export type {
    BrowserSpecification,
    FingerprintGenerator,
    FingerprintGeneratorOptions,
    GetFingerprintReturn,
} from './fingerprinting/types.js';
export { BrowserName, DeviceCategory, OperatingSystemsName } from './fingerprinting/types.js';
export type { BrowserControllerEvents } from './abstract-classes/browser-controller.js';
export { BrowserController } from './abstract-classes/browser-controller.js';
export { PuppeteerController } from './puppeteer/puppeteer-controller.js';
export { PlaywrightController } from './playwright/playwright-controller.js';
export { PlaywrightBrowser } from './playwright/playwright-browser.js';
export type {
    CommonPage,
    CommonLibrary,
    BrowserPluginOptions,
    CreateLaunchContextOptions,
    RemoteBrowserConfig,
    RemoteBrowserEndpointResult,
} from './abstract-classes/browser-plugin.js';
export { BrowserPlugin, BrowserLaunchError, DEFAULT_USER_AGENT } from './abstract-classes/browser-plugin.js';
export type { LaunchContextOptions } from './launch-context.js';
export { LaunchContext } from './launch-context.js';
export { RemoteBrowserProvider } from './remote-browser-provider.js';
export type { InferBrowserPluginArray, UnwrapPromise } from './utils.js';
export { anonymizeProxySugar, type AnonymizeProxySugarOptions } from './anonymize-proxy.js';
