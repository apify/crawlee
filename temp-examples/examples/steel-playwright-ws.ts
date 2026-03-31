import 'dotenv/config';

import { PlaywrightCrawler } from 'crawlee';

const apiKey = process.env.STEEL_API_KEY;

if (!apiKey) {
    throw new Error('STEEL_API_KEY env variable is required');
}

// Step 1: Create a Steel session via REST API.
// Explicit session creation enables advanced features like proxy and CAPTCHA solving.
const response = await fetch('https://api.steel.dev/v1/sessions', {
    method: 'POST',
    headers: {
        'Steel-Api-Key': apiKey,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ useProxy: true, solveCaptcha: true }),
});

if (!response.ok) {
    throw new Error(`Failed to create Steel session: ${response.status} ${response.statusText}`);
}

const session = await response.json();
console.log(`Created Steel session: ${session.id}`);

// Step 2: Connect to the session using Playwright's WebSocket connection.
// The session ID is passed as a query parameter to the Steel WebSocket endpoint.
const crawler = new PlaywrightCrawler({
    launchContext: {
        connectOptions: {
            wsEndpoint: `wss://connect.steel.dev?apiKey=${apiKey}&sessionId=${session.id}`,
        },
    },
    async requestHandler({ page, request }) {
        const title = await page.title();
        console.log(`[${request.loadedUrl}] ${title}`);
    },
    maxRequestsPerCrawl: 1,
});

await crawler.run(['https://example.com']);

// Step 3: Release the session (optional — Steel auto-releases on disconnect).
await fetch(`https://api.steel.dev/v1/sessions/${session.id}/release`, {
    method: 'POST',
    headers: { 'Steel-Api-Key': apiKey },
});
console.log(`Released Steel session: ${session.id}`);
