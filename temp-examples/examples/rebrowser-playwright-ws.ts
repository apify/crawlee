import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PlaywrightCrawler } from 'crawlee';

const apiKey = process.env.REBROWSER_API_KEY;
const profileId = process.env.REBROWSER_PROFILE_ID;

if (!apiKey) throw new Error('REBROWSER_API_KEY env variable is required');

// Rebrowser WS connection: starts a dedicated run via REST API,
// which gives you a WebSocket endpoint for Playwright's native protocol.
class RebrowserWsProvider extends RemoteBrowserProvider {
    override type = 'websocket' as const;

    async connect() {
        const url = new URL(`https://rebrowser.net/api/startRun?apikey=${apiKey}`);

        if (profileId) {
            url.searchParams.set('profileId', profileId);
            console.log(`Using Rebrowser profile: ${profileId}`);
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
            throw new Error(`Failed to start Rebrowser run: ${response.status} ${response.statusText}`);
        }

        const run = await response.json();
        console.log(`Started Rebrowser run with wsEndpoint: ${run.wsEndpoint}`);

        return { url: run.wsEndpoint };
    }
}

const crawler = new PlaywrightCrawler({
    launchContext: {
        remoteBrowser: new RebrowserWsProvider(),
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
