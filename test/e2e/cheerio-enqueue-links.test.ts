import { testActor } from 'apify-test-tools';

import { eachRuntime, scenario } from './harness.js';

export const main = async () => {
    const { Actor } = await import('apify');
    const { CheerioCrawler, Dataset } = await import('@crawlee/cheerio');

    await Actor.main(async () => {
        const crawler = new CheerioCrawler({
            maxRequestsPerCrawl: 30,
            async requestHandler({ $, enqueueLinks, request, log }) {
                const { url, loadedUrl } = request;

                const pageTitle = $('title').first().text();
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

const actor = scenario('cheerio-enqueue-links', import.meta.filename, main, { memory: 4096 });

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
