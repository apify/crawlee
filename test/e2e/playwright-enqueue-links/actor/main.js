import { Actor } from 'apify';
import { PlaywrightCrawler, log } from '@crawlee/playwright';

process.env.APIFY_LOG_LEVEL = 'DEBUG';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: 30,
        requestHandler: async ({ page, request, enqueueLinks, closeCookieModals }) => {
            const { url, loadedUrl } = request;

            const pageTitle = await page.title();
            log.info(`URL: ${url}; LOADED_URL: ${loadedUrl}; TITLE: ${pageTitle}`);

            await closeCookieModals();
            // Wait for the actor cards to render,
            // otherwise enqueueLinks wouldn't enqueue anything.
            await page.waitForSelector('.ActorStorePagination-buttons a');

            // Add links to the queue, but only from
            // elements matching the provided selector.
            await enqueueLinks({
                selector: '.ActorStorePagination-buttons a',
            });
        },
    });

    await crawler.run(['https://apify.com/store']);
}, mainOptions);
