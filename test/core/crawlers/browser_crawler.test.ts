import type { Server } from 'node:http';

import type { BrowserPool, PuppeteerController } from '@crawlee/browser-pool';
import {
    BROWSER_POOL_EVENTS,
    BrowserPool as BrowserPoolClass,
    OperatingSystemsName,
    PuppeteerPlugin,
    RemoteBrowserPool,
} from '@crawlee/browser-pool';
import { BLOCKED_STATUS_CODES, MemoryStorageBackend, serviceLocator, SessionPool } from '@crawlee/core';
import type { PuppeteerGoToOptions } from '@crawlee/puppeteer';
import { EnqueueStrategy, ProxyConfiguration, Request, RequestList, RequestState, Session } from '@crawlee/puppeteer';
import { sleep } from '@crawlee/utils';
// @ts-ignore This only throws when compiled against puppeteer 25+ (ESM only), we only import types, so its alllll gooooood
import type { HTTPResponse } from 'puppeteer';
// @ts-ignore This only throws when compiled against puppeteer 25+ (ESM only), vitest executes tests as ESM, so its alllll gooooood
import puppeteer from 'puppeteer';
import { runExampleComServer } from '../../shared/_helper.js';

import { ENV_VARS } from '@apify/consts';
import log from '@apify/log';

import type { TestCrawlingContext } from './basic_browser_crawler.js';
import { BrowserCrawlerTest } from './basic_browser_crawler.js';
import { ISession } from '@crawlee/types';

