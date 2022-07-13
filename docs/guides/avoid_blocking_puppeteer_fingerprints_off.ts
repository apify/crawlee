import { PuppeteerCrawler } from 'crawlee';

const crawler = new PuppeteerCrawler({
    browserPoolOptions: {
        useFingerprints: false,
    },
    // ...
});
