// For more information, see https://crawlee.dev/
import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import { firefox } from 'playwright';

import { router } from './routes.js';

const startUrls = ['https://crawlee.dev'];

const crawler = new PlaywrightCrawler({
    requestHandler: router,
    maxRequestsPerCrawl: 20,
    launchContext: {
        launcher: firefox,
        launchOptions: {
            executablePath: './binaries/camoufox/camoufox',
        },
    },
    headless: false,
});

await crawler.run(startUrls);
