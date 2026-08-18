"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const impit_client_1 = require("@crawlee/impit-client");
const crawler = new crawlee_1.CheerioCrawler({
    httpClient: new impit_client_1.ImpitHttpClient({
        browser: impit_client_1.Browser.Chrome,
    }),
    async requestHandler({ $, request, enqueueLinks, pushData }) {
        const title = $('title').text();
        const h1 = $('h1').first().text();
        await pushData({
            url: request.url,
            title,
            h1,
        });
        // Enqueue links found on the page
        await enqueueLinks();
    },
});
await crawler.run(['https://example.com']);
