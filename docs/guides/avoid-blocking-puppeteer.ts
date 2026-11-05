import { PuppeteerCrawler, puppeteerBrowserPool } from 'crawlee';
import { BrowserName, DeviceCategory } from '@crawlee/browser-pool';

const crawler = new PuppeteerCrawler({
    browserPool: puppeteerBrowserPool({
        useFingerprints: true, // this is the default
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: [BrowserName.chrome, BrowserName.firefox],
                devices: [DeviceCategory.mobile],
                locales: ['en-US'],
            },
        },
    }),
    // ...
});
