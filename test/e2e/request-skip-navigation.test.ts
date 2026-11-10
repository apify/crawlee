import { harness, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Actor } = await import('apify');
    const { CheerioCrawler, Dataset, log, Request } = await import('@crawlee/cheerio');

    log.setLevel(log.LEVELS.DEBUG);

    const r1 = new Request({
        url: 'https://crawlee.dev/?q=1',
        skipNavigation: true,
        userData: { abc: { def: 'ghi' } },
    });

    const r2 = new Request({
        url: 'https://crawlee.dev/?q=2',
        skipNavigation: true,
    });
    r2.userData = { xyz: { kjl: 'mno' } };

    const r3 = new Request({
        url: 'https://crawlee.dev/?q=3',
    });

    const mainOptions = { exit: Actor.isAtHome() };

    // Persisting internal settings of `Request`.
    await Actor.main(async () => {
        let requestCounter = 0;
        let navigationCounter = 0;

        const crawler = new CheerioCrawler({
            preNavigationHooks: [
                () => {
                    navigationCounter++;
                },
            ],
            async requestHandler({ request }) {
                requestCounter++;
                if (request.skipNavigation) {
                    log.info(`Skipping ${request.id}...`);
                    return;
                }
                log.info(`Navigating on ${request.id}...`);
            },
        });

        await crawler.run([r1, r2, r3]);

        await Dataset.pushData({ requestCounter, navigationCounter });
    }, mainOptions);
};

test('request-skip-navigation', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('request-skip-navigation', {
        source: scenario(import.meta.filename, main),
        memory: 4096,
    });
    const result = await runActor(actor);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(items[0].requestCounter, 'processed 3 requests').toBe(3);
    expect(items[0].navigationCounter, 'navigated on 1 request only').toBe(1);
});
