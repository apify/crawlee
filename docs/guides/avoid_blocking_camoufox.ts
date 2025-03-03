import { PlaywrightCrawler } from 'crawlee';
import { launchOptions } from 'camoufox-js';
import { firefox } from 'playwright';

const crawler = new PlaywrightCrawler({
    postNavigationHooks: [
        async ({ handleCloudflareChallenge }) => {
            await handleCloudflareChallenge();
        },
    ],
    launchContext: {
        launcher: firefox,
        launchOptions: await launchOptions({
            headless: true,
        }),
    },
    // ...
});
