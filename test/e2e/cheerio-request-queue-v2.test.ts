import { testActor } from 'apify-test-tools';

import { getStats, scenario, validateDataset } from './harness.js';

export const main = async () => {
    const { Actor, log: Logger } = await import('apify');
    const { ApifyLogAdapter, CheerioCrawler, Dataset } = await import('@crawlee/cheerio');

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const crawler = new CheerioCrawler({
            async requestHandler({ $, enqueueLinks, request, log }) {
                const { url } = request;
                await enqueueLinks({
                    include: ['https://crawlee.dev/js/docs/**'],
                });

                const pageTitle = $('title').first().text();
                log.info(`REQUEST ID: ${request.id} URL: ${url} TITLE: ${pageTitle}`);

                await Dataset.pushData({ url, pageTitle });
            },
            logger: new ApifyLogAdapter(
                Logger.child({
                    prefix: 'CheerioCrawler',
                }),
            ),
        });

        try {
            await crawler.run(['https://crawlee.dev/js/docs/quick-start']);
        } catch (e) {
            console.error(e);
        }
    }, mainOptions);
};

const actor = scenario('cheerio-request-queue-v2', import.meta.filename, main, { memory: 4096 });

testActor(actor, 'crawls with the request queue v2', async ({ expect, run }) => {
    const result = await run();
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBeGreaterThan(40);
    expect(items.length).toBeGreaterThan(40);
    expect(validateDataset(items, ['url', 'pageTitle'])).toBe(true);
});
