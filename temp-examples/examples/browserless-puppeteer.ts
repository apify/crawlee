import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PuppeteerCrawler } from 'crawlee';

// Set BROWSERLESS_TOKEN in .env
// For local Docker, see browserless-local-puppeteer.ts
const token = process.env.BROWSERLESS_TOKEN;
if (!token) throw new Error('BROWSERLESS_TOKEN env variable is required');
const endpointUrl = `wss://production-sfo.browserless.io?token=${token}`;

class BrowserlessProvider extends RemoteBrowserProvider {
    async connect() {
        return { url: endpointUrl };
    }
}

const crawler = new PuppeteerCrawler({
    launchContext: {
        remoteBrowser: new BrowserlessProvider(),
    },
    browserPoolOptions: {
        retireBrowserAfterPageCount: 5,
        maxOpenPagesPerBrowser: 1,
    },
    maxConcurrency: 4,
    maxRequestsPerCrawl: 9,
    async requestHandler({ page, request }) {
        const title = await page.title();
        console.log(`[Page] ${request.loadedUrl} — "${title}"`);
    },
});

await crawler.run([
    'https://example.com',
    'https://crawlee.dev',
    'https://www.google.com',
    'https://github.com',
    'https://wikipedia.org',
    'https://httpbin.org',
    'https://jsonplaceholder.typicode.com',
    'https://news.ycombinator.com',
    'https://books.toscrape.com',
]);
