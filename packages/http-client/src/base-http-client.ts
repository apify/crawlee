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
        const setCookieHeaders = response.headers.getSetCookie();

        await Promise.all(setCookieHeaders.map((header) => cookieJar.setCookie(header, response.url)));
    }

    private resolveRequestContext(options?: SendRequestOptions): {
        proxyUrl?: string;
        cookieJar: CookieJar;
        timeout?: number;
    } {
        const proxyUrl = options?.proxyUrl ?? options?.session?.proxyInfo?.url;
        const cookieJar = options?.cookieJar ?? options?.session?.cookieJar ?? new CookieJar();
        const timeout = options?.timeout;
        return { proxyUrl, cookieJar: cookieJar as CookieJar, timeout };
    }

    private createAbortSignal(timeout?: number): AbortSignal | undefined {
        return timeout ? AbortSignal.timeout(timeout) : undefined;
    }

    private isRedirect(response: Response): boolean {
        const status = response.status;
        return status >= 300 && status < 400 && !!response.headers.get('location');
    }

    private buildRedirectRequest(currentRequest: Request, response: Response, initialRequest: Request): Request {
        const location = response.headers.get('location')!;
        const nextUrl = new URL(location, response.url ?? currentRequest.url);

        const prevMethod = (currentRequest.method ?? 'GET').toUpperCase();
        let nextMethod = prevMethod;
        let nextBody: BodyInit | null = null;

        if (
            response.status === 303 ||
            ((response.status === 301 || response.status === 302) && prevMethod === 'POST')
        ) {
            nextMethod = 'GET';
            nextBody = null;
        } else {
            const clonedRequest = initialRequest.clone();
            nextBody = clonedRequest.body;
        }

        const nextHeaders = new Headers();
        currentRequest.headers.forEach((value, key) => nextHeaders.set(key, value));

        return new Request(nextUrl.toString(), {
            method: nextMethod,
            headers: nextHeaders,
            body: nextBody,
            credentials: (currentRequest as any).credentials,
            redirect: 'manual',
        });
    }

    /**
     * Public fetch-like method that handles redirects and uses provided proxy and cookie jar.
     */
    async sendRequest(initialRequest: Request, options?: SendRequestOptions): Promise<Response> {
        const maxRedirects = 10;
        let currentRequest = initialRequest;
        let redirectCount = 0;

        const { proxyUrl, cookieJar, timeout } = this.resolveRequestContext(options);
        currentRequest = initialRequest.clone();

        while (true) {
            await this.applyCookies(currentRequest, cookieJar);

            const response = await this.fetch(currentRequest, {
                signal: this.createAbortSignal(timeout),
                proxyUrl,
                redirect: 'manual',
            });

            await this.setCookies(response, cookieJar);

            if (this.isRedirect(response)) {
                if (redirectCount++ >= maxRedirects) {
                    throw new Error(`Too many redirects (${maxRedirects}) while requesting ${currentRequest.url}`);
                }
                currentRequest = this.buildRedirectRequest(currentRequest, response, initialRequest);
                continue;
            }

            return response;
        }
    }
}
