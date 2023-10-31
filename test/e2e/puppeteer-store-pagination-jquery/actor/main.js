import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        maxRequestsPerCrawl: 10,
        preNavigationHooks: [async ({ page }, goToOptions) => {
            await page.evaluateOnNewDocument(() => {
                localStorage.setItem('themeExitPopup', 'true');
            });
            goToOptions.waitUntil = ['networkidle2'];
        }],
        async requestHandler({ page, request, log, enqueueLinks, injectJQuery }) {
            const { url, userData: { label } } = request;

            if (label === 'START') {
                log.info('Store opened');
                const nextButtonSelector = '.pagination__next';
                // enqueue product details from the first three pages of the store
                for (let pageNo = 1; pageNo < 3; pageNo++) {
                    // Wait for network events to finish
                    await page.waitForNetworkIdle();
                    // Enqueue all loaded links
                    await enqueueLinks({
                        selector: 'a.product-item__image-wrapper',
                        label: 'DETAIL',
                        globs: ['https://warehouse-theme-metal.myshopify.com/*/*'],
                    });
                    log.info(`Enqueued actors for page ${pageNo}`);
                    log.info('Loading the next page');
                    await page.evaluate((el) => document.querySelector(el)?.click(), nextButtonSelector);
                }
            } else if (label === 'DETAIL') {
                log.info(`Scraping ${url}`);
                await injectJQuery();
                const urlPart = url.split('/').slice(-1); // ['sennheiser-mke-440-professional-stereo-shotgun-microphone-mke-440']
                const manufacturer = urlPart[0].split('-')[0]; // 'sennheiser'

                /* eslint-disable no-undef */
                const results = await page.evaluate(() => {
                    const rawPrice = $('span.price')
                        .filter((_, el) => $(el).text().includes('$'))
                        .first()
                        .text()
                        .split('$')[1];

                    const price = Number(rawPrice.replaceAll(',', ''));

                    const inStock = $('span.product-form__inventory')
                        .first()
                        .filter((_, el) => $(el).text().includes('In stock'))
                        .length !== 0;

                    return {
                        title: $('.product-meta h1').text(),
                        sku: $('span.product-meta__sku-number').text(),
                        currentPrice: price,
                        availableInStock: inStock,
                    };
                });

                /* eslint-enable no-undef */

                await Dataset.pushData({ url, manufacturer, ...results });
            }
        },
    });

    await crawler.run([{ url: 'https://warehouse-theme-metal.myshopify.com/collections/all-tvs', userData: { label: 'START' } }]);
}, mainOptions);
