"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const crawler = new crawlee_1.CheerioCrawler({
    // Function called for each URL
    async requestHandler({ request, log }) {
        log.info(request.url);
    },
    maxRequestsPerCrawl: 10, // Limitation for only 10 requests (do not use if you want to crawl a sitemap)
});
const { urls } = await crawlee_1.Sitemap.load('https://crawlee.dev/sitemap.xml');
await crawler.addRequests(urls);
// Run the crawler
await crawler.run();
