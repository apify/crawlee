import { randomUUID } from 'node:crypto';

import {
    browserPoolCookieToToughCookie,
    SessionError,
    SessionRetiredError,
    toughCookieToBrowserPoolCookie,
} from '@crawlee/basic';
import { BaseHttpClient, type CustomFetchOptions, ResponseWithUrl } from '@crawlee/http-client';
import type { CookieJar, CrawleeLogger, IBrowserPool, ISession } from '@crawlee/types';
import type { Page } from 'playwright';

export interface BrowserFetchHttpClientOptions {
    /**
     * The browser pool to open the pages in, e.g. one built with {@apilink playwrightBrowserPool}. The pages are opened
     * for the session of the request, so they use its proxy and fingerprint. The client does not destroy the pool.
     */
    browserPool: IBrowserPool<Page>;

    /**
     * Prepares a session before its first request, e.g. logs in or passes an anti-bot check. It gets a page of the pool
     * opened for the session, and the cookies the page ends up with are saved to the session's cookie jar. Throw a
     * {@apilink SessionError} to retire the session.
     */
    login?: (page: Page, session?: ISession) => Promise<void>;

    /**
     * The maximum number of pages to keep open, one per session and origin. When there are more, the least recently
     * used pages without requests in flight are closed, so the limit can be exceeded while more of them are used at
     * once.
     * @default 20
     */
    maxOpenPages?: number;

    logger?: CrawleeLogger;
}

interface OpenPage {
    page: Promise<Page>;
    session?: ISession;
    requests: number;
}

const CONTROLLERS_KEY = 'crawlee.browserFetchHttpClient';
const EMPTY_DOCUMENT_PATH = '/__crawlee_browser_fetch__';

/**
 * A HTTP client implementation that sends requests with `fetch()` from pages of a browser pool.
 *
 * Every session gets its own page for each origin (scheme, host and port), opened on an empty document of that origin
 * without loading the site, so the requests are same-origin. The cookies of the session are added to the page before
 * each request, and the cookies of the page are saved to the session after it. Pages of sessions that are no longer
 * usable are closed, so the pool retires the browser of a blocked session.
 *
 * Redirects to another origin fail, as the browser treats them as cross-origin requests. The `proxyUrl`, `fingerprint`
 * and `ignoreTlsErrors` options are ignored, the pool decides them for the session.
 */
export class BrowserFetchHttpClient extends BaseHttpClient {
    #browserPool: IBrowserPool<Page>;
    #login: BrowserFetchHttpClientOptions['login'];
    #maxOpenPages: number;
    #logger?: CrawleeLogger;
    // Keyed by session ID and origin, ordered from the least recently used
    #pages = new Map<string, OpenPage>();
    // Keyed by session ID
    #logins = new Map<string, { session?: ISession; done: Promise<void> }>();

    constructor(options: BrowserFetchHttpClientOptions) {
        super(options);
        this.#browserPool = options.browserPool;
        this.#login = options.login;
        this.#maxOpenPages = options.maxOpenPages ?? 20;
        this.#logger = options.logger;
    }

    protected override async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        const { session, cookieJar } = options ?? {};

