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

    /**
     * The maximum number of pages to keep open, one per origin. When there are more, the least recently used pages
     * without requests in flight are closed, so the limit can be exceeded while more origins are fetched at once.
     * @default 20
     */
    maxOpenPages?: number;

    logger?: CrawleeLogger;
}

interface OpenPage {
    page: Promise<Page>;
    requests: number;
}

interface SerializedResponse {
    status: number;
    statusText: string;
    headers: [string, string][];
    url: string;
    body: Uint8Array<ArrayBuffer>;
}

const CONTROLLERS_KEY = 'crawlee.browserFetchHttpClient';
const EMPTY_DOCUMENT_PATH = '/__crawlee_browser_fetch__';

/**
 * A HTTP client implementation that sends requests with `fetch()` from pages of a Playwright browser context.
 *
 * Each origin gets its own page, opened on an empty document of that origin without loading the site, so the requests
 * are same-origin and carry the cookies of the context. Redirects to another origin fail, as the browser treats them as
 * cross-origin requests. The `proxyUrl`, `fingerprint` and `ignoreTlsErrors` options are ignored.
 */
export class BrowserFetchHttpClient extends BaseHttpClient {
    #context: BrowserContext;
    #maxOpenPages: number;
    #logger?: CrawleeLogger;
    // Ordered from the least recently used
    #pages = new Map<string, OpenPage>();

    constructor(options: BrowserFetchHttpClientOptions) {
        super(options);
        this.#context = options.context;
        this.#maxOpenPages = options.maxOpenPages ?? 20;
        this.#logger = options.logger;
    }

    protected override async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        if (options?.ignoreTlsErrors) {
            this.#logger?.warningOnce(
                'BrowserFetchHttpClient cannot disable TLS certificate verification, the `ignoreTlsErrors` option is ignored. ' +
                    'Set it on the browser context instead.',
            );
        }

        const body = request.body ? new Uint8Array(await request.arrayBuffer()) : undefined;
        const openPage = this.#acquirePage(new URL(request.url).origin);

        try {
            const response = await this.#fetchInPage(
                await openPage.page,
                { url: request.url, method: request.method, headers: [...request.headers], body },
                options?.signal ?? undefined,
            );

            const { status, statusText, headers, url } = response;
            return new ResponseWithUrl(response.body, { status, statusText, headers, url });
        } finally {
            openPage.requests--;
            this.#closeIdlePages();
        }
    }

    #acquirePage(origin: string): OpenPage {
        let openPage = this.#pages.get(origin);

        if (!openPage) {
            const opened: OpenPage = { page: this.#openPage(origin), requests: 0 };
            const forget = () => {
                if (this.#pages.get(origin) === opened) this.#pages.delete(origin);
            };
            opened.page.then(
                (p) => p.once('close', forget).once('crash', () => void p.close().catch(() => {})),
                forget,
            );
            openPage = opened;
        }

        // Re-inserting moves the page to the most recently used end
        this.#pages.delete(origin);
        this.#pages.set(origin, openPage);
        openPage.requests++;
        this.#closeIdlePages();

        return openPage;
    }

    #closeIdlePages(): void {
        for (const [origin, { page, requests }] of this.#pages) {
            if (this.#pages.size <= this.#maxOpenPages) return;
            if (requests > 0) continue;

            this.#pages.delete(origin);
            page.then(async (p) => p.close()).catch(() => {});
        }
    }

    async #openPage(origin: string): Promise<Page> {
        const page = await this.#context.newPage();
        const url = `${origin}${EMPTY_DOCUMENT_PATH}`;

        try {
            await page.route(url, async (route) => route.fulfill({ contentType: 'text/html', body: '' }));
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
        request: { url: string; method: string; headers: [string, string][]; body?: Uint8Array<ArrayBuffer> },
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
                            if (body !== undefined) init.body = body;

                            const response = await fetch(url, init);

                            return {
                                status: response.status,
                                statusText: response.statusText,
                                headers: [...response.headers] as [string, string][],
                                url: response.url,
                                body: new Uint8Array(await response.arrayBuffer()),
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
