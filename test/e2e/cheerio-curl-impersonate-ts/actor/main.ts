import { CheerioCrawler } from '@crawlee/cheerio';
import { BaseHttpClient, type CustomFetchOptions, ResponseWithUrl } from '@crawlee/http-client';
import type { Dictionary } from '@crawlee/types';
import { Actor } from 'apify';
import { CurlImpersonate } from 'apify-node-curl-impersonate';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    // @ts-ignore
    await Actor.init({ storage: new (await import('@apify/storage-local')).ApifyStorageLocal() });
} else {
    await Actor.init();
}

interface CurlImpersonateHttpClientOptions {
    impersonate?: ConstructorParameters<typeof CurlImpersonate>[1]['impersonate'];
}

/**
 * A v4 `BaseHttpClient` implementation backed by `apify-node-curl-impersonate`.
 * The base class provides redirect following, proxy and cookie handling - this
 * only performs the raw request and wraps the result in a fetch `Response`.
 */
class CurlImpersonateHttpClient extends BaseHttpClient {
    constructor(private options: CurlImpersonateHttpClientOptions = {}) {
        super();
    }

    protected async fetch(request: Request, init?: RequestInit & CustomFetchOptions): Promise<Response> {
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key] = value;
        });

        const flags = ['--compressed'];
        if (init?.proxyUrl) {
            flags.push('--proxy', init.proxyUrl);
        }

        const curl = new CurlImpersonate(request.url, {
            method: request.method ?? 'GET',
            headers,
            flags,
            impersonate: this.options.impersonate,
            followRedirects: false,
            debugLogger: () => {},
        });

        const response = await curl.makeRequest();

        return new ResponseWithUrl(response.response, {
            status: response.statusCode,
            headers: response.responseHeaders as Record<string, string>,
            url: response.url ?? request.url,
        });
    }
}

const crawler = new CheerioCrawler({
    async requestHandler(context) {
        // sendRequest returns a WHATWG Response in v4
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
    httpClient: new CurlImpersonateHttpClient({ impersonate: 'chrome-116' }),
});

await crawler.run(['https://crawlee.dev']);

await Actor.exit({ exit: Actor.isAtHome() });
