import { HttpCrawler } from '@crawlee/http';
import { test } from 'vitest';

test('Verify full timeout aggregation', async () => {
    const startTime = Date.now();
    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        preNavigationHooks: [
            async () => {
                // Simulate slow pre-navigation processing
                await new Promise((res) => setTimeout(res, 64_000));
            },
        ],
        requestHandler: async () => {
            // Should trigger handler timeout
            await new Promise((res) => setTimeout(res, 70_000));
        },
        failedRequestHandler: async ({ error }) => {
            console.log('Full Error:', JSON.stringify(error, null, 2));
        },
    });
    await crawler.run(['http://example.com']);
    console.log('Total Duration:', (Date.now() - startTime) / 1000);
}, 135_000);
