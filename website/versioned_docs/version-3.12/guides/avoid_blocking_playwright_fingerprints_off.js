"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const crawler = new crawlee_1.PlaywrightCrawler({
    browserPoolOptions: {
        useFingerprints: false,
    },
    // ...
});
