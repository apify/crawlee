import type { BaseHttpClient as BaseHttpClientInterface, SendRequestOptions } from '@crawlee/types';
import { CookieJar } from 'tough-cookie';

export interface CustomFetchOptions {
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

    private async applyCookies(request: Request, cookieJar: CookieJar): Promise<Request> {
        const cookies = (await cookieJar.getCookies(request.url)).map((x) => x.cookieString().trim()).filter(Boolean);

        if (cookies?.length > 0) {
            request.headers.set('cookie', cookies.join('; '));
        }
        return request;
    }

    private async setCookies(response: Response, cookieJar: CookieJar): Promise<void> {
        const setCookieHeader = response.headers.get('set-cookie');
        if (setCookieHeader) {
            await cookieJar.setCookie(setCookieHeader, response.url);
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
        const cookieJar = options?.cookieJar ?? options?.session?.cookieJar ?? new CookieJar();

        while (true) {
            await this.applyCookies(currentRequest, cookieJar as CookieJar);

            const abortSignal = options?.timeout ? AbortSignal.timeout(options?.timeout) : undefined;
            const response = await this.fetch(currentRequest, {
                signal: abortSignal,
                proxyUrl,
                redirect: 'manual',
            });

            await this.setCookies(response, cookieJar as CookieJar);

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
}
