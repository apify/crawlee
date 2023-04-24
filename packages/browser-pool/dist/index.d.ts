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
// @ts-ignore optional peer dependency
 * import puppeteer from 'puppeteer';
// @ts-ignore optional peer dependency
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
export * from './browser-pool';
export * from './playwright/playwright-plugin';
export * from './puppeteer/puppeteer-plugin';
export * from './events';
export { BrowserName, DeviceCategory, OperatingSystemsName, } from './fingerprinting/types';
export { BrowserController, BrowserControllerEvents } from './abstract-classes/browser-controller';
export { PuppeteerController } from './puppeteer/puppeteer-controller';
export { PlaywrightController } from './playwright/playwright-controller';
export { PlaywrightBrowser } from './playwright/playwright-browser';
export { CommonPage, CommonLibrary, BrowserPlugin, BrowserPluginOptions, CreateLaunchContextOptions, } from './abstract-classes/browser-plugin';
export { LaunchContext, LaunchContextOptions } from './launch-context';
export { BrowserSpecification, FingerprintGenerator, FingerprintGeneratorOptions, GetFingerprintReturn, } from './fingerprinting/types';
export { InferBrowserPluginArray, UnwrapPromise } from './utils';
//# sourceMappingURL=index.d.ts.map