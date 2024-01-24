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
export { BrowserController, BrowserControllerEvents } from './abstract-classes/browser-controller';
export { BrowserLaunchError, BrowserPlugin, BrowserPluginOptions, CommonLibrary, CommonPage, CreateLaunchContextOptions,
    DEFAULT_USER_AGENT } from './abstract-classes/browser-plugin';
export * from './browser-pool';
export * from './events';
export { BrowserName, DeviceCategory, OperatingSystemsName } from './fingerprinting/types';
export { BrowserSpecification, FingerprintGenerator, FingerprintGeneratorOptions, GetFingerprintReturn } from './fingerprinting/types';
export { LaunchContext, LaunchContextOptions } from './launch-context';
export { PlaywrightBrowser } from './playwright/playwright-browser';
export { PlaywrightController } from './playwright/playwright-controller';
export * from './playwright/playwright-plugin';
export { PuppeteerController } from './puppeteer/puppeteer-controller';
export * from './puppeteer/puppeteer-plugin';
export { InferBrowserPluginArray, UnwrapPromise } from './utils';
