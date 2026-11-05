import { CheerioCrawler } from 'crawlee';
import { GotScrapingHttpClient } from '@crawlee/got-scraping-client';

const crawler = new CheerioCrawler({
    httpClient: new GotScrapingHttpClient(),
    async requestHandler() {
        /* ... */
    },
});
