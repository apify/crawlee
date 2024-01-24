import { BrowserName, DeviceCategory } from '@crawlee/browser-pool';
import { PuppeteerCrawler } from 'crawlee';

const crawler = new PuppeteerCrawler({
    browserPoolOptions: {
        useFingerprints: true, // this is the default
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: [
                    BrowserName.chrome,
                    BrowserName.firefox,
                ],
                devices: [
                    DeviceCategory.mobile,
                ],
                locales: [
                    'en-US',
                ],
            },
        },
    },
    // ...
});
