import { PuppeteerCrawler } from 'crawlee';

const crawler = new PuppeteerCrawler({
    browserPoolOptions: {
        useFingerprints: true, // this is the default
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: [
                    'chrome',
                    'firefox',
                ],
                devices: [
                    'mobile',
                ],
                locales: [
                    'en-US',
                ],
            },
        },
    },
    // ...
});
