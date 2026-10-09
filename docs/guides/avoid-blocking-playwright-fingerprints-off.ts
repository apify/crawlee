import { PlaywrightCrawler, playwrightBrowserPool } from 'crawlee';

const crawler = new PlaywrightCrawler({
    browserPool: playwrightBrowserPool({
        useFingerprints: false,
    }),
    // ...
});
