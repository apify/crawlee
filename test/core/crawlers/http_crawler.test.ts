import http from 'node:http';
import https from 'node:https';
import type { AddressInfo, Socket } from 'node:net';
import net from 'node:net';
import { Readable } from 'node:stream';

import { ProxyConfiguration } from '@crawlee/core';
import { GotScrapingHttpClient, HttpCrawler } from '@crawlee/http';
import { ImpitHttpClient } from '@crawlee/impit-client';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

const TEST_TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC/5j1R+CwYt+eV
xUN2GFC0GV9gGNNT0at+44+ODYxmzJvVtfni2/7nt1SMDU5E05rIA/8HDWTqzlE1
89/tTLLTL112xAnvSk6hAOTnBBnJ6UStlDUHeqTgU6GxqiFcFayUIOKVS/ZDkWwx
FTieyp27tfBe9Lo+CnsZw8HUQ1r8RU50sXDmPJQ+J+piEh9GWxuHhF4AeSWNBqT3
zlSSbbDmJFm9OivF1vIAwxUpLFHEF90MAcHYMW7Xb2LBxH1H/LEhdUAEloLdbQyb
gvtaAWaaGn61D5tGUlZ6UshudXq/trJoD8VJbzZ9HSSlWht1mPGf94gipOpX3PpZ
9vxs55UpAgMBAAECggEAASKn2LkO67uE0YBICKYWriYbSBqFf5C1QswuYIEIhGAw
CNjpiFPUY4MUazq17JbS6t2JL/2+i9waI2dUuxbx1OmKFEaPJ30JT48Ni6dczrLE
XwGKOcfaO2CLS52N0nlnWr4CES+QnrA402aEff4FZmOqbylkA7N0rH+ZwTt/yY/N
yCGFp9lVl91Q4ODs4cFbvPkdxMYNolOmWFr9xICRRVZ5MiOHsUbmi+PuvjFQ5iBf
KQfgbu41zDgLe+Ov6l1cnYe0PgwOZgqfq6C/lw5leQLJ0wXESxCV/wQ+I0N6qgtW
BBvhkXOz6Ta2sbOyI2yS29XY+H35Lb3SfICHU89VgQKBgQDwbD1S6/+Xr9oDtm/S
YPFIGhXKcM0zJcj/2UwL3CXbgkH0LVZna9ggTpLhtCGTttZh8S+W2D5cT4kOc5gh
U08hGa4K1f+5G6vTnmK1dddTSv70/YhTn4KslHFtCUKfkkaDMqJtKOqe2voqZ8NC
d+XJImUv8QIODFCOd/vtuWiA6QKBgQDMVSsjgmo/7pda59fvr5yqxSwQlJNqJbER
4wg6MQZ05UqGKzjhsZP67sb5HDQcVggEfqebh4ei1ejWFPOLStGOyAVrJ3Wl4Bwx
ZSoISi1bf8qa16dsEyq70j8BmfBjAIsMayNIZFd1MSgnr7b5QzaFJXYVSZsnv5Ta
leFr5g/KQQKBgConoF0AujD7iWtrOpIVo1i0EiwLuT8FmgeaLyZJNG4Xmb7ZkDPU
CfIoNMLUVarTvSUxJ9n4En8XBv38sKjvNYmlOgn2Wb84JdmWBNKyVc3p8Wg9aADZ
kAz4fibTH9ZgzHJGl4oySWkPFhwHU4o9AZJRsJJGXMjfyeQhD5AwGS25AoGAGevs
DxMqW3XvKY8j67pBi8B7uJbApMSnU/eTQZ6ajRXRgHfXPXqDpV/JSizzx2x6k+dl
Z+unn1a3tQDvbIpPT2e8mD1nRWXK7dFBpc+TNXpev4oAKUu9Lhqb954JyuV0vlyR
G0vvdGSKDY7TDYgjUHzSIB04W7CIN7qv4DpNYoECgYBK3tAa/fN89BVjc30Utf+n
U2dnMum1wDAEQVM6rq1IYhsEzYKxmofN0UHlB6JcvfQtm4kUSsqv8NYhoHfE0F5B
edR2tRNY0oEa8l6SSUWL5/l09dqErRDw7xcw4/WiJDvr5RtIZ/6qDNRibi3n4YvY
s6waGKiuAltfN0VEH7PjGA==
-----END PRIVATE KEY-----`;

const TEST_TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUTY+m8VZQKxS/HuxrrHq5tPEkz1AwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDExMzA3MTkwMloXDTM2MDEx
MTA3MTkwMlowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAv+Y9UfgsGLfnlcVDdhhQtBlfYBjTU9GrfuOPjg2MZsyb
1bX54tv+57dUjA1ORNOayAP/Bw1k6s5RNfPf7Uyy0y9ddsQJ70pOoQDk5wQZyelE
rZQ1B3qk4FOhsaohXBWslCDilUv2Q5FsMRU4nsqdu7XwXvS6Pgp7GcPB1ENa/EVO
dLFw5jyUPifqYhIfRlsbh4ReAHkljQak985Ukm2w5iRZvTorxdbyAMMVKSxRxBfd
DAHB2DFu129iwcR9R/yxIXVABJaC3W0Mm4L7WgFmmhp+tQ+bRlJWelLIbnV6v7ay
aA/FSW82fR0kpVobdZjxn/eIIqTqV9z6Wfb8bOeVKQIDAQABo1MwUTAdBgNVHQ4E
FgQUI22Wfzhs03Dlvgj5a4hnKJ0y9NMwHwYDVR0jBBgwFoAUI22Wfzhs03Dlvgj5
a4hnKJ0y9NMwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAt9tf
I1/+oI2+YEyaRUl+FZEtUJEsWytqA/kWLM8pfKHX+MJug6LKLiDE4Ph7L08QolGO
VxH2vwCRfBJdArewAcZzWskFnMDNE07Y3fg+LtGvRSQQ6BMeAsIuEWLrBE23sqWO
2DFFFfBZ4Mzawp5oQs3+Jr1YiteyVglulihAHhy6hJEHrIa23sWW2nv6jHXqKzL6
LkadTuGWBQVQPz2AJJZyAxDLEIWkWfJsecrMe3Z74FBR6fSXwJoIpoKzljUdJyNa
1AZsqJ8Rg1zxpRQRwaOjUU6MsjAThzpv0lrXuxKRsNqmT1t5R2cUm3rKukw708Ak
i0QiSp3NS/dFY94vgA==
-----END CERTIFICATE-----`;

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

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
});

