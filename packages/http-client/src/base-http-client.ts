import type {
    BaseHttpClient as BaseHttpClientInterface,
    CrawleeLogger,
    ISession,
    SendRequestOptions,
} from '@crawlee/types';
import { CookieJar } from 'tough-cookie';

/**
 * Per-request options handed to a concrete client's `fetch` implementation.
 *
 * `proxyUrl` and `cookieJar` are the *effective* values for this request after
 * {@apilink BaseHttpClient.sendRequest} resolves per-request overrides on top of
 * the session — clients should always use these and not re-read them from the
 * session. `session` is forwarded untouched so clients can consume anything else
 * declared on it (most notably {@apilink ISession.fingerprint}, but also custom
 * `userData`) without us having to grow this interface for every new field.
 */
export interface CustomFetchOptions {
    /**
     * Effective proxy URL for this request. `sendRequest` populates this from
     * the explicit `SendRequestOptions.proxyUrl` override when set, falling back
     * to `session.proxyInfo.url`.
     */
    proxyUrl?: string;

    /**
     * Effective cookie jar for this request. `sendRequest` populates this from
     * the explicit `SendRequestOptions.cookieJar` override when set, falling
     * back to `session.cookieJar` (or a fresh jar when neither is provided).
     */
    cookieJar?: CookieJar;

    /**
     * The session this request is being made on behalf of, forwarded untouched.
     * Clients should read session-derived state (e.g. {@apilink ISession.fingerprint})
     * directly from here rather than expecting dedicated `CustomFetchOptions` fields
     * for it. The `proxyUrl` and `cookieJar` fields above already incorporate any
     * per-request overrides, so prefer them over `session.proxyInfo`/`session.cookieJar`.
     */
    session?: ISession;
}

/**
 * Base HTTP client that provides fetch-like `sendRequest` with Crawlee-managed
 * behaviors (redirect handling, proxy and cookie handling). Concrete clients
 * implement only the low-level network call in `fetch`.
 */
export abstract class BaseHttpClient implements BaseHttpClientInterface {
    protected log?: CrawleeLogger;

    constructor(options?: { logger?: CrawleeLogger }) {
        this.log = options?.logger;
    }

    /**
     * Perform the raw network request and return a single Response without any
     * automatic redirect following or special error handling.
     */
    protected abstract fetch(input: Request, init?: RequestInit & CustomFetchOptions): Promise<Response>;

    private async applyCookies(request: Request, cookieJar: CookieJar): Promise<Request> {
        try {
            const requestCookies = request.headers.get('cookie') ?? '';

            if (!requestCookies) {
                // Fast path: no header cookies, use the jar directly.
                const cookieString = await cookieJar.getCookieString(request.url);
                if (cookieString) {
                    request.headers.set('cookie', cookieString);
                }
                return request;
            }

            // Merge jar cookies with request Cookie header. Clone the jar so we
            // don't persist the header-only cookies into the session.
            const merged = await cookieJar.clone();

            await Promise.all(
                requestCookies
                    .split(/; */)
                    .filter(Boolean)
                    .map((pair) => merged.setCookie(pair, request.url)),
            );
            const cookieString = merged.getCookieStringSync(request.url);

            if (cookieString) {
                request.headers.set('cookie', cookieString);
            }
        } catch (e) {
            this.log?.warning(`Failed to get cookies for URL "${request.url}": ${(e as Error).message}`);
        }

        return request;
    }

    private async setCookies(response: Response, cookieJar: CookieJar): Promise<void> {
        const setCookieHeaders = response.headers.getSetCookie();

        for (const header of setCookieHeaders) {
            try {
                await cookieJar.setCookie(header, response.url);
            } catch (e) {
                this.log?.warning(`Failed to set cookie for URL "${response.url}": ${(e as Error).message}`);
            }
        }
    }

    private resolveRequestContext(options?: SendRequestOptions): {
        proxyUrl?: string;
        cookieJar: CookieJar;
        signal?: AbortSignal;
        session?: ISession;
    } {
        const proxyUrl = options?.proxyUrl ?? options?.session?.proxyInfo?.url;
        const cookieJar = options?.cookieJar ?? options?.session?.cookieJar ?? new CookieJar();
        const signal = this.createAbortSignal(options?.signal, options?.timeoutMillis);
        return { proxyUrl, cookieJar: cookieJar as CookieJar, signal, session: options?.session };
    }

    private createAbortSignal(signal?: AbortSignal, timeoutMillis?: number): AbortSignal | undefined {
        if (signal && timeoutMillis) {
            return AbortSignal.any([signal, AbortSignal.timeout(timeoutMillis)]);
        }
        if (signal) {
            return signal;
        }
        return timeoutMillis ? AbortSignal.timeout(timeoutMillis) : undefined;
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

        const { proxyUrl, cookieJar, signal, session } = this.resolveRequestContext(options);
        currentRequest = initialRequest.clone();

        while (true) {
            await this.applyCookies(currentRequest, cookieJar);

            const response = await this.fetch(currentRequest, {
                signal,
                proxyUrl,
                cookieJar,
                session,
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
