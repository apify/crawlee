import { HttpCrawler } from 'crawlee';
import { FetchHttpClient } from './implementation.js';

const crawler = new HttpCrawler({
    httpClient: new FetchHttpClient(),
    async requestHandler() {
        /* ... */
    },
});
