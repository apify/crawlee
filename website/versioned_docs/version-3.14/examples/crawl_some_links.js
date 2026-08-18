"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
// Create a CheerioCrawler
const crawler = new crawlee_1.CheerioCrawler({
    // Limits the crawler to only 10 requests (do not use if you want to crawl all links)
    maxRequestsPerCrawl: 10,
    // Function called for each URL
    async requestHandler({ request, enqueueLinks, log }) {
        log.info(request.url);
        // Add some links from page to the crawler's RequestQueue
        await enqueueLinks({
            globs: ['http?(s)://crawlee.dev/*/*'],
        });
    },
});
// Define the starting URL
await crawler.addRequests(['https://crawlee.dev']);
// Run the crawler
await crawler.run();
