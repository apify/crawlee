import { Actor } from 'apify';
import { Dataset, PlaywrightCrawler } from '@crawlee/playwright';

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
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PlaywrightCrawler({
        preNavigationHooks: [({ session, request }, goToOptions) => {
            session.setCookies([
                {
                    name: 'session',
                    value: 'true',
                },
            ], request.url);
            request.headers.cookie = 'hook_request=true';

            goToOptions.waitUntil = 'networkidle';
        }],
        async requestHandler({ page }) {
            const initialCookiesLength = expectedCookies.length;

            const pageCookies = await page.context().cookies();

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
