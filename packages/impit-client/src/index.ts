import type { CustomFetchOptions } from '@crawlee/http-client';
import { BaseHttpClient, ResponseWithUrl } from '@crawlee/http-client';
import type { CrawleeLogger, SessionFingerprint } from '@crawlee/types';
import { Impit, type Browser as ImpitBrowser, type ImpitOptions } from 'impit';
import type { CookieJar as ToughCookieJar } from 'tough-cookie';

import { LruCache } from '@apify/datastructures';

// Concrete impit impersonation profiles per browser family. The plain `chrome` /
// `firefox` aliases fall back to the oldest available version, which is a
// fingerprint giveaway — we pick one of these explicitly instead. Keep in sync
// with impit's `Browser` type when bumping the dependency.
const IMPIT_VERSIONS_BY_BROWSER: Partial<Record<NonNullable<SessionFingerprint['browser']>, ImpitBrowser[]>> = {
    chrome: [
        'chrome100',
        'chrome101',
        'chrome104',
        'chrome107',
        'chrome110',
        'chrome116',
        'chrome124',
        'chrome125',
        'chrome131',
        'chrome136',
        'chrome142',
    ],
    firefox: ['firefox128', 'firefox133', 'firefox135', 'firefox144'],
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
    private cacheClients: boolean;

    /**
     * Enables reuse of `impit` clients for the same set of options.
     * This is useful for performance reasons, as creating
     * a new client for each request breaks TCP connection
     * (and other resources) reuse.
     */
    private clientCache: LruCache<{ client: Impit; cookieJar: ToughCookieJar }> = new LruCache({ maxLength: 10 });

    /**
     * Stable impit impersonation version per fingerprint object, so the same
     * session keeps impersonating the same browser version across requests
     * instead of rerolling on every call.
     */
    private impitBrowserByFingerprint = new WeakMap<SessionFingerprint, ImpitBrowser>();

    private getClient(options: ImpitOptions): Impit {
        if (!this.cacheClients) {
            return new Impit(options);
        }

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

    /**
     * @param options.cacheClients Whether to cache `impit` clients between requests. Defaults to `true`.
     */
    constructor(
        options?: Omit<ImpitOptions, 'proxyUrl' | 'timeout'> & { cacheClients?: boolean; logger?: CrawleeLogger },
    ) {
        super({ logger: options?.logger });
        const { cacheClients = true, logger: _logger, ...impitOptions } = options ?? {};

        this.impitOptions = impitOptions;
        this.cacheClients = cacheClients;
    }

    /**
     * @inheritDoc
     */
    async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        const { proxyUrl, redirect, signal, fingerprint } = options ?? {};

        const impitBrowser = this.resolveImpitBrowser(fingerprint);

        const impit = this.getClient({
            ...this.impitOptions,
            ...(impitBrowser ? { browser: impitBrowser } : {}),
            proxyUrl,
            followRedirects: redirect === 'follow',
        });

        const response = await impit.fetch(request, { signal: signal ?? undefined });

        // todo - cast shouldn't be needed here, impit returns `Uint8Array`
        return new ResponseWithUrl(response.body, response);
    }

    private resolveImpitBrowser(fingerprint?: SessionFingerprint): ImpitBrowser | undefined {
        if (!fingerprint?.browser) return undefined;
        const versions = IMPIT_VERSIONS_BY_BROWSER[fingerprint.browser];
        if (!versions?.length) return undefined;

        const cached = this.impitBrowserByFingerprint.get(fingerprint);
        if (cached) return cached;

        const picked = versions[Math.floor(Math.random() * versions.length)];
        this.impitBrowserByFingerprint.set(fingerprint, picked);
        return picked;
    }
}
