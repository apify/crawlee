import { ENV_VARS } from 'apify-shared/consts';
import playwright from 'playwright';
import log from '../../build/utils_log';
import * as Apify from '../../build';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';
import * as utils from '../../build/utils';

describe('PlaywrightCrawler', () => {
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

    describe('should work', () => {
        // @TODO: add webkit and solve te timeout issue on github actions.
        test.each(['chromium', 'firefox'])('with %s', async (browser) => {
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
                expect(await response.status()).toBe(200);
                request.userData.title = await page.title();
                processed.push(request);
            };

            const playwrightCrawler = new Apify.PlaywrightCrawler({
                launchContext: {
                    launcher: playwright[browser],
                },
                requestList: requestListLarge,
                minConcurrency: 1,
                maxConcurrency: 1,
                handlePageFunction,
                handleFailedRequestFunction: ({ request }) => failed.push(request),
            });

            await requestListLarge.initialize();
            await playwrightCrawler.run();

            expect(playwrightCrawler.autoscaledPool.minConcurrency).toBe(1);
            expect(processed).toHaveLength(6);
            expect(failed).toHaveLength(0);

            processed.forEach((request, id) => {
                expect(request.url).toEqual(sourcesCopy[id].url);
                expect(request.userData.title).toBe('Example Domain');
            });
        });
    });

    test('should override goto timeout with gotoTimeoutSecs', async () => {
        const timeoutSecs = 10;
        let options;
        const playwrightCrawler = new Apify.PlaywrightCrawler({ //eslint-disable-line
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

        expect(playwrightCrawler.defaultGotoOptions.timeout).toEqual(timeoutSecs * 1000);
        await playwrightCrawler.run();

        expect(options.timeout).toEqual(timeoutSecs * 1000);

        expect.hasAssertions();
    });
    test('should support custom gotoFunction', async () => {
        const functions = {
            handlePageFunction: () => { },
            gotoFunction: ({ page, request }, options) => {
                return page.goto(request.url, options);
            },
        };
        jest.spyOn(functions, 'gotoFunction');
        jest.spyOn(functions, 'handlePageFunction');
        const playwrightCrawler = new Apify.PlaywrightCrawler({ //eslint-disable-line
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            handlePageFunction: functions.handlePageFunction,
            gotoFunction: functions.gotoFunction,
        });

        expect(playwrightCrawler.gotoFunction).toEqual(functions.gotoFunction);
        await playwrightCrawler.run();

        expect(functions.gotoFunction).toBeCalled();
        expect(functions.handlePageFunction).toBeCalled();
    });

    test('should override goto timeout with navigationTimeoutSecs', async () => {
        const timeoutSecs = 10;
        let options;
        const playwrightCrawler = new Apify.PlaywrightCrawler({ //eslint-disable-line
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            handlePageFunction: async () => {
            },
            preNavigationHooks: [(context, gotoOptions) => {
                options = gotoOptions;
            }],
            navigationTimeoutSecs: timeoutSecs,
        });

        expect(playwrightCrawler.defaultGotoOptions.timeout).toEqual(timeoutSecs * 1000);
        await playwrightCrawler.run();

        expect(options.timeout).toEqual(timeoutSecs * 1000);
    });
});
