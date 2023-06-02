import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        launchContext: { launchOptions: { ignoreHTTPSErrors: true } },
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
                await Dataset.pushData({ url, title });
            }
        },
    });

    await crawler.run([{ url: 'https://badssl.com', userData: { label: 'START' } }]);
}, mainOptions);
