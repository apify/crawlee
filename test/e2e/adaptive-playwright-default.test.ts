import { harness, scenario, validateDataset } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Actor } = await import('apify');
    const { AdaptivePlaywrightCrawler } = await import('@crawlee/playwright');
    const { default: log, LogLevel } = await import('@apify/log');

    await Actor.init();

    const crawler = new AdaptivePlaywrightCrawler({
        // Override the comparator so that it ignores `requestHandlerMode`
        resultComparator: (resultA, resultB) => {
            if (resultA.datasetItems.length === 1 && resultB.datasetItems.length === 1) {
                const itemA = resultA.datasetItems[0].item;
                const itemB = resultB.datasetItems[0].item;

                if (itemA.url === itemB.url && itemA.heading === itemB.heading) {
                    return 'equal';
                }
            }

            return 'different';
        },
        requestHandler: async (context) => {
            const { url } = context.request;

            const heading = (await context.querySelectorOne('h1')).text();

            const requestHandlerMode = await (async () => {
                try {
                    await context.page.title();
                    return 'browser';
                } catch {
                    return 'httpOnly';
                }
            })();

            await context.pushData({ url, heading, requestHandlerMode });

            await context.enqueueLinks({
                include: ['**/next/examples/*'],
            });
        },
    });

    // CrawleeLogger has no setLevel; raise the level on the global @apify/log instead.
    log.setLevel(LogLevel.DEBUG);

    await crawler.run(['https://crawlee.dev/js/docs/next/examples/add-data-to-dataset']);

    await Actor.exit({ exit: Actor.isAtHome() });
};

test('adaptive-playwright-default', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('adaptive-playwright-default', {
        source: scenario(import.meta.filename, main, { image: 'playwright' }),
        memory: 16384,
    });
    const result = await runActor(actor);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(items.length).toBeGreaterThan(15);
    expect(validateDataset(items, ['url', 'heading', 'requestHandlerMode'])).toBe(true);
    expect(items.filter((it) => it.requestHandlerMode === 'browser').length).toBeGreaterThanOrEqual(1);
    expect(items.filter((it) => it.requestHandlerMode === 'httpOnly').length).toBeGreaterThanOrEqual(5);
});
