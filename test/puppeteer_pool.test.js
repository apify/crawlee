import fs from 'fs';
import _ from 'underscore';
import { ENV_VARS } from 'apify-shared/consts';
import sinon from 'sinon';
import log from '../build/utils_log';
import * as Apify from '../build/index';
import { launchPuppeteer } from '../build/puppeteer';
import { SessionPool } from '../build/session_pool/session_pool';
import { sleep } from '../build/utils';
import LocalStorageDirEmulator from './local_storage_dir_emulator';
import * as utilsRequest from '../build/utils_request';


const shortSleep = (millis = 25) => new Promise(resolve => setTimeout(resolve, millis));

describe('PuppeteerPool', () => {
    let prevEnvHeadless;
    let logLevel;

    beforeAll(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';
    });

    afterAll(() => {
        log.setLevel(logLevel);
        process.env[ENV_VARS.HEADLESS] = prevEnvHeadless;
    });

    test('should work', async () => {
        process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
        process.env[ENV_VARS.PROXY_HOSTNAME] = 'my.host.com';
        process.env[ENV_VARS.PROXY_PORT] = 123;

        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 3,
            retireInstanceAfterRequestCount: 5,
        });
        const browsers = [];

        // Open 6 pages 3 in both browsers.
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        await Promise.all(browsers);

        expect(_.values(pool.activeInstances).length).toBe(2);
        expect(pool.activeInstances[0].activePages).toBe(3);
        expect(pool.activeInstances[0].totalPages).toBe(3);
        expect(pool.activeInstances[1].activePages).toBe(3);
        expect(pool.activeInstances[1].totalPages).toBe(3);

        // Close 2 pages in a first browser.
        await (await browsers[0]).close();
        await (await browsers[1]).close();
        await shortSleep();

        expect(_.values(pool.activeInstances).length).toBe(2);
        expect(pool.activeInstances[0].activePages).toBe(1);
        expect(pool.activeInstances[0].totalPages).toBe(3);
        expect(pool.activeInstances[1].activePages).toBe(3);
        expect(pool.activeInstances[1].totalPages).toBe(3);

        // Open two more pages in first browser so it reaches 5 and gets retired.
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        await Promise.all(browsers);
        expect(_.values(pool.activeInstances).length).toBe(1);
        expect(_.values(pool.retiredInstances).length).toBe(1);
        expect(pool.activeInstances[1].activePages).toBe(3);
        expect(pool.activeInstances[1].totalPages).toBe(3);
        expect(pool.retiredInstances[0].activePages).toBe(3);
        expect(pool.retiredInstances[0].totalPages).toBe(5);

        // Open one more page to see that 3rd browser gets started.
        browsers.push(pool.newPage());
        await Promise.all(browsers);

        expect(_.values(pool.activeInstances).length).toBe(2);
        expect(_.values(pool.retiredInstances).length).toBe(1);
        expect(pool.activeInstances[1].activePages).toBe(3);
        expect(pool.activeInstances[1].totalPages).toBe(3);
        expect(pool.activeInstances[2].activePages).toBe(1);
        expect(pool.activeInstances[2].totalPages).toBe(1);
        expect(pool.retiredInstances[0].activePages).toBe(3);
        expect(pool.retiredInstances[0].totalPages).toBe(5);

        // Kill the remaining 3 pages from the 1st browser to see that it gets closed.
        await (await browsers[2]).close();
        await (await browsers[6]).close();

        await (await browsers[7]).close();
        await shortSleep(2000);
        expect(_.values(pool.retiredInstances).length).toBe(0);

        // Cleanup everything.
        await pool.destroy();
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        delete process.env[ENV_VARS.PROXY_HOSTNAME];
        delete process.env[ENV_VARS.PROXY_PORT];
    });

    test('kills hanging retired instances', async () => {
        process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
        process.env[ENV_VARS.PROXY_HOSTNAME] = 'my.host.com';
        process.env[ENV_VARS.PROXY_PORT] = 123;

        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 3,
            retireInstanceAfterRequestCount: 5,
            instanceKillerIntervalMillis: 1000,
            killInstanceAfterMillis: 500,
        });
        const browsers = [];

        // Open 3 pages.
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        await Promise.all(browsers);
        expect(_.values(pool.activeInstances).length).toBe(1);
        expect(_.values(pool.retiredInstances).length).toBe(0);

        // Close 2.
        await (await browsers[0]).close();
        await (await browsers[1]).close();
        await shortSleep();
        expect(_.values(pool.activeInstances).length).toBe(1);
        expect(_.values(pool.retiredInstances).length).toBe(0);

        // Open 2 more so that the browser gets retired.
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        await Promise.all(browsers);

        // Check that it's retired.
        expect(_.values(pool.activeInstances).length).toBe(0);
        expect(_.values(pool.retiredInstances).length).toBe(1);
        expect(pool.retiredInstances[0].activePages).toBe(3);
        expect(pool.retiredInstances[0].totalPages).toBe(5);

        // Sleep and check that it has been killed.
        await shortSleep(2100);
        expect(_.values(pool.activeInstances).length).toBe(0);
        expect(_.values(pool.retiredInstances).length).toBe(0);

        // Cleanup everything.
        await pool.destroy();
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        delete process.env[ENV_VARS.PROXY_HOSTNAME];
        delete process.env[ENV_VARS.PROXY_PORT];
    });

    test('retire manually', async () => {
        process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
        process.env[ENV_VARS.PROXY_HOSTNAME] = 'my.host.com';
        process.env[ENV_VARS.PROXY_PORT] = 123;

        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 1,
            abortInstanceAfterRequestCount: 5,
            instanceKillerIntervalMillis: 1000,
            killInstanceAfterMillis: 500,
        });
        const pages = [];

        // Open 3 pages.
        pages.push(pool.newPage());
        pages.push(pool.newPage());
        pages.push(pool.newPage());
        await Promise.all(pages);
        expect(_.values(pool.activeInstances).length).toBe(3);
        expect(_.values(pool.retiredInstances).length).toBe(0);

        // Retire 1.
        await pool.retire((await pages[0]).browser());
        expect(_.values(pool.activeInstances).length).toBe(2);
        expect(_.values(pool.retiredInstances).length).toBe(1);

        // Retire 2.
        await pool.retire((await pages[1]).browser());
        expect(_.values(pool.activeInstances).length).toBe(1);
        expect(_.values(pool.retiredInstances).length).toBe(2);

        // Sleep and check that two have been killed.
        await shortSleep(2100);
        expect(_.values(pool.activeInstances).length).toBe(1);
        expect(_.values(pool.retiredInstances).length).toBe(0);

        // Cleanup everything.
        await pool.destroy();
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        delete process.env[ENV_VARS.PROXY_HOSTNAME];
        delete process.env[ENV_VARS.PROXY_PORT];
    });

    test('works with one page per instance', async () => {
        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 1,
            retireInstanceAfterRequestCount: 1,
        });

        const page1 = await pool.newPage();
        await page1.goto('about:blank');
        const pid1 = page1.browser().process().pid;

        const page2 = await pool.newPage();
        await page2.goto('about:blank');
        const pid2 = page2.browser().process().pid;

        await page1.close();
        await page2.close();

        const page3 = await pool.newPage();
        await page3.goto('about:blank');
        const pid3 = page3.browser().process().pid;

        await page3.close();

        // Ensure we spawned 3 different processes
        expect(pid1).not.toEqual(pid2);
        expect(pid2).not.toEqual(pid3);
        expect(pid3).not.toEqual(pid1);

        // Cleanup everything.
        await pool.destroy();
    });

    test('does not create more than maxOpenPagesPerInstance', async () => {
        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 2,
            retireInstanceAfterRequestCount: 100,
        });
        const opennedPages = [];

        for (let i = 0; i < 12; i++) {
            opennedPages.push(pool.newPage());
        }
        await Promise.all(opennedPages);

        const instances = Object.values(pool.activeInstances);

        expect(instances.length).toEqual(6);

        instances.forEach((instance) => {
            expect(instance.activePages).toEqual(2);
        });

        // Cleanup everything.
        await pool.destroy();
    });

    test('supports recycleDiskCache option', async () => {
        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 1,
            retireInstanceAfterRequestCount: 1,
            recycleDiskCache: true,
            launchPuppeteerOptions: { headless: true },
        });

        // log.setLevel(log.LEVELS.DEBUG);

        const url = 'https://www.wikipedia.org';

        const page1 = await pool.newPage();
        const dir1 = page1.browser().recycleDiskCacheDir;

        console.log(dir1);

        expect(fs.existsSync(dir1)).toBe(true);

        // First time, nothing can come from disk cache
        let fromDiskCache1 = 0;
        page1.on('response', (response) => {
            if (response._fromDiskCache) fromDiskCache1++; // eslint-disable-line no-underscore-dangle
            // console.log(response._url + ": " + response.fromCache() + "/" + response._fromDiskCache);
        });

        const cookies1before = await page1.cookies(url);
        expect(cookies1before.length).toBe(0);

        await page1.goto(url);

        expect(fromDiskCache1).toBe(0);

        await Apify.utils.sleep(1000);

        const cookies1after = await page1.cookies();
        expect(cookies1after.length).toBeGreaterThanOrEqual(1);

        await page1.close();

        // Wait for browser to close
        await Apify.utils.sleep(5000);

        // User directory must be the same
        const page2 = await pool.newPage();
        const dir2 = page2.browser().recycleDiskCacheDir;
        expect(dir1).toEqual(dir2);
        expect(fs.existsSync(dir2)).toBe(true);

        // Ensure at least few assets are loaded from disk cache
        let fromDiskCache2 = 0;
        page2.on('response', (response) => {
            if (response._fromDiskCache) fromDiskCache2++; // eslint-disable-line no-underscore-dangle
        });

        const cookies2before = await page2.cookies(url);
        expect(cookies2before.length).toBe(0);

        await page2.goto(url);

        expect(fromDiskCache2).toBeGreaterThanOrEqual(1);

        // Open third browser while second is still open, it should use a new cache directory
        const page3 = await pool.newPage();
        const dir3 = page3.browser().recycleDiskCacheDir;
        expect(dir3).not.toEqual(dir2);
        expect(fs.existsSync(dir3)).toBe(true);

        await page2.close();

        // Cleanup everything.
        await pool.destroy();

        // Check cache dirs were deleted
        expect(fs.existsSync(dir1)).toBe(false);
        expect(fs.existsSync(dir3)).toBe(false);
    }, 20000);

    describe('reuse of browser tabs', () => {
        xit('should work', async () => {
            const pool = new Apify.PuppeteerPool({
                reusePages: true,
            });
            const firstPage = await pool.newPage();
            const secondPage = await pool.newPage();
            await pool.recyclePage(firstPage);
            const recycledFirstPage = await pool.newPage();
            const thirdPage = await pool.newPage();
            await pool.recyclePage(thirdPage);
            await pool.recyclePage(secondPage);
            const recycledThirdPage = await pool.newPage();
            const recycledSecondPage = await pool.newPage();

            expect(recycledFirstPage === firstPage).toBe(true);
            expect(recycledSecondPage === secondPage).toBe(true);
            expect(recycledThirdPage === thirdPage).toBe(true);

            expect(firstPage === secondPage).toBe(false);
            expect(firstPage === thirdPage).toBe(false);
            expect(firstPage === recycledSecondPage).toBe(false);
            expect(firstPage === recycledThirdPage).toBe(false);
            expect(secondPage === thirdPage).toBe(false);
            expect(secondPage === recycledFirstPage).toBe(false);
            expect(secondPage === recycledThirdPage).toBe(false);
            expect(thirdPage === recycledFirstPage).toBe(false);
            expect(thirdPage === recycledSecondPage).toBe(false);

            await pool.destroy();
        });

        xit('should not open new browsers when idle pages are available', async () => {
            const pool = new Apify.PuppeteerPool({
                maxOpenPagesPerInstance: 1,
                reusePages: true,
            });

            const pageOne = await pool.newPage();
            await pool.recyclePage(pageOne);
            expect(Object.keys(pool.activeInstances).length).toBe(1);

            const pageTwo = await pool.newPage();
            expect(pageOne === pageTwo).toBe(true);
            await pool.recyclePage(pageTwo);
            expect(Object.keys(pool.activeInstances).length).toBe(1);

            const pageThree = await pool.newPage();
            expect(pageTwo === pageThree).toBe(true);
            expect(Object.keys(pool.activeInstances).length).toBe(1);

            const pageFour = await pool.newPage();
            expect(pageFour === pageThree).toBe(false);
            expect(Object.keys(pool.activeInstances).length).toBe(2);

            await pool.recyclePage(pageThree);
            await pool.recyclePage(pageFour);
            await pool.newPage();
            await pool.newPage();
            expect(Object.keys(pool.activeInstances).length).toBe(2);

            await pool.destroy();
        });

        xit('should count towards retireInstanceAfterRequestCount option', async () => {
            const pool = new Apify.PuppeteerPool({
                retireInstanceAfterRequestCount: 2,
                reusePages: true,
            });

            const len = obj => Object.keys(obj).length;

            let page = await pool.newPage();
            await pool.recyclePage(page);
            expect(len(pool.activeInstances)).toBe(1);

            page = await pool.newPage();
            await pool.recyclePage(page);
            expect(len(pool.activeInstances)).toBe(0);

            page = await pool.newPage();
            expect(len(pool.activeInstances)).toBe(1);

            const pageTwo = await pool.newPage();
            expect(len(pool.activeInstances)).toBe(0);

            await pool.recyclePage(page);
            await pool.recyclePage(pageTwo);
            expect(len(pool.activeInstances)).toBe(0);
            await pool.newPage();
            expect(len(pool.activeInstances)).toBe(1);
            await pool.newPage();
            expect(len(pool.activeInstances)).toBe(0);

            await pool.destroy();
        });

        xit('should close pages in retired instances', async () => {
            const pool = new Apify.PuppeteerPool({
                retireInstanceAfterRequestCount: 1,
                reusePages: true,
            });

            // Open 3 pages, should have 3 retired instances later.
            const pages = [
                await pool.newPage(),
                await pool.newPage(),
                await pool.newPage(),
            ];

            let closeCounter = 0;

            // Recycle all pages, this should just make them idle.
            for (const p of pages) {
                const { close } = p;
                p.close = (...args) => { // eslint-disable-line no-loop-func
                    closeCounter++;
                    close.apply(p, ...args);
                };
                await pool.recyclePage(p);
            }

            // Get one new page. This should flush all the idle ones because
            // they are in retired instances.
            await pool.newPage();

            expect(closeCounter).toBe(3);

            await pool.destroy();
        });

        xit('should skip closed pages', async () => {
            const pool = new Apify.PuppeteerPool({ reusePages: true });

            const firstPage = await pool.newPage();
            const secondPage = await pool.newPage();
            await pool.recyclePage(firstPage);
            await pool.recyclePage(secondPage);
            await firstPage.close();
            const recycledSecondPage = await pool.newPage();
            const thirdPage = await pool.newPage();
            await thirdPage.close();
            const fourthPage = await pool.newPage();
            await secondPage.close();
            const fifthPage = await pool.newPage();
            await pool.recyclePage(recycledSecondPage);
            await pool.recyclePage(thirdPage);
            await pool.recyclePage(fourthPage);
            await pool.recyclePage(fifthPage);
            await fourthPage.close();
            const recycledFifthPage = await pool.newPage();

            expect(recycledSecondPage === secondPage).toBe(true);
            expect(recycledFifthPage === fifthPage).toBe(true);

            const all = [firstPage, secondPage, thirdPage, fourthPage, fifthPage, recycledSecondPage, recycledFifthPage];
            const matches = page => all.filter(x => page === x).length;

            expect(matches(firstPage)).toBe(1);
            expect(matches(secondPage)).toBe(2);
            expect(matches(thirdPage)).toBe(1);
            expect(matches(fourthPage)).toBe(1);
            expect(matches(fifthPage)).toBe(2);

            await pool.destroy();
        });
    });

    describe('useIncognitoPages', () => {
        test('opens a page in incognito browser context', async () => {
            const pool = new Apify.PuppeteerPool({
                useIncognitoPages: true,
            });
            const page = await pool.newPage();
            const browser = page.browser();
            const context = page.browserContext();
            expect(context.isIncognito()).toBe(true);
            await page.close();
            const contexts = browser.browserContexts();
            expect(contexts).toHaveLength(1);
            expect(contexts[0].isIncognito()).toBe(false);
            await pool.destroy();
        });
    });

    describe('the proxyConfiguration', () => {
        test('correctly creates the proxyUrl', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
            const status = { connected: true };
            const fakeCall = async () => {
                return { body: status };
            };

            const stub = sinon.stub(utilsRequest, 'requestAsBrowser').callsFake(fakeCall);
            const proxyConfiguration = await Apify.createProxyConfiguration({
                groups: ['G1', 'G2'],
            });

            const optionsLog = [];
            const proxyUrls = [];
            const pool = new Apify.PuppeteerPool({
                maxOpenPagesPerInstance: 1,
                proxyConfiguration,
                launchPuppeteerFunction: async (launchOpts) => {
                    optionsLog.push(launchOpts);
                    return launchPuppeteer(launchOpts);
                },
            });

            // Open 4 browsers to do rotation cycle
            const page1 = await pool.newPage();
            const page2 = await pool.newPage();
            const page3 = await pool.newPage();
            const page4 = await pool.newPage();
            /* eslint-disable no-underscore-dangle */
            proxyUrls.push(pool._getBrowserInstance(page1).proxyInfo.url);
            proxyUrls.push(pool._getBrowserInstance(page2).proxyInfo.url);
            proxyUrls.push(pool._getBrowserInstance(page3).proxyInfo.url);
            proxyUrls.push(pool._getBrowserInstance(page4).proxyInfo.url);

            await pool.destroy();


            expect(optionsLog).toHaveLength(4);
            expect(optionsLog[0].proxyUrl).toEqual(proxyUrls[0]);
            expect(optionsLog[1].proxyUrl).toEqual(proxyUrls[1]);
            expect(optionsLog[2].proxyUrl).toEqual(proxyUrls[2]);
            expect(optionsLog[3].proxyUrl).toEqual(proxyUrls[3]);

            delete process.env[ENV_VARS.PROXY_PASSWORD];
            stub.restore();
        });

        test('supports rotation of custom proxies', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
            const optionsLog = [];

            const proxyConfiguration = await Apify.createProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });
            const pool = new Apify.PuppeteerPool({
                maxOpenPagesPerInstance: 1,
                launchPuppeteerFunction: async (launchOpts) => {
                    optionsLog.push(launchOpts);
                    return launchPuppeteer(launchOpts);
                },
                proxyConfiguration,
            });
            const proxies = proxyConfiguration.proxyUrls;
            // Open 4 browsers to do full rotation cycle
            await pool.newPage();
            await pool.newPage();
            await pool.newPage();
            await pool.newPage();
            await pool.destroy();

            expect(optionsLog).toHaveLength(4);
            expect(optionsLog[0].proxyUrl).toEqual(proxies[0]);
            expect(optionsLog[1].proxyUrl).toEqual(proxies[1]);
            expect(optionsLog[2].proxyUrl).toEqual(proxies[2]);
            expect(optionsLog[3].proxyUrl).toEqual(proxies[0]);

            delete process.env[ENV_VARS.PROXY_PASSWORD];
        });

        test('should throw on proxyConfiguration together with proxyUrl from launchPuppeteerOptions', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';

            const proxyConfiguration = await Apify.createProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            try {
                // eslint-disable-next-line no-unused-vars
                const pool = new Apify.PuppeteerPool({
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

    describe('prevents hanging of puppeteer operations', () => {
        let pool;
        beforeEach(() => {
            log.setLevel(log.LEVELS.OFF);
            pool = new Apify.PuppeteerPool({
                launchPuppeteerOptions: {
                    headless: true,
                },
            });
        });
        afterEach(async () => {
            log.setLevel(log.LEVELS.ERROR);
            await pool.destroy();
        });

        test('should work', async () => {
            // Start browser;
            await pool._openNewTab(); // eslint-disable-line no-underscore-dangle
            pool.puppeteerOperationTimeoutMillis = 0.005;
            try {
                await pool._openNewTab(); // eslint-disable-line no-underscore-dangle
                throw new Error('invalid error');
            } catch (err) {
                expect(err.stack).toMatch('browser.newPage() timed out.');
            }
        });
    });

    describe('enables LiveView', () => {
        beforeAll(() => {
            process.env[ENV_VARS.IS_AT_HOME] = '1';
        });
        afterAll(() => {
            delete process.env[ENV_VARS.IS_AT_HOME];
        });
        test('should work', async () => {
            const serveCalledWith = [];
            let started = 0;
            let stopped = 0;
            const pool = new Apify.PuppeteerPool({
                launchPuppeteerOptions: { headless: true },
                useLiveView: true,
            });
            pool.liveViewServer.start = async () => {
                started++;
                pool.liveViewServer._isRunning = true; // eslint-disable-line no-underscore-dangle
                pool.liveViewServer.clientCount++;
            };
            pool.liveViewServer.serve = async arg => serveCalledWith.push(arg);
            pool.liveViewServer.stop = async () => stopped++;

            for (let i = 0; i < 3; i++) {
                const page = await pool.newPage();
                await pool.serveLiveViewSnapshot(page);
                await pool.recyclePage(page);
            }

            expect(started).toBe(1);
            expect(serveCalledWith).toHaveLength(3);
            serveCalledWith.forEach(item => expect(item.constructor.name === 'Page'));

            await pool.destroy();
            expect(stopped).toBe(1);
        });
    });

    describe('uses sessionPool', () => {
        let localStorageEmulator;

        beforeAll(async () => {
            localStorageEmulator = new LocalStorageDirEmulator();
        });

        beforeEach(async () => {
            await localStorageEmulator.init();
        });

        afterAll(async () => {
            await localStorageEmulator.destroy();
        });

        test('should work', async () => {
            const sessionPool = new SessionPool();
            await sessionPool.initialize();
            const pool = new Apify.PuppeteerPool({
                launchPuppeteerOptions: { headless: true },
                sessionPool,
            });
            expect(pool.sessionPool.constructor.name).toEqual('SessionPool');
            const page = await pool.newPage();
            // eslint-disable-next-line no-underscore-dangle
            const browserSession = pool._getBrowserInstance(page).session;

            expect(browserSession.id).toEqual(sessionPool.sessions[0].id);
            expect(
                Object.values(pool.activeInstances).filter(instance => instance.session.id === browserSession.id),
            ).toHaveLength(1);

            sessionPool.sessions[0].retire();

            await sleep(2000);
            expect(Object.values(pool.activeInstances)).toHaveLength(0);
        });
    });
});
