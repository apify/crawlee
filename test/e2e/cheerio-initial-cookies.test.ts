import type { Session } from '@crawlee/cheerio';

import { getStats, harness, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Actor } = await import('apify');
    const { CheerioCrawler, Dataset } = await import('@crawlee/cheerio');

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

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const crawler = new CheerioCrawler({
            additionalMimeTypes: ['application/json'],
            preNavigationHooks: [
                async ({ session, request }) => {
                    await (session as Session).setCookie('session=true', request.url);
                    request.headers!.cookie = 'hook_request=true';
                },
            ],
            async requestHandler({ json }) {
                const initialCookiesLength = expectedCookies.length;

                const cookieString: string = json.headers.cookie;
                const pageCookies = cookieString.split(';').map((cookie) => {
                    const [name, value] = cookie.split('=').map((str) => str.trim());
                    return { name, value };
                });

                let numberOfMatchingCookies = 0;
                for (const cookie of expectedCookies) {
                    if (
                        pageCookies.some(
                            (pageCookie) => pageCookie.name === cookie.name && pageCookie.value === cookie.value,
                        )
                    ) {
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
};

test('cheerio-initial-cookies', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('cheerio-initial-cookies', {
        source: scenario(import.meta.filename, main),
        memory: 4096,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBe(1);
    expect(items[0].numberOfMatchingCookies).toBe(3);
    expect(items[0].numberOfMatchingCookies, 'page cookies match the initial cookies').toBe(
        items[0].initialCookiesLength,
    );
});
