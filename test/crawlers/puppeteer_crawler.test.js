import { ENV_VARS } from 'apify-shared/consts';
import sinon from 'sinon';
import log from '../../build/utils_log';
import * as Apify from '../../build';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';
import * as utilsRequest from '../../build/utils_request';

describe('PuppeteerCrawler', () => {
    let prevEnvHeadless;
    let logLevel;
    let localStorageEmulator;

    beforeAll(async () => {
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        localStorageEmulator = new LocalStorageDirEmulator();
    });
    beforeEach(async () => {
        await localStorageEmulator.init();
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
            await page.waitFor('title');

            expect(await response.status()).toBe(200);
            request.userData.title = await page.title();
            processed.push(request);
        };

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            minConcurrency: 1,
            maxConcurrency: 1,
            handlePageFunction,
            handleFailedRequestFunction: ({ request }) => failed.push(request),
        });

        await requestList.initialize();
        await puppeteerCrawler.run();

        expect(puppeteerCrawler.autoscaledPool.minConcurrency).toBe(1);
        expect(processed).toHaveLength(6);
        expect(failed).toHaveLength(0);

        processed.forEach((request, id) => {
            expect(request.url).toEqual(sourcesCopy[id].url);
            expect(request.userData.title).toBe('Example Domain');
        });
    });

    test('should ignore errors in Page.close()', async () => {
        for (let i = 0; i < 2; i++) {
            const requestList = new Apify.RequestList({
                sources: [
                    { url: 'http://example.com/?q=1' },
                ],
            });
            let failedCalled = false;

            const puppeteerCrawler = new Apify.PuppeteerCrawler({
                requestList,
                handlePageFunction: ({ page }) => {
                    page.close = () => {
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
            await puppeteerCrawler.run();

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
        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            useSessionPool: true,
            handlePageFunction: async ({ session }) => {
                handlePageSessions.push(session);
                return Promise.resolve();
            },
            gotoFunction: async ({ session }) => {
                goToPageSessions.push(session);
                return Apify.launchPuppeteer();
            },
        });

        await requestList.initialize();
        await puppeteerCrawler.run();

        expect(puppeteerCrawler.sessionPool.constructor.name).toEqual('SessionPool');
        expect(handlePageSessions).toHaveLength(1);
        expect(goToPageSessions).toHaveLength(1);
        handlePageSessions.forEach(session => expect(session.constructor.name).toEqual('Session'));
        goToPageSessions.forEach(session => expect(session.constructor.name).toEqual('Session'));
    });

    test('should persist cookies per session', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'http://example.com/?q=1' },
                { url: 'http://example.com/?q=2' },
                { url: 'http://example.com/?q=3' },
                { url: 'http://example.com/?q=4' },
            ],
        });
        const goToPageSessions = [];
        const loadedCookies = [];
        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            useSessionPool: true,
            persistCookiesPerSession: true,
            handlePageFunction: async ({ session, request }) => {
                loadedCookies.push(session.getCookieString(request.url));
                return Promise.resolve();
            },
            gotoFunction: async ({ session, page, request }) => {
                await page.setCookie({ name: 'TEST', value: '12321312312', domain: 'example.com', expires: Date.now() + 100000 });
                goToPageSessions.push(session);
                return page.goto(request.url);
            },
        });

        await requestList.initialize();
        await puppeteerCrawler.run();
        expect(loadedCookies).toHaveLength(4);
        loadedCookies.forEach(cookie => expect(cookie).toEqual('TEST=12321312312'));
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
            const generatedProxyUrl = proxyConfiguration.newUrl();
            let browserProxy;
            const launchPuppeteerFunction = async (opts) => {
                browserProxy = opts.proxyUrl;
                const browser = await Apify.launchPuppeteer(opts);

                return browser;
            };

            const puppeteerCrawler = new Apify.PuppeteerCrawler({
                requestList,
                handlePageFunction: async () => {},
                launchPuppeteerFunction,
                proxyConfiguration,
            });

            await puppeteerCrawler.run();
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

            const puppeteerCrawler = new Apify.PuppeteerCrawler({
                requestList,
                handlePageFunction,
                proxyConfiguration,
                useSessionPool: true,
                sessionPoolOptions: {
                    maxPoolSize: 1,
                },
            });

            await puppeteerCrawler.run();

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
            const launchPuppeteerFunction = async (opts) => {
                browserProxies.push(opts.proxyUrl);
                const browser = await Apify.launchPuppeteer(opts);

                return browser;
            };

            const puppeteerCrawler = new Apify.PuppeteerCrawler({
                requestList,
                handlePageFunction: async () => {},
                gotoFunction: async () => {},
                launchPuppeteerFunction,
                puppeteerPoolOptions: {
                    retireInstanceAfterRequestCount: 1,
                },
                proxyConfiguration,
            });

            await puppeteerCrawler.run();

            const proxiesToUse = proxyConfiguration.proxyUrls;
            expect(browserProxies[0]).toEqual(proxiesToUse[0]);
            expect(browserProxies[1]).toEqual(proxiesToUse[1]);
            expect(browserProxies[2]).toEqual(proxiesToUse[2]);
            expect(browserProxies[3]).toEqual(proxiesToUse[0]);

            delete process.env[ENV_VARS.PROXY_PASSWORD];
        });

        test('should throw on proxyConfiguration together with proxyUrl from launchPuppeteerOptions', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';

            const proxyConfiguration = await Apify.createProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            try {
                // eslint-disable-next-line no-unused-vars
                const puppeteerCrawler = new Apify.PuppeteerCrawler({
                    requestList,
                    handlePageFunction: async () => {},
                    gotoFunction: async () => {},
                    proxyConfiguration,
                    launchPuppeteerOptions: {
                        proxyUrl: 'http://proxy.com:1111',
                    },
                });
                throw new Error('wrong error');
            } catch (err) {
                expect(err.message).toMatch('It is not possible to combine "options.proxyConfiguration"');
            }

            delete process.env[ENV_VARS.PROXY_PASSWORD];
        });
    });
});
