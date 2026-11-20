import type { Session } from '@crawlee/puppeteer';
import { testActor } from 'apify-test-tools';

import { eachRuntime, getStats, scenario } from './harness.js';

export const main = async () => {
    const { Actor } = await import('apify');
    const { Dataset, PuppeteerCrawler } = await import('@crawlee/puppeteer');

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

    await Actor.main(async () => {
        const crawler = new PuppeteerCrawler({
            preNavigationHooks: [
                async ({ session, request, gotoOptions }) => {
                    await (session as Session).setCookie('session=true', request.url);
                    request.headers!.cookie = 'hook_request=true';

                    gotoOptions.waitUntil = ['networkidle2'];
                },
            ],
            async requestHandler({ page }) {
                const initialCookiesLength = expectedCookies.length;

                const pageCookies = await page.cookies();

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
    });
};

const actor = scenario('puppeteer-initial-cookies', import.meta.filename, main, { image: 'puppeteer', memory: 16384 });

eachRuntime((runtime) => {
    testActor(actor, 'sends the initial cookies', async ({ expect, run }) => {
        const result = await run({ runtime });
        const stats = await getStats(result);
        const { items } = await result.getDataset<any>();

        expect(result.status).toBe('SUCCEEDED');
        expect(stats.requestsSucceeded).toBe(1);
        expect(items[0].numberOfMatchingCookies).toBe(3);
        expect(items[0].numberOfMatchingCookies, 'page cookies match the initial cookies').toBe(
            items[0].initialCookiesLength,
        );
    });
});
