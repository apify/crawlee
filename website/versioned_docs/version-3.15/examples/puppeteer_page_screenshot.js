"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const keyValueStore = await crawlee_1.KeyValueStore.open();
const url = 'https://crawlee.dev';
// Start a browser
const browser = await (0, crawlee_1.launchPuppeteer)();
// Open new tab in the browser
const page = await browser.newPage();
// Navigate to the URL
await page.goto(url);
// Capture the screenshot
const screenshot = await page.screenshot();
// Save the screenshot to the default key-value store
await keyValueStore.setValue('my-key', screenshot, { contentType: 'image/png' });
// Close Puppeteer
await browser.close();
