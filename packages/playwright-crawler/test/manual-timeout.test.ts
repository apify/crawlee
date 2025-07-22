import { PlaywrightCrawler } from 'crawlee';
import { test } from 'vitest';

test('Verify full timeout aggregation', async () => {
    const startTime = Date.now();

    const crawler = new PlaywrightCrawler({
        navigationTimeoutSecs: 60,
        requestHandlerTimeoutSecs: 60,
        maxRequestRetries: 0,
        preNavigationHooks: [
            async () => {
                // Simulate slow navigation
                await new Promise((res) => setTimeout(res, 65_000)); // 55s < 60s
            },
        ],
        requestHandler: async () => {
            // Should trigger handler timeout
            await new Promise((res) => setTimeout(res, 65_000)); // 65s > 60s
        },
        failedRequestHandler: async ({ error }) => {
            console.log('Full Error:', JSON.stringify(error, null, 2));
        },
    });

    await crawler.run(['http://example.com']);
    console.log('Total Duration:', (Date.now() - startTime) / 1000);
}, 200_000);
