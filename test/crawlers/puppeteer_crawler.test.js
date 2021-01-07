import { ENV_VARS } from 'apify-shared/consts';
import sinon from 'sinon';
import log from '../../build/utils_log';
import * as Apify from '../../build';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';
import * as utils from '../../build/utils';

describe('PuppeteerCrawler', () => {
    let prevEnvHeadless;
    let logLevel;
    let localStorageEmulator;
    let requestList;

    beforeAll(async () => {
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        localStorageEmulator = new LocalStorageDirEmulator();
    });
    beforeEach(async () => {
        const storageDir = await localStorageEmulator.init();
        utils.apifyStorageLocal = utils.newStorageLocal({ storageDir });
        const sources = ['http://example.com/'];
        requestList = await Apify.openRequestList(`sources-${Math.random * 10000}`, sources);
    });
    afterAll(async () => {
        log.setLevel(logLevel);
        process.env[ENV_VARS.HEADLESS] = prevEnvHeadless;
        await localStorageEmulator.destroy();
    });

    test('should work', async () => {
        const sourcesLarge = [
            { url: 'http://example.com/?q=1' },
            { url: 'http://example.com/?q=2' },
            { url: 'http://example.com/?q=3' },
            { url: 'http://example.com/?q=4' },
            { url: 'http://example.com/?q=5' },
            { url: 'http://example.com/?q=6' },
        ];
        const sourcesCopy = JSON.parse(JSON.stringify(sourcesLarge));
        const processed = [];
        const failed = [];
        const requestListLarge = new Apify.RequestList({ sources: sourcesLarge });
        const handlePageFunction = async ({ page, request, response }) => {
            await page.waitForSelector('title');

            expect(await response.status()).toBe(200);
            request.userData.title = await page.title();
            processed.push(request);
        };

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList: requestListLarge,
            minConcurrency: 1,
            maxConcurrency: 1,
            handlePageFunction,
            handleFailedRequestFunction: ({ request }) => failed.push(request),
        });

        await requestListLarge.initialize();
        await puppeteerCrawler.run();

        expect(puppeteerCrawler.autoscaledPool.minConcurrency).toBe(1);
        expect(processed).toHaveLength(6);
        expect(failed).toHaveLength(0);

        processed.forEach((request, id) => {
            expect(request.url).toEqual(sourcesCopy[id].url);
            expect(request.userData.title).toBe('Example Domain');
        });
    });

    test('should throw on gotoFunction', async () => {
        try {
        const puppeteerCrawler = new Apify.PuppeteerCrawler({ //eslint-disable-line
                requestList,
                maxRequestRetries: 0,
                maxConcurrency: 1,
                handlePageFunction: async () => {
                },
                gotoFunction: () => {},
            });
        } catch (e) {
            expect(e.message.includes('Expected property `gotoFunction` to be of type `undefined`')).toBeTruthy();
        }

        expect.hasAssertions();
    });

    test('should override goto timeout ', async () => {
        const timeoutSecs = 10;
        let options;
        const puppeteerCrawler = new Apify.PuppeteerCrawler({ //eslint-disable-line
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            handlePageFunction: async () => {
            },
            preNavigationHooks: [(context, gotoOptions) => {
                options = gotoOptions;
            }],
            gotoTimeoutSecs: timeoutSecs,
        });

        expect(puppeteerCrawler.gotoOptions.timeout).toEqual(timeoutSecs * 1000);
        await puppeteerCrawler.run();

        expect(options.timeout).toEqual(timeoutSecs * 1000);

        expect.hasAssertions();
    });

    test('should throw if launchOptions.proxyUrl and proxyConfiguration is suplied', async () => {
        try {
            const puppeteerCrawler = new Apify.PuppeteerCrawler({ //eslint-disable-line
                requestList,
                maxRequestRetries: 0,
                maxConcurrency: 1,
                launchContext: {
                    proxyUrl: 'http://localhost@1234',
                },
                proxyConfiguration: await Apify.createProxyConfiguration({ proxyUrls: ['http://localhost@1234'] }),
                handlePageFunction: async () => {},
            });
        } catch (e) {
            expect(e.message).toEqual('It is not possible to combine "options.proxyConfiguration" together with '
                + 'custom "proxyUrl" option from "options.launchPuppeteerOptions".');
        }

        expect.hasAssertions();
    });
    test('supports useChrome option', async () => {
        const spy = sinon.spy(utils, 'getTypicalChromeExecutablePath');

            const puppeteerCrawler = new Apify.PuppeteerCrawler({ //eslint-disable-line
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            launchContext: {
                useChrome: true,
                launchOptions: {
                    headless: true,
                },
            },
            handlePageFunction: async () => {
            },
        });

        expect(spy.calledOnce).toBe(true);
        spy.restore();
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

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            launchContext: opts,
            handlePageFunction: async ({ page }) => {
                loadedUserAgent = await page.evaluate(() => window.navigator.userAgent);
            },
        });

        await puppeteerCrawler.run();

        expect(loadedUserAgent).toEqual(opts.userAgent);
    });
});
