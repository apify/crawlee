import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Session, SessionError, SessionPool, SessionRetiredError } from '@crawlee/basic';
import { CheerioCrawler } from '@crawlee/cheerio';
import { MemoryStorageBackend, serviceLocator } from '@crawlee/core';
import {
    BrowserFetchHttpClient,
    type BrowserFetchHttpClientOptions,
    playwrightBrowserPool,
    type PlaywrightBrowserPool,
} from '@crawlee/playwright';
import type { CrawleeLogger } from '@crawlee/types';
import { sleep } from '@crawlee/utils';
import express from 'express';
import type { Page } from 'playwright';
import playwright from 'playwright';

import log from '@apify/log';

import { startExpressAppPromise } from '../shared/_helper.js';

/**
 * State of the test site, reset before each test.
 */
const site = {
    /** Tokens handed out by `/login` in the `token` cookie, `/private/*` serves only requests with one of them */
    tokens: new Set<string>(),
    /** Paths of all the requests the site received */
    paths: [] as string[],
    /** `/slow` requests being served at the moment, and the most of them served at once */
    inFlight: 0,
    maxInFlight: 0,
    /** `/hang` resolves `reached` when requested and responds only after `release` is resolved */
    hang: { reached: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() },
    reset() {
        this.tokens.clear();
        this.paths.length = 0;
        this.inFlight = 0;
        this.maxInFlight = 0;
        this.hang.release.resolve();
        this.hang = { reached: Promise.withResolvers(), release: Promise.withResolvers() };
    },
};

const allBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

function createSiteApp() {
    const app = express();

    app.use((req, _res, next) => {
        site.paths.push(req.path);
        next();
    });
    app.get('/login', (_req, res) => {
        const token = randomUUID();
        site.tokens.add(token);
        res.setHeader('set-cookie', `token=${token}; Path=/`);
        res.send('<html><body>logged in</body></html>');
    });
    app.get('/private/:id', (req, res) => {
        const token = /token=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
        if (!token || !site.tokens.has(token)) {
            res.status(401).send('unauthorized');
            return;
        }
        res.send(`<html><head><title>Private ${req.params.id}</title></head></html>`);
    });
    app.get('/slow', async (req, res) => {
        site.inFlight++;
        site.maxInFlight = Math.max(site.maxInFlight, site.inFlight);
        await sleep(Number(req.query.delay));
        site.inFlight--;
        res.send('slow');
    });
    app.get('/hang', async (_req, res) => {
        site.hang.reached.resolve();
        await site.hang.release.promise;
        res.send('released');
    });
    app.post('/echo', express.raw({ type: '*/*' }), (req, res) => {
        res.json({
            contentType: req.headers['content-type'],
            body: Buffer.from(req.body).toString('base64'),
        });
    });
    app.get('/binary', (_req, res) => {
        res.type('application/octet-stream').send(allBytes);
    });
    app.get('/redirect', (_req, res) => res.redirect(302, '/final'));
    app.get('/final', (_req, res) => {
        res.setHeader('x-custom', 'yes');
        res.status(203).send('final');
    });

    return app;
}

