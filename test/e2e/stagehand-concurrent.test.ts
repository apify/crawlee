import { testActor } from 'apify-test-tools';
import { describe } from 'vitest';

import { getStats, scenario, validateDataset } from './harness.js';

export const main = async () => {
    const { StagehandCrawler, stagehandBrowserPool } = await import('@crawlee/stagehand');
    const { Actor } = await import('apify');
    const { z } = await import('zod');

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        // Playwright's Browser has no `process()`, so number the instances by object identity.
        const browserIds = new Map();
        const getBrowserId = (browser: unknown) => {
            if (!browserIds.has(browser)) browserIds.set(browser, `browser-${browserIds.size + 1}`);
            return browserIds.get(browser);
        };

        const crawler = new StagehandCrawler({
            maxConcurrency: 3,
            maxRequestsPerCrawl: 3,
            // @ts-expect-error stagehandBrowserPool() is typed as a pool of plain Playwright pages (StagehandBrowserPool.newPage)
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
};

const actor = scenario('stagehand-concurrent', import.meta.filename, main, {
    image: 'playwright',
    memory: 16384,
    env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('needs ANTHROPIC_API_KEY', () => {
    testActor(actor, 'handles pages concurrently', async ({ expect, run }) => {
        const result = await run();
        const stats = await getStats(result);
        const { items } = await result.getDataset<any>();

        expect(result.status).toBe('SUCCEEDED');
        expect(stats.requestsSucceeded).toBe(3);
        expect(stats.requestsFailed).toBe(0);
        expect(items).toHaveLength(3);
        expect(validateDataset(items, ['url', 'title', 'browserId'])).toBe(true);

        const browserIds = new Set(items.map((item) => item.browserId));
        expect(browserIds.size, 'multiple browser instances used').toBeGreaterThanOrEqual(2);

        const urls = items.map((item) => item.url);
        expect(urls.some((url) => url.includes('crawlee.dev'))).toBe(true);
        expect(urls.some((url) => url.includes('apify.com'))).toBe(true);
        expect(urls.some((url) => url.includes('blog.apify.com'))).toBe(true);

        for (const item of items) {
            expect(item.title.length, `title extracted for ${item.url}`).toBeGreaterThan(0);
        }
    });
});
