import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';
import deepEqual from 'deep-equal';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        maxRequestsPerCrawl: 30,
        async requestHandler({ page, enqueueLinks, request, log }) {
            const { url, loadedUrl } = request;

            const pageTitle = await page.title();
            log.info(`URL: ${url}; LOADED_URL: ${loadedUrl}; TITLE: ${pageTitle}`);

            const results = await enqueueLinks();

            if (loadedUrl.startsWith('https://drive')) {
                const isEqual = deepEqual(results, { processedRequests: [], unprocessedRequests: [] });
                await Dataset.pushData({ isEqual });
            }
        },
    });

    await crawler.run(['https://apify.com/press-kit', 'https://apify.com/about']);
}, mainOptions);
