import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { HttpCrawler } from '@crawlee/http';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

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

let server: http.Server;
let url: string;

beforeAll(async () => {
    server = http.createServer((request, response) => {
        try {
            const requestUrl = new URL(request.url, 'http://localhost');
            router.get(requestUrl.pathname)(request, response);
        } catch (error) {
            response.destroy();
        }
    });

    await new Promise<void>((resolve) => server.listen(() => {
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
    }));
});

afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
});

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
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

test('parseWithCheerio works', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        maxRequestRetries: 0,
        requestHandler: async ({ parseWithCheerio }) => {
            const $ = await parseWithCheerio();
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

test('handles cookies from redirects', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        sessionPoolOptions: {
            maxPoolSize: 1,
        },
        handlePageFunction: async ({ body }) => {
            results.push(JSON.parse(body.toString()));
        },
    });

    await crawler.run([`${url}/redirectAndCookies`]);

    expect(results).toStrictEqual([
        'foo=bar',
    ]);
});

test('handles cookies from redirects - no empty cookie header', async () => {
    const results: string[] = [];

    const crawler = new HttpCrawler({
        sessionPoolOptions: {
            maxPoolSize: 1,
        },
        handlePageFunction: async ({ body }) => {
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
        sessionPoolOptions: {
            maxPoolSize: 1,
        },
        handlePageFunction: async ({ body }) => {
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
        handlePageFunction: async ({ body }) => {
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

    expect(crawler.autoscaledPool.minConcurrency).toBe(2);
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

    expect(crawler.autoscaledPool.minConcurrency).toBe(2);
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

    await cheerioCrawler.run([{
        url: `${url}`,
        method: 'DELETE',
    }]);

    expect(failed).toHaveLength(0);
});

test('should retry on 403 even with disallowed content-type', async () => {
    const succeeded: any[] = [];

    const crawler = new HttpCrawler({
        maxConcurrency: 1,
        maxRequestRetries: 1,
        preNavigationHooks: [async ({ request }) => {
            // mock 403 response with octet stream on first request attempt, but not on
            // subsequent retries, so the request should eventually succeed
            if (request.retryCount === 0) {
                request.url = `${url}/403-with-octet-stream`;
            } else {
                request.url = url;
            }
        }],
        requestHandler: async ({ request }) => {
            succeeded.push(request);
        },
    });

    await crawler.run([url]);

    expect(succeeded).toHaveLength(1);
    expect(succeeded[0].retryCount).toBe(1);
});
