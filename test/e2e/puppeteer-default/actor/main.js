import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        preNavigationHooks: [(_ctx, goToOptions) => {
            goToOptions.waitUntil = ['networkidle2'];
        }],
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
}, mainOptions);
