import { HttpCrawler } from 'crawlee';
import { CustomHttpClient } from './implementation.js';

const crawler = new HttpCrawler({
    httpClient: new CustomHttpClient(),
    async requestHandler() {
        /* ... */
    },
});
