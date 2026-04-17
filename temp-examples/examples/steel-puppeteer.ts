import 'dotenv/config';

import { PuppeteerCrawler } from 'crawlee';

const apiKey = process.env.STEEL_API_KEY;

if (!apiKey) {
    throw new Error('STEEL_API_KEY env variable is required');
}

// Steel direct connection: no session creation needed.
// A session is auto-created when you connect and auto-released on disconnect.
const crawler = new PuppeteerCrawler({
    launchContext: {
        connectOverCDPOptions: {
            browserWSEndpoint: `wss://connect.steel.dev?apiKey=${apiKey}`,
        },
    },
    async requestHandler({ page, request }) {
        const title = await page.title();
        console.log(`[${request.loadedUrl}] ${title}`);
    },
    maxRequestsPerCrawl: 1,
});

await crawler.run(['https://example.com']);
