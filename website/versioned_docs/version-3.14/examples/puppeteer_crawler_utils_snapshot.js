"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const url = 'http://www.example.com/';
// Start a browser
const browser = await (0, crawlee_1.launchPuppeteer)();
// Open new tab in the browser
const page = await browser.newPage();
// Navigate to the URL
await page.goto(url);
// Capture the screenshot
await crawlee_1.utils.puppeteer.saveSnapshot(page, { key: 'my-key', saveHtml: false });
// Close Puppeteer
await browser.close();
