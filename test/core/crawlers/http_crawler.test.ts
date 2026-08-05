import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';

import type { ConcurrencySystemOptions } from '@crawlee/core';
import { MemoryStorageBackend, serviceLocator } from '@crawlee/core';
import { ConcurrencySystem, HttpCrawler, RequestQueue, SessionPool, ThrottlingRequestManager } from '@crawlee/http';
import { ResponseWithUrl } from '@crawlee/http-client';
import iconv from 'iconv-lite';

const router = new Map<string, http.RequestListener>();
router.set('/', (req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<html><head><title>Example Domain</title></head></html>`);
});

router.set('/hello.html', (req, res) => {
    res.end(`<html><head><title>Example Domain</title></head></html>`);
});

router.set('/noext', (req, res) => {
    res.end(`<html><head><title>Example Domain</title></head></html>`);
});

router.set('/invalidContentType', (req, res) => {
    res.setHeader('content-type', 'crazy-stuff; charset=utf-8');
    res.end(`<html><head><title>Example Domain</title></head></html>`);
});

router.set('/redirectAndCookies', (req, res) => {
    res.setHeader('content-type', 'text/html');
    res.setHeader('set-cookie', 'foo=bar');
    res.setHeader('location', '/cookies');
    res.statusCode = 302;
    res.end();
});

router.set('/cookies', (req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(JSON.stringify(req.headers.cookie));
});

router.set('/redirectWithoutCookies', (req, res) => {
    res.setHeader('location', '/cookies');
    res.statusCode = 302;
    res.end();
});

router.set('/echo', (req, res) => {
    res.setHeader('content-type', 'text/html');
    req.pipe(res);
});

router.set('/500Error', (req, res) => {
    res.statusCode = 500;
    res.end();
});

router.set('/403-with-octet-stream', (req, res) => {
    res.setHeader('content-type', 'application/octet-stream');
    res.statusCode = 403;
    res.end();
});

router.set('/meta-charset', (req, res) => {
    const text = 'Žluťoučký kůň';
    const html = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1250"></head><body>${text}</body></html>`;
    res.setHeader('content-type', 'text/html'); // no charset in HTTP header
    res.end(iconv.encode(html, 'windows-1250'));
});

router.set('/meta-charset-html5', (req, res) => {
    const text = 'Žluťoučký kůň';
    const html = `<html><head><meta charset="windows-1250"></head><body>${text}</body></html>`;
    res.setHeader('content-type', 'text/html'); // no charset in HTTP header
    res.end(iconv.encode(html, 'windows-1250'));
});

let server: http.Server;
let url: string;

beforeAll(async () => {
    server = http.createServer((request, response) => {
        try {
            const requestUrl = new URL(request.url!, 'http://localhost');
            router.get(requestUrl.pathname)!(request, response);
        } catch (error) {
            response.destroy();
        }
    });

    await new Promise<void>((resolve) =>
        server.listen(() => {
            url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
            resolve();
        }),
    );
});

afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
    serviceLocator.setStorageBackend(new MemoryStorageBackend());
});

test('works', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        requestHandler: ({ body }) => {
            results.push(body as string);
        },
    });

    await crawler.run([url]);

    expect(results[0].includes('Example Domain')).toBeTruthy();
});

/**
 * Records the budget of the {@apilink ConcurrencySystem} the crawler builds for itself, *as configured* — i.e. before
 * `start()` arms the autoscaler.
 */
class ObservableHttpCrawler extends HttpCrawler {
    /** The default governor's budget at the moment the crawler built it. */
    asConfigured?: { desiredConcurrency: number; maxConcurrency: number };

    protected override createDefaultConcurrencySystem(options: ConcurrencySystemOptions): ConcurrencySystem {
        const system = super.createDefaultConcurrencySystem(options);

        this.asConfigured = {
            desiredConcurrency: system.desiredConcurrency,
            maxConcurrency: system.maxConcurrency,
        };

        return system;
    }
}

