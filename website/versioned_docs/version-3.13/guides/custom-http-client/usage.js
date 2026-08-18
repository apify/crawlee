"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawler = new HttpCrawler({
    httpClient: new CustomHttpClient(),
    async requestHandler() {
        /* ... */
    },
});
