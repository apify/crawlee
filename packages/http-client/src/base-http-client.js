/**
 * Base HTTP client that provides fetch-like `sendRequest` with Crawlee-managed
 * behaviors (redirect handling, proxy and cookie handling). Concrete clients
 * implement only the low-level network call in `fetch`.
 */
export class BaseHttpClient {
    #log;
    constructor(options) {
        this.#log = options?.logger;
    }
    async applyCookies(request, cookieJar) {
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
            await Promise.all(requestCookies
                .split(/; */)
                .filter(Boolean)
                .map((pair) => merged.setCookie(pair, request.url)));
            const cookieString = await merged.getCookieString(request.url);
            if (cookieString) {
                request.headers.set('cookie', cookieString);
            }
        }
        catch (e) {
            this.#log?.warning(`Failed to get cookies for URL "${request.url}": ${e.message}`);
        }
        return request;
    }
    async setCookies(response, cookieJar) {
        const setCookieHeaders = response.headers.getSetCookie();
        for (const header of setCookieHeaders) {
            try {
                await cookieJar.setCookie(header, response.url);
            }
            catch (e) {
                this.#log?.warning(`Failed to set cookie for URL "${response.url}": ${e.message}`);
            }
        }
    }
    async resolveRequestContext(options) {
        const proxyUrl = options?.proxyUrl ?? options?.session?.proxyInfo?.url;
        const cookieJar = options?.cookieJar ?? options?.session?.cookieJar ?? (await this.#createDefaultCookieJar());
        const signal = this.createAbortSignal(options?.signal, options?.timeoutMillis);
        return {
            proxyUrl,
            cookieJar,
            signal,
            fingerprint: options?.session?.fingerprint,
            ignoreTlsErrors: options?.ignoreTlsErrors || options?.session?.proxyInfo?.ignoreTlsErrors,
        };
    }
    async #createDefaultCookieJar() {
        const { CookieJar: ToughCookieJar } = await import('tough-cookie');
        return new ToughCookieJar();
    }
    createAbortSignal(signal, timeoutMillis) {
        if (signal && timeoutMillis) {
            return AbortSignal.any([signal, AbortSignal.timeout(timeoutMillis)]);
        }
        if (signal) {
            return signal;
        }
        return timeoutMillis ? AbortSignal.timeout(timeoutMillis) : undefined;
    }
    isRedirect(response) {
        const status = response.status;
        return status >= 300 && status < 400 && !!response.headers.get('location');
    }
    buildRedirectRequest(currentRequest, response, initialRequest) {
        const location = response.headers.get('location');
        const nextUrl = new URL(location, response.url ?? currentRequest.url);
        const prevMethod = (currentRequest.method ?? 'GET').toUpperCase();
        let nextMethod = prevMethod;
        let nextBody = null;
        if (response.status === 303 ||
            ((response.status === 301 || response.status === 302) && prevMethod === 'POST')) {
            nextMethod = 'GET';
            nextBody = null;
        }
        else {
            const clonedRequest = initialRequest.clone();
            nextBody = clonedRequest.body;
        }
        const nextHeaders = new Headers();
        currentRequest.headers.forEach((value, key) => nextHeaders.set(key, value));
        return new Request(nextUrl.toString(), {
            method: nextMethod,
            headers: nextHeaders,
            body: nextBody,
            credentials: currentRequest.credentials,
            redirect: 'manual',
        });
    }
    /**
     * Public fetch-like method that handles redirects and uses provided proxy and cookie jar.
     */
    async sendRequest(initialRequest, options) {
        const maxRedirects = 10;
        let currentRequest = initialRequest;
        let redirectCount = 0;
        const { proxyUrl, cookieJar, signal, fingerprint, ignoreTlsErrors } = await this.resolveRequestContext(options);
        currentRequest = initialRequest.clone();
        while (true) {
            await this.applyCookies(currentRequest, cookieJar);
            const response = await this.fetch(currentRequest, {
                signal,
                proxyUrl,
                cookieJar,
                fingerprint,
                ignoreTlsErrors,
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
