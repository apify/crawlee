// import { expect } from 'chai';
import * as utils from '../build/utils';
import Apify from '../build';

describe('utils.infiniteScroll()', () => {
    xit('exits after it reaches the bottom', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });
        try {
            const page = await browser.newPage();
            // Note: external website
            await page.goto('https://twitter.com/search?src=typd&q=%23fingervein&lang=sv', {
                waitUntil: 'networkidle2',
            });
            await utils.infiniteScroll({ page });
        } finally {
            await browser.close();
        }
    });

    xit('times out if limit is set', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });
        try {
            const page = await browser.newPage();
            // Note: external website
            await page.goto('https://medium.com/search?q=biometrics', {
                waitUntil: 'networkidle2',
            });
            const timeoutSecs = 10; // seconds
            await utils.infiniteScroll({ page, timeoutSecs });
        } finally {
            await browser.close();
        }
    });
});
