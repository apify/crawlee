import { CheerioCrawler } from 'crawlee';
import { ImpitHttpClient, Browser } from '@crawlee/impit-client';

const crawler = new CheerioCrawler({
    httpClient: new ImpitHttpClient({
        // Impersonate Chrome browser
        browser: Browser.Chrome,
        // Enable HTTP/3 protocol
        http3: true,
    }),
    async requestHandler({ $ }) {
        console.log(`Title: ${$('title').text()}`);
    },
});

await crawler.run(['https://example.com']);
