import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from '@crawlee/cheerio';
import deepEqual from 'deep-equal';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new CheerioCrawler({
        maxRequestsPerCrawl: 30,
        async requestHandler({ $, enqueueLinks, request, log }) {
            const { url, loadedUrl } = request;

            const pageTitle = $('title').first().text();
            log.info(`URL: ${url}; LOADED_URL: ${loadedUrl}; TITLE: ${pageTitle}`);

            const results = await enqueueLinks({ selector: '[class^=CustomRebass__Box] a' });

            if (loadedUrl.startsWith('https://drive')) {
                const isEqual = deepEqual(results, { processedRequests: [], unprocessedRequests: [] });
                await Dataset.pushData({ isEqual });
            }
        },
    });

    await crawler.run(['https://apify.com/about']);
}, mainOptions);
