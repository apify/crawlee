import { HttpCrawler } from 'crawlee';
import { ImpitHttpClient, Browser } from '@crawlee/impit-client';

const crawler = new HttpCrawler({
    httpClient: new ImpitHttpClient({
        browser: Browser.Firefox,
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