test('builds an HTTP-optimized default ConcurrencySystem and owns its lifecycle', async () => {
    const startSpy = vitest.spyOn(ConcurrencySystem.prototype, 'start');
    const stopSpy = vitest.spyOn(ConcurrencySystem.prototype, 'stop');

    try {
        const crawler = new ObservableHttpCrawler({
            maxRequestRetries: 0,
            requestHandler: () => {},
        });

        await crawler.run([url]);

        // The HTTP-optimized starting concurrency made it into the default system...
        expect(crawler.asConfigured!.desiredConcurrency).toBe(10);
        // ...and the crawler owns the default system, so it drives its lifecycle.
        expect(startSpy).toHaveBeenCalledTimes(1);
        expect(stopSpy).toHaveBeenCalledTimes(1);
    } finally {
        startSpy.mockRestore();
        stopSpy.mockRestore();
    }
});

test('concurrency shortcuts coexist with the HTTP-optimized defaults', async () => {
    const crawler = new ObservableHttpCrawler({
        maxConcurrency: 5,
        maxRequestRetries: 0,
        requestHandler: () => {},
    });

    await crawler.run([url]);

    // The shortcut applies, and the governor really is the one wired into the pool (autoscaling never moves the
    // ceiling, so this one is safe to read after the run)...
    expect((crawler.concurrencySystem! as ConcurrencySystem).maxConcurrency).toBe(5);
    // ...without discarding the HTTP-optimized starting concurrency, which the max then caps.
    expect(crawler.asConfigured!.desiredConcurrency).toBe(5);
});

test('parseWithCheerio works', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        requestHandler: async ({ parseWithCheerio }) => {
            const $ = await parseWithCheerio('title');
            results.push($('title').text());
        },
    });

    await crawler.run([`${url}/hello.html`]);

    expect(results).toStrictEqual(['Example Domain']);
});

test('should parse content type from header', async () => {
    const results: { type: string; encoding: BufferEncoding }[] = [];

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        requestHandler: ({ contentType }) => {
            results.push(contentType);
        },
    });

    await crawler.run([url]);

    expect(results).toStrictEqual([
        {
            type: 'text/html',
            encoding: 'utf-8',
        },
    ]);
});

test('should parse content type from file extension', async () => {
    const results: { type: string; encoding: BufferEncoding }[] = [];

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        requestHandler: ({ contentType }) => {
            results.push(contentType);
        },
    });

    await crawler.run([`${url}/hello.html`]);

    expect(results).toStrictEqual([
        {
            type: 'text/html',
            encoding: 'utf-8',
        },
    ]);
});

test('no content type defaults to octet-stream', async () => {
    const results: { type: string; encoding: BufferEncoding }[] = [];

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        additionalMimeTypes: ['*/*'],
        requestHandler: ({ contentType }) => {
            results.push(contentType);
        },
    });

    await crawler.run([`${url}/noext`]);

    expect(results).toStrictEqual([
        {
            type: 'application/octet-stream',
            encoding: 'utf-8',
        },
    ]);
});

test('invalid content type defaults to octet-stream', async () => {
    const results: { type: string; encoding: BufferEncoding }[] = [];

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        additionalMimeTypes: ['*/*'],
        requestHandler: ({ contentType }) => {
            results.push(contentType);
        },
    });

    await crawler.run([`${url}/invalidContentType`]);

    expect(results).toStrictEqual([
        {
            type: 'application/octet-stream',
            encoding: 'utf-8',
        },
    ]);
});

test('decodes charset from http-equiv meta tag when absent in HTTP header', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        requestHandler: ({ body }) => {
            results.push(body as string);
        },
    });

    await crawler.run([`${url}/meta-charset`]);

    expect(results[0]).toContain('Žluťoučký kůň');
});

test('decodes charset from HTML5 meta charset attribute when absent in HTTP header', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        requestHandler: ({ body }) => {
            results.push(body as string);
        },
    });

    await crawler.run([`${url}/meta-charset-html5`]);

    expect(results[0]).toContain('Žluťoučký kůň');
});

