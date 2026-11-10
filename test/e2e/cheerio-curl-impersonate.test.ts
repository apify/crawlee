import type { CustomFetchOptions } from '@crawlee/http-client';
import type { Dictionary } from '@crawlee/types';

import { getStats, harness, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { CheerioCrawler } = await import('@crawlee/cheerio');
    const { BaseHttpClient, ResponseWithUrl } = await import('@crawlee/http-client');
    const { Actor } = await import('apify');
    const { CurlImpersonate } = await import('apify-node-curl-impersonate');

    await Actor.init();

    interface CurlImpersonateHttpClientOptions {
        impersonate?: ConstructorParameters<typeof CurlImpersonate>[1]['impersonate'];
    }

    /**
     * A v4 `BaseHttpClient` implementation backed by `apify-node-curl-impersonate`.
     * The base class provides redirect following, proxy and cookie handling - this
     * only performs the raw request and wraps the result in a fetch `Response`.
     */
    class CurlImpersonateHttpClient extends BaseHttpClient {
        readonly #options: CurlImpersonateHttpClientOptions;

        constructor(options: CurlImpersonateHttpClientOptions = {}) {
            super();
            this.#options = options;
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
                method: request.method,
                headers,
                flags,
                impersonate: this.#options.impersonate,
                followRedirects: false,
                debugLogger: () => {},
            });

            const response = await curl.makeRequest();

            // The parsed curl headers include the status line as a key (e.g. "HTTP/2 200 "),
            // which the fetch Headers constructor rejects - keep only valid header names.
            const responseHeaders: Record<string, string> = {};
            for (const [name, value] of Object.entries(response.responseHeaders ?? {})) {
                if (/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
                    responseHeaders[name] = String(value);
                }
            }

            return new ResponseWithUrl(response.response, {
                status: response.statusCode,
                headers: responseHeaders,
                url: response.url ?? request.url,
            });
        }
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
        httpClient: new CurlImpersonateHttpClient({ impersonate: 'chrome-116' }),
    });

    await crawler.run(['https://crawlee.dev']);

    await Actor.exit({ exit: Actor.isAtHome() });
};

test('cheerio-curl-impersonate', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('cheerio-curl-impersonate', {
        source: scenario(import.meta.filename, main, { image: 'curl-impersonate' }),
        memory: 4096,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBeGreaterThan(0);
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.body.length).toBeGreaterThan(1000);
    expect(item.title.toLowerCase()).toContain('crawlee');
    expect(item.userAgent).toBe(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    );
    expect(item.clientIpJsonResponse.clientIp).toBeDefined();
    expect(JSON.parse(item.clientIpTextResponse).clientIp).toBeDefined();
});
