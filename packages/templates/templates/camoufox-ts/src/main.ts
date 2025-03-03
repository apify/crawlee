// For more information, see https://crawlee.dev/
import { launchOptions } from 'camoufox-js';
import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import { firefox } from 'playwright';

import { router } from './routes.js';

const startUrls = ['https://crawlee.dev'];

const crawler = new PlaywrightCrawler({
    // proxyConfiguration: new ProxyConfiguration({ proxyUrls: ['...'] }),
    requestHandler: router,
    // Comment this option to scrape the full website.
    maxRequestsPerCrawl: 20,
    launchContext: {
        launcher: firefox,
        launchOptions: await launchOptions({
            headless: false,
            // Pass your own Camoufox parameters here...
            // block_images: true,
            // fonts: ['Times New Roman'],
            // ...
        }),
    },
});

await crawler.run(startUrls);
