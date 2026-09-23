import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';

import type { CustomFetchOptions } from '@crawlee/http-client';
import { BaseHttpClient, FetchHttpClient } from '@crawlee/http-client';
import { CookieJar } from 'tough-cookie';
import { afterAll, beforeAll, describe, expect, test, vitest } from 'vitest';

let server: http.Server;
let url: string;

beforeAll(async () => {
    server = http.createServer((req, res) => {
        if (new URL(req.url!, 'http://localhost').pathname === '/echo-cookies') {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ cookie: req.headers.cookie ?? '' }));
        } else {
            res.setHeader('content-type', 'text/plain');
            res.end('ok');
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

const httpClient = new FetchHttpClient();

describe('BaseHttpClient signal and timeoutMillis options', () => {
    test('sends a request without any signal or timeout', async () => {
        const response = await httpClient.sendRequest(new Request(url));
        expect(response.status).toBe(200);
    });

    test('aborts when a pre-aborted signal is passed', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(httpClient.sendRequest(new Request(url), { signal: controller.signal })).rejects.toThrow();
    });

    test('aborts when the signal is aborted after the request starts', async () => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 50);

        const slowServer = http.createServer((_req, res) => {
            setTimeout(() => res.end('late'), 500);
        });

        await new Promise<void>((r) => slowServer.listen(r));
        const slowUrl = `http://127.0.0.1:${(slowServer.address() as AddressInfo).port}`;

        try {
            await expect(httpClient.sendRequest(new Request(slowUrl), { signal: controller.signal })).rejects.toThrow();
        } finally {
            await new Promise((r) => slowServer.close(r));
        }
    });

    test('aborts when timeoutMillis elapses', async () => {
        const slowServer = http.createServer((_req, res) => {
            setTimeout(() => res.end('late'), 500);
        });

        await new Promise<void>((r) => slowServer.listen(r));
        const slowUrl = `http://127.0.0.1:${(slowServer.address() as AddressInfo).port}`;

        try {
            await expect(httpClient.sendRequest(new Request(slowUrl), { timeoutMillis: 50 })).rejects.toThrow();
        } finally {
            await new Promise((r) => slowServer.close(r));
        }
    });

    test('aborts when both signal and timeoutMillis are provided and the signal fires first', async () => {
        const slowServer = http.createServer((_req, res) => {
            setTimeout(() => res.end('late'), 500);
        });

        await new Promise<void>((r) => slowServer.listen(r));
        const slowUrl = `http://127.0.0.1:${(slowServer.address() as AddressInfo).port}`;

        const controller = new AbortController();
        setTimeout(() => controller.abort(), 50);

        try {
            await expect(
                httpClient.sendRequest(new Request(slowUrl), { signal: controller.signal, timeoutMillis: 5_000 }),
            ).rejects.toThrow();
        } finally {
            await new Promise((r) => slowServer.close(r));
        }
    });
});

describe('BaseHttpClient cookie handling', () => {
    test('merges jar cookies with existing Cookie header', async () => {
        const jar = new CookieJar();
        await jar.setCookie('jar_cookie=from_jar', `${url}/echo-cookies`);
        await jar.setCookie('shared=from_jar', `${url}/echo-cookies`);

        const request = new Request(`${url}/echo-cookies`, {
            headers: { Cookie: 'shared=from_header; header_only=explicit' },
        });

        const response = await httpClient.sendRequest(request, { cookieJar: jar });
        const body = (await response.json()) as { cookie: string };

        expect(body.cookie).toContain('header_only=explicit');
        expect(body.cookie).toContain('jar_cookie=from_jar');
        // header takes precedence over jar for same-named cookie
        expect(body.cookie).toContain('shared=from_header');
        expect(body.cookie).not.toContain('shared=from_jar');
    });

    test('uses only jar cookies when no Cookie header is set', async () => {
        const jar = new CookieJar();
        await jar.setCookie('only_jar=value', `${url}/echo-cookies`);

        const response = await httpClient.sendRequest(new Request(`${url}/echo-cookies`), { cookieJar: jar });
        const body = (await response.json()) as { cookie: string };

        expect(body.cookie).toBe('only_jar=value');
    });

    test('preserves Cookie header when jar is empty', async () => {
        const jar = new CookieJar();
        const request = new Request(`${url}/echo-cookies`, {
            headers: { Cookie: 'header_only=value' },
        });

        const response = await httpClient.sendRequest(request, { cookieJar: jar });
        const body = (await response.json()) as { cookie: string };

        expect(body.cookie).toBe('header_only=value');
    });
});

