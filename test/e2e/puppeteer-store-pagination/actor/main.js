import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';

await Actor.init({ storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined });

const crawler = new PuppeteerCrawler({
    maxRequestsPerCrawl: 10,
    preNavigationHooks: [({ session, request }, goToOptions) => {
        session?.setCookies([{ name: 'OptanonAlertBoxClosed', value: new Date().toISOString() }], request.url);
        goToOptions.waitUntil = ['networkidle2'];
    }],
});

crawler.router.addHandler('START', async ({ log, enqueueLinks, page }) => {
    log.info('Store opened');
    const nextButtonSelector = '.data-tracking-actor-pagination-button-load-more:not([disabled])';
    // enqueue actor details from the first three pages of the store
    for (let pageNo = 1; pageNo <= 3; pageNo++) {
        // Wait for network events to finish
        await page.waitForNetworkIdle();
        // Enqueue all loaded links
        await enqueueLinks({
            selector: '[data-test="actorCard"] > a',
            label: 'DETAIL',
            globs: ['https://apify.com/*/*'],
        });
        log.info(`Enqueued actors for page ${pageNo}`);
        log.info('Loading the next page');
        await page.evaluate((el) => document.querySelector(el)?.click(), nextButtonSelector);
    }
});

crawler.router.addHandler('DETAIL', async ({ log, page, request: { url } }) => {
    log.info(`Scraping ${url}`);

    const uniqueIdentifier = url.split('/').slice(-2).join('/');
    const titleP = page.$eval('header h1', ((el) => el.textContent));
    const descriptionP = page.$eval('header p.ActorHeader-description', ((el) => el.textContent));
    const modifiedTimestampP = page.$eval('ul.ActorHeader-userMedallion time', (el) => el.getAttribute('datetime'));
    const runCountTextP = page.$eval('ul.ActorHeader-userMedallion li:nth-of-type(4)', ((el) => el.textContent));
    const [
        title,
        description,
        modifiedTimestamp,
        runCountText,
    ] = await Promise.all([
        titleP,
        descriptionP,
        modifiedTimestampP,
        runCountTextP,
    ]);
    const modifiedDate = new Date(Number(modifiedTimestamp));
    const runCount = Number(runCountText.match(/[\d,]+/)[0].replace(/,/g, ''));

    await Dataset.pushData({ url, uniqueIdentifier, title, description, modifiedDate, runCount });
});

await crawler.run([{ url: 'https://apify.com/store?page=1', userData: { label: 'START' } }]);

await Actor.exit({ exit: Actor.isAtHome() });
