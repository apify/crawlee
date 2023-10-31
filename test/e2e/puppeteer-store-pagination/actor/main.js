import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';

await Actor.init({ storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined });

const crawler = new PuppeteerCrawler({
    maxRequestsPerCrawl: 10,
    preNavigationHooks: [async ({ page }, goToOptions) => {
        await page.evaluateOnNewDocument(() => {
            localStorage.setItem('themeExitPopup', 'true');
        });
        goToOptions.waitUntil = ['networkidle2'];
    }],
});

crawler.router.addHandler('START', async ({ log, enqueueLinks, page }) => {
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
});

crawler.router.addHandler('DETAIL', async ({ log, page, request: { url } }) => {
    log.info(`Scraping ${url}`);

    const urlPart = url.split('/').slice(-1); // ['sennheiser-mke-440-professional-stereo-shotgun-microphone-mke-440']
    const manufacturer = urlPart[0].split('-')[0]; // 'sennheiser'

    const title = await page.locator('.product-meta h1').map((el) => el.textContent).wait();
    const sku = await page.locator('span.product-meta__sku-number').map((el) => el.textContent).wait();

    const rawPriceString = await page
        .locator('span.price')
        .filter((el) => el.textContent.includes('$'))
        .map((el) => el.textContent)
        .wait();

    const rawPrice = rawPriceString.split('$')[1];
    const price = Number(rawPrice.replaceAll(',', ''));

    const inStock = await page
        .locator('span.product-form__inventory')
        .filter((el) => el.textContent.includes('In stock'))
        .map((el) => (!!el))
        .wait();

    const results = {
        url,
        manufacturer,
        title,
        sku,
        currentPrice: price,
        availableInStock: inStock,
    };

    await Dataset.pushData(results);
});

await crawler.run([{ url: 'https://warehouse-theme-metal.myshopify.com/collections/all-tvs', userData: { label: 'START' } }]);

await Actor.exit({ exit: Actor.isAtHome() });
