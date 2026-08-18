"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const crawler = new crawlee_1.CheerioCrawler({
    // Let's limit our crawls to make our
    // tests shorter and safer.
    maxRequestsPerCrawl: 20,
    // enqueueLinks is an argument of the requestHandler
    async requestHandler({ $, request, enqueueLinks }) {
        const title = $('title').text();
        console.log(`The title of "${request.url}" is: ${title}.`);
        // The enqueueLinks function is context aware,
        // so it does not require any parameters.
        await enqueueLinks();
    },
});
await crawler.run(['https://crawlee.dev']);
