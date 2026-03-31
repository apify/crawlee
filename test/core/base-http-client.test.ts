import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { FetchHttpClient } from '@crawlee/http-client';
import { CookieJar } from 'tough-cookie';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

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
