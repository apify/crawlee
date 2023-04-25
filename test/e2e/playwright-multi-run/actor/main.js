import { Actor } from 'apify';
import { Dataset, PlaywrightCrawler } from '@crawlee/playwright';
import { ApifyStorageLocal } from '@apify/storage-local';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    await Actor.init({ storage: new ApifyStorageLocal() });
} else {
    await Actor.init();
}

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 10,
    async requestHandler({ page, enqueueLinks, request }) {
        const { url } = request;
        const pageTitle = await page.title();
        await Dataset.pushData({ url, pageTitle });
        await enqueueLinks({
            globs: ['**/3.0/examples/*'],
        });
    },
});

await crawler.run(['https://crawlee.dev/docs/3.0/examples/']);
await crawler.run(['https://crawlee.dev/docs/3.0/examples/']);
await crawler.run(['https://crawlee.dev/docs/3.0/examples/']);

await Actor.exit({ exit: Actor.isAtHome() });
