import 'dotenv/config';

import { PuppeteerCrawler } from 'crawlee';

// Browserbase requires two env variables:
// - BROWSERBASE_API_KEY: Your API key for authentication
// - BROWSERBASE_PROJECT_ID: The project to create sessions in
const apiKey = process.env.BROWSERBASE_API_KEY;
const projectId = process.env.BROWSERBASE_PROJECT_ID;

if (!apiKey) {
    throw new Error('BROWSERBASE_API_KEY env variable is required');
}

if (!projectId) {
    throw new Error('BROWSERBASE_PROJECT_ID env variable is required');
}

// Step 1: Create a Browserbase session via REST API.
// This returns a connectUrl that we can use with Puppeteer's CDP connection.
// You have 5 minutes to connect before the session terminates.
const response = await fetch('https://api.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: {
        'x-bb-api-key': apiKey,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projectId }),
});

if (!response.ok) {
    throw new Error(`Failed to create Browserbase session: ${response.status} ${response.statusText}`);
}

const session = await response.json();
console.log(`Created Browserbase session: ${session.id}`);

// Step 2: Connect to the session using Puppeteer's CDP connection.
// The connectUrl from the session response is used as the browserWSEndpoint.
const crawler = new PuppeteerCrawler({
    launchContext: {
        connectOverCDPOptions: {
            browserWSEndpoint: session.connectUrl,
        },
    },
    async requestHandler({ page, request }) {
        const title = await page.title();
        console.log(`[${request.loadedUrl}] ${title}`);
    },
    maxRequestsPerCrawl: 1,
});

await crawler.run(['https://example.com']);