test('handles cookies from redirects', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        sessionPool: new SessionPool({
            maxPoolSize: 1,
        }),
        requestHandler: async ({ body }) => {
            results.push(JSON.parse(body.toString()));
        },
    });

    await crawler.run([`${url}/redirectAndCookies`]);

    expect(results).toStrictEqual(['foo=bar']);
});

test('handles cookies from redirects - no empty cookie header', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        sessionPool: new SessionPool({
            maxPoolSize: 1,
        }),
        requestHandler: async ({ body }) => {
            const str = body.toString();

            if (str !== '') {
                results.push(JSON.parse(str));
            }
        },
    });

    await crawler.run([`${url}/redirectWithoutCookies`]);

    expect(results).toStrictEqual([]);
});

test('no empty cookie header', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        sessionPool: new SessionPool({
            maxPoolSize: 1,
        }),
        requestHandler: async ({ body }) => {
            const str = body.toString();

            if (str !== '') {
                results.push(JSON.parse(str));
            }
        },
    });

    await crawler.run([`${url}/cookies`]);

    expect(results).toStrictEqual([]);
});

test('POST with undefined (empty) payload', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        requestHandler: async ({ body }) => {
            results.push(body.toString());
        },
    });

    await crawler.run([
        {
            url: `${url}/echo`,
            payload: undefined,
            method: 'POST',
        },
    ]);

    expect(results).toStrictEqual(['']);
});

test('should ignore http error status codes set by user', async () => {
    const failed: any[] = [];

    const crawler = new HttpCrawler({
        minConcurrency: 2,
        maxConcurrency: 2,
        ignoreHttpErrorStatusCodes: [500],
        requestHandler: () => {},
        failedRequestHandler: ({ request }) => {
            failed.push(request);
        },
    });

    await crawler.run([`${url}/500Error`]);

    expect((crawler.concurrencySystem! as ConcurrencySystem).minConcurrency).toBe(2);
    expect(failed).toHaveLength(0);
});

test('should throw an error on http error status codes set by user', async () => {
    const failed: any[] = [];

    const crawler = new HttpCrawler({
        minConcurrency: 2,
        maxConcurrency: 2,
        additionalHttpErrorStatusCodes: [200],
        requestHandler: () => {},
        failedRequestHandler: ({ request }) => {
            failed.push(request);
        },
    });

    await crawler.run([`${url}/hello.html`]);

    expect((crawler.concurrencySystem! as ConcurrencySystem).minConcurrency).toBe(2);
    expect(failed).toHaveLength(1);
});

test('should work with delete requests', async () => {
    const failed: any[] = [];

    const cheerioCrawler = new HttpCrawler({
        maxConcurrency: 1,
        maxRequestRetries: 0,
        navigationTimeoutSecs: 5,
        requestHandlerTimeoutSecs: 5,
        requestHandler: async () => {},
        failedRequestHandler: async ({ request }) => {
            failed.push(request);
        },
    });

    await cheerioCrawler.run([
        {
            url,
            method: 'DELETE',
        },
    ]);

    expect(failed).toHaveLength(0);
});

test('should retry on 403 even with disallowed content-type', async () => {
    const succeeded: any[] = [];

    const crawler = new HttpCrawler({
        maxConcurrency: 1,
        maxRequestRetries: 1,
        preNavigationHooks: [
            async ({ request }) => {
                // mock 403 response with octet stream on first request attempt, but not on
                // subsequent retries, so the request should eventually succeed
                if (request.retryCount === 0) {
                    request.url = `${url}/403-with-octet-stream`;
                } else {
                    request.url = url;
                }
            },
        ],
        requestHandler: async ({ request }) => {
            succeeded.push(request);
        },
    });

    await crawler.run([url]);

    expect(succeeded).toHaveLength(1);
    expect(succeeded[0].retryCount).toBe(1);
});

