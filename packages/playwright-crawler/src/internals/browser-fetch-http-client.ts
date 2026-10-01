import { randomUUID } from 'node:crypto';

import { BaseHttpClient, type CustomFetchOptions, ResponseWithUrl } from '@crawlee/http-client';
import type { CrawleeLogger } from '@crawlee/types';
import type { BrowserContext, Page } from 'playwright';

export interface BrowserFetchHttpClientOptions {
    /**
     * The browser context whose pages send the requests. They use its cookies, so a login in any page of the context
     * applies to them.
     */
    context: BrowserContext;

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
const EMPTY_DOCUMENT_PATH = '/__crawlee_browser_fetch__';

/**
 * A HTTP client implementation that sends requests with `fetch()` from pages of a Playwright browser context.
 *
 * Each origin gets its own page, opened on an empty document of that origin without loading the site, so the requests
 * are same-origin and carry the cookies of the context. The `proxyUrl`, `fingerprint` and `ignoreTlsErrors` options
 * are ignored.
 */
export class BrowserFetchHttpClient extends BaseHttpClient {
    #context: BrowserContext;
    #logger?: CrawleeLogger;
    #pages = new Map<string, Promise<Page>>();

    constructor(options: BrowserFetchHttpClientOptions) {
        super(options);
        this.#context = options.context;
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
        const page = await this.#getPage(new URL(request.url).origin);
        const response = await this.#fetchInPage(
            page,
            { url: request.url, method: request.method, headers: [...request.headers], body },
            options?.signal ?? undefined,
        );

        const { status, statusText, headers, url } = response;
        return new ResponseWithUrl(Buffer.from(response.body, 'base64'), { status, statusText, headers, url });
    }

    async #getPage(origin: string): Promise<Page> {
        const existing = this.#pages.get(origin);
        if (existing) return existing;

        const page = this.#openPage(origin);
        const forget = () => {
            if (this.#pages.get(origin) === page) this.#pages.delete(origin);
        };
        page.then((p) => p.once('close', forget).once('crash', forget), forget);
        this.#pages.set(origin, page);

        return page;
    }

    async #openPage(origin: string): Promise<Page> {
        const page = await this.#context.newPage();
        const url = `${origin}${EMPTY_DOCUMENT_PATH}`;

        try {
            // The empty icon keeps Firefox from requesting `/favicon.ico` from the site
            await page.route(url, async (route) =>
                route.fulfill({ contentType: 'text/html', body: '<link rel="icon" href="data:,">' }),
            );
            await page.goto(url);
            await page.unroute(url);
        } catch (error) {
            await page.close().catch(() => {});
            throw error;
        }

        return page;
    }

    async #fetchInPage(
        page: Page,
        request: { url: string; method: string; headers: [string, string][]; body?: string },
        signal?: AbortSignal,
    ): Promise<SerializedResponse> {
        signal?.throwIfAborted();

        const id = randomUUID();
        let onAbort!: () => void;
        const aborted = new Promise<never>((_, reject) => {
            onAbort = () => {
                page.evaluate(([key, requestId]) => (globalThis as any)[Symbol.for(key)]?.get(requestId)?.abort(), [
                    CONTROLLERS_KEY,
                    id,
                ] as const).catch(() => {});
                reject(signal!.reason);
            };
        });
        signal?.addEventListener('abort', onAbort, { once: true });

        try {
            return await Promise.race([
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
