/**
 * Browserless local — Playwright CDP
 * Docker: docker run -p 3000:3000 -e CONCURRENT=4 ghcr.io/browserless/chromium
 */
import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PlaywrightCrawler } from 'crawlee';

class BrowserlessLocalProvider extends RemoteBrowserProvider {
    maxOpenBrowsers = 4; // match CONCURRENT=4 in docker

    async connect() {
        return { url: 'ws://localhost:3000' };
    }
}

const crawler = new PlaywrightCrawler({
    launchContext: {
        remoteBrowser: new BrowserlessLocalProvider(),
    },
    browserPoolOptions: {
        retireBrowserAfterPageCount: 5,
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
