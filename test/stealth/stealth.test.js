import scanner from 'fpscanner';
import path from 'path';

import Apify from '../../build';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';

const fingerPrintPath = require.resolve('fpcollect/dist/fpCollect.min.js');
const pathToHTML = path.join(__dirname, 'test_html.html');
const testUrl = `file://${pathToHTML}`;

const getFingerPrint = async (page) => {
    await Apify.utils.puppeteer.injectFile(page, fingerPrintPath);

    return page.evaluate(() => fpCollect.generateFingerprint()); // eslint-disable-line
};

// we can speed up the test to make the requests to the local static html
describe('Stealth - testing headless chrome hiding tricks', () => {
    let localStorageEmulator;
    let browser;
    let page;

    beforeAll(async () => {
        localStorageEmulator = new LocalStorageDirEmulator();
    });

    beforeEach(async () => {
        await localStorageEmulator.init();
        browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });
        page = await browser.newPage();
    });

    afterEach(async () => {
        await browser.close();
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    test('it adds plugins, mimeTypes and passes', async () => {
        await page.goto(testUrl);
        const { plugins, mimeTypes } = await getFingerPrint(page);

        expect(plugins.length).toBe(3);
        expect(mimeTypes.length).toBe(4);
    });

    test('it hides webDriver', async () => {
        await page.goto(testUrl);
        const { webDriver } = await getFingerPrint(page);

        expect(webDriver).toBe(false);
    });

    test('it hacks permissions', async () => {
        await page.goto(testUrl);
        const { permissions } = await getFingerPrint(page);

        expect(permissions.state).toBe('denied');
    });

    test('it adds language to navigator', async () => {
        await page.goto(testUrl);
        const { languages } = await getFingerPrint(page);

        expect(Array.isArray(languages)).toBe(true);
        expect(languages[0]).toBe('en-US');
    });

    test('it emulates WebGL', async () => {
        await page.goto(testUrl);
        const { videoCard } = await getFingerPrint(page);

        expect(videoCard[0]).toBe('Intel Inc.');
        expect(videoCard[1]).toBe('Intel(R) Iris(TM) Plus Graphics 640');
    });

    test('it emulates windowFrame', async () => {
        await page.goto(testUrl);
        const { screen } = await getFingerPrint(page);

        expect(screen.wOuterHeight > 0).toBe(true);
        expect(screen.wOuterWidth > 0).toBe(true);
    });

    test('it emulates console.debug', async () => {
        await page.goto(testUrl);
        const returnValue = await page.evaluate(() => console.debug('TEST'));

        expect(returnValue).toBe(null);
    });
    test('it should mock window.chrome to plain object', async () => {
        await page.goto(testUrl);
        const { hasChrome } = await getFingerPrint(page);
        const chrome = await page.evaluate(() => window.chrome); //eslint-disable-line
        expect(chrome).toBeInstanceOf(Object);
        expect(chrome.runtime).toEqual({}); // eslint-disable-line
        expect(hasChrome).toBe(true);
    });

    test('it should mock chrome when iframe is created', async () => {
        await page.goto(testUrl);
        const { iframeChrome } = await getFingerPrint(page);

        expect(iframeChrome).toBe('object');

        return browser.close();
    });

    test('it should not break iframe ', async () => {
        const testFuncReturnValue = 'TESTSTRING';
        await page.goto(testUrl);
        await page.evaluate((returnValue) => {
            const { document } = window; //eslint-disable-line
            const body = document.querySelector('body');
            const iframe = document.createElement('iframe');
            iframe.contentWindow.mySuperFunction = () => returnValue;
            body.appendChild(iframe);
        }, testFuncReturnValue);
        const realReturn = await page.evaluate(
            () => document.querySelector('iframe').contentWindow.mySuperFunction(), //eslint-disable-line
        );
        expect(realReturn).toEqual(testFuncReturnValue);
    });

    test('it should mock device memory', async () => {
        await page.goto(testUrl);
        const { deviceMemory } = await getFingerPrint(page);

        expect(deviceMemory).not.toBe(0);
    });

    test(
        'it should bypass all of the known tests for browser fingerprinting',
        async () => {
            await page.goto(testUrl);
            const fingerPrint = await getFingerPrint(page);
            const testedFingerprint = scanner.analyseFingerprint(fingerPrint);
            const failedChecks = Object.values(testedFingerprint).filter(val => val.consistent < 3);

            expect(failedChecks.length).toBe(0);
        },
    );

    test('logs the evaluation warning in "page" when limit is exceeded', async () => {
        const numberOfIframes = 14;
        let message = '';
        const oldConsoleWarn = console.warn;
        console.warn = (msg) => {
            message = msg;
            return oldConsoleWarn.bind(console);
        };

        await page.goto(testUrl);

        await page.evaluate((iframesCount) => {
            for (let i = 0; i < iframesCount; i++) {
                const iframe = document.createElement('iframe');
                document.body.appendChild(iframe);
            }
        }, numberOfIframes);


        expect(message.includes('Evaluating hiding tricks in too many iframes')).toBeTruthy();
    });

    test('does not log the message when the iframes are under the limit', async () => {
        const numberOfIframes = 9;
        let message;
        const oldConsoleWarn = console.warn;
        console.warn = (msg) => {
            message = msg;
            return oldConsoleWarn.bind(console);
        };

        await page.goto(testUrl);

        await page.evaluate((iframesCount) => {
            for (let i = 0; i < iframesCount; i++) {
                const iframe = document.createElement('iframe');
                document.body.appendChild(iframe);
            }
        }, numberOfIframes);

        expect(message).toBeUndefined();
    });


    describe('puppeteer crawler test', async () => {
        let requestList;
        let puppeteerCrawler;

        beforeEach(async () => {
            requestList = await Apify.openRequestList('test', [testUrl]);
            puppeteerCrawler = new Apify.PuppeteerCrawler({
                requestList,
                launchPuppeteerOptions: {
                    stealth: true,
                    useChrome: true,
                    headless: true,
                },
                handlePageFunction: () => {},
            });
        });
        test('should work in crawler', async () => {
            puppeteerCrawler.handlePageFunction = async ({ page: activePage }) => {
                const fingerprint = await getFingerPrint(activePage);
                values.push(fingerprint);
            };
            const values = [];
            await puppeteerCrawler.run();
            const fingerprint = values[0];
            expect(fingerprint.webDriver).toBe(false); // eslint-disable-line
            expect(fingerprint.webDriverValue).toBeUndefined(); // eslint-disable-line
        });
    });
});