        if (options?.ignoreTlsErrors && !session?.proxyInfo?.ignoreTlsErrors) {
            this.#logger?.warningOnce(
                'BrowserFetchHttpClient cannot disable TLS certificate verification, the `ignoreTlsErrors` option is ignored. ' +
                    'The browser pool decides it.',
            );
        }

        // Lets the pool retire the browser of a blocked session before a new session opens pages
        this.#closeIdlePages();
        await this.#ensureLoggedIn(session, cookieJar);
        const openPage = this.#acquirePage(new URL(request.url).origin, session);

        try {
            const page = await openPage.page;
            await this.#injectCookies(page, request.url, cookieJar);
            // `options.redirect` is ignored, the browser follows redirects itself
            const response = await this.#fetchInPage(page, request, options?.signal);
            await this.#saveCookies(page, response.url, cookieJar);

            return response;
        } finally {
            openPage.requests--;
            this.#closeIdlePages();
        }
    }

    async #ensureLoggedIn(session?: ISession, cookieJar?: CookieJar): Promise<void> {
        if (!this.#login) return;

        const id = session?.id ?? '';
        let login = this.#logins.get(id);

        if (!login) {
            const started = { session, done: this.#runLogin(session, cookieJar) };
            // A failed login is tried again on the next request of the session
            started.done.catch(() => {
                if (this.#logins.get(id) === started) this.#logins.delete(id);
            });
            this.#logins.set(id, started);
            login = started;
        }

        await login.done;
    }

    async #runLogin(session?: ISession, cookieJar?: CookieJar): Promise<void> {
        const page = await this.#browserPool.newPage({ session });
        let error: Error | undefined;

        try {
            await this.#login!(page, session);
            await this.#saveCookies(page, page.url(), cookieJar);
        } catch (e) {
            error = e as Error;
            throw e;
        } finally {
            await this.#browserPool.closePage(page, { error }).catch(() => {});
        }
    }

    #acquirePage(origin: string, session?: ISession): OpenPage {
        const key = `${session?.id ?? ''} ${origin}`;
        let openPage = this.#pages.get(key);

        if (!openPage) {
            const opened: OpenPage = { page: this.#openPage(origin, session), session, requests: 0 };
            const forget = () => {
                if (this.#pages.get(key) === opened) this.#pages.delete(key);
            };
            opened.page.then(
                (p) =>
                    p.once('close', forget).once('crash', () => {
                        this.#browserPool.closePage(p).catch(() => {});
                    }),
                forget,
            );
            openPage = opened;
        }

        // Re-inserting moves the page to the most recently used end
        this.#pages.delete(key);
        this.#pages.set(key, openPage);
        openPage.requests++;
        this.#closeIdlePages();

        return openPage;
    }

    #closeIdlePages(): void {
        for (const [key, { page, session, requests }] of this.#pages) {
            if (requests > 0) continue;

            const sessionFinished = session !== undefined && !session.isUsable();
            if (!sessionFinished && this.#pages.size <= this.#maxOpenPages) continue;

            this.#pages.delete(key);
            // Like browser crawlers, report a blocked session as a `SessionError`, so the pool retires its browser
            const error = !sessionFinished
                ? undefined
                : session.isBlocked()
                  ? new SessionError()
                  : new SessionRetiredError();
            page.then(async (p) => this.#browserPool.closePage(p, { error })).catch(() => {});
        }

        for (const [id, { session }] of this.#logins) {
            if (session && !session.isUsable()) this.#logins.delete(id);
        }
    }

    async #openPage(origin: string, session?: ISession): Promise<Page> {
        const page = await this.#browserPool.newPage({ session });
        const url = `${origin}${EMPTY_DOCUMENT_PATH}`;

        try {
            await page.route(url, async (route) => route.fulfill({ contentType: 'text/html', body: '' }));
            await page.goto(url);
            await page.unroute(url);
        } catch (error) {
            await this.#browserPool.closePage(page).catch(() => {});
            throw error;
        }

        return page;
    }

    async #injectCookies(page: Page, url: string, cookieJar?: CookieJar): Promise<void> {
        const cookies = ((await cookieJar?.getCookies(url)) ?? []).map(toughCookieToBrowserPoolCookie);
        if (cookies.length === 0) return;

        await this.#browserPool.injectPageState(page, {
            cookies: cookies.map((cookie) => ({ ...cookie, url: cookie.domain ? undefined : url })),
        });
    }

    async #saveCookies(page: Page, url: string, cookieJar?: CookieJar): Promise<void> {
        if (!cookieJar) return;

        const { cookies } = await this.#browserPool.extractPageState(page);

        for (const cookie of cookies) {
            // Cookies of other sites than `url` are rejected
            await cookieJar.setCookie(browserPoolCookieToToughCookie(cookie), url, { ignoreError: true });
        }
    }

    async #fetchInPage(page: Page, request: Request, signal?: AbortSignal | null): Promise<Response> {
        signal?.throwIfAborted();

        const body = request.body ? new Uint8Array(await request.arrayBuffer()) : undefined;
        const id = randomUUID();
        const aborted = Promise.withResolvers<never>();
        const onAbort = () => {
            page.evaluate(([key, requestId]) => (globalThis as any)[Symbol.for(key)]?.get(requestId)?.abort(), [
                CONTROLLERS_KEY,
                id,
            ] as const).catch(() => {});
            aborted.reject(signal!.reason);
        };
        signal?.addEventListener('abort', onAbort, { once: true });

        try {
            const { body: responseBody, ...responseInit } = await Promise.race([
                page.evaluate(
                    async ({ key, requestId, url, method, headers, body }) => {
                        const controllers: Map<string, AbortController> = ((globalThis as any)[Symbol.for(key)] ??=
                            new Map());
                        const controller = new AbortController();
                        controllers.set(requestId, controller);

                        try {
                            const init: RequestInit = {
                                method,
                                headers,
                                body,
                                credentials: 'include',
                                signal: controller.signal,
                            };

                            const response = await fetch(url, init);

                            return {
                                status: response.status,
                                statusText: response.statusText,
                                headers: [...response.headers],
                                url: response.url,
                                body: new Uint8Array(await response.arrayBuffer()),
                            };
                        } finally {
                            controllers.delete(requestId);
                        }
                    },
                    {
                        key: CONTROLLERS_KEY,
                        requestId: id,
                        url: request.url,
                        method: request.method,
                        headers: [...request.headers],
                        body,
                    },
                ),
                aborted.promise,
            ]);

            return new ResponseWithUrl(responseBody, responseInit);
        } finally {
            signal?.removeEventListener('abort', onAbort);
        }
    }
}
