"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const camoufox_js_1 = require("camoufox-js");
const playwright_1 = require("playwright");
const crawler = new crawlee_1.PlaywrightCrawler({
    postNavigationHooks: [
        async ({ handleCloudflareChallenge }) => {
            await handleCloudflareChallenge();
        },
    ],
    browserPoolOptions: {
        // Disable the default fingerprint spoofing to avoid conflicts with Camoufox.
        useFingerprints: false,
    },
    launchContext: {
        launcher: playwright_1.firefox,
        launchOptions: await (0, camoufox_js_1.launchOptions)({
            headless: true,
        }),
    },
    // ...
});
