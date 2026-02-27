import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { FetchHttpClient } from '@crawlee/http-client';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

let server: http.Server;
let url: string;

beforeAll(async () => {
    server = http.createServer((_req, res) => {
        res.setHeader('content-type', 'text/plain');
        res.end('ok');
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

        await expect(
            httpClient.sendRequest(new Request(url), { signal: controller.signal }),
        ).rejects.toThrow();
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
            await expect(
                httpClient.sendRequest(new Request(slowUrl), { signal: controller.signal }),
            ).rejects.toThrow();
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
            await expect(
                httpClient.sendRequest(new Request(slowUrl), { timeoutMillis: 50 }),
            ).rejects.toThrow();
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
