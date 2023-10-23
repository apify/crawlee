import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        maxRequestsPerCrawl: 10,
        preNavigationHooks: [({ session, request }, goToOptions) => {
            session?.setCookies([{ name: 'OptanonAlertBoxClosed', value: new Date().toISOString() }], request.url);
            goToOptions.waitUntil = ['networkidle2'];
        }],
        async requestHandler({ page, request, log, enqueueLinks, injectJQuery }) {
            const { url, userData: { label } } = request;

            if (label === 'START') {
                log.info('Store opened');
                const nextButtonSelector = '[data-test="pagination-button-next"]:not([disabled])';
                // enqueue actor details from the first three pages of the store
                for (let pageNo = 1; pageNo <= 3; pageNo++) {
                    // Wait for network events to finish
                    await page.waitForNetworkIdle();
                    // Enqueue all loaded links
                    await enqueueLinks({
                        selector: 'div.ActorStore-main div > a',
                        globs: [{ glob: 'https://apify.com/*/*', userData: { label: 'DETAIL' } }],
                    });
                    log.info(`Enqueued actors for page ${pageNo}`);
                    log.info('Loading the next page');
                    await page.evaluate((el) => document.querySelector(el)?.click(), nextButtonSelector);
                }
            } else if (label === 'DETAIL') {
                log.info(`Scraping ${url}`);
                await injectJQuery();
                const uniqueIdentifier = url.split('/').slice(-2).join('/');
                const results = await page.evaluate(() => ({
                    title: $('header h1').text(), // eslint-disable-line
                    description: $('div.Section-body > div > p').text(), // eslint-disable-line
                    modifiedDate: $('div:nth-of-type(2) > ul > li:nth-of-type(3)').text(), // eslint-disable-line
                    runCount: $('ul.ActorHeader-userMedallion li:nth-of-type(4)').text(), // eslint-disable-line
                }));

                await Dataset.pushData({ url, uniqueIdentifier, ...results });
            }
        },
    });

    await crawler.run([{ url: 'https://apify.com/store', userData: { label: 'START' } }]);
}, mainOptions);
