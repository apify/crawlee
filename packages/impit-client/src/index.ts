import { BaseHttpClient, CustomFetchOptions, ResponseWithUrl } from '@crawlee/http-client';
import { Impit, type ImpitOptions } from 'impit';
import type { CookieJar as ToughCookieJar } from 'tough-cookie';

import { LruCache } from '@apify/datastructures';

export const Browser = {
    'Chrome': 'chrome',
    'Firefox': 'firefox',
} as const;

/**
 * A HTTP client implementation based on the `impit library.
 */
export class ImpitHttpClient extends BaseHttpClient {
    private impitOptions: ImpitOptions;

    /**
     * Enables reuse of `impit` clients for the same set of options.
     * This is useful for performance reasons, as creating
     * a new client for each request breaks TCP connection
     * (and other resources) reuse.
     */
    private clientCache: LruCache<{ client: Impit; cookieJar: ToughCookieJar }> = new LruCache({ maxLength: 10 });

    private getClient(options: ImpitOptions) {
        const { cookieJar, ...rest } = options;

        const cacheKey = JSON.stringify(rest);
        const existingClient = this.clientCache.get(cacheKey);

        if (existingClient && (!cookieJar || existingClient.cookieJar === cookieJar)) {
            return existingClient.client;
        }

        const client = new Impit(options);
        this.clientCache.add(cacheKey, { client, cookieJar: cookieJar as ToughCookieJar });

        return client;
    }

    constructor(options?: Omit<ImpitOptions, 'proxyUrl'>) {
        super();
        this.impitOptions = options ?? {};
    }

    /**
     * @inheritDoc
     */
    async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        const { proxyUrl, redirect } = options ?? {};

        const impit = this.getClient({
            ...this.impitOptions,
            proxyUrl,
            followRedirects: redirect === 'follow',
        });

        // todo - missing support for aborts / timeouts (see https://github.com/apify/impit/issues/348)
        const response = await impit.fetch(request)

        // todo - cast shouldn't be needed here, impit returns `Uint8Array`
        return new ResponseWithUrl((await response.bytes()) as any, response);
    }
}
