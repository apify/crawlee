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
export {
    BrowserName,
    DeviceCategory,
    OperatingSystemsName,
} from './fingerprinting/types.js';
export { BrowserController, BrowserControllerEvents } from './abstract-classes/browser-controller.js';
export { PuppeteerController } from './puppeteer/puppeteer-controller.js';
export { PlaywrightController } from './playwright/playwright-controller.js';
export { PlaywrightBrowser } from './playwright/playwright-browser.js';
export {
    CommonPage,
    CommonLibrary,
    BrowserPlugin,
    BrowserPluginOptions,
    CreateLaunchContextOptions,
    BrowserLaunchError,
    DEFAULT_USER_AGENT,
} from './abstract-classes/browser-plugin.js';
export { LaunchContext, LaunchContextOptions } from './launch-context.js';
export {
    BrowserSpecification,
    FingerprintGenerator,
    FingerprintGeneratorOptions,
    GetFingerprintReturn,
} from './fingerprinting/types.js';
export { InferBrowserPluginArray, UnwrapPromise } from './utils.js';
