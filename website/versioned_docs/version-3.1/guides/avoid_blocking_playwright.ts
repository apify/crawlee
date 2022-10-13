import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    browserPoolOptions: {
        useFingerprints: true, // this is the default
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: [{
                    name: 'edge',
                    minVersion: 96,
                }],
                devices: [
                    'desktop',
                ],
                operatingSystems: [
                    'windows',
                ],
            },
        },
    },
    // ...
});
