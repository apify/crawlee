import { launchPuppeteer, utils } from 'crawlee';

const url = 'http://www.example.com/';
// Start a browser
const browser = await launchPuppeteer();

// Open new tab in the browser
const page = await browser.newPage();

// Navigate to the URL
await page.goto(url);

// Capture the screenshot
await utils.puppeteer.saveSnapshot(page, { key: 'my-key', saveHtml: false });

// Close Puppeteer
await browser.close();
