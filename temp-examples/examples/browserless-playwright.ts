/**
 * Browserless remote — Playwright CDP with API-managed sessions
 * Set BROWSERLESS_TOKEN in .env
 * For local Docker, see browserless-local-playwright.ts
 */
import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PlaywrightCrawler } from 'crawlee';

const token = process.env.BROWSERLESS_TOKEN;
if (!token) throw new Error('BROWSERLESS_TOKEN env variable is required');

const baseUrl = 'https://production-sfo.browserless.io';

class BrowserlessProvider extends RemoteBrowserProvider<{ stopUrl: string }> {
    async connect() {
        const response = await fetch(`${baseUrl}/session?token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttl: 60_000 }),
        });

        if (!response.ok) {
            throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
        }

        const session = await response.json();
        console.log(`>>> Session created: ${session.id}`);

        return {
            url: session.connect,
            context: { stopUrl: session.stop },
        };
    }

    async release({ stopUrl }: { stopUrl: string }) {
        await fetch(`${stopUrl}&force=true`, { method: 'DELETE' }).catch(() => {});
        console.log(`<<< Session released`);
    }
}

const crawler = new PlaywrightCrawler({
    launchContext: {
        remoteBrowser: new BrowserlessProvider(),
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
