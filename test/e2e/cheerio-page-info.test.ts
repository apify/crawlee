import { getStats, harness, scenario, validateDataset } from './harness.js';

const { test } = harness();

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

test('cheerio-page-info', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('cheerio-page-info', {
        source: scenario(import.meta.filename, main),
        memory: 4096,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBe(2);
    expect(items).toHaveLength(1);
    expect(validateDataset(items, ['url', 'title', 'uniqueIdentifier', 'firstParagraph', 'modifiedDate'])).toBe(true);
});
