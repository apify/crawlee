import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { CheerioCrawler } from '@crawlee/cheerio';
import { MemoryStorageBackend, serviceLocator } from '@crawlee/core';
import { BrowserFetchHttpClient } from '@crawlee/playwright';
import type { CrawleeLogger } from '@crawlee/types';
import { sleep } from '@crawlee/utils';
import express from 'express';
import type { Browser, BrowserContext, Page } from 'playwright';
import playwright from 'playwright';

import log from '@apify/log';

import { startExpressAppPromise } from '../shared/_helper.js';

describe('BrowserFetchHttpClient', () => {
    let server: Server;
    let baseUrl: string;
    let otherUrl: string;
    let browser: Browser;
    let context: BrowserContext;
    let logLevel: number;

    const sessions = new Set<string>();
    let sessionCounter = 0;
    let logoutAfterHits = Infinity;
    let protectedHits = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    let flakyHits = 0;
    let hangingClosed: Promise<void>;
    let resolveHangingClosed: () => void;
    const requestedPaths: string[] = [];

    const hasSession = (req: express.Request) => {
        const token = /session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
        return !!token && sessions.has(token);
    };

    const login = async (url = baseUrl) => {
        const page = await context.newPage();
        await page.goto(`${url}/login`);
        await page.close();
    };

    beforeAll(async () => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);

        const app = express();
        app.use((req, _res, next) => {
            requestedPaths.push(req.path);
            next();
        });
        app.get('/login', (_req, res) => {
            const token = `token-${++sessionCounter}`;
            sessions.add(token);
            res.setHeader('set-cookie', `session=${token}; Path=/`);
            res.send('<html><body>logged in</body></html>');
        });
        app.get('/private/:id', async (req, res) => {
            if (++protectedHits === logoutAfterHits) sessions.clear();
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await sleep(Number(req.query.delay ?? 0));
            inFlight--;
            if (!hasSession(req)) {
                res.status(401).send('unauthorized');
                return;
            }
            res.send(`<html><head><title>Private ${req.params.id}</title></head></html>`);
        });
        app.get('/flaky', (_req, res) => {
            if (++flakyHits === 1) {
                res.status(500).send('error');
                return;
            }
            res.send('<html><head><title>Flaky</title></head></html>');
        });
        app.post('/echo', express.raw({ type: '*/*' }), (req, res) => {
            res.json({
                contentType: req.headers['content-type'],
                body: Buffer.from(req.body).toString('base64'),
            });
        });
        app.get('/binary', (_req, res) => {
            res.type('application/octet-stream').send(Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
        });
        app.get('/redirect', (_req, res) => res.redirect(302, '/final'));
        app.get('/final', (_req, res) => {
            res.setHeader('x-custom', 'yes');
            res.status(203).send('final');
        });
        app.get('/hang', (_req, res) => {
            res.on('close', () => resolveHangingClosed());
        });

        server = await startExpressAppPromise(app, 0);
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        otherUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
        browser = await playwright.chromium.launch({ headless: true });
    });

    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        sessions.clear();
        logoutAfterHits = Infinity;
        protectedHits = 0;
        inFlight = 0;
        maxInFlight = 0;
        flakyHits = 0;
        hangingClosed = new Promise((resolve) => {
            resolveHangingClosed = resolve;
        });
        context = await browser.newContext();
        await login();
        requestedPaths.length = 0;
    });

    afterEach(async () => {
        await context.close();
    });

    afterAll(async () => {
        await browser.close();
        server.close();
        log.setLevel(logLevel);
    });

    test('CheerioCrawler crawls pages that need the session of the context', async () => {
        const titles: string[] = [];
        const crawler = new CheerioCrawler({
            httpClient: new BrowserFetchHttpClient({ context }),
            maxRequestRetries: 1,
            requestHandler: async ({ $ }) => {
                titles.push($('title').text());
            },
        });

        const stats = await crawler.run([
            ...Array.from({ length: 8 }, (_, i) => `${baseUrl}/private/${i}`),
            `${baseUrl}/flaky`,
        ]);

        expect(titles.sort()).toEqual(['Flaky', ...Array.from({ length: 8 }, (_, i) => `Private ${i}`)].sort());
        expect(stats.requestsSucceeded).toBe(9);
        expect(stats.requestsFailed).toBe(0);
        expect(stats.retryHistogram).toEqual([8, 1]);
    });

    test('runs requests concurrently on one page', async () => {
        const crawler = new CheerioCrawler({
            httpClient: new BrowserFetchHttpClient({ context }),
            minConcurrency: 4,
            maxConcurrency: 4,
            requestHandler: async () => {},
        });

        const stats = await crawler.run(Array.from({ length: 8 }, (_, i) => `${baseUrl}/private/${i}?delay=300`));

        expect(maxInFlight).toBe(4);
        expect(stats.requestsSucceeded).toBe(8);
        expect(stats.requestsFailed).toBe(0);
    });

    test('lets errorHandler log in again when the session is lost while requests are in flight', async () => {
        let logins = 0;
        let relogin: Promise<void> | undefined;
        const crawler = new CheerioCrawler({
            httpClient: new BrowserFetchHttpClient({ context }),
            minConcurrency: 4,
            maxConcurrency: 4,
            maxRequestRetries: 1,
            errorHandler: async ({ response }) => {
                if (response?.status !== 401) return;
                if (!relogin) {
                    logins++;
                    relogin = login().finally(() => {
                        relogin = undefined;
                    });
                }
                await relogin;
            },
            requestHandler: async () => {},
        });

        logoutAfterHits = 3;
        const stats = await crawler.run(Array.from({ length: 12 }, (_, i) => `${baseUrl}/private/${i}?delay=200`));

        expect(logins).toBe(1);
        expect(stats.requestsSucceeded).toBe(12);
        expect(stats.requestsFailed).toBe(0);
    });

    test('opens one page per origin without loading the site', async () => {
        await login(otherUrl);
        requestedPaths.length = 0;
        const httpClient = new BrowserFetchHttpClient({ context });

        const responses = await Promise.all(
            [baseUrl, baseUrl, otherUrl, otherUrl].map(async (url, i) =>
                httpClient.sendRequest(new Request(`${url}/private/${i}`)),
            ),
        );

        expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
        expect(context.pages()).toHaveLength(2);
        expect(requestedPaths.sort()).toEqual(['/private/0', '/private/1', '/private/2', '/private/3']);
    });

    test.each([
        ['is closed', async (page: Page) => page.close()],
        ['crashes', async (page: Page) => page.goto('chrome://crash').catch(() => {})],
    ])('opens a new page when its page %s', async (_name, breakPage) => {
        const httpClient = new BrowserFetchHttpClient({ context });
        await httpClient.sendRequest(new Request(`${baseUrl}/final`));

        const [page] = context.pages();
        const closed = new Promise((resolve) => page.once('close', resolve));
        await breakPage(page);
        await closed;
        const response = await httpClient.sendRequest(new Request(`${baseUrl}/final`));

        expect(response.status).toBe(203);
        expect(context.pages()).toHaveLength(1);
    });

    test.each([
        ['text', 'text/plain', Buffer.from('hello world')],
        ['JSON', 'application/json', Buffer.from(JSON.stringify({ foo: 'bar' }))],
        ['binary', 'application/octet-stream', Buffer.from(Array.from({ length: 256 }, (_, i) => i))],
    ])('sends a %s request body intact', async (_name, contentType, body) => {
        const httpClient = new BrowserFetchHttpClient({ context });

        const response = await httpClient.sendRequest(
            new Request(`${baseUrl}/echo`, { method: 'POST', headers: { 'content-type': contentType }, body }),
        );

        expect(await response.json()).toEqual({ contentType, body: body.toString('base64') });
    });

    test('returns binary response bodies intact', async () => {
        const httpClient = new BrowserFetchHttpClient({ context });

        const response = await httpClient.sendRequest(new Request(`${baseUrl}/binary`));

        expect(Buffer.from(await response.arrayBuffer())).toEqual(
            Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
        );
    });

    test('follows redirects and returns the final status, headers and URL', async () => {
        const httpClient = new BrowserFetchHttpClient({ context });

        const response = await httpClient.sendRequest(new Request(`${baseUrl}/redirect`));

        expect(response.status).toBe(203);
        expect(response.url).toBe(`${baseUrl}/final`);
        expect(response.headers.get('x-custom')).toBe('yes');
        expect(await response.text()).toBe('final');
    });

    test('cancels the request in the page when aborted', async () => {
        const httpClient = new BrowserFetchHttpClient({ context });
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 200);

        await expect(
            httpClient.sendRequest(new Request(`${baseUrl}/hang`), { signal: controller.signal }),
        ).rejects.toThrow();
        await expect(Promise.race([hangingClosed.then(() => 'closed'), sleep(2000)])).resolves.toBe('closed');
    });

    test('warns that ignoreTlsErrors is ignored', async () => {
        const logger = { warningOnce: vi.fn() } as unknown as CrawleeLogger;
        const httpClient = new BrowserFetchHttpClient({ context, logger });

        await httpClient.sendRequest(new Request(`${baseUrl}/final`), { ignoreTlsErrors: true });

        expect(logger.warningOnce).toHaveBeenCalledWith(expect.stringContaining('ignoreTlsErrors'));
    });
});
