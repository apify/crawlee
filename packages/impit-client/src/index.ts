import type { CustomFetchOptions } from '@crawlee/http-client';
import { BaseHttpClient, ResponseWithUrl } from '@crawlee/http-client';
import type { CrawleeLogger, SessionFingerprint } from '@crawlee/types';
import { Impit, type Browser as ImpitBrowser, type ImpitOptions, type RequestInit as ImpitRequestInit } from 'impit';
import type { CookieJar as ToughCookieJar } from 'tough-cookie';

import { LruCache } from '@apify/datastructures';

const IMPIT_BROWSER_BY_FINGERPRINT: Partial<Record<NonNullable<SessionFingerprint['browser']>, ImpitBrowser>> = {
    chrome: 'chrome',
    firefox: 'firefox',
};

export const Browser = {
    'Chrome': 'chrome',
    'Firefox': 'firefox',
} as const;

/**
 * A HTTP client implementation based on the `impit` library.
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

    constructor(options?: Omit<ImpitOptions, 'proxyUrl' | 'timeout'> & { logger?: CrawleeLogger }) {
        super({ logger: options?.logger });
        this.impitOptions = options ?? {};
    }

    /**
     * @inheritDoc
     */
    async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        const { proxyUrl, redirect, signal, session } = options ?? {};
        const fingerprint = session?.fingerprint;

        const impitBrowser = fingerprint?.browser && IMPIT_BROWSER_BY_FINGERPRINT[fingerprint.browser];

        const impit = this.getClient({
            ...this.impitOptions,
            ...(impitBrowser ? { browser: impitBrowser } : {}),
            proxyUrl,
            followRedirects: redirect === 'follow',
        });

        const fetchInit: ImpitRequestInit = { signal: signal ?? undefined };
        const fingerprintHeaders = this.buildFingerprintHeaders(request, fingerprint);
        if (fingerprintHeaders) fetchInit.headers = fingerprintHeaders;

        const response = await impit.fetch(request, fetchInit);

        // todo - cast shouldn't be needed here, impit returns `Uint8Array`
        return new ResponseWithUrl(response.body, response);
    }

    /**
     * Merge session-declared fingerprint headers under the actual request headers
     * (request wins) so impit's browser impersonation gets overridden in a way that
     * matches the session, without mutating the caller's `Request`.
     */
    private buildFingerprintHeaders(request: Request, fingerprint?: SessionFingerprint): Headers | undefined {
        if (!fingerprint) return undefined;
        const headers = new Headers();
        if (fingerprint.headers) {
            for (const [key, value] of Object.entries(fingerprint.headers)) headers.set(key, value);
        }
        if (fingerprint.userAgent && !headers.has('user-agent')) headers.set('user-agent', fingerprint.userAgent);
        request.headers.forEach((value, key) => headers.set(key, value));
        return [...headers.keys()].length > 0 ? headers : undefined;
    }
}
