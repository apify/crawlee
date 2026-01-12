import { Actor } from 'apify';
import { Dataset, StagehandCrawler } from '@crawlee/stagehand';
import { z } from 'zod';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const browserIds = new Set();

    const crawler = new StagehandCrawler({
        maxConcurrency: 3,
        maxRequestsPerCrawl: 3,
        // Force one page per browser to ensure multiple browsers are used
        browserPoolOptions: {
            maxOpenPagesPerBrowser: 1,
        },
        stagehandOptions: {
            env: 'LOCAL',
            model: 'anthropic/claude-sonnet-4-20250514',
            verbose: 0,
        },
        async requestHandler({ page, request, browserController, log }) {
            log.info(`Processing ${request.loadedUrl}`);

            // Track which browser instance handled this request
            const browserId = browserController.id;
            browserIds.add(browserId);

            // Simple extraction - just get the page title
            const result = await page.extract(
                'Get the main heading or title of the page',
                z.object({ title: z.string() }),
            );

            log.info(`Extracted: ${result.title} (browser: ${browserId})`);

            // Save to dataset
            await Dataset.pushData({
                url: request.loadedUrl,
                title: result.title,
                browserId,
            });
        },
    });

    // Run with 3 different URLs to force concurrency
    await crawler.run(['https://crawlee.dev', 'https://apify.com', 'https://blog.apify.com']);

    // Log how many browser instances were used
    console.log(`[Test] Used ${browserIds.size} browser instances for 3 requests`);
}, mainOptions);
