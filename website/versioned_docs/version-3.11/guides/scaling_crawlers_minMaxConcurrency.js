"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const crawler = new crawlee_1.CheerioCrawler({
    // Start the crawler right away and ensure there will always be 5 concurrent requests ran at any time
    minConcurrency: 5,
    // Ensure the crawler doesn't exceed 15 concurrent requests ran at any time
    maxConcurrency: 15,
});
