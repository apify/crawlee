import { CheerioCrawler, Session, SessionPool } from '@crawlee/cheerio';
import type { Dictionary } from '@crawlee/types';
import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { Actor } from 'apify';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    // @ts-ignore
    await Actor.init({ storage: new (await import('@apify/storage-local')).ApifyStorageLocal() });
} else {
    await Actor.init();
}

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
