import { expect } from 'chai';
import scanner from 'fpscanner';

import Apify from '../../build';

const fingerPrintPath = require.resolve('fpcollect/dist/fpCollect.min.js');

const getFingerPrint = async (page) => {
    await Apify.utils.puppeteer.injectFile(page, fingerPrintPath);

    return page.evaluate(() => fpCollect.generateFingerprint()); // eslint-disable-line
};

// we can speed up the test to make the requests to the local static html
describe('Stealth - testing headless chrome hiding tricks', () => {
    it('it adds plugins, mimeTypes and passes', async () => {
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
        await page.goto('file://test_html.html');
        const { webDriver } = await getFingerPrint(page);

        // check if disabling works
        expect(webDriver).to.be.eql(true);
        const { plugins, mimeTypes } = await getFingerPrint(page);

        expect(plugins.length).to.be.eql(3);
        expect(mimeTypes.length).to.be.eql(4);

        return browser.close();
    });

    it('it hides webDriver', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto('file://test_html.html');
        const { webDriver } = await getFingerPrint(page);

        expect(webDriver).to.be.eql(false);

        return browser.close();
    });

    it('it hacks permissions', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto('file://test_html.html');
        const { permissions } = await getFingerPrint(page);

        expect(permissions.state).to.be.eql('denied');

        return browser.close();
    });

    it('it adds language to navigator', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto('file://test_html.html');
        const { languages } = await getFingerPrint(page);

        expect(languages).to.be.an('array');
        expect(languages[0]).to.be.eql('en-US');

        return browser.close();
    });

    it('it emulates WebGL', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto('file://test_html.html');
        const { videoCard } = await getFingerPrint(page);

        expect(videoCard[0]).to.be.eql('Intel Inc.');
        expect(videoCard[1]).to.be.eql('Intel(R) Iris(TM) Plus Graphics 640');

        return browser.close();
    });

    it('it emulates windowFrame', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto('file://test_html.html');
        const { screen } = await getFingerPrint(page);

        expect(screen.wOuterHeight > 0).to.be.eql(true);
        expect(screen.wOuterWidth > 0).to.be.eql(true);

        return browser.close();
    });

    it('it emulates console.debug', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto('file://test_html.html');
        const returnValue = await page.evaluate(() => console.debug('TEST'));

        expect(returnValue).to.be.eql(null);

        return browser.close();
    });
    it('it should mock window.chrome to plain object', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto('file://test_html.html');
        const { hasChrome } = await getFingerPrint(page);
        const chrome = await page.evaluate(() => window.chrome); //eslint-disable-line
        expect(chrome).to.be.an('object');
        expect(chrome.runtime).to.be.empty; // eslint-disable-line
        expect(hasChrome).to.be.eql(true);

        return browser.close();
    });

    it('it should mock chrome when iframe is created', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto('file://test_html.html');
        const { iframeChrome } = await getFingerPrint(page);

        expect(iframeChrome).to.be.eql('object');

        return browser.close();
    });

    it('it should not break iframe ', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        const testFuncReturnValue = 'TESTSTRING';
        await page.goto('file://test_html.html');
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
        expect(realReturn).to.eql(testFuncReturnValue);

        return browser.close();
    });

    it('it should mock device memory', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto('file://test_html.html');
        const { deviceMemory } = await getFingerPrint(page);

        expect(deviceMemory).not.to.be.eql(0);

        return browser.close();
    });

    it('it should bypass all of the known tests for browser fingerprinting', async () => {
        const browser = await Apify.launchPuppeteer({
            stealth: true,
            headless: true,
            useChrome: true,
        });

        const page = await browser.newPage();
        await page.goto('file://test_html.html');
        const fingerPrint = await getFingerPrint(page);
        const testedFingerprint = scanner.analyseFingerprint(fingerPrint);
        const failedChecks = Object.values(testedFingerprint).filter(val => val.consistent < 3);

        expect(failedChecks.length).to.eql(0);

        return browser.close();
    });
});