describe('BaseHttpClient credentials on redirects', () => {
    const credentials = {
        'authorization': 'Bearer secret',
        'proxy-authorization': 'Basic secret',
        'cookie': 'token=secret',
    };

    const echoCredentials = (req: http.IncomingMessage, res: http.ServerResponse) => {
        res.setHeader('content-type', 'application/json');
        res.end(
            JSON.stringify({
                'authorization': req.headers.authorization ?? null,
                'proxy-authorization': req.headers['proxy-authorization'] ?? null,
                'cookie': req.headers.cookie ?? null,
            }),
        );
    };

    let target: http.Server;
    let redirector: http.Server;
    let redirectorUrl: string;

    beforeAll(async () => {
        target = http.createServer(echoCredentials);
        await new Promise<void>((resolve) => target.listen(resolve));
        // A different host, so that the cookie jar does not match it either
        const targetUrl = `http://localhost:${(target.address() as AddressInfo).port}`;

        redirector = http.createServer((req, res) => {
            const { pathname } = new URL(req.url!, 'http://localhost');

            if (pathname === '/cross-origin') {
                res.writeHead(302, { location: `${targetUrl}/echo` }).end();
            } else if (pathname === '/same-origin') {
                res.writeHead(302, { location: '/echo' }).end();
            } else {
                echoCredentials(req, res);
            }
        });
        await new Promise<void>((resolve) => redirector.listen(resolve));
        redirectorUrl = `http://127.0.0.1:${(redirector.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        await new Promise((resolve) => redirector.close(resolve));
        await new Promise((resolve) => target.close(resolve));
    });

    test('does not forward credential headers to a different origin', async () => {
        const response = await httpClient.sendRequest(
            new Request(`${redirectorUrl}/cross-origin`, { headers: credentials }),
        );

        expect(await response.json()).toEqual({ 'authorization': null, 'proxy-authorization': null, 'cookie': null });
    });

    test('does not send cookies of the previous origin to a different origin', async () => {
        const cookieJar = new CookieJar();
        await cookieJar.setCookie('session=secret', redirectorUrl);

        const response = await httpClient.sendRequest(new Request(`${redirectorUrl}/cross-origin`), { cookieJar });

        expect(await response.json()).toMatchObject({ cookie: null });
    });

    test('keeps credential headers on a same-origin redirect', async () => {
        const response = await httpClient.sendRequest(
            new Request(`${redirectorUrl}/same-origin`, { headers: credentials }),
        );

        expect(await response.json()).toEqual(credentials);
    });
});

describe('BaseHttpClient TLS error handling', () => {
    class CapturingHttpClient extends BaseHttpClient {
        lastFetchOptions?: RequestInit & CustomFetchOptions;

        override async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
            this.lastFetchOptions = options;
            return fetch(request, options);
        }
    }

    test('passes ignoreTlsErrors from session.proxyInfo to fetch', async () => {
        const client = new CapturingHttpClient();
        const session = { proxyInfo: { ignoreTlsErrors: true } } as any;

        await client.sendRequest(new Request(url), { session });

        expect(client.lastFetchOptions?.ignoreTlsErrors).toBe(true);
    });

    test('passes an explicit ignoreTlsErrors option to fetch', async () => {
        const client = new CapturingHttpClient();

        await client.sendRequest(new Request(url), { ignoreTlsErrors: true });

        expect(client.lastFetchOptions?.ignoreTlsErrors).toBe(true);
    });

    test('session proxyInfo.ignoreTlsErrors wins over an explicit false option', async () => {
        const client = new CapturingHttpClient();
        const session = { proxyInfo: { ignoreTlsErrors: true } } as any;

        await client.sendRequest(new Request(url), { session, ignoreTlsErrors: false });

        expect(client.lastFetchOptions?.ignoreTlsErrors).toBe(true);
    });

    test('leaves ignoreTlsErrors unset without a session proxy', async () => {
        const client = new CapturingHttpClient();

        await client.sendRequest(new Request(url));

        expect(client.lastFetchOptions?.ignoreTlsErrors).toBeUndefined();
    });

    test('FetchHttpClient warns when ignoreTlsErrors is requested', async () => {
        const warningOnce = vitest.fn();
        const client = new FetchHttpClient({ logger: { warningOnce } as any });

        await client.sendRequest(new Request(url), { ignoreTlsErrors: true });
        expect(warningOnce).toHaveBeenCalledWith(expect.stringContaining('ignoreTlsErrors'));

        warningOnce.mockClear();
        await client.sendRequest(new Request(url));
        expect(warningOnce).not.toHaveBeenCalled();
    });
});

describe('BaseHttpClient redirects that keep the request body', () => {
    let redirectServer: http.Server;
    let redirectUrl: string;

    beforeAll(async () => {
        redirectServer = http.createServer(async (req, res) => {
            const { pathname, searchParams } = new URL(req.url!, 'http://localhost');

            if (pathname === '/redirect') {
                req.resume();
                res.writeHead(Number(searchParams.get('status')), { location: '/echo' });
                res.end();
                return;
            }

            let body = '';
            for await (const chunk of req) body += chunk;

            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ method: req.method, body }));
        });

        await new Promise<void>((resolve) => redirectServer.listen(resolve));
        redirectUrl = `http://127.0.0.1:${(redirectServer.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        await new Promise((resolve) => redirectServer.close(resolve));
    });

    test.each([
        [307, 'POST'],
        [308, 'POST'],
        [301, 'PUT'],
        [302, 'PATCH'],
    ])('resends the body after a %i redirect of a %s request', async (status, method) => {
        const init: RequestInit = { method, body: 'hello' };
        const response = await httpClient.sendRequest(new Request(`${redirectUrl}/redirect?status=${status}`, init));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ method, body: 'hello' });
    });

    test('resends a streamed body after a 307 redirect', async () => {
        const response = await httpClient.sendRequest(
            new Request(`${redirectUrl}/redirect?status=307`, {
                method: 'POST',
                body: Readable.toWeb(Readable.from(['hel', 'lo'])) as ReadableStream,
                duplex: 'half',
            } as RequestInit),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ method: 'POST', body: 'hello' });
    });
});
