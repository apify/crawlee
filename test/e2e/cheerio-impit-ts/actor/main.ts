import { CheerioCrawler, Dictionary } from '@crawlee/cheerio';
import { Actor } from 'apify';
import { ImpitHttpClient, Browser } from '@crawlee/impit-client';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    // @ts-ignore
    await Actor.init({ storage: new (await import('@apify/storage-local')).ApifyStorageLocal() });
} else {
    await Actor.init();
}

const crawler = new CheerioCrawler({
    async requestHandler(context) {
        const { body: text } = await context.sendRequest({
            url: 'https://httpbin.org/uuid',
        });

        const { body: json } = await context.sendRequest({
            url: 'https://httpbin.org/uuid',
            responseType: 'json',
        });

        const { body: ua } = await context.sendRequest<Dictionary>({
            url: 'https://httpbin.org/user-agent',
            responseType: 'json',
        });

        await context.pushData({
            body: context.body,
            title: context.$('title').text(),
            userAgent: ua['user-agent'],
            uuidTextResponse: text,
            uuidJsonResponse: json,
        });
    },
    httpClient: new ImpitHttpClient({ browser: Browser.Firefox }),
});

await crawler.run(['https://httpbin.org/']);

await Actor.exit({ exit: Actor.isAtHome() });
