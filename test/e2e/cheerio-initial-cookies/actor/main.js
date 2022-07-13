import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';
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
    const crawler = new CheerioCrawler({
        additionalMimeTypes: ['application/json'],
        preNavigationHooks: [({ session, request }) => {
            session.setCookies(initialCookies, request.url);
        }],
        async requestHandler({ json }) {
            const initialCookiesLength = initialCookies.length;

            const cookieString = json.headers.cookie;
            const pageCookies = cookieString.split(';').map((cookie) => {
                const [name, value] = cookie.split('=').map((str) => str.trim());
                return { name, value };
            });

            let numberOfMatchingCookies = 0;
            for (const cookie of initialCookies) {
                if (pageCookies.some((pageCookie) => pageCookie.name === cookie.name && pageCookie.value === cookie.value)) {
                    numberOfMatchingCookies++;
                }
            }

            await Actor.pushData({ initialCookiesLength, numberOfMatchingCookies });
        },
    });

    await crawler.run(['https://api.apify.com/v2/browser-info']);
}, mainOptions);
