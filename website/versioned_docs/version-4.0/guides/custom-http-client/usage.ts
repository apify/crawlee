import { HttpCrawler } from 'crawlee';
import { CustomFetchClient } from './implementation.js';

const crawler = new HttpCrawler({
    httpClient: new CustomFetchClient(),
    async requestHandler() {
        /* ... */
    },
});
