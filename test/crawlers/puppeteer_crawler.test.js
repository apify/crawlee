import log from 'apify-shared/log';
import { ENV_VARS } from 'apify-shared/consts';
import * as Apify from '../../build';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';

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
        await localStorageEmulator.init();
    });
    afterEach(async () => {
        await localStorageEmulator.clean();
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
            expect(request.url).toEqual(sources[id].url);
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
});
