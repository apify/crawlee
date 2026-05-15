/**
 * Test to reproduce the browser overlap problem during retirement.
 *
 * Local:  docker run -p 3000:3000 -e CONCURRENT=2 ghcr.io/browserless/chromium
 * Cloud:  set BROWSERLESS_TOKEN in .env (free tier has 2 concurrent limit)
 *
 * Run:  node --experimental-strip-types examples/browserless-overlap-test.ts
 *
 * With maxConcurrency:2 and a service limit of 2, you'd expect at most 2 browsers.
 * But during retirement transitions, the pool briefly opens a 3rd connection → 429.
 *
 * The overlap:
 * 1. Browser A hits retireBrowserAfterPageCount while its last page is still running
 * 2. A moves to retiredBrowserControllers (still connected, page not yet closed)
 * 3. Next page request → A is retired, no active browser → pool launches Browser C
 * 4. A hasn't closed yet (1s timeout) → A + B + C = 3 concurrent connections → 429
 */
import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PlaywrightCrawler } from 'crawlee';

let activeConnections = 0;
let peakConnections = 0;

class BrowserlessProvider extends RemoteBrowserProvider {
    // Cap to match the service limit — prevents overlap during retirement
    maxOpenBrowsers = 2;

    async connect() {
        activeConnections++;
        peakConnections = Math.max(peakConnections, activeConnections);
        console.log(`>>> CONNECT  active=${activeConnections} (peak=${peakConnections})`);
        const token = process.env.BROWSERLESS_TOKEN;
        const url = token ? `wss://production-sfo.browserless.io?token=${token}` : 'ws://localhost:3000';
        return { url };
    }

    async release() {
        activeConnections--;
        console.log(`<<< RELEASE  active=${activeConnections}`);
    }
}

const crawler = new PlaywrightCrawler({
    launchContext: {
        remoteBrowser: new BrowserlessProvider(),
    },
    browserPoolOptions: {
        // Retire after just 2 pages — forces frequent retirement
        retireBrowserAfterPageCount: 2,
        maxOpenPagesPerBrowser: 1,
    },
    // 2 concurrent pages = 2 browsers needed, matching the docker CONCURRENT=2
    maxConcurrency: 2,
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

console.log(`\nPeak concurrent connections: ${peakConnections}`);
console.log(`Expected max: 2 (matching maxConcurrency)`);
if (peakConnections > 2) {
    console.log(`⚠ OVERLAP DETECTED: ${peakConnections} browsers were open simultaneously`);
}
