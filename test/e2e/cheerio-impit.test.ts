import type { Dictionary } from '@crawlee/types';

import { getStats, harness, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { CheerioCrawler, Session, SessionPool } = await import('@crawlee/cheerio');
    const { Browser, ImpitHttpClient } = await import('@crawlee/impit-client');
    const { Actor } = await import('apify');

    await Actor.init();

    const crawler = new CheerioCrawler({
        async requestHandler(context) {
            const text = await (
                await context.sendRequest({
                    url: 'https://api.apify.com/v2/browser-info',
                })
            ).text();

            const json = (await (
                await context.sendRequest({
                    url: 'https://api.apify.com/v2/browser-info',
                })
            ).json()) as Dictionary;

            await context.pushData({
                body: context.body,
                title: context.$('title').text(),
                userAgent: (json.headers as Dictionary)['user-agent'],
                clientIpTextResponse: text,
                clientIpJsonResponse: json,
            });
        },
        httpClient: new ImpitHttpClient({ browser: Browser.Firefox }),
        // The random default session fingerprint would override the client's browser
        // impersonation, so pin the sessions to Firefox as well.
        sessionPool: new SessionPool({
            createSessionFunction: async (opts) =>
                new Session({
                    ...opts?.sessionOptions,
                    fingerprint: { browser: 'firefox', platform: 'linux', device: 'desktop' },
                }),
        }),
    });

    await crawler.run(['https://crawlee.dev']);

    await Actor.exit({ exit: Actor.isAtHome() });
};

test('cheerio-impit', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('cheerio-impit', { source: scenario(import.meta.filename, main), memory: 4096 });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBeGreaterThan(0);
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.body.length).toBeGreaterThan(1000);
    expect(item.title.toLowerCase()).toContain('crawlee');
    expect(item.userAgent, 'Impit spoofs Firefox').toMatch(/Gecko\/\d{8} Firefox\/\d{2}/);
    expect(item.clientIpJsonResponse.clientIp).toBeDefined();
    expect(JSON.parse(item.clientIpTextResponse).clientIp).toBeDefined();
});
