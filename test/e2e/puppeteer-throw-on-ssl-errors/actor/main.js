import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        launchContext: { launchOptions: { ignoreHTTPSErrors: false } }, // This is the default
        preNavigationHooks: [(_ctx, goToOptions) => {
            goToOptions.waitUntil = ['networkidle2'];
        }],
        async requestHandler({ page, enqueueLinks, request, log }) {
            const { url, userData: { label } } = request;

            if (label === 'START') {
                log.info('Bad ssl page opened!');
                await enqueueLinks({
                    globs: [{ glob: 'https://*.badssl.com/', userData: { label: 'DETAIL' } }],
                    selector: '.group a.bad',
                });
            } else if (label === 'DETAIL') {
                log.info(`Scraping ${url}`);
                const title = await page.title();
                await Actor.pushData({ url, title });
            }
        },
    });

    await crawler.run([{ url: 'https://badssl.com', userData: { label: 'START' } }]);
}, mainOptions);
