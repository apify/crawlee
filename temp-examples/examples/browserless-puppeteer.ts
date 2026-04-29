import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PuppeteerCrawler } from 'crawlee';

// Local Docker (preferred): docker run -p 3000:3000 -e CONCURRENT=4 ghcr.io/browserless/chromium
// Remote: set BROWSERLESS_TOKEN in .env
const token = process.env.BROWSERLESS_TOKEN;
const endpointUrl = token ? `wss://production-sfo.browserless.io?token=${token}` : 'ws://localhost:3000';

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
