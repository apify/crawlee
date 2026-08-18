"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const proxyConfiguration = new crawlee_1.ProxyConfiguration({ /* opts */});
const crawler = new crawlee_1.CheerioCrawler({
    proxyConfiguration,
    async requestHandler({ proxyInfo }) {
        console.log(proxyInfo);
    },
    // ...
});
