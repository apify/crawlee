import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from '@crawlee/cheerio';

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
    {
        name: 'got_options_upper_case',
        value: 'true',
    },
    {
        name: 'got_options_lower_case',
        value: 'true',
    },
];

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new CheerioCrawler({
        additionalMimeTypes: ['application/json'],
        preNavigationHooks: [({ session, request }, gotOptions) => {
            session.setCookies([
                {
                    name: 'session',
                    value: 'true',
                },
            ], request.url);
            request.headers.cookie = 'hook_request=true';

            gotOptions.headers ??= {};
            gotOptions.headers.Cookie = 'got_options_upper_case=true';
            gotOptions.headers.cookie = 'got_options_lower_case=true';
        }],
        async requestHandler({ json }) {
            const initialCookiesLength = expectedCookies.length;

            const cookieString = json.headers.cookie;
            const pageCookies = cookieString.split(';').map((cookie) => {
                const [name, value] = cookie.split('=').map((str) => str.trim());
                return { name, value };
            });

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
