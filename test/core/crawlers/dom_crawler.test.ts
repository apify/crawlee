import { JSDOMCrawler } from '@crawlee/jsdom';
import type { AddressInfo } from 'node:net';
import http from 'node:http';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

const router = new Map<string, http.RequestListener>();
router.set('/', (req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!DOCTYPE html><html><head><title>Example Domain</title></head><body><p>Hello, world!</p></body></html>`);
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

    const crawler = new JSDOMCrawler({
        maxRequestRetries: 0,
        requestHandler: ({ window }) => {
            results.push(window.document.title, window.document.querySelector('p').textContent);
        },
    });

    await crawler.run([url]);

    expect(results).toStrictEqual([
        'Example Domain',
        'Hello, world!',
    ]);
});
