import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from '@crawlee/cheerio';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new CheerioCrawler({
        async requestHandler({ $, enqueueLinks, request, log }) {
            const { url } = request;
            await enqueueLinks({
                globs: ['https://crawlee.dev/docs/**'],
            });

            const pageTitle = $('title').first().text();
            log.info(`URL: ${url} TITLE: ${pageTitle}`);

            await Dataset.pushData({ url, pageTitle });
        },
    });

    await crawler.run(['https://crawlee.dev/docs/quick-start']);
}, mainOptions);
