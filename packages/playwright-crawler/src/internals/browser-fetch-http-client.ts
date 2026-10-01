import { randomUUID } from 'node:crypto';

import { BaseHttpClient, type CustomFetchOptions, ResponseWithUrl } from '@crawlee/http-client';
import type { CrawleeLogger } from '@crawlee/types';

/**
 * The part of a Playwright `Page` the client uses.
 */
export interface BrowserFetchPage {
    evaluate<R, Arg>(pageFunction: (arg: Arg) => R | Promise<R>, arg: Arg): Promise<R>;
}

export interface BrowserFetchHttpClientOptions<Page extends BrowserFetchPage = BrowserFetchPage> {
    /**
     * The page whose `fetch()` sends the requests.
     */
    page: Page;

    /**
     * Restores the session of the page. Runs when a request gets a `401` response, once for all concurrent requests.
     */
    login?: (page: Page) => Promise<void>;

    logger?: CrawleeLogger;
}

interface SerializedResponse {
    status: number;
    statusText: string;
    headers: [string, string][];
    url: string;
    body: string;
}

const CONTROLLERS_KEY = 'crawlee.browserFetchHttpClient';

async function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    signal.throwIfAborted();

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}

/**
 * A HTTP client implementation that sends requests with `fetch()` inside an existing Playwright page.
 *
 * Requests are sent with the page's cookies, so only same-origin URLs, or cross-origin ones whose server allows credentials
 * for the page's origin, can be fetched. The `proxyUrl`, `fingerprint` and `ignoreTlsErrors` options are ignored.
 */
export class BrowserFetchHttpClient<Page extends BrowserFetchPage = BrowserFetchPage> extends BaseHttpClient {
    #page: Page;
    #login?: (page: Page) => Promise<void>;
    #logger?: CrawleeLogger;
    #loginPromise?: Promise<void>;
    #loginCount = 0;

    constructor(options: BrowserFetchHttpClientOptions<Page>) {
        super(options);
        this.#page = options.page;
        this.#login = options.login;
        this.#logger = options.logger;
    }

    protected override async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        if (options?.ignoreTlsErrors) {
            this.#logger?.warningOnce(
                'BrowserFetchHttpClient cannot disable TLS certificate verification, the `ignoreTlsErrors` option is ignored. ' +
                    'Set it on the browser context instead.',
            );
        }

        const body = request.body ? Buffer.from(await request.arrayBuffer()).toString('base64') : undefined;
        const serialized = { url: request.url, method: request.method, headers: [...request.headers], body };
        const signal = options?.signal ?? undefined;
        let retried = false;

        while (true) {
            if (this.#loginPromise) await untilAborted(this.#loginPromise, signal);
            const loginCount = this.#loginCount;

            let response: SerializedResponse;
            try {
                response = await this.#fetchInPage(serialized, signal);
            } catch (error) {
                // A login navigation destroys the fetches running in the page
                if (signal?.aborted || retried || (!this.#loginPromise && loginCount === this.#loginCount)) {
                    throw error;
                }
                retried = true;
                continue;
            }

            if (response.status === 401 && this.#login && !retried) {
                retried = true;
                await this.#relogin(loginCount, signal);
                continue;
            }

            const { status, statusText, headers, url } = response;
            return new ResponseWithUrl(Buffer.from(response.body, 'base64'), { status, statusText, headers, url });
        }
    }

    async #relogin(loginCount: number, signal?: AbortSignal): Promise<void> {
        // A login that finished after the request started already restored the session
        if (!this.#loginPromise && loginCount !== this.#loginCount) return;

        this.#loginPromise ??= this.#login!(this.#page).finally(() => {
            this.#loginCount++;
            this.#loginPromise = undefined;
        });

        await untilAborted(this.#loginPromise, signal);
    }

    async #fetchInPage(
        request: { url: string; method: string; headers: [string, string][]; body?: string },
        signal?: AbortSignal,
    ): Promise<SerializedResponse> {
        signal?.throwIfAborted();

        const id = randomUUID();
        let onAbort!: () => void;
        const aborted = new Promise<never>((_, reject) => {
            onAbort = () => {
                this.#page
                    .evaluate(([key, requestId]) => (globalThis as any)[Symbol.for(key)]?.get(requestId)?.abort(), [
                        CONTROLLERS_KEY,
                        id,
                    ] as const)
                    .catch(() => {});
                reject(signal!.reason);
            };
        });
        signal?.addEventListener('abort', onAbort, { once: true });

        try {
            return await Promise.race([
                this.#page.evaluate(
                    async ({ key, requestId, url, method, headers, body }) => {
                        const controllers: Map<string, AbortController> = ((globalThis as any)[Symbol.for(key)] ??=
                            new Map());
                        const controller = new AbortController();
                        controllers.set(requestId, controller);

                        try {
                            const init: RequestInit = {
                                method,
                                headers,
                                credentials: 'include',
                                signal: controller.signal,
                            };
                            if (body !== undefined) init.body = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));

                            const response = await fetch(url, init);
                            const bytes = new Uint8Array(await response.arrayBuffer());

                            let binary = '';
                            for (let i = 0; i < bytes.length; i += 0x8000) {
                                binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
                            }

                            return {
                                status: response.status,
                                statusText: response.statusText,
                                headers: [...response.headers] as [string, string][],
                                url: response.url,
                                body: btoa(binary),
                            };
                        } finally {
                            controllers.delete(requestId);
                        }
                    },
                    { key: CONTROLLERS_KEY, requestId: id, ...request },
                ),
                aborted,
            ]);
        } finally {
            signal?.removeEventListener('abort', onAbort);
        }
    }
}
