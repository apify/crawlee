import { testActor } from 'apify-test-tools';

import { getStats, scenario, validateDataset } from './harness.js';

export const main = async () => {
    const { Actor } = await import('apify');
    const { CheerioCrawler, createCheerioRouter, Dataset } = await import('@crawlee/cheerio');

    const mainOptions = { exit: Actor.isAtHome() };

    const router = createCheerioRouter();

    router.addHandler('START', async ({ enqueueLinks }) => {
        await enqueueLinks({
            label: 'DETAIL',
            include: ['**/examples/accept-user-input'],
        });
    });

    router.addHandler('DETAIL', async ({ request, $ }) => {
        const { url } = request;

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
    });

    await Actor.main(async () => {
        const crawler = new CheerioCrawler({
            requestHandler: router,
        });

        await crawler.run([{ url: 'https://crawlee.dev/js/docs/3.12/examples', userData: { label: 'START' } }]);
    }, mainOptions);
};

const actor = scenario('cheerio-page-info', import.meta.filename, main, { memory: 4096 });

testActor(actor, 'extracts page info through a router', async ({ expect, run }) => {
    const result = await run();
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBe(2);
    expect(items).toHaveLength(1);
    expect(validateDataset(items, ['url', 'title', 'uniqueIdentifier', 'firstParagraph', 'modifiedDate'])).toBe(true);
});
