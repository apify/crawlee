/**
 * Browserless local — Playwright WebSocket protocol
 * Docker: docker run -p 3000:3000 -e CONCURRENT=4 ghcr.io/browserless/chromium
 *
 * Uses browserType.connect() (Playwright native WS), not connectOverCDP().
 * Browserless supports both protocols — the /chromium/playwright endpoint
 * speaks the Playwright WebSocket protocol.
 */
import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PlaywrightCrawler } from 'crawlee';

class BrowserlessLocalWsProvider extends RemoteBrowserProvider {
    override type = 'websocket' as const;
    maxOpenBrowsers = 4; // match CONCURRENT=4 in docker

    async connect() {
        return { url: 'ws://localhost:3000/chromium/playwright' };
    }
}

const crawler = new PlaywrightCrawler({
    launchContext: {
        remoteBrowser: new BrowserlessLocalWsProvider(),
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
