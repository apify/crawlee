"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const impit_client_1 = require("@crawlee/impit-client");
const crawler = new crawlee_1.CheerioCrawler({
    httpClient: new impit_client_1.ImpitHttpClient({
        // Impersonate Chrome browser
        browser: impit_client_1.Browser.Chrome,
        // Enable HTTP/3 protocol
        http3: true,
    }),
    async requestHandler({ $ }) {
        console.log(`Title: ${$('title').text()}`);
    },
});
await crawler.run(['https://example.com']);
