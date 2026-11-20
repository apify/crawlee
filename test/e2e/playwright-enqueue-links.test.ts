import { testActor } from 'apify-test-tools';

import { eachRuntime, scenario } from './harness.js';

export const main = async () => {
    const { PlaywrightCrawler, Dataset, log } = await import('@crawlee/playwright');
    const { Actor } = await import('apify');

    process.env.APIFY_LOG_LEVEL = 'DEBUG';

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
    });
};

const actor = scenario('playwright-enqueue-links', import.meta.filename, main, { image: 'playwright', memory: 16384 });

eachRuntime((runtime) => {
    testActor(actor, 'enqueues by the loaded URL', async ({ expect, run }) => {
        const result = await run({ runtime });
        const { items } = await result.getDataset<any>();

        expect(result.status).toBe('SUCCEEDED');
        expect(items[0].isEqual, "enqueueing on the same subdomain but a different loaded url doesn't enqueue").toBe(
            true,
        );
    });
});
