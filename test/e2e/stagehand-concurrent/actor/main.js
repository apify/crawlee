import { StagehandCrawler, stagehandBrowserPool } from '@crawlee/stagehand';
import { Actor } from 'apify';
import { z } from 'zod';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    // Playwright's Browser has no `process()`, so number the instances by object identity.
    const browserIds = new Map();
    const getBrowserId = (browser) => {
        if (!browserIds.has(browser)) browserIds.set(browser, `browser-${browserIds.size + 1}`);
        return browserIds.get(browser);
    };

    const crawler = new StagehandCrawler({
        maxConcurrency: 3,
        maxRequestsPerCrawl: 3,
        browserPool: stagehandBrowserPool({
            // Force one page per browser to ensure multiple browsers are used
            maxOpenPagesPerBrowser: 1,
            stagehandOptions: {
                env: 'LOCAL',
                model: 'anthropic/claude-haiku-4-5-20251001',
                verbose: 0,
            },
        }),
        async requestHandler({ page, request, log, pushData }) {
            log.info(`Processing ${request.loadedUrl}`);

            // Track which browser instance handled this request via the underlying Playwright browser
            const browserId = getBrowserId(page.context().browser());

            // Simple extraction - just get the page title
            const result = await page.extract(
                'Get the main heading or title of the page',
                z.object({ title: z.string() }),
            );

            log.info(`Extracted: ${result.title} (browser: ${browserId})`);

            // Save to dataset
            await pushData({
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
