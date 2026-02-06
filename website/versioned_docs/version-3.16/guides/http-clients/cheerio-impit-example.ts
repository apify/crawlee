import { CheerioCrawler } from 'crawlee';
import { ImpitHttpClient } from '@crawlee/impit-client';

const crawler = new CheerioCrawler({
    httpClient: new ImpitHttpClient({
        // Set-up options for the impit library
        ignoreTlsErrors: true,
        browser: 'firefox',
    }),
    async requestHandler() {
        /* ... */
    },
});
