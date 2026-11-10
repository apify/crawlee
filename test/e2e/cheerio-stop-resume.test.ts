import { getStats, harness, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { CheerioCrawler, Dataset } = await import('@crawlee/cheerio');
    const { Actor } = await import('apify');

    await Actor.init();

    let requestCount = 0;

    const crawler = new CheerioCrawler();
    crawler.router.addDefaultHandler(async ({ $, enqueueLinks, request, log }) => {
        const { url } = request;
        await enqueueLinks({
            include: ['https://crawlee.dev/js/docs/**'],
        });

        const pageTitle = $('title').first().text();
        log.info(`URL: ${url} TITLE: ${pageTitle}`);
        await Dataset.pushData({ url, pageTitle });

        if (requestCount++ > 10) crawler.stop();
    });

    await crawler.run(['https://crawlee.dev/js/docs/quick-start']);

    requestCount = 0;
    await crawler.run(['https://crawlee.dev/js/docs/quick-start']);
    await Actor.exit({ exit: Actor.isAtHome() });
};

test('cheerio-stop-resume', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('cheerio-stop-resume', {
        source: scenario(import.meta.filename, main),
        memory: 4096,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    // Some extra requests are expected (at most 10 extra for each run).
    expect(stats.requestsSucceeded, 'crawler.stop() works').toBeLessThan(40);
    const visitedUrls = new Set(items.map((item) => item.url));
    expect(visitedUrls.size, 'a second crawler.run() resumes the same queue').toBe(items.length);
});
