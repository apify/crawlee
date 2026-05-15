import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PuppeteerCrawler } from 'crawlee';

const apiKey = process.env.REBROWSER_API_KEY;
if (!apiKey) throw new Error('REBROWSER_API_KEY env variable is required');

// Rebrowser simple connection: no profile or run creation needed.
// A random profile is auto-selected when you connect with just an API key.
// Proxies are managed via the Rebrowser dashboard or WS URL params.
class RebrowserProvider extends RemoteBrowserProvider {
    async connect() {
        return { url: `wss://api.rebrowser.net?apikey=${apiKey}` };
    }
}

const crawler = new PuppeteerCrawler({
    launchContext: {
        remoteBrowser: new RebrowserProvider(),
    },
    async requestHandler({ page, request }) {
        const title = await page.title();
        console.log(`[${request.loadedUrl}] ${title}`);
    },
    maxRequestsPerCrawl: 1,
});

await crawler.run(['https://example.com']);

// Note: Rebrowser recommends calling finishRun after you're done to avoid idle billing.
// With Crawlee, the browser disconnects automatically after the crawl finishes,
// which should end the run. For explicit control, use the REST API finishRun endpoint.
