import { PuppeteerCrawler, puppeteerBrowserPool } from 'crawlee';

const crawler = new PuppeteerCrawler({
    browserPool: puppeteerBrowserPool({
        useFingerprints: false,
    }),
    // ...
});
