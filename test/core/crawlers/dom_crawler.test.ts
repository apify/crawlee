import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { MemoryStorageBackend, serviceLocator } from '@crawlee/core';
import { JSDOMCrawler } from '@crawlee/jsdom';
import { LinkeDOMCrawler } from '@crawlee/linkedom';

const router = new Map<string, http.RequestListener>();
router.set('/', (req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!DOCTYPE html><html><head><title>Example Domain</title></head><body><p>Hello, world!</p></body></html>`);
});

for (const depth of [0, 1, 2]) {
    router.set(`/depth-${depth}`, (req, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(
            `<!DOCTYPE html><html><head><title>Depth ${depth}</title></head><body><a href="/depth-${depth + 1}">link</a></body></html>`,
        );
    });
}

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

    const crawler = new JSDOMCrawler({
        maxRequestRetries: 0,
        requestHandler: ({ window }) => {
            results.push(window.document.title, window.document.querySelector('p')!.textContent!);
        },
    });

    await crawler.run([url]);

    expect(results).toStrictEqual(['Example Domain', 'Hello, world!']);
});

test('JSDOMCrawler enqueueLinks should respect maxCrawlDepth', async () => {
    const titles: string[] = [];

    const crawler = new JSDOMCrawler({
        maxCrawlDepth: 1,
        maxRequestsPerCrawl: 10, // to avoid accidental runaway
        requestHandler: async ({ window, enqueueLinks }) => {
            titles.push(window.document.title);
            await enqueueLinks();
        },
    });

    await crawler.run([`${url}/depth-0`]);

    expect(titles).toEqual(['Depth 0', 'Depth 1']);
});

test('LinkeDOMCrawler enqueueLinks should respect maxCrawlDepth', async () => {
    const titles: string[] = [];

    const crawler = new LinkeDOMCrawler({
        maxCrawlDepth: 1,
        maxRequestsPerCrawl: 10, // to avoid accidental runaway
        requestHandler: async ({ document, enqueueLinks }) => {
            titles.push(document.title);
            await enqueueLinks();
        },
    });

    await crawler.run([`${url}/depth-0`]);

    expect(titles).toEqual(['Depth 0', 'Depth 1']);
});
