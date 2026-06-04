import { CheerioCrawler, GotScrapingHttpClient } from 'crawlee';

const crawler = new CheerioCrawler({
    httpClient: new GotScrapingHttpClient(),
    async requestHandler() {
        /* ... */
    },
});
