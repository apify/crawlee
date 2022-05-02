import { URL } from 'url';
import { ENV_VARS } from '@apify/consts';
import sinon from 'sinon';
import { BrowserPool, PuppeteerPlugin } from 'browser-pool';
import puppeteer from 'puppeteer';
import log from '../../build/utils_log';
import Apify from '../../build';
import { STATUS_CODES_BLOCKED } from '../../build/constants';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';
import * as utilsRequest from '../../build/utils_request';
import Request from '../../build/request';
import AutoscaledPool from '../../build/autoscaling/autoscaled_pool';
import { Session } from '../../build/session_pool/session';
import EVENTS from '../../build/session_pool/events';

describe('BrowserCrawler', () => {
    let prevEnvHeadless;
    let logLevel;
    let localStorageEmulator;
    let puppeteerPlugin;

    beforeAll(async () => {
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        localStorageEmulator = new LocalStorageDirEmulator();
    });
    beforeEach(async () => {
        const storageDir = await localStorageEmulator.init();
        Apify.Configuration.getGlobalConfig().set('localStorageDir', storageDir);
        puppeteerPlugin = new PuppeteerPlugin(puppeteer);
    });
    afterEach(() => {
        puppeteerPlugin = null;
    });
    afterAll(async () => {
        log.setLevel(logLevel);
        process.env[ENV_VARS.HEADLESS] = prevEnvHeadless;
        await localStorageEmulator.destroy();
    });

    test('should work', async () => {
        const sources = [
            { url: 'http://example.com/?q=1' },
            { url: 'http://example.com/?q=2' },
            { url: 'http://example.com/?q=3' },
            { url: 'http://example.com/?q=4' },
            { url: 'http://example.com/?q=5' },
            { url: 'http://example.com/?q=6' },
        ];
        const sourcesCopy = JSON.parse(JSON.stringify(sources));
        const processed = [];
        const failed = [];
        const requestList = new Apify.RequestList({ sources });
        const handlePageFunction = async ({ page, request, response }) => {
            await page.waitForSelector('title');

            expect(await response.status()).toBe(200);
            request.userData.title = await page.title();
            processed.push(request);
        };

        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            gotoFunction: ({ page, request }) => page.goto(request.url),
            minConcurrency: 1,
            maxConcurrency: 1,
            handlePageFunction,
            handleFailedRequestFunction: ({ request }) => failed.push(request),
        });

        await requestList.initialize();
        await browserCrawler.run();

        expect(browserCrawler.autoscaledPool.minConcurrency).toBe(1);
        expect(processed).toHaveLength(6);
        expect(failed).toHaveLength(0);

        processed.forEach((request, id) => {
            expect(request.url).toEqual(sourcesCopy[id].url);
            expect(request.userData.title).toBe('Example Domain');
        });
    });
    test('should teardown browser pool', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            handlePageFunction: async () => {
                return Promise.resolve();
            },
            maxRequestRetries: 1,
            gotoFunction: async () => {
            },
        });
        jest.spyOn(browserCrawler.browserPool, 'destroy');

        await requestList.initialize();
        await browserCrawler.run();
        expect(browserCrawler.browserPool.destroy).toBeCalled();
    });

    test('should retire session after TimeouError', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        class TimeoutError extends Error {

        }
        let sessionGoto;
        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            handlePageFunction: async () => {
                return Promise.resolve();
            },
            maxRequestRetries: 1,
            gotoFunction: async ({ session }) => {
                jest.spyOn(session, 'markBad');
                sessionGoto = session;
                throw new TimeoutError();
            },
        });

        await requestList.initialize();
        await browserCrawler.run();
        expect(sessionGoto.markBad).toBeCalled();
    });

    test('should evaluate preNavigationHooks', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        let isEvaluated = false;

        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            handlePageFunction: async () => {
                return Promise.resolve();
            },
            maxRequestRetries: 0,
            gotoFunction: async ({ hookFinished }) => {
                isEvaluated = hookFinished;
            },
            preNavigationHooks: [
                async (crawlingContext) => {
                    await Apify.utils.sleep(10);
                    crawlingContext.hookFinished = true;
                },
            ],
        });

        await requestList.initialize();
        await browserCrawler.run();

        expect(isEvaluated).toBeTruthy();
    });

    test('should evaluate postNavigationHooks', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        let isEvaluated = false;

        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            handlePageFunction: async ({ hookFinished }) => {
                isEvaluated = hookFinished;
            },
            maxRequestRetries: 0,
            gotoFunction: ({ page, request }) => page.goto(request.url),
            postNavigationHooks: [
                async (crawlingContext) => {
                    await Apify.utils.sleep(10);
                    crawlingContext.hookFinished = true;
                },
            ],
        });

        await requestList.initialize();
        await browserCrawler.run();

        expect(isEvaluated).toBeTruthy();
    });

    test('should allow modifying gotoOptions by pre navigation hooks', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        let optionsGoto;
        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            handlePageFunction: async () => {},
            maxRequestRetries: 0,
            gotoFunction: ({ page, request }, gotoOptions) => {
                optionsGoto = gotoOptions;
                return page.goto(request.url, gotoOptions);
            },
            preNavigationHooks: [
                async (crawlingContext, gotoOptions) => {
                    gotoOptions.timeout = 60000;
                },
            ],
        });

        await requestList.initialize();
        await browserCrawler.run();

        expect(optionsGoto.timeout).toEqual(60000);
    });

    test('should ignore errors in Page.close()', async () => {
        for (let i = 0; i < 2; i++) {
            const requestList = new Apify.RequestList({
                sources: [
                    { url: 'http://example.com/?q=1' },
                ],
            });
            let failedCalled = false;

            const browserCrawler = new Apify.BrowserCrawler({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                },
                requestList,
                gotoFunction: ({ page, request }) => page.goto(request.url),
                handlePageFunction: ({ page }) => {
                    page.close = async () => {
                        if (i === 0) {
                            throw new Error();
                        } else {
                            return Promise.reject(new Error());
                        }
                    };
                    return Promise.resolve();
                },
                handleFailedRequestFunction: async () => {
                    failedCalled = true;
                },
            });
            await requestList.initialize();
            await browserCrawler.run();
            expect(failedCalled).toBe(false);
        }
    });

    test('should use SessionPool', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        const handlePageSessions = [];
        const goToPageSessions = [];
        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            handlePageFunction: async ({ session }) => {
                handlePageSessions.push(session);
                return Promise.resolve();
            },

        });

        browserCrawler.gotoFunction = async ({ session, page, request }) => {
            goToPageSessions.push(session);
            return page.goto(request.url);
        };

        await requestList.initialize();
        await browserCrawler.run();

        expect(browserCrawler.sessionPool.constructor.name).toEqual('SessionPool');
        expect(handlePageSessions).toHaveLength(1);
        expect(goToPageSessions).toHaveLength(1);
        handlePageSessions.forEach((session) => expect(session.constructor.name).toEqual('Session'));
        goToPageSessions.forEach((session) => expect(session.constructor.name).toEqual('Session'));
    });

    test('should not throw without SessionPool', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: false,
            handlePageFunction: async () => {},

        });

        expect(browserCrawler).toBeDefined();
    });

    test('should correctly set session pool options', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });

        const crawler = new Apify.BrowserCrawler({
            requestList,
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            useSessionPool: true,
            persistCookiesPerSession: false,
            sessionPoolOptions: {
                sessionOptions: {
                    maxUsageCount: 1,
                },
                persistStateKeyValueStoreId: 'abc',
            },
            handlePageFunction: async () => {},
        });
        expect(crawler.sessionPoolOptions.sessionOptions.maxUsageCount).toBe(1);
        expect(crawler.sessionPoolOptions.persistStateKeyValueStoreId).toBe('abc');
    });

    test.skip('should persist cookies per session', async () => {
        const name = `list-${Math.random()}`;
        const requestList = new Apify.RequestList({
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
        const loadedCookies = [];
        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            persistCookiesPerSession: true,
            handlePageFunction: async ({ session, request }) => {
                loadedCookies.push(session.getCookieString(request.url));
                return Promise.resolve();
            },
        });

        browserCrawler.gotoFunction = async ({ session, page, request }) => {
            await page.setCookie({ name: 'TEST', value: '12321312312', domain: 'example.com', expires: Date.now() + 100000 });
            goToPageSessions.push(session);
            return page.goto(request.url);
        };

        await requestList.initialize();
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
        const baseUrl = 'https://example.com/';
        const sources = STATUS_CODES_BLOCKED.map((statusCode) => {
            return {
                url: baseUrl + statusCode,
                userData: { statusCode },
            };
        });
        const requestList = await Apify.openRequestList(null, sources);

        let called = false;
        const failedRequests = [];
        const crawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            persistCookiesPerSession: false,
            maxRequestRetries: 0,
            handlePageFunction: async () => {
                called = true;
            },
            handleFailedRequestFunction: async ({ request }) => {
                failedRequests.push(request);
            },
        });

        crawler.gotoFunction = async ({ request }) => {
            return { status: () => request.userData.statusCode };
        };

        await crawler.run();

        expect(failedRequests.length).toBe(STATUS_CODES_BLOCKED.length);
        failedRequests.forEach((fr) => {
            const [msg] = fr.errorMessages;
            expect(msg).toContain(`Request blocked - received ${fr.userData.statusCode} status code.`);
        });
        expect(called).toBe(false);
    });

    test('should throw on "blocked" status codes (retire session)', async () => {
        const baseUrl = 'https://example.com/';
        const sources = STATUS_CODES_BLOCKED.map((statusCode) => {
            return {
                url: baseUrl + statusCode,
                userData: { statusCode },
            };
        });
        const requestList = await Apify.openRequestList(null, sources);

        let called = false;
        const failedRequests = [];
        const crawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            persistCookiesPerSession: false,
            maxRequestRetries: 0,
            handlePageFunction: async () => {
                called = true;
            },
            gotoFunction: ({ page, request }) => page.goto(request.url),
            handleFailedRequestFunction: async ({ request }) => {
                failedRequests.push(request);
            },
        });

        crawler.gotoFunction = async ({ request }) => {
            return { status: () => request.userData.statusCode };
        };

        await crawler.run();

        expect(failedRequests.length).toBe(STATUS_CODES_BLOCKED.length);
        failedRequests.forEach((fr) => {
            const [msg] = fr.errorMessages;
            expect(msg).toContain(`Request blocked - received ${fr.userData.statusCode} status code.`);
        });
        expect(called).toBe(false);
    });

    test('should retire browser with session', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        let resolve;

        const retirementPromise = new Promise((r) => {
            resolve = r;
        });
        let called = false;
        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            handlePageFunction: async () => {
                await retirementPromise;
            },
            maxRequestRetries: 1,
            gotoFunction: async ({ session, crawler, page, request }) => {
                crawler.browserPool.on('browserRetired', () => {
                    resolve();
                    called = true;
                });

                session.retire();
                return page.goto(request.url);
            },
        });

        await requestList.initialize();
        await browserCrawler.run();

        expect(called).toBeTruthy();
    });

    test('should remove browser listener on session pool', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
                { url: 'http://example.com/?q=2' },
            ],
        });
        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
                maxOpenPagesPerBrowser: 1,
            },
            requestList,
            useSessionPool: true,
            handlePageFunction: async () => {
                return Promise.resolve();
            },
            maxRequestRetries: 1,
            gotoFunction: async ({ session }) => {
                expect(session.sessionPool.listeners(EVENTS.SESSION_RETIRED)).toHaveLength(1);
                session.retire();
            },
        });
        // prevent browser to auto close the browsers
        const teardown = browserCrawler._teardown // eslint-disable-line
        browserCrawler._teardown = () => {// eslint-disable-line

        };

        await requestList.initialize();
        await browserCrawler.run();
        await Apify.utils.sleep(5000);
        expect(browserCrawler.sessionPool.listeners(EVENTS.SESSION_RETIRED)).toHaveLength(0);
        await browserCrawler.browserPool.destroy();
    });

    test('should allow using fingerprints from browser pool', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        const browserCrawler = new Apify.BrowserCrawler({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
                useFingerprints: true,
                fingerprintsOptions: {
                    fingerprintGeneratorOptions: {
                        operatingSystems: ['windows'],
                    },
                },
            },
            requestList,
            useSessionPool: false,
            gotoFunction: async ({ page, request }) => {
                return page.goto(request.url);
            },
            handlePageFunction: async ({ browserController }) => {
                expect(browserController.launchContext.fingerprint).toBeDefined();
            },

        });
        await requestList.initialize();

        await browserCrawler.run();
        expect.hasAssertions();
    });

    describe('proxy', () => {
        let requestList;
        beforeEach(async () => {
            requestList = new Apify.RequestList({
                sources: [
                    { url: 'http://example.com/?q=1' },
                    { url: 'http://example.com/?q=2' },
                    { url: 'http://example.com/?q=3' },
                    { url: 'http://example.com/?q=4' },
                ],
            });
            await requestList.initialize();
        });

        afterEach(() => {
            requestList = null;
        });

        test('browser should launch with correct proxyUrl', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
            const status = { connected: true };
            const fakeCall = async () => {
                return { body: status };
            };

            const stub = sinon.stub(utilsRequest, 'requestAsBrowser').callsFake(fakeCall);
            const proxyConfiguration = await Apify.createProxyConfiguration();
            const generatedProxyUrl = new URL(await proxyConfiguration.newUrl()).href;
            let browserProxy;

            const browserCrawler = new Apify.BrowserCrawler({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                    postLaunchHooks: [(pageId, browserController) => {
                        browserProxy = browserController.launchContext.proxyUrl;
                    }],
                },
                useSessionPool: false,
                persistCookiesPerSession: false,
                requestList,
                maxRequestsPerCrawl: 1,
                maxRequestRetries: 0,
                gotoFunction: ({ page, request }) => page.goto(request.url, { timeout: 1000 }),
                handlePageFunction: async () => {
                },
                proxyConfiguration,
            });
            await browserCrawler.run();
            delete process.env[ENV_VARS.PROXY_PASSWORD];

            expect(browserProxy).toEqual(generatedProxyUrl);

            stub.restore();
        });

        test('handlePageFunction should expose the proxyInfo object with sessions correctly', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
            const status = { connected: true };
            const fakeCall = async () => {
                return { body: status };
            };

            const stub = sinon.stub(utilsRequest, 'requestAsBrowser').callsFake(fakeCall);

            const proxyConfiguration = await Apify.createProxyConfiguration();
            const proxies = [];
            const sessions = [];
            const handlePageFunction = async ({ session, proxyInfo }) => {
                proxies.push(proxyInfo);
                sessions.push(session);
            };

            const browserCrawler = new Apify.BrowserCrawler({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                },
                requestList,
                handlePageFunction,
                gotoFunction: ({ page, request }) => page.goto(request.url),
                proxyConfiguration,
                useSessionPool: true,
                sessionPoolOptions: {
                    maxPoolSize: 1,
                },
            });

            await browserCrawler.run();

            expect(proxies[0].sessionId).toEqual(sessions[0].id);
            expect(proxies[1].sessionId).toEqual(sessions[1].id);
            expect(proxies[2].sessionId).toEqual(sessions[2].id);
            expect(proxies[3].sessionId).toEqual(sessions[3].id);

            delete process.env[ENV_VARS.PROXY_PASSWORD];
            stub.restore();
        });

        test('browser should launch with rotated custom proxy', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';

            const proxyConfiguration = await Apify.createProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            const browserProxies = [];

            const browserCrawler = new Apify.BrowserCrawler({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                    maxOpenPagesPerBrowser: 1,
                    retireBrowserAfterPageCount: 1,
                },
                requestList,
                handlePageFunction: async () => {
                },
                proxyConfiguration,
                maxRequestRetries: 0,
                maxConcurrency: 1,
            });

            browserCrawler.gotoFunction = async () => {
            };

            browserCrawler.browserPool.postLaunchHooks.push((pageId, browserController) => {
                browserProxies.push(browserController.launchContext.proxyUrl);
            });

            await browserCrawler.run();

            const proxiesToUse = proxyConfiguration.proxyUrls;
            for (const proxyUrl of proxiesToUse) {
                expect(browserProxies.includes(new URL(proxyUrl).href)).toBeTruthy();
            }

            delete process.env[ENV_VARS.PROXY_PASSWORD];
        });
    });
    describe('Crawling context', () => {
        const sources = ['http://example.com/'];
        let requestList;
        let actualLogLevel;
        beforeEach(async () => {
            actualLogLevel = log.getLevel();
            log.setLevel(log.LEVELS.OFF);
            requestList = await Apify.openRequestList(null, sources.slice());
        });

        afterAll(() => {
            log.setLevel(actualLogLevel);
        });

        test('uses correct crawling context', async () => {
            let prepareCrawlingContext;

            const gotoFunction = async (crawlingContext) => {
                prepareCrawlingContext = crawlingContext;
                expect(crawlingContext.request).toBeInstanceOf(Request);
                expect(crawlingContext.crawler.autoscaledPool).toBeInstanceOf(AutoscaledPool);
                expect(crawlingContext.session).toBeInstanceOf(Session);
                expect(typeof crawlingContext.page).toBe('object');
            };

            const handlePageFunction = async (crawlingContext) => {
                expect(crawlingContext === prepareCrawlingContext).toEqual(true);
                expect(crawlingContext.request).toBeInstanceOf(Request);
                expect(crawlingContext.crawler.autoscaledPool).toBeInstanceOf(AutoscaledPool);
                expect(crawlingContext.session).toBeInstanceOf(Session);
                expect(typeof crawlingContext.page).toBe('object');
                expect(crawlingContext.crawler).toBeInstanceOf(Apify.BrowserCrawler);
                expect(crawlingContext.hasOwnProperty('response')).toBe(true);

                throw new Error('some error');
            };

            const handleFailedRequestFunction = async (crawlingContext) => {
                expect(crawlingContext === prepareCrawlingContext).toEqual(true);
                expect(crawlingContext.request).toBeInstanceOf(Request);
                expect(crawlingContext.crawler.autoscaledPool).toBeInstanceOf(AutoscaledPool);
                expect(crawlingContext.session).toBeInstanceOf(Session);
                expect(typeof crawlingContext.page).toBe('object');
                expect(crawlingContext.crawler).toBeInstanceOf(Apify.BrowserCrawler);
                expect(crawlingContext.crawler.browserPool).toBeInstanceOf(BrowserPool);
                expect(crawlingContext.hasOwnProperty('response')).toBe(true);

                expect(crawlingContext.error).toBeInstanceOf(Error);
                expect(crawlingContext.error.message).toEqual('some error');
            };

            const browserCrawler = new Apify.BrowserCrawler({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                },
                requestList,
                maxRequestRetries: 0,
                maxConcurrency: 1,
                useSessionPool: true,
                handlePageFunction,
                handleFailedRequestFunction,
            });
            browserCrawler.gotoFunction = gotoFunction;

            await browserCrawler.run();
        });

        test('handleFailedRequestFunction contains proxyInfo', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
            const stub = sinon.stub(utilsRequest, 'requestAsBrowser').resolves({ body: { connected: true } });

            const proxyConfiguration = await Apify.createProxyConfiguration();

            const browserCrawler = new Apify.BrowserCrawler({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                },
                requestList,
                maxRequestRetries: 0,
                maxConcurrency: 1,
                useSessionPool: true,
                proxyConfiguration,
                handlePageFunction: async () => {
                    throw new Error('some error');
                },
                handleFailedRequestFunction: async (crawlingContext) => {
                    expect(typeof crawlingContext.proxyInfo).toEqual('object');
                    expect(crawlingContext.proxyInfo.hasOwnProperty('url')).toEqual(true);
                },
            });

            await browserCrawler.run();

            delete process.env[ENV_VARS.PROXY_PASSWORD];
            stub.restore();
        });
    });
});
