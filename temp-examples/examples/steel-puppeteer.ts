import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PuppeteerCrawler } from 'crawlee';

const apiKey = process.env.STEEL_API_KEY;
if (!apiKey) throw new Error('STEEL_API_KEY env variable is required');

class SteelProvider extends RemoteBrowserProvider {
    maxOpenBrowsers = 4; // Steel Hobby tier effective concurrent limit

    async connect() {
        return { url: `wss://connect.steel.dev?apiKey=${apiKey}` };
    }
}

const crawler = new PuppeteerCrawler({
    launchContext: {
        remoteBrowser: new SteelProvider(),
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
