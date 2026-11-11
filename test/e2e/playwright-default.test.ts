import { testActor } from 'apify-test-tools';

import { getStats, scenario, validateDataset } from './harness.js';

export const main = async () => {
    const { Actor } = await import('apify');
    const { Dataset, PlaywrightCrawler } = await import('@crawlee/playwright');

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const crawler = new PlaywrightCrawler({
            preNavigationHooks: [
                ({ gotoOptions }) => {
                    gotoOptions.waitUntil = 'networkidle';
                },
            ],
            async requestHandler({ page, enqueueLinks, request }) {
                const { url } = request;
                const pageTitle = await page.title();
                await Dataset.pushData({ url, pageTitle });
                await enqueueLinks({
                    include: ['**/3.12/examples/*'],
                });
            },
        });

        await crawler.run(['https://crawlee.dev/js/docs/3.12/examples/']);
    }, mainOptions);
};

const actor = scenario('playwright-default', import.meta.filename, main, { image: 'playwright', memory: 16384 });

testActor(actor, 'crawls the docs and stores page titles', async ({ expect, run }) => {
    const result = await run();
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBeGreaterThan(15);
    expect(items.length).toBeGreaterThan(15);
    expect(items.length).toBeLessThan(30);
    expect(validateDataset(items, ['url', 'pageTitle'])).toBe(true);
});
