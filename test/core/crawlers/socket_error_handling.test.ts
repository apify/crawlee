import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

import { GotScrapingHttpClient, HttpCrawler } from '@crawlee/http';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

let server: http.Server;
let url: string;

const sockets = new Set<Socket>();

const router = new Map<string, http.RequestListener>();

router.set('/ok', (_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<html><body>OK</body></html>');
});

router.set('/destroy-socket-after-headers', (req, res) => {
    // Send headers, start body, then destroy the socket to simulate a mid-response error.
    // This simulates the TLS error scenario where the socket fails after headers are sent.
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('content-length', '10000');
    res.write('<html>');

    // Destroy the underlying socket after a short delay to trigger an error
    // after the 'response' event has already fired.
    setTimeout(() => {
        req.socket.destroy();
    }, 50);
});

beforeAll(async () => {
    server = http.createServer((request, response) => {
        try {
            const requestUrl = new URL(request.url!, 'http://localhost');
            const handler = router.get(requestUrl.pathname);
            if (handler) {
                handler(request, response);
            } else {
                response.statusCode = 404;
                response.end();
            }
        } catch {
            response.destroy();
        }
    });

    server.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
    });

    await new Promise<void>((resolve) =>
        server.listen(() => {
            url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
            resolve();
        }),
    );
});

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    for (const socket of sockets) {
        socket.destroy();
    }
    await new Promise((resolve) => server.close(resolve));
    await localStorageEmulator.destroy();
});

describe('HttpCrawler socket error handling', () => {
    test('should handle mid-response socket destruction gracefully without crashing', async () => {
        const errors: Error[] = [];

        const crawler = new HttpCrawler({
            httpClient: new GotScrapingHttpClient(),
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: () => {
                // Should not complete successfully for the error case
            },
            failedRequestHandler: (_ctx, error) => {
                errors.push(error as Error);
            },
        });

        await crawler.run([`${url}/destroy-socket-after-headers`]);

        // The request should have failed (not crashed the process).
        // The key assertion is that we reach this point without process crash.
        expect(errors.length).toBe(1);
    });

    test('normal requests still work correctly', async () => {
        const results: string[] = [];

        const crawler = new HttpCrawler({
            httpClient: new GotScrapingHttpClient(),
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: ({ body }) => {
                results.push(body as string);
            },
        });

        await crawler.run([`${url}/ok`]);

        expect(results.length).toBe(1);
        expect(results[0]).toContain('OK');
    });

    test('crawler recovers after socket error and processes next request', async () => {
        const results: string[] = [];
        const errors: Error[] = [];

        const crawler = new HttpCrawler({
            httpClient: new GotScrapingHttpClient(),
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: ({ body }) => {
                results.push(body as string);
            },
            failedRequestHandler: (_ctx, error) => {
                errors.push(error as Error);
            },
        });

        await crawler.run([
            `${url}/destroy-socket-after-headers`,
            `${url}/ok`,
        ]);

        // One should fail and one should succeed, but no process crash.
        expect(errors.length).toBe(1);
        expect(results.length).toBe(1);
        expect(results[0]).toContain('OK');
    });
});