test('navigation hooks can override context members via return value', async () => {
    let observedBody: string | undefined;
    let observedStatus: number | undefined;
    let postHookSawOverride = false;

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        postNavigationHooks: [
            async ({ request }) => ({
                response: new ResponseWithUrl('<html>overridden body</html>', {
                    url: request.url,
                    status: 201,
                    headers: { 'content-type': 'text/html; charset=utf-8' },
                }),
            }),
            async ({ response }) => {
                postHookSawOverride = response.status === 201;
            },
        ],
        requestHandler: async ({ body, response }) => {
            observedBody = body.toString();
            observedStatus = response.status;
        },
    });

    await crawler.run([url]);

    expect(postHookSawOverride).toBe(true);
    expect(observedStatus).toBe(201);
    expect(observedBody).toContain('overridden body');
});

test('extendContext is visible to pre/post-navigation hooks and the request handler', async () => {
    const seenIn: Record<string, unknown> = {};

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        extendContext: () => ({ injected: 'from-extend-context' }),
        preNavigationHooks: [
            async (context) => {
                seenIn.preNavigation = context.injected;
            },
        ],
        postNavigationHooks: [
            async (context) => {
                seenIn.postNavigation = context.injected;
            },
        ],
        requestHandler: async (context) => {
            seenIn.requestHandler = context.injected;
        },
    });

    await crawler.run([url]);

    expect(seenIn.preNavigation).toBe('from-extend-context');
    expect(seenIn.postNavigation).toBe('from-extend-context');
    expect(seenIn.requestHandler).toBe('from-extend-context');
});

test('works with a custom HttpClient', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        requestHandler: async ({ body, sendRequest }) => {
            results.push(body as string);

            results.push(await (await sendRequest()).text());
        },
        httpClient: {
            async sendRequest(request) {
                return new ResponseWithUrl('<html><head><title>Schmexample Domain</title></head></html>', {
                    url: request.url.toString(),
                    status: 200,
                    headers: { 'content-type': 'text/html; charset=utf-8' },
                });
            },
        },
    });

    await crawler.run([url]);

    expect(results[0].includes('Schmexample Domain')).toBeTruthy();
    expect(results[1].includes('Schmexample Domain')).toBeTruthy();
});

test('a 429 on a throttled domain paces the retry without spending it or the session', async () => {
    const hits: number[] = [];
    router.set('/429-then-ok', (req, res) => {
        hits.push(Date.now());
        if (hits.length === 1) {
            res.statusCode = 429;
            res.setHeader('retry-after', '1');
            res.end();
            return;
        }
        res.setHeader('content-type', 'text/html');
        res.end('<html><body>ok</body></html>');
    });

    const throttlingManager = new ThrottlingRequestManager({
        inner: await RequestQueue.open(),
        domains: ['127.0.0.1'],
    });

    const sessionPool = new SessionPool();
    const retiredSessions: string[] = [];
    const markedBad: string[] = [];

    const handled: string[] = [];
    const crawler = new HttpCrawler({
        requestManager: throttlingManager,
        sessionPool,
        maxRequestRetries: 0,
        preNavigationHooks: [
            async ({ session }) => {
                vitest.spyOn(session!, 'retire').mockImplementation(() => retiredSessions.push(session!.id));
                vitest.spyOn(session!, 'markBad').mockImplementation(() => markedBad.push(session!.id));
            },
        ],
        requestHandler: async ({ request }) => {
            handled.push(request.url);
        },
    });

    const stats = await crawler.run([`${url}/429-then-ok`]);

    // `maxRequestRetries: 0` would have failed the request outright had the 429 been charged as a retry.
    expect(handled).toHaveLength(1);
    expect(stats.requestsFailed).toBe(0);

    // The domain's `Retry-After` was honoured between the two attempts...
    expect(hits).toHaveLength(2);
    expect(hits[1] - hits[0]).toBeGreaterThanOrEqual(1000);

    // ...and the session came out untouched - a rate limit says nothing about it.
    expect(retiredSessions).toEqual([]);
    expect(markedBad).toEqual([]);
}, 30_000);
