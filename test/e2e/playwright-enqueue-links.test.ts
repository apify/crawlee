import { harness, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { PlaywrightCrawler, Dataset, log } = await import('@crawlee/playwright');
    const { Actor } = await import('apify');

    process.env.APIFY_LOG_LEVEL = 'DEBUG';

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const crawler = new PlaywrightCrawler({
            maxRequestsPerCrawl: 30,
            requestHandler: async ({ page, request, enqueueLinks }) => {
                const { url, loadedUrl } = request;

                const pageTitle = await page.title();
                log.info(`URL: ${url}; LOADED_URL: ${loadedUrl}; TITLE: ${pageTitle}`);

                const results = await enqueueLinks();

                if (loadedUrl.startsWith('https://drive')) {
                    const isEqual = results.addedRequests.length === 0;
                    await Dataset.pushData({ isEqual });
                }
            },
        });

        await crawler.run(['https://apify.com/press-kit', 'https://apify.com/about']);
    }, mainOptions);
};

test('playwright-enqueue-links', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('playwright-enqueue-links', {
        source: scenario(import.meta.filename, main, { image: 'playwright' }),
        memory: 16384,
    });
    const result = await runActor(actor);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(items[0].isEqual, "enqueueing on the same subdomain but a different loaded url doesn't enqueue").toBe(true);
});
