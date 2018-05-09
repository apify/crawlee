import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Apify from '../build/index';

chai.use(chaiAsPromised);

/* global process, describe, it */

describe('Apify.utils.puppeteer', () => {
    it('injectJQuery()', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });

        try {
            const page = await browser.newPage();
            await page.goto('about:blank');

            // NOTE: Chrome already defines window.$ as alias to document.querySelector(),
            // (https://developers.google.com/web/tools/chrome-devtools/console/command-line-reference#queryselector)
            const result1 = await page.evaluate(() => {
                return {
                    isDefined: window.jQuery !== undefined,
                };
            });
            expect(result1).to.eql({
                isDefined: false,
            });

            await Apify.utils.puppeteer.injectJQuery(page);
            const result2 = await page.evaluate(() => {
                return {
                    isDefined: window.jQuery === window.$,
                    text: $('h1').text(),
                };
            });
            expect(result2).to.eql({
                isDefined: true,
                text: '',
            });
        } finally {
            browser.close();
        }
    });

    it('injectUnderscore()', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });

        try {
            const page = await browser.newPage();
            await page.goto('about:blank');

            const result1 = await page.evaluate(() => {
                return { isDefined: window._ !== undefined };
            });
            expect(result1).to.eql({ isDefined: false });

            await Apify.utils.puppeteer.injectUnderscore(page);
            const result2 = await page.evaluate(() => {
                return { isDefined: _.isEmpty({}) };
            });
            expect(result2).to.eql({ isDefined: true });
        } finally {
            browser.close();
        }
    });

    it('hideWebDriver()', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });

        try {
            const page = await browser.newPage();
            await page.goto('about:blank');

            // TODO: Jarda, please can you add unit test for this?
            /*
            const result1 = await page.evaluate(() => {
                return { isDefined: window._ !== undefined };
            });
            expect(result1).to.eql({ isDefined: false });

            await Apify.utils.puppeteer.hideWebDriver(page);
            const result2 = await page.evaluate(() => {
                return { isDefined: _.isEmpty({}) };
            });
            expect(result2).to.eql({ isDefined: true }); */
        } finally {
            browser.close();
        }
    });
});
