import * as utils from '../../build/utils';

const puppeteer = require('puppeteer');

describe('utils.infiniteScroll()', () => {
    it('exits after no more to scroll', () => {
        (async () => {
            const browser = await puppeteer.launch({
                headless: true,
            });
            const page = await browser.newPage();
            const contentHTML = '<div>nothing</div>';
            await page.setContent(contentHTML);
            await utils.infiniteScroll({ page });
            await browser.close();
        })();
    });

    it('exits after reaches the bottom', () => {
        (async () => {
            const browser = await puppeteer.launch({
                headless: true,
            });
            const page = await browser.newPage();
            // Note: external website
            await page.goto('https://twitter.com/search?src=typd&q=%23fingervein&lang=sv', {
                waitUntil: 'networkidle2',
            });
            await utils.infiniteScroll({ page });
            await browser.close();
        })();
    });

    it('times out if limit is set', () => {
        (async () => {
            const browser = await puppeteer.launch({
                headless: true,
            });
            const page = await browser.newPage();
            // Note: external website
            await page.goto('https://medium.com/search?q=biometrics', {
                waitUntil: 'networkidle2',
            });
            const timeoutSecs = 10; // seconds
            await utils.infiniteScroll({ page, timeoutSecs });
            await browser.close();
        })();
    });
});
