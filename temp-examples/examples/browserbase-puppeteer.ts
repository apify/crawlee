import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PuppeteerCrawler } from 'crawlee';

const apiKey = process.env.BROWSERBASE_API_KEY;
const projectId = process.env.BROWSERBASE_PROJECT_ID;

if (!apiKey) throw new Error('BROWSERBASE_API_KEY env variable is required');
if (!projectId) throw new Error('BROWSERBASE_PROJECT_ID env variable is required');

class BrowserbaseProvider extends RemoteBrowserProvider<{ id: string }> {
    async connect() {
        const response = await fetch('https://api.browserbase.com/v1/sessions', {
            method: 'POST',
            headers: { 'x-bb-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId }),
        });

        if (!response.ok) {
            throw new Error(`Failed to create Browserbase session: ${response.status} ${response.statusText}`);
        }

        const session = await response.json();
        console.log(`>>> Session created: ${session.id}`);

        return { url: session.connectUrl, context: { id: session.id } };
    }

    async release({ id }: { id: string }) {
        await fetch(`https://api.browserbase.com/v1/sessions/${id}`, {
            method: 'POST',
            headers: { 'x-bb-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'REQUEST_RELEASE' }),
        }).catch(() => {});
        console.log(`<<< Session released: ${id}`);
    }
}

const crawler = new PuppeteerCrawler({
    launchContext: {
        remoteBrowser: new BrowserbaseProvider(),
    },
    browserPoolOptions: {
        retireBrowserAfterPageCount: 3,
        maxOpenPagesPerBrowser: 1,
    },
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
