import { getStats, harness, scenario, validateDataset } from './harness.js';

const { test } = harness();

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

test('playwright-default', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('playwright-default', {
        source: scenario(import.meta.filename, main, { image: 'playwright' }),
        memory: 16384,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBeGreaterThan(15);
    expect(items.length).toBeGreaterThan(15);
    expect(items.length).toBeLessThan(30);
    expect(validateDataset(items, ['url', 'pageTitle'])).toBe(true);
});
