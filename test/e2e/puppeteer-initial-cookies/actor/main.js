import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';
import { ApifyStorageLocal } from '@apify/storage-local';

const initialCookies = [
    {
        name: 'test',
        value: 'testing cookies',
    },
    {
        name: 'store',
        value: 'value store',
    },
    {
        name: 'market_place',
        value: 'value market place',
    },
];

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        preNavigationHooks: [({ session, request }, goToOptions) => {
            session.setCookies(initialCookies, request.url);
            goToOptions.waitUntil = ['networkidle2'];
        }],
        async requestHandler({ page }) {
            const initialCookiesLength = initialCookies.length;

            const pageCookies = await page.cookies();

            let numberOfMatchingCookies = 0;
            for (const cookie of initialCookies) {
                if (pageCookies.some((pageCookie) => pageCookie.name === cookie.name && pageCookie.value === cookie.value)) {
                    numberOfMatchingCookies++;
                }
            }

            await Dataset.pushData({ initialCookiesLength, numberOfMatchingCookies });
        },
    });

    await crawler.run(['https://api.apify.com/v2/browser-info']);
}, mainOptions);
