import { BasicCrawler } from 'crawlee';
import { ImpitHttpClient, Browser } from '@crawlee/impit-client';

const crawler = new BasicCrawler({
    httpClient: new ImpitHttpClient({
        browser: Browser.Firefox,
    }),
    async requestHandler({ sendRequest, log }) {
        const response = await sendRequest();
        log.info('Received response', { status: response.status });
    },
});

await crawler.run(['https://example.com']);