describe.each(
    process.version.startsWith('v16')
        ? [new GotScrapingHttpClient()]
        : [new GotScrapingHttpClient(), new ImpitHttpClient()],
)('HttpCrawler with %s', (httpClient) => {
    test('works', async () => {
        const results: string[] = [];

        const crawler = new HttpCrawler({
            httpClient,
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
            httpClient,
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
            httpClient,
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
            httpClient,
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
            httpClient,
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
            httpClient,
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
            httpClient,
            sessionPoolOptions: {
                maxPoolSize: 1,
            },
            handlePageFunction: async ({ body }) => {
                results.push(JSON.parse(body.toString()));
            },
        });

        await crawler.run([`${url}/redirectAndCookies`]);

        expect(results).toStrictEqual(['foo=bar']);
    });

    test('handles cookies from redirects - no empty cookie header', async () => {
        const results: string[] = [];

        const crawler = new HttpCrawler({
            httpClient,
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
            httpClient,
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
            httpClient,
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
            httpClient,
            minConcurrency: 2,
            maxConcurrency: 2,
            ignoreHttpErrorStatusCodes: [500],
            requestHandler: () => {},
            failedRequestHandler: ({ request }) => {
                failed.push(request);
            },
        });

        await crawler.run([`${url}/500Error`]);

        expect(crawler.autoscaledPool!.minConcurrency).toBe(2);
        expect(failed).toHaveLength(0);
    });

    test('should throw an error on http error status codes set by user', async () => {
        const failed: any[] = [];

        const crawler = new HttpCrawler({
            httpClient,
            minConcurrency: 2,
            maxConcurrency: 2,
            additionalHttpErrorStatusCodes: [200],
            requestHandler: () => {},
            failedRequestHandler: ({ request }) => {
                failed.push(request);
            },
        });

        await crawler.run([`${url}/hello.html`]);

        expect(crawler.autoscaledPool!.minConcurrency).toBe(2);
        expect(failed).toHaveLength(1);
    });

    test('should work with delete requests', async () => {
        const failed: any[] = [];

        const cheerioCrawler = new HttpCrawler({
            httpClient,
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
                url: `${url}`,
                method: 'DELETE',
            },
        ]);

        expect(failed).toHaveLength(0);
    });

    test('should retry on 403 even with disallowed content-type', async () => {
        const succeeded: any[] = [];

        const crawler = new HttpCrawler({
            httpClient,
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

    test.skipIf(!(httpClient instanceof GotScrapingHttpClient))(
        'should retry with next proxy after a navigation timeout',
        async () => {
            const hangingSockets = new Set<Socket>();
            const workingSockets = new Set<Socket>();
            const workingProxyRequests: string[] = [];
            let hangingProxyConnectionCount = 0;

            const trackSocket = (set: Set<Socket>) => {
                return (socket: Socket) => {
                    set.add(socket);
                    socket.on('close', () => set.delete(socket));
                };
            };

            const hangingProxyServer = net.createServer((socket) => {
                hangingProxyConnectionCount += 1;
                trackSocket(hangingSockets)(socket);

                // Swallow request data and never respond, simulating a dead proxy.
                socket.on('data', () => {});
            });

            const workingProxyServer = http.createServer((req, res) => {
                workingProxyRequests.push(req.url ?? '');

                const targetUrl = (() => {
                    try {
                        return new URL(req.url ?? '');
                    } catch {
                        const base = req.headers.host ? `http://${req.headers.host}` : url;
                        return new URL(req.url ?? '', base);
                    }
                })();

                const proxyReq = http.request(
                    {
                        hostname: targetUrl.hostname,
                        port: targetUrl.port,
                        path: targetUrl.pathname + targetUrl.search,
                        method: req.method,
                        headers: {
                            ...req.headers,
                            host: targetUrl.host,
                        },
                    },
                    (proxyRes) => {
                        res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
                        proxyRes.pipe(res);
                    },
                );

                proxyReq.on('error', (err) => {
                    res.statusCode = 502;
                    res.end(`Proxy error: ${err.message}`);
                });

                req.pipe(proxyReq);
            });
            workingProxyServer.on('connection', trackSocket(workingSockets));

            try {
                await Promise.all([
                    new Promise<void>((resolve) => hangingProxyServer.listen(0, '127.0.0.1', resolve)),
                    new Promise<void>((resolve) => workingProxyServer.listen(0, '127.0.0.1', resolve)),
                ]);

                const hangingProxyUrl = `http://127.0.0.1:${(hangingProxyServer.address() as AddressInfo).port}`;
                const workingProxyUrl = `http://127.0.0.1:${(workingProxyServer.address() as AddressInfo).port}`;

                const proxyConfiguration = new ProxyConfiguration({
                    proxyUrls: [hangingProxyUrl, workingProxyUrl],
                });

                const succeeded: { retryCount: number; proxyUrl: string | undefined }[] = [];
                const failed: { retryCount: number; proxyUrl: string | undefined; error: string }[] = [];

                const crawler = new HttpCrawler({
                    httpClient,
                    maxConcurrency: 1,
                    maxRequestRetries: 1,
                    navigationTimeoutSecs: 1,
                    useSessionPool: false,
                    proxyConfiguration,
                    requestHandler: ({ request, proxyInfo }) => {
                        succeeded.push({ retryCount: request.retryCount, proxyUrl: proxyInfo?.url });
                    },
                    failedRequestHandler: ({ request, proxyInfo, error }) => {
                        failed.push({ retryCount: request.retryCount, proxyUrl: proxyInfo?.url, error: String(error) });
                    },
                });

                await crawler.run([`${url}/hello.html`]);

                // Correct behavior: first attempt times out on the dead proxy, retry uses the next proxy and succeeds.
                expect(hangingProxyConnectionCount).toBeGreaterThan(0);
                expect(workingProxyRequests.length).toBeGreaterThan(0);
                expect(failed).toHaveLength(0);
                expect(succeeded).toEqual([{ retryCount: 1, proxyUrl: workingProxyUrl }]);
            } finally {
                for (const socket of hangingSockets) socket.destroy();
                for (const socket of workingSockets) socket.destroy();

                await Promise.all([
                    new Promise<void>((resolve) => hangingProxyServer.close(() => resolve())),
                    new Promise<void>((resolve) => workingProxyServer.close(() => resolve())),
                ]);
            }
        },
        15_000,
    );

    test.skipIf(!(httpClient instanceof GotScrapingHttpClient))(
        'should retry with next proxy after a proxy CONNECT hang (navigation timeout)',
        async () => {
            const hangingSockets = new Set<Socket>();
            const workingSockets = new Set<Socket>();

            let hangingProxyConnectCount = 0;
            let workingProxyConnectCount = 0;

            const trackSocket = (set: Set<Socket>) => {
                return (socket: Socket) => {
                    set.add(socket);
                    socket.on('close', () => set.delete(socket));
                };
            };

            const httpsServer = https.createServer({ key: TEST_TLS_KEY, cert: TEST_TLS_CERT }, (_req, res) => {
                res.statusCode = 200;
                res.setHeader('content-type', 'text/html; charset=utf-8');
                res.end('<html><body>ok</body></html>');
            });

            const hangingProxy = http.createServer();
            hangingProxy.on('connection', trackSocket(hangingSockets));
            hangingProxy.on('connect', (_req, clientSocket) => {
                hangingProxyConnectCount += 1;

                // Keep the socket open but never respond (no "200 Connection Established").
                clientSocket.on('data', () => {});
            });

            const workingProxy = http.createServer();
            workingProxy.on('connection', trackSocket(workingSockets));
            workingProxy.on('connect', (req, clientSocket, head) => {
                workingProxyConnectCount += 1;

                const [host, portStr] = (req.url ?? '').split(':');
                const port = portStr ? Number(portStr) : 443;

                // Use IPv4 loopback for `localhost` to avoid relying on OS DNS result order (IPv4 vs IPv6).
                const connectHost = host === 'localhost' ? '127.0.0.1' : (host ?? '127.0.0.1');

                const upstreamSocket = net.connect(port, connectHost, () => {
                    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                    if (head && head.length) upstreamSocket.write(head);
                    upstreamSocket.pipe(clientSocket);
                    clientSocket.pipe(upstreamSocket);
                });

                upstreamSocket.on('error', () => clientSocket.destroy());
                clientSocket.on('error', () => upstreamSocket.destroy());
            });

            try {
                await Promise.all([
                    new Promise<void>((resolve) => httpsServer.listen(0, '127.0.0.1', resolve)),
                    new Promise<void>((resolve) => hangingProxy.listen(0, '127.0.0.1', resolve)),
                    new Promise<void>((resolve) => workingProxy.listen(0, '127.0.0.1', resolve)),
                ]);

                const httpsUrl = `https://localhost:${(httpsServer.address() as AddressInfo).port}/hello.html`;
                const hangingProxyUrl = `http://127.0.0.1:${(hangingProxy.address() as AddressInfo).port}`;
                const workingProxyUrl = `http://127.0.0.1:${(workingProxy.address() as AddressInfo).port}`;

                const proxyConfiguration = new ProxyConfiguration({
                    proxyUrls: [hangingProxyUrl, workingProxyUrl],
                });

                const errors: { retryCount: number; proxyUrl: string | undefined; error: string }[] = [];
                const succeeded: { retryCount: number; proxyUrl: string | undefined }[] = [];
                const failed: { retryCount: number; proxyUrl: string | undefined; error: string }[] = [];

                const crawler = new HttpCrawler({
                    httpClient,
                    maxConcurrency: 1,
                    maxRequestRetries: 1,
                    navigationTimeoutSecs: 1,
                    useSessionPool: false,
                    ignoreSslErrors: true,
                    proxyConfiguration,
                    preNavigationHooks: [
                        async (_ctx, gotOptions) => {
                            // Make sure the underlying request won't self-timeout before the crawler timeout.
                            gotOptions.timeout = { request: 60_000 };
                        },
                    ],
                    errorHandler: ({ request, proxyInfo }, error) => {
                        errors.push({ retryCount: request.retryCount, proxyUrl: proxyInfo?.url, error: String(error) });
                    },
                    requestHandler: ({ request, proxyInfo }) => {
                        succeeded.push({ retryCount: request.retryCount, proxyUrl: proxyInfo?.url });
                    },
                    failedRequestHandler: ({ request, proxyInfo, error }) => {
                        failed.push({ retryCount: request.retryCount, proxyUrl: proxyInfo?.url, error: String(error) });
                    },
                });

                await crawler.run([httpsUrl]);

                // Correct behavior: first attempt gets stuck on CONNECT, retry uses the next proxy and succeeds.
                expect(hangingProxyConnectCount).toBeGreaterThan(0);
                expect(workingProxyConnectCount).toBeGreaterThan(0);
                expect(failed).toHaveLength(0);
                expect(succeeded).toEqual([{ retryCount: 1, proxyUrl: workingProxyUrl }]);
                expect(errors).toEqual([
                    { retryCount: 0, proxyUrl: hangingProxyUrl, error: expect.stringContaining('request timed out') },
                ]);
            } finally {
                for (const socket of hangingSockets) socket.destroy();
                for (const socket of workingSockets) socket.destroy();

                await Promise.all([
                    new Promise<void>((resolve) => httpsServer.close(() => resolve())),
                    new Promise<void>((resolve) => hangingProxy.close(() => resolve())),
                    new Promise<void>((resolve) => workingProxy.close(() => resolve())),
                ]);
            }
        },
        20_000,
    );

    test.skipIf(httpClient instanceof ImpitHttpClient)('should work with cacheable-request', async () => {
        const isFromCache: Record<string, boolean> = {};
        const cache = new Map();
        const crawler = new HttpCrawler({
            httpClient,
            maxConcurrency: 1,
            preNavigationHooks: [
                async (_, gotOptions) => {
                    gotOptions.cache = cache;
                    gotOptions.headers = {
                        ...gotOptions.headers,
                        // to force cache
                        'cache-control': 'max-stale',
                    };
                },
            ],
            requestHandler: async ({ request, response }) => {
                isFromCache[request.uniqueKey] = response.isFromCache;
            },
        });
        await crawler.run([
            { url, uniqueKey: 'first' },
            { url, uniqueKey: 'second' },
        ]);
        expect(isFromCache).toEqual({ first: false, second: true });
    });

    test('works with a custom HttpClient', async () => {
        const results: string[] = [];

        const crawler = new HttpCrawler({
            maxRequestRetries: 0,
            requestHandler: async ({ body, sendRequest }) => {
                results.push(body as string);

                results.push((await sendRequest()).body);
            },
            httpClient: {
                async sendRequest(request) {
                    if (request.responseType !== 'text') {
                        throw new Error('Not implemented');
                    }

                    return {
                        body: 'Hello from sendRequest()' as any,
                        request,
                        url,
                        redirectUrls: [],
                        statusCode: 200,
                        headers: {},
                        trailers: {},
                        complete: true,
                    };
                },
                async stream(request) {
                    const stream = new Readable();
                    stream.push('<html><head><title>Schmexample Domain</title></head></html>');
                    stream.push(null);

                    return {
                        stream,
                        downloadProgress: { percent: 100, transferred: 0 },
                        uploadProgress: { percent: 100, transferred: 0 },
                        request,
                        url,
                        redirectUrls: [],
                        statusCode: 200,
                        headers: { 'content-type': 'text/html; charset=utf-8' },
                        trailers: {},
                        complete: true,
                    };
                },
            },
        });

        await crawler.run([url]);

        expect(results[0].includes('Schmexample Domain')).toBeTruthy();
        expect(results[1].includes('Hello')).toBeTruthy();
    });
});
