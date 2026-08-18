"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const proxyConfiguration = new crawlee_1.ProxyConfiguration({
    proxyUrls: ['http://proxy-1.com', 'http://proxy-2.com'],
});
const crawler = new crawlee_1.HttpCrawler({
    proxyConfiguration,
    // ...
});
