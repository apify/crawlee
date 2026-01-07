import { Readable } from 'node:stream';

import type { BaseHttpClient as BaseHttpClientInterface, SendRequestOptions } from '@crawlee/types';
import type { Options } from 'got-scraping';
import { gotScraping } from 'got-scraping';

import { ResponseWithUrl } from './base-http-client.js';

interface CustomFetchOptions {
    proxyUrl?: string;
}

/**
 * Base HTTP client that provides fetch-like `sendRequest` with Crawlee-managed
 * behaviors (redirect handling, proxy and cookie handling). Concrete clients
 * implement only the low-level network call in `fetch`.
 */
export abstract class BaseHttpClient implements BaseHttpClientInterface {
    /**
     * Perform the raw network request and return a single Response without any
     * automatic redirect following or special error handling.
     */
    protected abstract fetch(input: Request, init?: RequestInit & CustomFetchOptions): Promise<Response>;

    private applyCookies(request: Request, cookieJar: any): Request {
        const cookies = cookieJar.getCookiesSync(request.url);
        if (cookies) {
            request.headers.set('cookie', cookies);
        }
        return request;
    }

    private setCookies(response: Response, cookieJar: any): void {
        const setCookieHeader = response.headers.get('set-cookie');
        if (setCookieHeader) {
            cookieJar.setCookieSync(setCookieHeader, response.url);
        }
    }

    /**
     * Public fetch-like method that handles redirects and uses provided proxy and cookie jar.
     */
    async sendRequest(initialRequest: Request, options?: SendRequestOptions): Promise<Response> {
        const maxRedirects = 10;
        let currentRequest = initialRequest;
        let redirectCount = 0;
        const proxyUrl = options?.proxyUrl ?? options?.session?.proxyInfo?.url;
        const cookieJar = options?.cookieJar ?? options?.session?.cookieJar;

        while (true) {
            this.applyCookies(currentRequest, cookieJar);

            const abortSignal = options?.timeout ? AbortSignal.timeout(options?.timeout) : undefined;
            const response = await this.fetch(currentRequest, {
                signal: abortSignal,
                proxyUrl,
            });

            this.setCookies(response, cookieJar);

            const status = response.status;
            const location = response.headers.get('location');
            if (location && status >= 300 && status < 400) {
                if (redirectCount++ >= maxRedirects) {
                    throw new Error(`Too many redirects (${maxRedirects}) while requesting ${currentRequest.url}`);
                }

                const nextUrl = new URL(location, response.url || currentRequest.url);

                const prevMethod = (currentRequest.method || 'GET').toUpperCase();
                let nextMethod = prevMethod;
                let nextBody: BodyInit | null = null;

                if (status === 303 || ((status === 301 || status === 302) && prevMethod === 'POST')) {
                    nextMethod = 'GET';
                    nextBody = null;
                } else {
                    nextBody = (currentRequest as any).body ?? null;
                }

                const nextHeaders = new Headers();
                currentRequest.headers.forEach((value, key) => nextHeaders.set(key, value));

                currentRequest = new Request(nextUrl.toString(), {
                    method: nextMethod,
                    headers: nextHeaders,
                    body: nextBody,
                    credentials: (currentRequest as any).credentials,
                    redirect: 'manual',
                });
                continue;
            }

            return response;
        }
    }

    // Temporary compatibility: implement stream to satisfy current interface.
    // Delegates to sendRequest; clients should rely on sendRequest only.
    async stream(request: Request, options?: SendRequestOptions): Promise<Response> {
        return this.sendRequest(request, options);
    }
}

/**
 * A HTTP client implementation based on the `got-scraping` library.
 */
export class GotScrapingHttpClient extends BaseHttpClient {
    /**
     * Type guard that validates the HTTP method (excluding CONNECT).
     * @param request - The HTTP request to validate
     */
    private validateRequest(
        request: Request,
    ): request is Request & { method: Exclude<Request['method'], 'CONNECT' | 'connect'> } {
        return !['CONNECT', 'connect'].includes(request.method!);
    }

    private *iterateHeaders(
        headers: Record<string, string | string[] | undefined>,
    ): Generator<[string, string], void, unknown> {
        for (const [key, value] of Object.entries(headers)) {
            if (key.startsWith(':') || value === undefined) continue;
            if (Array.isArray(value)) {
                for (const v of value) yield [key, v];
            } else {
                yield [key, value];
            }
        }
    }

    private parseHeaders(headers: Record<string, string | string[] | undefined>): Headers {
        return new Headers([...this.iterateHeaders(headers)]);
    }

    override async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        const { proxyUrl } = options ?? {};

        if (!this.validateRequest(request)) {
            throw new Error(`The HTTP method CONNECT is not supported by the GotScrapingHttpClient.`);
        }

        const gotResult = await gotScraping({
            url: request.url!,
            method: request.method as Options['method'],
            headers: Object.fromEntries(request.headers.entries()),
            body: request.body ? Readable.fromWeb(request.body as any) : undefined,
            proxyUrl: proxyUrl,
            signal: options?.signal ?? undefined,
            followRedirect: false,
        });

        const responseHeaders = this.parseHeaders(gotResult.headers);

        return new ResponseWithUrl(new Uint8Array(gotResult.rawBody), {
            headers: responseHeaders,
            status: gotResult.statusCode,
            statusText: gotResult.statusMessage ?? '',
            url: gotResult.url,
        });
    }
}
