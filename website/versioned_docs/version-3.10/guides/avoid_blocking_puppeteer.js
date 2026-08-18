"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const browser_pool_1 = require("@crawlee/browser-pool");
const crawler = new crawlee_1.PuppeteerCrawler({
    browserPoolOptions: {
        useFingerprints: true, // this is the default
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: [
                    browser_pool_1.BrowserName.chrome,
                    browser_pool_1.BrowserName.firefox,
                ],
                devices: [
                    browser_pool_1.DeviceCategory.mobile,
                ],
                locales: [
                    'en-US',
                ],
            },
        },
    },
    // ...
});
