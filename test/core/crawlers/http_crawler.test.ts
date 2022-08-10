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
