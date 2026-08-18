"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const playwright_1 = require("playwright");
// Create an instance of the PlaywrightCrawler class.
const crawler = new crawlee_1.PlaywrightCrawler({
    launchContext: {
        // Set the Firefox browser to be used by the crawler.
        // If launcher option is not specified here,
        // default Chromium browser will be used.
        launcher: playwright_1.firefox,
    },
    async requestHandler({ request, page, log }) {
        const pageTitle = await page.title();
        log.info(`URL: ${request.loadedUrl} | Page title: ${pageTitle}`);
    },
});
await crawler.addRequests(['https://example.com']);
// Run the crawler and wait for it to finish.
await crawler.run();
