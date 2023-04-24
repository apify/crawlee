"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LaunchContext = exports.BrowserPlugin = exports.PlaywrightBrowser = exports.PlaywrightController = exports.PuppeteerController = exports.BrowserController = exports.OperatingSystemsName = exports.DeviceCategory = exports.BrowserName = void 0;
const tslib_1 = require("tslib");
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
tslib_1.__exportStar(require("./browser-pool"), exports);
tslib_1.__exportStar(require("./playwright/playwright-plugin"), exports);
tslib_1.__exportStar(require("./puppeteer/puppeteer-plugin"), exports);
tslib_1.__exportStar(require("./events"), exports);
var types_1 = require("./fingerprinting/types");
Object.defineProperty(exports, "BrowserName", { enumerable: true, get: function () { return types_1.BrowserName; } });
Object.defineProperty(exports, "DeviceCategory", { enumerable: true, get: function () { return types_1.DeviceCategory; } });
Object.defineProperty(exports, "OperatingSystemsName", { enumerable: true, get: function () { return types_1.OperatingSystemsName; } });
var browser_controller_1 = require("./abstract-classes/browser-controller");
Object.defineProperty(exports, "BrowserController", { enumerable: true, get: function () { return browser_controller_1.BrowserController; } });
var puppeteer_controller_1 = require("./puppeteer/puppeteer-controller");
Object.defineProperty(exports, "PuppeteerController", { enumerable: true, get: function () { return puppeteer_controller_1.PuppeteerController; } });
var playwright_controller_1 = require("./playwright/playwright-controller");
Object.defineProperty(exports, "PlaywrightController", { enumerable: true, get: function () { return playwright_controller_1.PlaywrightController; } });
var playwright_browser_1 = require("./playwright/playwright-browser");
Object.defineProperty(exports, "PlaywrightBrowser", { enumerable: true, get: function () { return playwright_browser_1.PlaywrightBrowser; } });
var browser_plugin_1 = require("./abstract-classes/browser-plugin");
Object.defineProperty(exports, "BrowserPlugin", { enumerable: true, get: function () { return browser_plugin_1.BrowserPlugin; } });
var launch_context_1 = require("./launch-context");
Object.defineProperty(exports, "LaunchContext", { enumerable: true, get: function () { return launch_context_1.LaunchContext; } });
//# sourceMappingURL=index.js.map