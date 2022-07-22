import { ApifyClient } from 'apify-client';
import { Configuration, CheerioCrawler, Dataset } from '@crawlee/cheerio';
import { ApifyStorageLocal } from '@apify/storage-local';

const config = Configuration.getGlobalConfig();
config.set('availableMemoryRatio', 1);

if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
    config.set('defaultDatasetId', process.env.APIFY_DEFAULT_DATASET_ID);
    config.set('defaultKeyValueStoreId', process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID);
    config.set('defaultRequestQueueId', process.env.APIFY_DEFAULT_REQUEST_QUEUE_ID);
    config.useStorageClient(new ApifyClient({
        baseUrl: process.env.APIFY_API_BASE_URL,
        token: process.env.APIFY_TOKEN,
    }));
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
