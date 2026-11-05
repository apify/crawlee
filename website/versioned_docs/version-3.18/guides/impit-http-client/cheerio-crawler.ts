import { CheerioCrawler } from 'crawlee';
import { ImpitHttpClient, Browser } from '@crawlee/impit-client';

const crawler = new CheerioCrawler({
    httpClient: new ImpitHttpClient({
        browser: Browser.Chrome,
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
