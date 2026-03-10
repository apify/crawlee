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
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('content-length', '10000');
    res.write('<html>');

    // Destroy the underlying socket after a short delay to trigger an error
    // after the 'response' event has already fired.
    setTimeout(() => {
        req.socket.destroy();
    }, 50);
});

router.set('/destroy-socket-immediately', (_req, res) => {
    // Destroy the socket immediately without sending any response.
    res.socket!.destroy();
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

afterAll(async () => {
    for (const socket of sockets) {
        socket.destroy();
    }
    await new Promise((resolve) => server.close(resolve));
});

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
});

describe('GotScrapingHttpClient socket error handling', () => {
    const httpClient = new GotScrapingHttpClient();

    test('socket error after response should not crash the process', async () => {
        const response = await httpClient.stream({ url: `${url}/destroy-socket-after-headers` });

        // The stream should eventually emit an error (not crash the process).
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timed out waiting for stream error or end')), 10_000);

            response.stream.on('error', () => {
                clearTimeout(timeout);
                resolve();
            });

            response.stream.on('end', () => {
                clearTimeout(timeout);
                // It's also acceptable if the stream ends without error
                // (depends on timing), but the key thing is: no process crash.
                resolve();
            });

            response.stream.resume();
        });
    });

    test('socket destroyed immediately should reject the stream promise', async () => {
        await expect(httpClient.stream({ url: `${url}/destroy-socket-immediately` })).rejects.toThrow();
    });

    test('normal request via stream works correctly', async () => {
        const response = await httpClient.stream({ url: `${url}/ok` });

        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
            response.stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.stream.on('end', resolve);
            response.stream.on('error', reject);
        });

        const body = Buffer.concat(chunks).toString();
        expect(body).toContain('OK');
        expect(response.statusCode).toBe(200);
    });
});

describe('HttpCrawler socket error handling', () => {
    test('should handle mid-response socket destruction gracefully', async () => {
        const errors: Error[] = [];

        const crawler = new HttpCrawler({
            httpClient: new GotScrapingHttpClient(),
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: () => {
                // Should not reach here for the error case
            },
            failedRequestHandler: ({ request }, error) => {
                errors.push(error as Error);
            },
        });

        await crawler.run([`${url}/destroy-socket-after-headers`]);

        // The request should have failed (not crashed the process).
        expect(errors.length).toBe(1);
    });

    test('should handle socket destruction without response gracefully', async () => {
        const errors: Error[] = [];

        const crawler = new HttpCrawler({
            httpClient: new GotScrapingHttpClient(),
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: () => {},
            failedRequestHandler: ({ request }, error) => {
                errors.push(error as Error);
            },
        });

        await crawler.run([`${url}/destroy-socket-immediately`]);

        // The request should have failed gracefully.
        expect(errors.length).toBe(1);
    });

    test('normal requests still work after socket errors', async () => {
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
