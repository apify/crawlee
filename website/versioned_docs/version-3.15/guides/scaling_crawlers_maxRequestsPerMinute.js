"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const crawler = new crawlee_1.CheerioCrawler({
    // Let the crawler know it can run up to 100 requests concurrently at any time
    maxConcurrency: 100,
    // ...but also ensure the crawler never exceeds 250 requests per minute
    maxRequestsPerMinute: 250,
});
