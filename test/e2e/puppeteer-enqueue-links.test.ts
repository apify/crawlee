import { testActor } from 'apify-test-tools';

import { scenario } from './harness.js';

export const main = async () => {
    const { Actor } = await import('apify');
    const { Dataset, PuppeteerCrawler } = await import('@crawlee/puppeteer');

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const crawler = new PuppeteerCrawler({
            maxRequestsPerCrawl: 30,
            async requestHandler({ page, enqueueLinks, request, log }) {
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

const actor = scenario('puppeteer-enqueue-links', import.meta.filename, main, { image: 'puppeteer', memory: 16384 });

testActor(actor, 'enqueues by the loaded URL', async ({ expect, run }) => {
    const result = await run();
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(items[0].isEqual, "enqueueing on the same subdomain but a different loaded url doesn't enqueue").toBe(true);
});
