import { PlaywrightCrawler, playwrightBrowserPool } from 'crawlee';
import { BrowserName, DeviceCategory, OperatingSystemsName } from '@crawlee/browser-pool';

const crawler = new PlaywrightCrawler({
    browserPool: playwrightBrowserPool({
        useFingerprints: true, // this is the default
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: [
                    {
                        name: BrowserName.edge,
                        minVersion: 96,
                    },
                ],
                devices: [DeviceCategory.desktop],
                operatingSystems: [OperatingSystemsName.windows],
            },
        },
    }),
    // ...
});
