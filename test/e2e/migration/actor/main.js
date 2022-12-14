import { Worker, workerData } from 'worker_threads';
import { URL } from 'url';
import { once } from 'events';
import { Actor } from 'apify';
import { CheerioCrawler, Configuration, Dataset } from '@crawlee/cheerio';
import { ApifyStorageLocal } from '@apify/storage-local';

process.env.CRAWLEE_PURGE_ON_START = '0';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

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

        // eslint-disable-next-line no-underscore-dangle
        Configuration.getGlobalConfig().getStorageClient().__purged = false;

        await crawler.run(['https://crawlee.dev']);
    }, mainOptions);
}
