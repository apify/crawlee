"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const crawler = new crawlee_1.PuppeteerCrawler({
    async requestHandler({ request, enqueueLinks, log }) {
        log.info(request.url);
        // Add all links from page to RequestQueue
        await enqueueLinks();
    },
    maxRequestsPerCrawl: 10, // Limitation for only 10 requests (do not use if you want to crawl all links)
});
// Run the crawler with initial request
await crawler.run(['https://crawlee.dev']);
