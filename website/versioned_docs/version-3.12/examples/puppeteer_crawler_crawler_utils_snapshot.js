"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
// Create a PuppeteerCrawler
const crawler = new crawlee_1.PuppeteerCrawler({
    async requestHandler({ request, saveSnapshot }) {
        // Convert the URL into a valid key
        const key = request.url.replace(/[:/]/g, '_');
        // Capture the screenshot
        await saveSnapshot({ key, saveHtml: false });
    },
});
await crawler.addRequests([
    { url: 'http://www.example.com/page-1' },
    { url: 'http://www.example.com/page-2' },
    { url: 'http://www.example.com/page-3' },
]);
// Run the crawler
await crawler.run();
