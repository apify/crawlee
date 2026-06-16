import { BrowserPool, PlaywrightPlugin, RemoteBrowserPool } from '@crawlee/browser-pool';
import { PlaywrightCrawler } from 'crawlee';
import playwright, { type Page } from 'playwright';

const token = process.env.BROWSERLESS_TOKEN!;

// Build a BrowserPool whose single plugin connects to the remote service…
// The generic is the page type the crawler works with (Playwright's `Page`).
const remoteBrowserPool = new RemoteBrowserPool<Page>({
    browserPool: new BrowserPool({
        browserPlugins: [
            new PlaywrightPlugin(playwright.chromium, {
                remoteBrowser: { endpoint: `wss://production-sfo.browserless.io?token=${token}` },
            }),
        ],
    }),
    // …and cap concurrent remote browsers. newPage() waits for a free slot instead
    // of overshooting the service's session quota.
    maxOpenBrowsers: 5,
});

// Pass the pool in directly. The crawler uses it instead of building its own and,
// because the pool is not owned by the crawler, never tears it down.
const crawler = new PlaywrightCrawler({
    browserPool: remoteBrowserPool,
    async requestHandler({ page, request, log }) {
        const title = await page.title();
        log.info(`${request.loadedUrl} — "${title}"`);
    },
});

await crawler.run(['https://crawlee.dev']);
