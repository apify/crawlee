"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const browser_pool_1 = require("@crawlee/browser-pool");
const crawler = new crawlee_1.PlaywrightCrawler({
    browserPoolOptions: {
        useFingerprints: true, // this is the default
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: [{
                        name: browser_pool_1.BrowserName.edge,
                        minVersion: 96,
                    }],
                devices: [
                    browser_pool_1.DeviceCategory.desktop,
                ],
                operatingSystems: [
                    browser_pool_1.OperatingSystemsName.windows,
                ],
            },
        },
    },
    // ...
});
