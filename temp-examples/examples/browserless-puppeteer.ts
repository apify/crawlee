import 'dotenv/config';

import { PuppeteerCrawler } from 'crawlee';

const token = process.env.BROWSERLESS_TOKEN;

if (!token) {
    throw new Error('BROWSERLESS_TOKEN env variable is required');
}

const crawler = new PuppeteerCrawler({
    launchContext: {
        connectOverCDPOptions: {
            browserWSEndpoint: `wss://production-sfo.browserless.io?token=${token}`,
        },
    },
    async requestHandler({ page, request, enqueueLinks }) {
        const title = await page.title();
        console.log(`[${request.loadedUrl}] ${title}`);

        await enqueueLinks({
            globs: ['https://www.crawlee.dev/**'],
            limit: 5,
        });
    },
    maxRequestsPerCrawl: 10,
});

await crawler.run(['https://www.crawlee.dev']);
