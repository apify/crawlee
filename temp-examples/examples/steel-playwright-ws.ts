import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PlaywrightCrawler } from 'crawlee';

const apiKey = process.env.STEEL_API_KEY;
if (!apiKey) throw new Error('STEEL_API_KEY env variable is required');

class SteelWsProvider extends RemoteBrowserProvider<{ id: string }> {
    override type = 'websocket' as const;

    async connect() {
        const response = await fetch('https://api.steel.dev/v1/sessions', {
            method: 'POST',
            headers: { 'Steel-Api-Key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            throw new Error(`Failed to create Steel session: ${response.status} ${response.statusText}`);
        }

        const session = await response.json();
        console.log(`>>> Session created: ${session.id}`);

        return {
            url: `wss://connect.steel.dev?apiKey=${apiKey}&sessionId=${session.id}`,
            context: { id: session.id },
        };
    }

    async release({ id }: { id: string }) {
        await fetch(`https://api.steel.dev/v1/sessions/${id}/release`, {
            method: 'POST',
            headers: { 'Steel-Api-Key': apiKey },
        }).catch(() => {});
        console.log(`<<< Session released: ${id}`);
    }
}

// Note: Steel may not support the Playwright WebSocket protocol.
// If this hangs on connect, use the CDP variant (steel-playwright.ts) instead.
const crawler = new PlaywrightCrawler({
    launchContext: {
        remoteBrowser: new SteelWsProvider(),
    },
    browserPoolOptions: {
        retireBrowserAfterPageCount: 3,
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
