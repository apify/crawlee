import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';
import { ApifyStorageLocal } from '@apify/storage-local';

const expectedCookies = [
    {
        name: 'initial_request',
        value: 'true',
    },
    {
        name: 'session',
        value: 'true',
    },
    {
        name: 'hook_request',
        value: 'true',
    },
];

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        preNavigationHooks: [({ session, request }, goToOptions) => {
            session.setCookies([
                {
                    name: 'session',
                    value: 'true',
                },
            ], request.url);
            request.headers.cookie = 'hook_request=true';

            goToOptions.waitUntil = ['networkidle2'];
        }],
        async requestHandler({ page }) {
            const initialCookiesLength = expectedCookies.length;

            const pageCookies = await page.cookies();

            let numberOfMatchingCookies = 0;
            for (const cookie of expectedCookies) {
                if (pageCookies.some((pageCookie) => pageCookie.name === cookie.name && pageCookie.value === cookie.value)) {
                    numberOfMatchingCookies++;
                }
            }

            await Dataset.pushData({ initialCookiesLength, numberOfMatchingCookies });
        },
    });

    await crawler.run([
        {
            url: 'https://api.apify.com/v2/browser-info',
            headers: {
                Cookie: 'initial_request=true',
            },
        },
    ]);
}, mainOptions);
