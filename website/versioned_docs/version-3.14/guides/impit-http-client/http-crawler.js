"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const impit_client_1 = require("@crawlee/impit-client");
const crawler = new crawlee_1.HttpCrawler({
    httpClient: new impit_client_1.ImpitHttpClient({
        browser: impit_client_1.Browser.Firefox,
        http3: true,
    }),
    async requestHandler({ body, request, log, pushData }) {
        log.info(`Processing ${request.url}`);
        // body is the raw HTML string
        await pushData({
            url: request.url,
            bodyLength: body.length,
        });
    },
});
await crawler.run(['https://example.com']);
