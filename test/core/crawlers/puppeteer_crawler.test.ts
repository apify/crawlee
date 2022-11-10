import log from '@apify/log';
import type {
    PuppeteerCrawlingContext,
    PuppeteerGoToOptions,
    Request,
} from '@crawlee/puppeteer';
import {
    ProxyConfiguration,
    PuppeteerCrawler,
    RequestList,
    RequestQueue,
    Session,
} from '@crawlee/puppeteer';
import type { Cookie } from '@crawlee/types';
import { sleep } from '@crawlee/utils';
import { once } from 'events';
import type { Server } from 'http';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import type { Server as ProxyChainServer } from 'proxy-chain';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';
import { promisify } from 'util';
import { createProxyServer } from '../create-proxy-server';

describe('PuppeteerCrawler', () => {
    let prevEnvHeadless: string;
    let logLevel: number;
    const localStorageEmulator = new MemoryStorageEmulator();
    let requestList: RequestList;
    let servers: ProxyChainServer[];
    let target: Server;
    let serverUrl: string;
    let proxyConfiguration: ProxyConfiguration;

    beforeAll(async () => {
        prevEnvHeadless = process.env.CRAWLEE_HEADLESS;
        process.env.CRAWLEE_HEADLESS = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);

        target = createServer((request, response) => {
            response.write(`<html><head><title>Example Domain</title></head></html>`);
            response.end(request.socket.remoteAddress);
        });

        target.listen(0, '127.0.0.1');
        await once(target, 'listening');

        serverUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`;

        servers = [
            createProxyServer('127.0.0.2', '', ''),
            createProxyServer('127.0.0.3', '', ''),
            createProxyServer('127.0.0.4', '', ''),
        ];

        await Promise.all(servers.map((server) => server.listen()));

        proxyConfiguration = new ProxyConfiguration({
            proxyUrls: [
                `http://127.0.0.2:${servers[0].port}`,
                `http://127.0.0.3:${servers[1].port}`,
                `http://127.0.0.4:${servers[2].port}`,
            ],
        });
    });

    beforeEach(async () => {
        await localStorageEmulator.init();

        const sources = [serverUrl];
        requestList = await RequestList.open(`sources-${Math.random() * 10000}`, sources);
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    afterAll(async () => {
        log.setLevel(logLevel);
        process.env.CRAWLEE_HEADLESS = prevEnvHeadless;

        await Promise.all(servers.map((server) => promisify(server.close.bind(server))(true)));
        await promisify(target.close.bind(target))();
    });

    test('should work', async () => {
        const sourcesLarge = [
            { url: `${serverUrl}/?q=1` },
            { url: `${serverUrl}/?q=2` },
            { url: `${serverUrl}/?q=3` },
            { url: `${serverUrl}/?q=4` },
            { url: `${serverUrl}/?q=5` },
            { url: `${serverUrl}/?q=6` },
        ];
        const sourcesCopy = JSON.parse(JSON.stringify(sourcesLarge));
        const processed: Request[] = [];
        const failed: Request[] = [];
        const asserts: boolean[] = [];
        const requestListLarge = await RequestList.open({ sources: sourcesLarge });
        const requestHandler = async ({ page, request, response }: PuppeteerCrawlingContext) => {
            await page.waitForSelector('title');
            asserts.push(response.status() === 200);
            request.userData.title = await page.title();
            processed.push(request);
            asserts.push(!response.request().headers()['user-agent'].match(/headless/i));
            asserts.push(!(await page.evaluate(() => window.navigator.webdriver)));
        };

        const puppeteerCrawler = new PuppeteerCrawler({
            requestList: requestListLarge,
            browserPoolOptions: { useFingerprints: false },
            minConcurrency: 1,
            maxConcurrency: 1,
            requestHandler,
            failedRequestHandler: ({ request }) => {
                failed.push(request);
            },
        });

        await puppeteerCrawler.run();

        expect(puppeteerCrawler.autoscaledPool.minConcurrency).toBe(1);
        expect(processed).toHaveLength(6);
        expect(failed).toHaveLength(0);

        for (const assert of asserts) {
            expect(assert).toBeTruthy();
        }

        processed.forEach((request, id) => {
            expect(request.url).toEqual(sourcesCopy[id].url);
            expect(request.userData.title).toBe('Example Domain');
        });
    });

    test('should override goto timeout with navigationTimeoutSecs', async () => {
        const timeoutSecs = 10;
        let options: PuppeteerGoToOptions;
        const puppeteerCrawler = new PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: () => {},
            preNavigationHooks: [(_context, gotoOptions) => {
                options = gotoOptions;
            }],
            navigationTimeoutSecs: timeoutSecs,
        });

        await puppeteerCrawler.run();
        expect(options.timeout).toEqual(timeoutSecs * 1000);
    });

    test('should throw if launchOptions.proxyUrl is supplied', async () => {
        try {
            new PuppeteerCrawler({ //eslint-disable-line
                requestList,
                maxRequestRetries: 0,
                maxConcurrency: 1,
                launchContext: {
                    proxyUrl: 'http://localhost@1234',
                },
                requestHandler: () => {},
            });
        } catch (e) {
            expect((e as Error).message).toMatch('PuppeteerCrawlerOptions.launchContext.proxyUrl is not allowed in PuppeteerCrawler.');
        }

        expect.hasAssertions();
    });

    test('supports useChrome option', async () => {
        // const spy = sinon.spy(utils, 'getTypicalChromeExecutablePath');
        const puppeteerCrawler = new PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            launchContext: {
                useChrome: true,
                launchOptions: {
                    headless: true,
                },
            },
            requestHandler: () => {},
        });
        await puppeteerCrawler.run();

        // expect(spy.calledOnce).toBe(true);
        // spy.restore();
    });

    test('supports userAgent option', async () => {
        const opts = {
            // Have space in user-agent to test passing of params
            userAgent: 'MyUserAgent/1234 AnotherString/456',
            launchOptions: {
                headless: true,
            },
        };
        let loadedUserAgent;

        const puppeteerCrawler = new PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            launchContext: opts,
            requestHandler: async ({ page }) => {
                loadedUserAgent = await page.evaluate(() => window.navigator.userAgent);
            },
        });

        await puppeteerCrawler.run();

        expect(loadedUserAgent).toEqual(opts.userAgent);
    });

    test('timeout via preNavigationHooks will abort the page function as early as possible (gh #1216)', async () => {
        const requestQueue = await RequestQueue.open();
        await requestQueue.addRequest({ url: serverUrl });
        const requestHandler = jest.fn();

        const crawler = new PuppeteerCrawler({
            requestQueue,
            requestHandlerTimeoutSecs: 0.005,
            navigationTimeoutSecs: 0.005,
            preNavigationHooks: [
                async () => {
                    await sleep(20);
                },
            ],
            requestHandler,
        });

        // @ts-expect-error Overriding protected method
        const logWarningSpy = jest.spyOn(crawler.log, 'warning');
        logWarningSpy.mockImplementation(() => {});

        // @ts-expect-error Overriding protected method
        const logErrorSpy = jest.spyOn(crawler.log, 'error');
        logErrorSpy.mockImplementation(() => {});

        await crawler.run();
        await crawler.teardown();
        await requestQueue.drop();

        expect(requestHandler).not.toBeCalled();
        const warnings = logWarningSpy.mock.calls.map((call) => [call[0], call[1].retryCount]);
        expect(warnings).toEqual([
            [
                'Reclaiming failed request back to the list or queue. Navigation timed out after 0.005 seconds.',
                1,
            ],
            [
                'Reclaiming failed request back to the list or queue. Navigation timed out after 0.005 seconds.',
                2,
            ],
            [
                'Reclaiming failed request back to the list or queue. Navigation timed out after 0.005 seconds.',
                3,
            ],
        ]);
        logWarningSpy.mockRestore();

        const errors = logErrorSpy.mock.calls.map((call) => [call[0], call[1].retryCount]);
        expect(errors).toEqual([
            [
                'Request failed and reached maximum retries. Navigation timed out after 0.005 seconds.',
                undefined,
            ],
        ]);
        logErrorSpy.mockRestore();
    });

    test('timeout in preLaunchHooks will abort the page function as early as possible (gh #1216)', async () => {
        const requestQueue = await RequestQueue.open();
        await requestQueue.addRequest({ url: serverUrl });
        const requestHandler = jest.fn();

        const crawler = new PuppeteerCrawler({
            requestQueue,
            navigationTimeoutSecs: 0.005,
            browserPoolOptions: {
                preLaunchHooks: [
                    async () => {
                        // Do some async work that's longer than navigationTimeoutSecs
                        await sleep(20);
                    },
                ],
            },
            requestHandler,
        });

        // @ts-expect-error Overriding protected method
        const logWarningSpy = jest.spyOn(crawler.log, 'warning');
        logWarningSpy.mockImplementation(() => {});

        // @ts-expect-error Overriding protected method
        const logErrorSpy = jest.spyOn(crawler.log, 'error');
        logErrorSpy.mockImplementation(() => {});

        await crawler.run();
        await crawler.teardown();
        await requestQueue.drop();

        expect(requestHandler).not.toBeCalled();
        const warnings = logWarningSpy.mock.calls.map((call) => [call[0], call[1].retryCount]);
        expect(warnings).toEqual([
            [
                'Reclaiming failed request back to the list or queue. Navigation timed out after 0.005 seconds.',
                1,
            ],
            [
                'Reclaiming failed request back to the list or queue. Navigation timed out after 0.005 seconds.',
                2,
            ],
            [
                'Reclaiming failed request back to the list or queue. Navigation timed out after 0.005 seconds.',
                3,
            ],
        ]);
        logWarningSpy.mockRestore();

        const errors = logErrorSpy.mock.calls.map((call) => [call[0], call[1].retryCount]);
        expect(errors).toEqual([
            [
                'Request failed and reached maximum retries. Navigation timed out after 0.005 seconds.',
                undefined,
            ],
        ]);
        logErrorSpy.mockRestore();
    });

    test('should set cookies assigned to session to page', async () => {
        const cookies: Cookie[] = [
            {
                name: 'example_cookie_name',
                domain: '127.0.0.1',
                value: 'example_cookie_value',
                expires: -1,
            } as never,
        ];

        let pageCookies;
        let sessionCookies;

        const puppeteerCrawler = new PuppeteerCrawler({
            requestList,
            useSessionPool: true,
            persistCookiesPerSession: true,
            sessionPoolOptions: {
                createSessionFunction: (sessionPool) => {
                    const session = new Session({ sessionPool });
                    session.setCookies(cookies, serverUrl);
                    return session;
                },
            },
            requestHandler: async ({ page, session }) => {
                pageCookies = await page.cookies().then((cks) => cks.map((c) => `${c.name}=${c.value}`).join('; '));
                sessionCookies = session.getCookieString(serverUrl);
            },
        });

        await puppeteerCrawler.run();

        expect(pageCookies).toEqual(sessionCookies);
    });

    test('proxy rotation', async () => {
        const proxies = new Set();
        const sessions = new Set();
        const puppeteerCrawler = new PuppeteerCrawler({
            requestList: await RequestList.open(null, [
                { url: `${serverUrl}/?q=1` },
                { url: `${serverUrl}/?q=2` },
                { url: `${serverUrl}/?q=3` },
            ]),
            launchContext: {
                launchOptions: {
                    headless: true,
                },
            },
            maxConcurrency: 1,
            sessionPoolOptions: {
                sessionOptions: {
                    maxUsageCount: 1,
                },
            },
            proxyConfiguration,
            requestHandler: async ({ proxyInfo, session }) => {
                proxies.add(proxyInfo.url);
                sessions.add(session.id);
            },
        });

        await puppeteerCrawler.run();
        expect(proxies.size).toBe(3); // 3 different proxies used
        expect(sessions.size).toBe(3); // 3 different sessions used
    });

    test('shallow clones browserPoolOptions before normalization', () => {
        const options = {
            browserPoolOptions: {},
            requestHandler: async () => {},
        };

        void new PuppeteerCrawler(options);
        void new PuppeteerCrawler(options);

        expect(Object.keys(options.browserPoolOptions).length).toBe(0);
    });

    if (os.platform() !== 'darwin') {
        test('proxy per page', async () => {
            const requestListLarge = await RequestList.open({
                sources: [
                    { url: `${serverUrl}/?q=1` },
                    { url: `${serverUrl}/?q=2` },
                    { url: `${serverUrl}/?q=3` },
                    { url: `${serverUrl}/?q=4` },
                    { url: `${serverUrl}/?q=5` },
                    { url: `${serverUrl}/?q=6` },
                ],
            });

            const count = {
                2: 0,
                3: 0,
                4: 0,
            };

            const puppeteerCrawler = new PuppeteerCrawler({
                requestList: requestListLarge,
                useSessionPool: true,
                launchContext: {
                    useIncognitoPages: true,
                },
                browserPoolOptions: {
                    prePageCreateHooks: [
                        (_id, _controller, options) => {
                            options.proxyBypassList = ['<-loopback>'];
                        },
                    ],
                },
                proxyConfiguration,
                requestHandler: async ({ page }) => {
                    const content = await page.content();

                    if (content.includes('127.0.0.2')) {
                        count[2]++;
                    } else if (content.includes('127.0.0.3')) {
                        count[3]++;
                    } else if (content.includes('127.0.0.4')) {
                        count[4]++;
                    }
                },
            });

            await puppeteerCrawler.run();

            expect(count[2]).toBeGreaterThan(0);
            expect(count[3]).toBeGreaterThan(0);
            expect(count[4]).toBeGreaterThan(0);
            expect(count[2] + count[3] + count[4]).toBe(6);
        });
    }
});
