import { PlaywrightCrawler, handleCloudflareChallengeHook } from 'crawlee';
import { launchOptions } from 'camoufox-js';
import { firefox } from 'playwright';

const crawler = new PlaywrightCrawler({
    postNavigationHooks: [handleCloudflareChallengeHook()],
    browserPoolOptions: {
        // Disable the default fingerprint spoofing to avoid conflicts with Camoufox.
        useFingerprints: false,
    },
    launchContext: {
        launcher: firefox,
        launchOptions: await launchOptions({
            headless: true,
        }),
    },
    // ...
});
