"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
// Create a PuppeteerCrawler
const crawler = new crawlee_1.PuppeteerCrawler({
    async requestHandler({ request, page }) {
        // Capture the screenshot with Puppeteer
        const screenshot = await page.screenshot();
        // Convert the URL into a valid key
        const key = request.url.replace(/[:/]/g, '_');
        // Save the screenshot to the default key-value store
        await crawlee_1.KeyValueStore.setValue(key, screenshot, { contentType: 'image/png' });
    },
});
await crawler.addRequests([
    { url: 'http://www.example.com/page-1' },
    { url: 'http://www.example.com/page-2' },
    { url: 'http://www.example.com/page-3' },
]);
// Run the crawler
await crawler.run();
