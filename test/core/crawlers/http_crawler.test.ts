import { HttpCrawler } from '@crawlee/http';
import type { AddressInfo } from 'node:net';
import http from 'node:http';
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

let server: http.Server;
let url: string;

beforeAll((cb) => {
    server = http.createServer((request, response) => {
        try {
            const requestUrl = new URL(request.url, 'http://localhost');
            router.get(requestUrl.pathname)(request, response);
        } catch (error) {
            response.destroy();
        }
    });

    server.listen(() => {
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        cb();
    });
});

afterAll((cb) => {
    server.close(cb);
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
