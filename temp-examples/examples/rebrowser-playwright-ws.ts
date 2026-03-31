import 'dotenv/config';

import { PlaywrightCrawler } from 'crawlee';

const apiKey = process.env.REBROWSER_API_KEY;
const profileId = process.env.REBROWSER_PROFILE_ID;

if (!apiKey) {
    throw new Error('REBROWSER_API_KEY env variable is required');
}

// Step 1: Start a Rebrowser run via REST API.
// This gives you a dedicated WebSocket endpoint for the session.
// You can optionally specify a profileId and proxyUrl for advanced control.
const startRunUrl = new URL(`https://rebrowser.net/api/startRun?apikey=${apiKey}`);

if (profileId) {
    startRunUrl.searchParams.set('profileId', profileId);
    console.log(`Using Rebrowser profile: ${profileId}`);
}

const response = await fetch(startRunUrl.toString());

if (!response.ok) {
    throw new Error(`Failed to start Rebrowser run: ${response.status} ${response.statusText}`);
}

const run = await response.json();
console.log(`Started Rebrowser run with wsEndpoint: ${run.wsEndpoint}`);

// Step 2: Connect to the run using Playwright's WebSocket connection.
const crawler = new PlaywrightCrawler({
    launchContext: {
        connectOptions: {
            wsEndpoint: run.wsEndpoint,
        },
    },
    async requestHandler({ page, request }) {
        const title = await page.title();
        console.log(`[${request.loadedUrl}] ${title}`);
    },
    maxRequestsPerCrawl: 1,
});

await crawler.run(['https://example.com']);

// Step 3: Finish the run to stop billing.
// Rebrowser recommends explicit finishRun to avoid idle billing.
// The browser disconnects automatically after the crawl, but calling finishRun
// ensures the run is cleanly terminated on Rebrowser's side.
