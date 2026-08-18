"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const impit_client_1 = require("@crawlee/impit-client");
const crawler = new crawlee_1.BasicCrawler({
    httpClient: new impit_client_1.ImpitHttpClient({
        browser: impit_client_1.Browser.Firefox,
    }),
    async requestHandler({ sendRequest, log }) {
        const response = await sendRequest();
        log.info('Received response', { statusCode: response.statusCode });
    },
});
await crawler.run(['https://example.com']);
