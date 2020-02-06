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

    beforeAll(async () => {
        localStorageEmulator = new LocalStorageDirEmulator();
        await localStorageEmulator.init();
    });

    beforeEach(async () => {
        await localStorageEmulator.clean();
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    test('it adds plugins, mimeTypes and passes', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            stealthOptions: {
                emulateWindowFrame: false,
                emulateWebGL: false,
                emulateConsoleDebug: false,
                addLanguage: false,
                hideWebDriver: false,
                hackPermissions: false,
                mockChrome: false,
                mockChromeInIframe: false,
                mockDeviceMemory: false,
            },
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto(testUrl);
        const { webDriver } = await getFingerPrint(page);

        // check if disabling works
        expect(webDriver).toBe(true);
        const { plugins, mimeTypes } = await getFingerPrint(page);

        expect(plugins.length).toBe(3);
        expect(mimeTypes.length).toBe(4);

        return browser.close();
    });

    test('it hides webDriver', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto(testUrl);
        const { webDriver } = await getFingerPrint(page);

        expect(webDriver).toBe(false);

        return browser.close();
    });

    test('it hacks permissions', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto(testUrl);
        const { permissions } = await getFingerPrint(page);

        expect(permissions.state).toBe('denied');

        return browser.close();
    });

    test('it adds language to navigator', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto(testUrl);
        const { languages } = await getFingerPrint(page);

        expect(Array.isArray(languages)).toBe(true);
        expect(languages[0]).toBe('en-US');

        return browser.close();
    });

    test('it emulates WebGL', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto(testUrl);
        const { videoCard } = await getFingerPrint(page);

        expect(videoCard[0]).toBe('Intel Inc.');
        expect(videoCard[1]).toBe('Intel(R) Iris(TM) Plus Graphics 640');

        return browser.close();
    });

    test('it emulates windowFrame', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto(testUrl);
        const { screen } = await getFingerPrint(page);

        expect(screen.wOuterHeight > 0).toBe(true);
        expect(screen.wOuterWidth > 0).toBe(true);

        return browser.close();
    });

    test('it emulates console.debug', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto(testUrl);
        const returnValue = await page.evaluate(() => console.debug('TEST'));

        expect(returnValue).toBe(null);

        return browser.close();
    });
    test('it should mock window.chrome to plain object', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto(testUrl);
        const { hasChrome } = await getFingerPrint(page);
        const chrome = await page.evaluate(() => window.chrome); //eslint-disable-line
        expect(chrome).toBeInstanceOf(Object);
        expect(chrome.runtime).toEqual({}); // eslint-disable-line
        expect(hasChrome).toBe(true);

        return browser.close();
    });

    test('it should mock chrome when iframe is created', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto(testUrl);
        const { iframeChrome } = await getFingerPrint(page);

        expect(iframeChrome).toBe('object');

        return browser.close();
    });

    test('it should not break iframe ', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
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

        return browser.close();
    });

    test('it should mock device memory', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto(testUrl);
        const { deviceMemory } = await getFingerPrint(page);

        expect(deviceMemory).not.toBe(0);

        return browser.close();
    });

    test(
        'it should bypass all of the known tests for browser fingerprinting',
        async () => {
            const browser = await Apify.launchPuppeteer({
                stealth: true,
                headless: true,
                useChrome: true,
            });

            const page = await browser.newPage();
            await page.goto(testUrl);
            const fingerPrint = await getFingerPrint(page);
            const testedFingerprint = scanner.analyseFingerprint(fingerPrint);
            const failedChecks = Object.values(testedFingerprint).filter(val => val.consistent < 3);

            expect(failedChecks.length).toBe(0);

            return browser.close();
        },
    );

    test('should work in crawler', async () => {
        const requestList = await Apify.openRequestList('test', [testUrl]);
        const values = [];
        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            launchPuppeteerOptions: {
                stealth: true,
                useChrome: true,
                headless: true,
            },
            handlePageFunction: async ({ page }) => {
                const fingerprint = await getFingerPrint(page);
                values.push(fingerprint);
            },
        });
        await puppeteerCrawler.run();
        const fingerprint = values[0];
        expect(fingerprint.webDriver).toBe(false); // eslint-disable-line
        expect(fingerprint.webDriverValue).toBeUndefined(); // eslint-disable-line
    });
});