describe('BrowserCrawler', () => {
    let prevEnvHeadless: string;
    let logLevel: number;

    let serverAddress = 'http://localhost:';
    let port: number;
    let server: Server;

    beforeAll(async () => {
        prevEnvHeadless = process.env.CRAWLEE_HEADLESS!;
        process.env.CRAWLEE_HEADLESS = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);

        [server, port] = await runExampleComServer();
        serverAddress += port;
    });

    afterAll(async () => {
        log.setLevel(logLevel);
        process.env.CRAWLEE_HEADLESS = prevEnvHeadless;
        server.close();
    });

    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    test('should work', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const sources = [
            { url: `${serverAddress}/?q=1` },
            { url: `${serverAddress}/?q=2` },
            { url: `${serverAddress}/?q=3` },
            { url: `${serverAddress}/?q=4` },
            { url: `${serverAddress}/?q=5` },
            { url: `${serverAddress}/?q=6` },
        ];
        const sourcesCopy = JSON.parse(JSON.stringify(sources));
        const processed: Request[] = [];
        const failed: Request[] = [];
        const requestList = await RequestList.open(null, sources);
        const requestHandler = async ({ page, request, response }: TestCrawlingContext) => {
            await page.waitForSelector('title');

            expect(response!.status()).toBe(200);
            request.userData.title = await page.title();
            processed.push(request);
        };

        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            minConcurrency: 1,
            maxConcurrency: 1,
            requestHandler,
            failedRequestHandler: async ({ request }) => {
                failed.push(request);
            },
        });

        await browserCrawler.run();

        expect(browserCrawler.autoscaledPool!.minConcurrency).toBe(1);
        expect(processed).toHaveLength(6);
        expect(failed).toHaveLength(0);

        processed.forEach((request, id) => {
            expect(request.url).toEqual(sourcesCopy[id].url);
            expect(request.userData.title).toBe('Example Domain');
        });
    });

    test('should teardown browser pool', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: 'http://example.com/?q=1' }],
        });
        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,

            requestHandler: async () => {},
            maxRequestRetries: 1,
        });

        // Spy on destroy and track if it was called
        let destroyCalled = false;
        const ownedPool = browserCrawler.browserPool as BrowserPool;
        const originalDestroy = ownedPool.destroy.bind(ownedPool);
        ownedPool.destroy = async () => {
            destroyCalled = true;
            return originalDestroy();
        };

        await browserCrawler.run();
        expect(destroyCalled).toBe(true);
    });

    test('should not tear down a user-supplied browser pool', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);
        const externalPool = new BrowserPoolClass({ browserPlugins: [puppeteerPlugin] });

        try {
            const requestList = await RequestList.open({
                sources: [{ url: 'http://example.com/?q=1' }],
            });
            const browserCrawler = new BrowserCrawlerTest({
                browserPool: externalPool,
                requestList,
                requestHandler: async () => {},
                maxRequestRetries: 1,
            });

            expect(browserCrawler.browserPool).toBe(externalPool);

            let destroyCalled = false;
            const originalDestroy = externalPool.destroy.bind(externalPool);
            externalPool.destroy = async () => {
                destroyCalled = true;
                return originalDestroy();
            };

            await browserCrawler.run();
            expect(destroyCalled).toBe(false);
        } finally {
            await externalPool.destroy();
        }
    });

    test('builds and owns a RemoteBrowserPool from the remoteBrowser option', async () => {
        const crawler = new BrowserCrawlerTest({
            remoteBrowser: { endpoint: 'ws://remote:9222', maxOpenBrowsers: 2 },
            browserPoolOptions: { browserPlugins: [new PuppeteerPlugin(puppeteer)] },
            requestHandler: async () => {},
        });

        expect(crawler.browserPool).toBeInstanceOf(RemoteBrowserPool);
        expect((crawler.browserPool as RemoteBrowserPool).maxOpenBrowsers).toBe(2);

        await (crawler.browserPool as RemoteBrowserPool).destroy();
    });

    test('uses browserPool and ignores remoteBrowser when both are set', async () => {
        const externalPool = new BrowserPoolClass({ browserPlugins: [new PuppeteerPlugin(puppeteer)] });

        try {
            const crawler = new BrowserCrawlerTest({
                browserPool: externalPool,
                remoteBrowser: { endpoint: 'ws://remote:9222' },
                requestHandler: async () => {},
            });

            expect(crawler.browserPool).toBe(externalPool);
        } finally {
            await externalPool.destroy();
        }
    });

    test('should retire session after TimeoutError', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: 'http://example.com/?q=1' }],
        });
        class TimeoutError extends Error {}
        let markBadCalled = false;
        let sessionGoto!: ISession;
        const browserCrawler = new (class extends BrowserCrawlerTest {
            protected override async _navigationHandler(
                ctx: TestCrawlingContext,
            ): Promise<HTTPResponse | null | undefined> {
                sessionGoto = ctx.session!;
                const originalMarkBad = sessionGoto.markBad.bind(sessionGoto);
                sessionGoto.markBad = () => {
                    markBadCalled = true;
                    return originalMarkBad();
                };
                throw new TimeoutError();
            }
        })({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,

            requestHandler: async () => {},
            maxRequestRetries: 1,
        });

        await browserCrawler.run();
        expect(markBadCalled).toBe(true);
    });

    test('should evaluate preNavigationHooks', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: 'http://example.com/?q=1' }],
        });

        const hook = vi.fn(async () => {
            await sleep(10);
        });

        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,

            requestHandler: async () => {},
            maxRequestRetries: 0,
            preNavigationHooks: [hook],
        });

        await browserCrawler.run();

        expect(hook).toHaveBeenCalled();
    });

    test('should evaluate postNavigationHooks', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: `${serverAddress}/?q=1` }],
        });

        const hook = vi.fn(async () => {
            await sleep(10);
        });

        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,

            requestHandler: async () => {},
            maxRequestRetries: 0,
            postNavigationHooks: [hook],
        });

        await browserCrawler.run();

        expect(hook).toHaveBeenCalled();
    });

    test('postNavigationHooks can override response, observed downstream', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: `${serverAddress}/?q=1` }],
        });

        const observed: { fromSecondHook?: number; fromHandler?: number } = {};
        const fakeStatus = 418;

        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            maxRequestRetries: 0,
            postNavigationHooks: [
                async ({ response }) => ({
                    response: new Proxy(response, {
                        get(target, key, receiver) {
                            if (key === 'status') return () => fakeStatus;
                            return Reflect.get(target, key, receiver);
                        },
                    }),
                }),
                async ({ response }) => {
                    observed.fromSecondHook = response.status();
                },
            ],
            requestHandler: async ({ response }) => {
                observed.fromHandler = response.status();
            },
        });

        await browserCrawler.run();

        expect(observed.fromSecondHook).toBe(fakeStatus);
        expect(observed.fromHandler).toBe(fakeStatus);
    });

    test('errorHandler has open page', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: `${serverAddress}/?q=1` }],
        });

        const result: string[] = [];

        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            requestHandler: async (ctx) => {
                throw new Error('Test error');
            },
            maxRequestRetries: 1,
            errorHandler: async (ctx, error) => {
                result.push(await ctx.page!.evaluate(() => window.location.origin));
            },
        });

        await browserCrawler.run();

        expect(result.length).toBe(1);
        expect(result[0]).toBe(serverAddress);
    });

    // see https://github.com/apify/crawlee/issues/3873
    test.skip('errorHandler has open page after non-timeout navigation error', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: `${serverAddress}/?q=1` }],
        });

        const pageClosedStates: boolean[] = [];

        const browserCrawler = new (class extends BrowserCrawlerTest {
            protected override async _navigationHandler(): Promise<HTTPResponse | null | undefined> {
                throw new Error('net::ERR_NAME_NOT_RESOLVED');
            }
        })({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            requestHandler: async () => {},
            maxRequestRetries: 1,
            errorHandler: async (ctx) => {
                pageClosedStates.push(ctx.page!.isClosed());
            },
        });

        await browserCrawler.run();

        expect(pageClosedStates).toHaveLength(1);
        expect(pageClosedStates[0]).toBe(false);
    });

    test('should correctly track request.state', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const sources = [{ url: `${serverAddress}/?q=1` }];
        const requestList = await RequestList.open(null, sources);
        const requestStates: RequestState[] = [];

        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            preNavigationHooks: [
                async ({ request }) => {
                    requestStates.push(request.state);
                },
            ],
            postNavigationHooks: [
                async ({ request }) => {
                    requestStates.push(request.state);
                },
            ],
            requestHandler: async ({ request }) => {
                requestStates.push(request.state);
                throw new Error('Error');
            },
            maxRequestRetries: 1,
            errorHandler: async ({ request }) => {
                requestStates.push(request.state);
            },
        });

        await browserCrawler.run();

        expect(requestStates).toEqual([
            RequestState.BEFORE_NAV,
            RequestState.AFTER_NAV,
            RequestState.REQUEST_HANDLER,
            RequestState.ERROR_HANDLER,
            RequestState.BEFORE_NAV,
            RequestState.AFTER_NAV,
            RequestState.REQUEST_HANDLER,
        ]);
    });

    test('should allow modifying gotoOptions by pre navigation hooks', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: `${serverAddress}/?q=1` }],
        });
        let optionsGoto: PuppeteerGoToOptions;
        const browserCrawler = new (class extends BrowserCrawlerTest {
            protected override async _navigationHandler(
                ctx: TestCrawlingContext,
                gotoOptions: PuppeteerGoToOptions,
            ): Promise<HTTPResponse | null | undefined> {
                optionsGoto = gotoOptions;
                return ctx.page.goto(ctx.request.url, gotoOptions);
            }
        })({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,

            requestHandler: async () => {},
            maxRequestRetries: 0,
            preNavigationHooks: [
                async ({ gotoOptions }) => {
                    gotoOptions.timeout = 60000;
                },
            ],
        });

        await browserCrawler.run();

        expect(optionsGoto!.timeout).toEqual(60000);
    });

    test('should ignore errors in Page.close()', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        for (let i = 0; i < 2; i++) {
            const requestList = await RequestList.open({
                sources: [{ url: `${serverAddress}/?q=1` }],
            });
            let failedCalled = false;

            const browserCrawler = new BrowserCrawlerTest({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                },
                requestList,
                requestHandler: async ({ page }) => {
                    page.close = async () => {
                        if (i === 0) {
                            throw new Error();
                        } else {
                            return Promise.reject(new Error());
                        }
                    };
                    return Promise.resolve();
                },
                failedRequestHandler: async () => {
                    failedCalled = true;
                },
            });
            await browserCrawler.run();
            expect(failedCalled).toBe(false);
        }
    });

    test('should respect the requestHandlerTimeoutSecs option', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: `${serverAddress}/?q=1` }],
        });

        const callSpy = vitest.fn();

        // Use a very long delay for "bad" so it can never fire during test execution.
        // The test verifies that the 500ms timeout aborts the handler before "bad" would fire.
        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            requestHandler: async () => {
                setTimeout(() => callSpy('good'), 300);
                setTimeout(() => callSpy('bad'), 60_000);
                await new Promise(() => {});
            },
            requestHandlerTimeoutSecs: 0.5,
            maxRequestRetries: 0,
        });
        await browserCrawler.run();

        expect(callSpy).toBeCalledTimes(1);
        expect(callSpy).toBeCalledWith('good');
    });

    test('should not throw without SessionPool', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: 'http://example.com/?q=1' }],
        });
        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,

            requestHandler: async () => {},
        });

        expect(browserCrawler).toBeDefined();
    });

    test('should correctly set session pool options', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: 'http://example.com/?q=1' }],
        });

        const crawler = new BrowserCrawlerTest({
            requestList,
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },

            saveResponseCookies: false,
            sessionPool: new SessionPool({
                sessionOptions: {
                    maxUsageCount: 1,
                },
                persistStateKeyValueStoreId: 'abc',
            }),
            requestHandler: async () => {},
        });

        // @ts-expect-error Accessing private prop
        expect(crawler.sessionPool.sessionOptions.maxUsageCount).toBe(1);
        // @ts-expect-error Accessing private prop
        expect(crawler.sessionPool.persistStateKeyValueStoreId).toBe('abc');
    });

    test.skip('should persist cookies per session', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);
        const name = `list-${Math.random()}`;
        const requestList = await RequestList.open({
            persistStateKey: name,
            persistRequestsKey: name,
            sources: [
                { url: 'http://example.com/?q=1' },
                { url: 'http://example.com/?q=2' },
                { url: 'http://example.com/?q=3' },
                { url: 'http://example.com/?q=4' },
            ],
        });
        const goToPageSessions = [];
        const loadedCookies: string[] = [];
        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            saveResponseCookies: true,
            requestHandler: async ({ session, request }) => {
                loadedCookies.push(session.cookieJar.getCookieStringSync(request.url));
                return Promise.resolve();
            },
            preNavigationHooks: [
                async ({ session, page }) => {
                    await page.setCookie({
                        name: 'TEST',
                        value: '12321312312',
                        domain: 'example.com',
                        expires: Date.now() + 100000,
                    });
                    goToPageSessions.push(session);
                },
            ],
        });

        await browserCrawler.run();
        expect(loadedCookies).toHaveLength(4);

        loadedCookies.forEach((cookie) => {
            // TODO this test is flaky in CI and we need some more info to debug why.
            if (cookie !== 'TEST=12321312312') {
                // for some reason, the CI failures report the first cookie to be just empty string

                console.log('loadedCookies:');

                console.dir(loadedCookies);
            }

            expect(cookie).toEqual('TEST=12321312312');
        });
    });

    test('should throw on "blocked" status codes', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const baseUrl = 'https://example.com/';
        const sources = BLOCKED_STATUS_CODES.map((statusCode) => {
            return {
                url: baseUrl + statusCode,
                userData: { statusCode },
            };
        });
        const requestList = await RequestList.open(null, sources);

        let called = false;
        const failedRequests: Request[] = [];
        const crawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,

            saveResponseCookies: false,
            maxRequestRetries: 0,
            requestHandler: async () => {
                called = true;
            },
            failedRequestHandler: async ({ request }) => {
                failedRequests.push(request);
            },
        });

        // @ts-expect-error Overriding protected method
        crawler._navigationHandler = async ({ request }) => {
            return { status: () => request.userData.statusCode };
        };

        await crawler.run();

        expect(failedRequests.length).toBe(3);
        failedRequests.forEach((fr) => {
            const [msg] = fr.errorMessages;
            expect(msg).toContain(`Request blocked - received ${fr.userData.statusCode} status code.`);
        });
        expect(called).toBe(false);
    });

    test('retryOnBlocked should retry on Cloudflare challenge', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const urls = [new URL('/special/cloudflareBlocking', serverAddress).href];
        const maxRequestRetries = 1;

        let processed = false;
        const errorMessages: string[] = [];

        const crawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            retryOnBlocked: true,
            maxRequestRetries,
            requestHandler: async ({ page, response }) => {
                processed = true;
            },
            failedRequestHandler: async ({ request }) => {
                errorMessages.push(...request.errorMessages);
            },
        });

        await crawler.run(urls);

        expect(errorMessages).toHaveLength(urls.length * (maxRequestRetries + 1));
        expect(errorMessages.every((x) => x.includes('Detected a session error, retiring session...'))).toBe(true);
        expect(processed).toBe(false);
    });

    test('retryOnBlocked throws on "blocked" status codes', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const baseUrl = 'https://example.com/';
        const sources = BLOCKED_STATUS_CODES.map((statusCode) => {
            return {
                url: baseUrl + statusCode,
                userData: { statusCode },
            };
        });
        const requestList = await RequestList.open(null, sources);
        const maxRequestRetries = 1;
        const errorMessages: string[] = [];

        let processed = false;
        const crawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            retryOnBlocked: true,
            maxRequestRetries,
            requestHandler: async () => {
                processed = true;
            },
            failedRequestHandler: async ({ request }) => {
                errorMessages.push(...request.errorMessages);
            },
        });

        // @ts-expect-error Overriding protected method
        crawler._navigationHandler = async ({ request }) => {
            return { status: () => request.userData.statusCode };
        };

        await crawler.run();

        expect(errorMessages.length).toBe(sources.length * (maxRequestRetries + 1));
        expect(errorMessages.every((x) => x.includes('Detected a session error, retiring session...'))).toBe(true);
        expect(processed).toBe(false);
    });

    test('should throw on "blocked" status codes (retire session)', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const baseUrl = 'https://example.com/';
        const sources = BLOCKED_STATUS_CODES.map((statusCode) => {
            return {
                url: baseUrl + statusCode,
                userData: { statusCode },
            };
        });
        const requestList = await RequestList.open(null, sources);

        let called = false;
        const failedRequests: Request[] = [];
        const crawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,

            saveResponseCookies: false,
            maxRequestRetries: 0,
            requestHandler: async () => {
                called = true;
            },
            failedRequestHandler: async ({ request }) => {
                failedRequests.push(request);
            },
        });

        // @ts-expect-error Overriding protected method
        crawler._navigationHandler = async ({ request }) => {
            return { status: () => request.userData.statusCode };
        };

        await crawler.run();

        expect(failedRequests.length).toBe(3);
        failedRequests.forEach((fr) => {
            const [msg] = fr.errorMessages;
            expect(msg).toContain(`Request blocked - received ${fr.userData.statusCode} status code.`);
        });
        expect(called).toBe(false);
    });

    test('should retire browser with session', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const requestList = await RequestList.open({
            sources: [{ url: 'http://example.com/?q=1' }],
        });

        let retiredBrowserCount = 0;
        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            requestHandler: async ({ session }) => {
                session!.retire();
            },
            maxRequestRetries: 1,
        });
        (browserCrawler.browserPool as BrowserPool).on(BROWSER_POOL_EVENTS.BROWSER_RETIRED, () => {
            retiredBrowserCount += 1;
        });

        await browserCrawler.run();

        expect(retiredBrowserCount).toBeGreaterThan(0);
    });

    test('should increment session usage correctly', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const sessionUsageHistory: number[] = [];

        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            sessionPool: new SessionPool({
                maxPoolSize: 1,
            }),
            requestHandler: async ({ session }) => {
                sessionUsageHistory.push((session as Session).usageCount);
            },
        });

        await browserCrawler.run([
            { url: `${serverAddress}/?q=1` },
            { url: `${serverAddress}/?q=2` },
            { url: `${serverAddress}/?q=3` },
            { url: `${serverAddress}/?q=4` },
            { url: `${serverAddress}/?q=5` },
            { url: `${serverAddress}/?q=6` },
        ]);

        expect(sessionUsageHistory).toEqual([0, 1, 2, 3, 4, 5]);
    });

    test('should allow using fingerprints from browser pool', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const pool = new BrowserPoolClass({
            browserPlugins: [puppeteerPlugin],
            useFingerprints: true,
            fingerprintOptions: {
                fingerprintGeneratorOptions: {
                    operatingSystems: [OperatingSystemsName.windows],
                },
            },
        });

        try {
            const requestList = await RequestList.open({
                sources: [{ url: `${serverAddress}/?q=1` }],
            });
            const browserCrawler = new BrowserCrawlerTest({
                browserPool: pool,
                requestList,

                requestHandler: async ({ page }) => {
                    const controller = pool.getBrowserControllerByPage(page);
                    expect(controller?.launchContext.fingerprint).toBeDefined();
                },
            });

            await browserCrawler.run();
            expect.hasAssertions();
        } finally {
            await pool.destroy();
        }
    });

    describe('proxy', () => {
        // This test manipulates environment variables, so it must NOT be run concurrently
        test('browser should launch with rotated custom proxy', async () => {
            const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';

            const requestList = await RequestList.open({
                sources: [
                    { url: `${serverAddress}/?q=1` },
                    { url: `${serverAddress}/?q=2` },
                    { url: `${serverAddress}/?q=3` },
                ],
            });

            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            const browserProxies: string[] = [];

            const browserCrawler = new BrowserCrawlerTest({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                    maxOpenPagesPerBrowser: 1,
                    retireBrowserAfterPageCount: 1,
                },
                requestList,
                requestHandler: async () => {},
                proxyConfiguration,
                maxRequestRetries: 0,
                maxConcurrency: 1,
            });

            (browserCrawler.browserPool as BrowserPool).postLaunchHooks.push((_pageId, browserController) => {
                browserProxies.push((browserController as PuppeteerController).launchContext.proxyUrl!);
            });

            await browserCrawler.run();

            // @ts-expect-error Accessing private property
            const proxiesToUse = proxyConfiguration.proxyUrls!;
            for (const proxyUrl of proxiesToUse) {
                expect(browserProxies.includes(new URL(proxyUrl!).href.slice(0, -1))).toBeTruthy();
            }

            delete process.env[ENV_VARS.PROXY_PASSWORD];
        });

        test('proxy rotation on error works as expected', async () => {
            const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

            const requestList = await RequestList.open({
                sources: [
                    { url: 'http://example.com/?q=1' },
                    { url: 'http://example.com/?q=2' },
                    { url: 'http://example.com/?q=3' },
                    { url: 'http://example.com/?q=4' },
                ],
            });

            const goodProxyUrl = 'http://good.proxy';
            const proxyUrls = ['http://localhost', 'http://localhost:1234', goodProxyUrl];
            const proxyConfiguration = new ProxyConfiguration({ proxyUrls });
            const requestHandler = vitest.fn();

            const browserCrawler = new (class extends BrowserCrawlerTest {
                protected override async _navigationHandler(
                    ctx: TestCrawlingContext,
                ): Promise<HTTPResponse | null | undefined> {
                    const proxyInfo = ctx.session?.proxyInfo;

                    if (proxyInfo!.url !== goodProxyUrl) {
                        throw new Error('ERR_PROXY_CONNECTION_FAILED');
                    }

                    return null;
                }
            })({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                },
                requestList,
                // Enough retries for every request to eventually be served on a session bound to the good proxy
                // (proxy rotation interleaves with the request-manager order, so a few extra attempts are needed).
                maxRequestRetries: 5,
                maxConcurrency: 1,

                proxyConfiguration,
                requestHandler,
            });

            await expect(browserCrawler.run()).resolves.not.toThrow();
            expect(requestHandler).toHaveBeenCalledTimes(4);
        });

        test('proxy rotation on error respects maxRequestRetries, calls failedRequestHandler', async () => {
            const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

            const requestList = await RequestList.open({
                sources: [
                    { url: 'http://example.com/?q=1' },
                    { url: 'http://example.com/?q=2' },
                    { url: 'http://example.com/?q=3' },
                    { url: 'http://example.com/?q=4' },
                ],
            });

            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://localhost', 'http://localhost:1234'],
            });
            const failedRequestHandler = vitest.fn();

            /**
             * The first increment is the base case when the proxy is retrieved for the first time.
             */
            let numberOfRotations = -(await requestList!.getTotalCount());
            const browserCrawler = new (class extends BrowserCrawlerTest {
                protected override async _navigationHandler(
                    ctx: TestCrawlingContext,
                ): Promise<HTTPResponse | null | undefined> {
                    const proxyInfo = ctx.session?.proxyInfo;

                    numberOfRotations++;

                    if (proxyInfo!.url.includes('localhost')) {
                        throw new Error('ERR_PROXY_CONNECTION_FAILED');
                    }

                    return null;
                }
            })({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                },
                requestList,
                maxRequestRetries: 5,
                maxConcurrency: 1,
                proxyConfiguration,
                requestHandler: async () => {},
                failedRequestHandler,
            });

            await browserCrawler.run();
            expect(failedRequestHandler).toBeCalledTimes(4);
            expect(numberOfRotations).toBe(4 * 5);
        });

        test('proxy rotation logs the original proxy error', async () => {
            const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

            const requestList = await RequestList.open({
                sources: [
                    { url: 'http://example.com/?q=1' },
                    { url: 'http://example.com/?q=2' },
                    { url: 'http://example.com/?q=3' },
                    { url: 'http://example.com/?q=4' },
                ],
            });

            const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://localhost:1234'] });

            const proxyError =
                'Proxy responded with 400 - Bad request. Also, this error message contains some useful payload.';

            const crawler = new (class extends BrowserCrawlerTest {
                protected override async _navigationHandler(
                    ctx: TestCrawlingContext,
                ): Promise<HTTPResponse | null | undefined> {
                    const proxyInfo = ctx.session?.proxyInfo;

                    if (proxyInfo!.url.includes('localhost')) {
                        throw new Error(proxyError);
                    }

                    return null;
                }
            })({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                },
                requestList,
                maxRequestRetries: 1,
                maxConcurrency: 1,
                proxyConfiguration,
                requestHandler: async () => {},
            });

            const spy = vitest.spyOn((crawler as any).log, 'warning' as any).mockImplementation(() => {});

            await crawler.run([serverAddress]);

            expect(spy).toBeCalled();
            expect(spy.mock.calls[0][0]).toEqual(expect.stringContaining(proxyError));
        });
    });

    describe('Crawling context', () => {
        // This describe block manipulates log levels (global state), so tests must NOT be concurrent

        test('uses correct crawling context', async () => {
            const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

            const actualLogLevel = log.getLevel();
            log.setLevel(log.LEVELS.OFF);

            try {
                const sources = ['http://example.com/'];
                const requestList = await RequestList.open(null, sources.slice());

                let prepareCrawlingContext: TestCrawlingContext;

                const gotoFunction = async (crawlingContext: TestCrawlingContext) => {
                    prepareCrawlingContext = crawlingContext;
                    expect(crawlingContext.request).toBeInstanceOf(Request);
                    expect(crawlingContext.session).toBeInstanceOf(Session);
                    expect(typeof crawlingContext.page).toBe('object');
                };

                const requestHandler = async (crawlingContext: TestCrawlingContext) => {
                    expect(crawlingContext === prepareCrawlingContext).toEqual(true);
                    expect(crawlingContext.request).toBeInstanceOf(Request);
                    expect(crawlingContext.session).toBeInstanceOf(Session);
                    expect(typeof crawlingContext.page).toBe('object');
                    expect(Object.hasOwn(crawlingContext, 'response')).toBe(true);

                    throw new Error('some error');
                };

                const failedRequestHandler = async (crawlingContext: Partial<TestCrawlingContext>, error: Error) => {
                    expect(crawlingContext).toBe(prepareCrawlingContext);
                    expect(crawlingContext.request).toBeInstanceOf(Request);
                    expect(crawlingContext.session).toBeInstanceOf(Session);
                    expect(typeof crawlingContext.page).toBe('object');
                    expect(Object.hasOwn(crawlingContext, 'response')).toBe(true);

                    expect(error).toBeInstanceOf(Error);
                    expect(error.message).toEqual('some error');
                };

                const browserCrawler = new BrowserCrawlerTest({
                    browserPoolOptions: {
                        browserPlugins: [puppeteerPlugin],
                    },
                    requestList,
                    maxRequestRetries: 0,
                    maxConcurrency: 1,

                    requestHandler,
                    failedRequestHandler,
                });
                // @ts-expect-error Overriding protected method
                browserCrawler._navigationHandler = gotoFunction;

                await browserCrawler.run();
            } finally {
                log.setLevel(actualLogLevel);
            }
        });
    });

    // These tests cannot run concurrently because they use crawler.run([urls])
    // which creates internal request queues that can conflict
    test("enqueueLinks() should skip links that don't match the strategy post redirect", async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const succeeded: string[] = [];

        const crawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            maxConcurrency: 1,
            maxRequestRetries: 0,
            requestHandler: async ({ page, enqueueLinks }) => {
                succeeded.push(await page.title());
                await enqueueLinks({ strategy: EnqueueStrategy.SameOrigin });
            },
        });

        await crawler.run([`${serverAddress}/special/redirect`]);

        expect(succeeded).toHaveLength(1);
        expect(succeeded[0]).toEqual('Redirecting outside');
    });

    test('enqueueLinks should respect maxCrawlDepth', async () => {
        const puppeteerPlugin = new PuppeteerPlugin(puppeteer);

        const succeeded: string[] = [];

        const crawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            maxCrawlDepth: 1,
            maxRequestsPerCrawl: 10, // avoiding accidental runaway
            requestHandler: async ({ page, enqueueLinks }) => {
                succeeded.push(await page.title());
                await enqueueLinks({ strategy: EnqueueStrategy.All });
            },
        });

        await crawler.run([`${serverAddress}/special/html-type`]);

        expect(succeeded).toHaveLength(2);
        expect(succeeded).toEqual(['Example Domain', 'Example Domains']);
    });
});
