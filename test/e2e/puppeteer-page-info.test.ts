import { getStats, harness, scenario, validateDataset } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Actor } = await import('apify');
    const { Dataset, PuppeteerCrawler } = await import('@crawlee/puppeteer');

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const crawler = new PuppeteerCrawler({
            preNavigationHooks: [
                ({ gotoOptions }) => {
                    gotoOptions.waitUntil = ['networkidle2'];
                },
            ],
            async requestHandler({ page, enqueueLinks, request }) {
                const {
                    userData: { label },
                } = request;

                if (label === 'START') {
                    await enqueueLinks({
                        include: ['**/examples/accept-user-input'],
                        userData: { label: 'DETAIL' },
                    });
                }

                if (label === 'DETAIL') {
                    const { url } = request;

                    const uniqueIdentifier = url.split('/').slice(-2).join('/');

                    const titleP = page.$eval('.markdown h1', (el) => el.textContent);
                    const firstParagraphP = page.$eval('.markdown > p', (el) => el.textContent);
                    const modifiedDateP = page.$eval('.theme-last-updated time', (el) => el.getAttribute('datetime'));
                    const [title, description, modifiedDate] = await Promise.all([
                        titleP,
                        firstParagraphP,
                        modifiedDateP,
                    ]);

                    await Dataset.pushData({ url, uniqueIdentifier, title, description, modifiedDate });
                }
            },
        });

        await crawler.run([{ url: 'https://crawlee.dev/docs/3.12/examples', userData: { label: 'START' } }]);
    }, mainOptions);
};

test('puppeteer-page-info', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('puppeteer-page-info', {
        source: scenario(import.meta.filename, main, { image: 'puppeteer' }),
        memory: 16384,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBe(2);
    expect(items).toHaveLength(1);
    expect(validateDataset(items, ['url', 'title', 'uniqueIdentifier', 'description', 'modifiedDate'])).toBe(true);
});
