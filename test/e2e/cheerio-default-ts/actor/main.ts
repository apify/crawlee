import { Actor } from 'apify';
import { Configuration, CheerioCrawler, Dataset } from '@crawlee/cheerio';
import { ApifyStorageLocal } from '@apify/storage-local';

const config = Configuration.getGlobalConfig();
config.set('availableMemoryRatio', 1);

if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
    await Actor.init();
} else if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    config.useStorageClient(new ApifyStorageLocal());
}

const crawler = new CheerioCrawler();

crawler.router.addDefaultHandler(async ({ $, enqueueLinks, request, log }) => {
    const { url } = request;
    await enqueueLinks({
        globs: ['https://crawlee.dev/docs/**'],
    });

    const pageTitle = $('title').first().text();
    log.info(`URL: ${url} TITLE: ${pageTitle}`);

    await Dataset.pushData({ url, pageTitle });
});

await crawler.run(['https://crawlee.dev/docs/quick-start']);
