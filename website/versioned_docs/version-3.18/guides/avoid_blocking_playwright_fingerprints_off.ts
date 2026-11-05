import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    browserPoolOptions: {
        useFingerprints: false,
    },
    // ...
});