describe('BrowserFetchHttpClient', () => {
    let server: Server;
    let otherPortServer: Server;
    // `baseUrl` and `otherUrl` are two origins of the same server, `otherPortUrl` is a third one on another server
    let baseUrl: string;
    let otherUrl: string;
    let otherPortUrl: string;
    let logLevel: number;

    let browserPool: PlaywrightBrowserPool;
    // All the pages the pool has opened
    let pages: Page[];
    const openPages = () => pages.filter((page) => !page.isClosed());
    const openOrigins = () => openPages().map((page) => new URL(page.url()).origin);

    const login: NonNullable<BrowserFetchHttpClientOptions['login']> = async (page) => {
        await page.goto(`${baseUrl}/login`);
    };

    const get = async (httpClient: BrowserFetchHttpClient, url: string, session?: Session) =>
        httpClient.sendRequest(new Request(url), { session });

    beforeAll(async () => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);

        const app = createSiteApp();
        server = await startExpressAppPromise(app, 0);
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        otherUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
        otherPortServer = await startExpressAppPromise(app, 0);
        otherPortUrl = `http://127.0.0.1:${(otherPortServer.address() as AddressInfo).port}`;
    });

    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        site.reset();
        pages = [];
        browserPool = playwrightBrowserPool({
            // Every page gets its own browser context, so the sessions do not share cookies
            launchContext: { launcher: playwright.chromium, useIncognitoPages: true },
            headless: true,
            useFingerprints: false,
            postPageCreateHooks: [
                async (page) => {
                    pages.push(page);
                },
            ],
        });
    });

    afterEach(async () => {
        await browserPool.destroy();
    });

    afterAll(async () => {
        server.close();
        otherPortServer.close();
        log.setLevel(logLevel);
    });

    describe('sessions', () => {
        test('sends the cookies of the session', async () => {
            const httpClient = new BrowserFetchHttpClient({ browserPool });
            const session = new Session();
            site.tokens.add('valid');
            await session.cookieJar.setCookie('token=valid', baseUrl);

            const response = await get(httpClient, `${baseUrl}/private/1`, session);

            expect(response.status).toBe(200);
        });

        test('saves the cookies set by responses to the session', async () => {
            const httpClient = new BrowserFetchHttpClient({ browserPool });
            const session = new Session();

            await get(httpClient, `${baseUrl}/login`, session);

            expect(await session.cookieJar.getCookieString(baseUrl)).toBe(`token=${[...site.tokens][0]}`);
        });

        test('keeps the cookies of different sessions apart', async () => {
            const httpClient = new BrowserFetchHttpClient({ browserPool });
            const [loggedIn, anonymous] = [new Session(), new Session()];
            await get(httpClient, `${baseUrl}/login`, loggedIn);

            const responses = await Promise.all(
                [loggedIn, anonymous].map(async (session) => get(httpClient, `${baseUrl}/private/1`, session)),
            );

            expect(responses.map((response) => response.status)).toEqual([200, 401]);
        });

        test('logs every session in once before its first request', async () => {
            const loginSpy = vi.fn(login);
            const httpClient = new BrowserFetchHttpClient({ browserPool, login: loginSpy });
            const sessions = [new Session(), new Session()];

            const responses = await Promise.all(
                sessions.flatMap((session) =>
                    [1, 2, 3].map(async (i) => get(httpClient, `${baseUrl}/private/${i}`, session)),
                ),
            );

            expect(responses.map((response) => response.status)).toEqual(Array(6).fill(200));
            expect(loginSpy).toHaveBeenCalledTimes(2);
            expect(loginSpy.mock.calls.map(([, session]) => session)).toEqual(expect.arrayContaining(sessions));
            // The login pages are closed, each session keeps one page for its requests
            await expect.poll(() => openPages()).toHaveLength(2);
        });

        test('tries a failed login again on the next request of the session', async () => {
            const loginSpy = vi.fn(login).mockRejectedValueOnce(new Error('login failed'));
            const httpClient = new BrowserFetchHttpClient({ browserPool, login: loginSpy });
            const session = new Session();

            await expect(get(httpClient, `${baseUrl}/private/1`, session)).rejects.toThrow('login failed');
            const response = await get(httpClient, `${baseUrl}/private/1`, session);

            expect(response.status).toBe(200);
            expect(loginSpy).toHaveBeenCalledTimes(2);
        });

        test('closes the pages of sessions that are no longer usable, reporting how they ended', async () => {
            const closePage = vi.spyOn(browserPool, 'closePage');
            const httpClient = new BrowserFetchHttpClient({ browserPool });
            const blocked = new Session();
            const exhausted = new Session({ maxUsageCount: 1 });
            await get(httpClient, `${baseUrl}/final`, blocked);
            await get(httpClient, `${baseUrl}/final`, exhausted);

            blocked.retire();
            exhausted.markGood();
            await get(httpClient, `${baseUrl}/final`, new Session());

            await expect.poll(() => openPages()).toHaveLength(1);
            expect(closePage.mock.calls.map(([, options]) => options?.error?.constructor)).toEqual([
                SessionError,
                SessionRetiredError,
            ]);
        });
    });

    describe('pages', () => {
        test('runs the requests of a session to one origin concurrently in one page', async () => {
            const httpClient = new BrowserFetchHttpClient({ browserPool });
            const session = new Session();

            // Distinct URLs, as the browser sends concurrent requests to the same URL one by one
            await Promise.all(
                Array.from({ length: 4 }, async (_, i) => get(httpClient, `${baseUrl}/slow?delay=300&i=${i}`, session)),
            );

            expect(site.maxInFlight).toBe(4);
            expect(openPages()).toHaveLength(1);
        });

        test('opens one page per session and origin without loading the site', async () => {
            const httpClient = new BrowserFetchHttpClient({ browserPool });
            const [first, second] = [new Session(), new Session()];

            await Promise.all(
                (
                    [
                        [first, baseUrl],
                        [first, baseUrl],
                        [first, otherUrl],
                        [second, baseUrl],
                    ] as const
                ).map(async ([session, url]) => get(httpClient, `${url}/final`, session)),
            );

            expect(openOrigins().sort()).toEqual([baseUrl, baseUrl, otherUrl].sort());
            expect(site.paths).toEqual(['/final', '/final', '/final', '/final']);
        });

        test.each([
            ['is closed', async (page: Page) => page.close()],
            ['crashes', async (page: Page) => page.goto('chrome://crash').catch(() => {})],
        ])('opens a new page when its page %s', async (_name, breakPage) => {
            const httpClient = new BrowserFetchHttpClient({ browserPool });
            await get(httpClient, `${baseUrl}/final`);

            const [page] = openPages();
            const closed = new Promise((resolve) => page.once('close', resolve));
            await breakPage(page);
            await closed;
            const response = await get(httpClient, `${baseUrl}/final`);

            expect(response.status).toBe(203);
            expect(openPages()).toHaveLength(1);
        });

        test('closes the least recently used pages when more than maxOpenPages are open', async () => {
            const httpClient = new BrowserFetchHttpClient({ browserPool, maxOpenPages: 2 });

            for (const url of [baseUrl, otherUrl, baseUrl, otherPortUrl]) {
                await get(httpClient, `${url}/final`);
            }

            await expect.poll(() => openOrigins().sort()).toEqual([baseUrl, otherPortUrl].sort());
        });

        test('keeps pages with requests in flight open', async () => {
            const httpClient = new BrowserFetchHttpClient({ browserPool, maxOpenPages: 1 });

            const held = get(httpClient, `${baseUrl}/hang`);
            await site.hang.reached.promise;
            const fast = await get(httpClient, `${otherUrl}/final`);
            site.hang.release.resolve();

            expect(fast.status).toBe(203);
            expect((await held).status).toBe(200);
            await expect.poll(() => openOrigins()).toEqual([baseUrl]);
        });
    });

    describe('requests', () => {
        test.each([
            ['text', 'text/plain', Buffer.from('hello world')],
            ['JSON', 'application/json', Buffer.from(JSON.stringify({ foo: 'bar' }))],
            ['binary', 'application/octet-stream', allBytes],
        ])('sends a %s request body intact', async (_name, contentType, body) => {
            const httpClient = new BrowserFetchHttpClient({ browserPool });

            const response = await httpClient.sendRequest(
                new Request(`${baseUrl}/echo`, { method: 'POST', headers: { 'content-type': contentType }, body }),
            );

            expect(await response.json()).toEqual({ contentType, body: body.toString('base64') });
        });

        test('returns binary response bodies intact', async () => {
            const httpClient = new BrowserFetchHttpClient({ browserPool });

            const response = await get(httpClient, `${baseUrl}/binary`);

            expect(Buffer.from(await response.arrayBuffer())).toEqual(allBytes);
        });

        test('follows redirects and returns the final status, headers and URL', async () => {
            const httpClient = new BrowserFetchHttpClient({ browserPool });

            const response = await get(httpClient, `${baseUrl}/redirect`);

            expect(response.status).toBe(203);
            expect(response.url).toBe(`${baseUrl}/final`);
            expect(response.headers.get('x-custom')).toBe('yes');
            expect(await response.text()).toBe('final');
        });

        test('cancels the request in the page when aborted', async () => {
            const httpClient = new BrowserFetchHttpClient({ browserPool });
            const controller = new AbortController();

            const response = httpClient.sendRequest(new Request(`${baseUrl}/hang`), { signal: controller.signal });
            await site.hang.reached.promise;
            const [page] = openPages();
            const failure = new Promise((resolve) => {
                page.once('requestfailed', (request) => resolve(request.failure()?.errorText));
            });
            controller.abort();

            await expect(response).rejects.toThrow();
            expect(await failure).toBe('net::ERR_ABORTED');
        });

        test('warns that ignoreTlsErrors is ignored', async () => {
            const logger = { warningOnce: vi.fn() } as unknown as CrawleeLogger;
            const httpClient = new BrowserFetchHttpClient({ browserPool, logger });

            await httpClient.sendRequest(new Request(`${baseUrl}/final`), { ignoreTlsErrors: true });

            expect(logger.warningOnce).toHaveBeenCalledWith(expect.stringContaining('ignoreTlsErrors'));
        });
    });

    test('lets CheerioCrawler log in again with a new session when the site ends the current one', async () => {
        const loginSpy = vi.fn(login);
        const titles: string[] = [];
        const crawler = new CheerioCrawler({
            httpClient: new BrowserFetchHttpClient({ browserPool, login: loginSpy }),
            sessionPool: new SessionPool({ sessionReuseStrategy: 'use-until-failure' }),
            maxConcurrency: 1,
            requestHandler: async ({ $ }) => {
                titles.push($('title').text());
                if (titles.length === 2) site.tokens.clear();
            },
        });

        const stats = await crawler.run(Array.from({ length: 4 }, (_, i) => `${baseUrl}/private/${i}`));

        expect(titles.sort()).toEqual(['Private 0', 'Private 1', 'Private 2', 'Private 3']);
        expect(stats.requestsFailed).toBe(0);
        expect(loginSpy).toHaveBeenCalledTimes(2);
        expect(new Set(loginSpy.mock.calls.map(([, session]) => session!.id)).size).toBe(2);
    });
});
