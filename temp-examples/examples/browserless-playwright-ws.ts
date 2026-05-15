import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PlaywrightCrawler } from 'crawlee';

// Set BROWSERLESS_TOKEN in .env
// For local Docker, see browserless-local-playwright-ws.ts
const token = process.env.BROWSERLESS_TOKEN;
if (!token) throw new Error('BROWSERLESS_TOKEN env variable is required');
const endpointUrl = `wss://production-sfo.browserless.io/chromium/playwright?token=${token}`;

class BrowserlessWsProvider extends RemoteBrowserProvider {
    override type = 'websocket' as const;

    async connect() {
        return { url: endpointUrl };
    }
}

const crawler = new PlaywrightCrawler({
    launchContext: {
        remoteBrowser: new BrowserlessWsProvider(),
    },
    browserPoolOptions: {
        retireBrowserAfterPageCount: 5,
        maxOpenPagesPerBrowser: 1,
    },
    maxConcurrency: 4,
    maxRequestsPerCrawl: 10,
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
    'https://quotes.toscrape.com',
]);
