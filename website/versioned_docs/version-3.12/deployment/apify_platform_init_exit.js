"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apify_1 = require("apify");
const crawlee_1 = require("crawlee");
await apify_1.Actor.init();
const crawler = new crawlee_1.CheerioCrawler({
    async requestHandler({ request, $, enqueueLinks }) {
        const { url } = request;
        // Extract HTML title of the page.
        const title = $('title').text();
        console.log(`Title of ${url}: ${title}`);
        // Add URLs that match the provided pattern.
        await enqueueLinks({
            globs: ['https://www.iana.org/*'],
        });
        // Save extracted data to dataset.
        await apify_1.Actor.pushData({ url, title });
    },
});
// Enqueue the initial request and run the crawler
await crawler.run(['https://www.iana.org/']);
await apify_1.Actor.exit();
