"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const crawler = new crawlee_1.CheerioCrawler({
    maxRequestsPerCrawl: 20,
    async requestHandler({ $, request, enqueueLinks }) {
        const title = $('title').text();
        console.log(`The title of "${request.url}" is: ${title}.`);
        // The default behavior of enqueueLinks is to stay on the same hostname,
        // so it does not require any parameters.
        // This will ensure the subdomain stays the same.
        await enqueueLinks();
    },
});
await crawler.run(['https://crawlee.dev']);
