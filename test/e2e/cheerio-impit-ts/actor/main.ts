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

function getHttpBinUrl(path: string): string {
    let url: URL;
    if (process.env.APIFY_HTTPBIN_TOKEN) {
        url = new URL(path, 'https://httpbin.apify.actor');
        url.searchParams.set('token', process.env.APIFY_HTTPBIN_TOKEN);
    } else {
        url = new URL(path, 'https://httpbin.org');
    }

    return url.href;
}

const crawler = new CheerioCrawler({
    async requestHandler(context) {
        const { body: text } = await context.sendRequest({
            url: getHttpBinUrl('/uuid'),
        });

        const { body: json } = await context.sendRequest({
            url: getHttpBinUrl('/uuid'),
            responseType: 'json',
        });

        const { body: ua } = await context.sendRequest<Dictionary>({
            url: getHttpBinUrl('/user-agent'),
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

await crawler.run([getHttpBinUrl('/')]);

await Actor.exit({ exit: Actor.isAtHome() });
