import { harness, scenario, validateDataset } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { once } = (await import('node:events')).default;
    const { URL } = await import('node:url');
    const { Worker, workerData } = await import('node:worker_threads');
    const { CheerioCrawler, Dataset, serviceLocator } = await import('@crawlee/cheerio');
    const { Actor } = await import('apify');

    process.env.CRAWLEE_PURGE_ON_START = '0';

    const mainOptions = { exit: Actor.isAtHome() };

    const thisFile = new URL(import.meta.url);

    if (workerData !== '#actor') {
        const firstRun = new Worker(thisFile, {
            workerData: '#actor',
        });

        const [firstExitCode] = await once(firstRun, 'exit');

        const secondRun = new Worker(thisFile, {
            workerData: '#actor',
        });

        const [secondExitCode] = await once(secondRun, 'exit');

        if (firstExitCode !== 0 || secondExitCode !== 0) {
            throw new Error(`Unexpected exit code:\nfirst run: ${firstExitCode}\nsecond run: ${secondExitCode}`);
        }
    } else {
        await Actor.main(async () => {
            const crawler = new CheerioCrawler({
                maxConcurrency: 1,
                maxRequestsPerCrawl: 5,
                async requestHandler({ enqueueLinks, request }) {
                    const { url } = request;
                    await enqueueLinks();

                    await Dataset.pushData({ url });

                    process.emit('SIGINT');
                },
            });

            // @ts-expect-error resets the backend's private purge flag so the second worker run purges again
            serviceLocator.getStorageBackend().__purged = false;

            await crawler.run(['https://crawlee.dev']);
        }, mainOptions);
    }
};

test('migration', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('migration', { source: scenario(import.meta.filename, main), memory: 4096 });
    const result = await runActor(actor);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(items).toHaveLength(2);
    expect(validateDataset(items, ['url'])).toBe(true);
    expect(items[0].url).not.toBe(items[1].url);
});
