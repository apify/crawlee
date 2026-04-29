import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PlaywrightCrawler } from 'crawlee';

// Local Docker (preferred): docker run -p 3000:3000 -e CONCURRENT=4 ghcr.io/browserless/chromium
// Remote: set BROWSERLESS_TOKEN in .env
const token = process.env.BROWSERLESS_TOKEN;
const base = token ? 'wss://production-sfo.browserless.io' : 'ws://localhost:3000';
const endpointUrl = token ? `${base}/chromium/playwright?token=${token}` : `${base}/chromium/playwright`;

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
