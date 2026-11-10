import { getStats, harness, scenario, validateDataset } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Actor } = await import('apify');
    const { CheerioCrawler, Dataset } = await import('@crawlee/cheerio');

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const crawler = new CheerioCrawler({
            statusMessageCallback: async (ctx) => {
                return ctx.crawler.setStatusMessage(`this is status message from ${new Date().toISOString()}`, {
                    level: 'INFO',
                });
            },
            statusMessageLoggingInterval: 1,
            async requestHandler({ $, enqueueLinks, request, log }) {
                const { url } = request;
                await enqueueLinks({
                    include: ['https://crawlee.dev/js/docs/**'],
                });

                const pageTitle = $('title').first().text();
                log.info(`URL: ${url} TITLE: ${pageTitle}`);

                await Dataset.pushData({ url, pageTitle });
            },
        });

        await crawler.run(['https://crawlee.dev/js/docs/quick-start']);
    }, mainOptions);
};

test('cheerio-default', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('cheerio-default', { source: scenario(import.meta.filename, main), memory: 4096 });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBeGreaterThan(40);
    expect(items.length).toBeGreaterThan(40);
    expect(validateDataset(items, ['url', 'pageTitle'])).toBe(true);
});
