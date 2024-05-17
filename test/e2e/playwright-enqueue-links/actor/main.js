import { PlaywrightCrawler, Dataset, log } from '@crawlee/playwright';
import { Actor } from 'apify';
import deepEqual from 'deep-equal';

process.env.APIFY_LOG_LEVEL = 'DEBUG';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: 30,
        requestHandler: async ({ page, request, enqueueLinks, closeCookieModals }) => {
            const { url, loadedUrl } = request;

            const pageTitle = await page.title();
            log.info(`URL: ${url}; LOADED_URL: ${loadedUrl}; TITLE: ${pageTitle}`);

            await closeCookieModals();

            const results = await enqueueLinks();

            if (loadedUrl.startsWith('https://drive')) {
                const isEqual = deepEqual(results, { processedRequests: [], unprocessedRequests: [] });
                await Dataset.pushData({ isEqual });
            }
        },
    });

    await crawler.run(['https://apify.com/press-kit', 'https://apify.com/about']);
}, mainOptions);
