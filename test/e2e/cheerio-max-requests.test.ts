import { getStats, harness, scenario, validateDataset } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Actor } = await import('apify');
    const { CheerioCrawler, ConcurrencySystem, Dataset } = await import('@crawlee/cheerio');

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        // The caller owns an injected system's lifecycle - start it before the crawler runs and stop it afterwards.
        const concurrencySystem = new ConcurrencySystem({ desiredConcurrency: 2 });

        const crawler = new CheerioCrawler({
            maxRequestsPerCrawl: 10,
            concurrencySystem,
            async requestHandler({ $, request }) {
                const {
                    url,
                    userData: { label },
                } = request;

                if (label === 'START') {
                    const links = $('a.card')
                        .toArray()
                        .map((item) => $(item).attr('href'));
                    for (const link of links) {
                        const actorDetailUrl = `https://crawlee.dev${link}`;
                        await crawler.addRequests([
                            {
                                url: actorDetailUrl,
                                userData: { label: 'DETAIL' },
                            },
                        ]);
                    }
                } else if (label === 'DETAIL') {
                    const uniqueIdentifier = url.split('/').slice(-2).join('/');
                    const title = $('.markdown h1').text();
                    const firstParagraph = $('.markdown > p').text();
                    const modifiedDate = $('.theme-last-updated time').attr('datetime');

                    await Dataset.pushData({
                        url,
                        uniqueIdentifier,
                        title,
                        firstParagraph,
                        modifiedDate,
                    });
                }
            },
        });

        await concurrencySystem.start();
        try {
            await crawler.run([{ url: 'https://crawlee.dev/js/docs/examples', userData: { label: 'START' } }]);
        } finally {
            await concurrencySystem.stop();
        }
    }, mainOptions);
};

test('cheerio-max-requests', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('cheerio-max-requests', {
        source: scenario(import.meta.filename, main),
        memory: 4096,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBeGreaterThanOrEqual(10);
    expect(items.length).toBeGreaterThan(5);
    expect(items.length).toBeLessThan(15);
    expect(validateDataset(items, ['url', 'title', 'uniqueIdentifier', 'firstParagraph', 'modifiedDate'])).toBe(true);
});
