import { Actor } from 'apify';
// @ts-ignore
import { CheerioCrawler, Dataset } from '@crawlee/cheerio';
// @ts-ignore
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

// @ts-ignore
await Actor.main(async () => {
    const crawler = new CheerioCrawler();

    // @ts-ignore
    crawler.router.addDefaultHandler(async ({ $, enqueueLinks, request, log }) => {
        const { url } = request;
        await enqueueLinks({
            globs: ['https://crawlee.dev/docs/**'],
        });

        const pageTitle = $('title').first().text();
        log.info(`URL: ${url} TITLE: ${pageTitle}`);

        await Dataset.pushData({ url, pageTitle });
    });

    await crawler.run(['https://crawlee.dev/docs']);
}, mainOptions);
