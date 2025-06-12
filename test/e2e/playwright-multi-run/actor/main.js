import { Actor } from 'apify';
import { Dataset, PlaywrightCrawler } from '@crawlee/playwright';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    await Actor.init({ storage: new (await import('@apify/storage-local')).ApifyStorageLocal() });
} else {
    await Actor.init();
}

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 10,
    async requestHandler({ log, page, enqueueLinks, request }) {
        const { url } = request;
        log.info(`Processing ${url}...`);
        const pageTitle = await page.title();
        await Dataset.pushData({ url, pageTitle });
        await enqueueLinks({
            globs: ['**/3.0/examples/*'],
        });
    },
});

crawler.log.info('=== Run 1 ===');
await crawler.run(['https://crawlee.dev/js/docs/3.0/examples']);
crawler.log.info('=== Run 2 ===');
await crawler.run(['https://crawlee.dev/js/docs/3.0/examples']);
crawler.log.info('=== Run 3 ===');
await crawler.run(['https://crawlee.dev/js/docs/3.0/examples']);

await Actor.exit({ exit: Actor.isAtHome() });
