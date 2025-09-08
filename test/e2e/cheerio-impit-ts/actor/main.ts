import type { Dictionary } from '@crawlee/cheerio';
import { CheerioCrawler } from '@crawlee/cheerio';
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
        const { body: text } = await context.sendRequest({
            url: 'https://api.apify.com/v2/browser-info',
        });

        const { body: json } = await context.sendRequest<Dictionary>({
            url: 'https://api.apify.com/v2/browser-info',
            responseType: 'json',
        });

        await context.pushData({
            body: context.body,
            title: context.$('title').text(),
            userAgent: json.headers['user-agent'],
            clientIpTextResponse: text,
            clientIpJsonResponse: json,
        });
    },
    httpClient: new ImpitHttpClient({ browser: Browser.Firefox }),
});

await crawler.run(['https://crawlee.dev']);

await Actor.exit({ exit: Actor.isAtHome() });
