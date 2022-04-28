import playwright from 'playwright';
import express from 'express';
import path from 'path';
import Apify from '../build/index';
import LocalStorageDirEmulator from './local_storage_dir_emulator';
import { startExpressAppPromise } from './_helper';

const { utils: { log } } = Apify;

const HOSTNAME = '127.0.0.1';
let port;
let server;
beforeAll(async () => {
    const app = express();

    app.get('/getRawHeaders', (req, res) => {
        res.send(JSON.stringify(req.rawHeaders));
    });

    app.all('/foo', (req, res) => {
        res.json({
            headers: req.headers,
            method: req.method,
            bodyLength: +req.headers['content-length'] || 0,
        });
    });

    server = await startExpressAppPromise(app, 0);
    port = server.address().port; //eslint-disable-line
});

afterAll(() => {
    server.close();
});

describe('Apify.utils.playwright', () => {
    let ll;
    let localStorageEmulator;

    beforeAll(async () => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        localStorageEmulator = new LocalStorageDirEmulator();
    });

    beforeEach(async () => {
        const storageDir = await localStorageEmulator.init();
        Apify.Configuration.getGlobalConfig().set('localStorageDir', storageDir);
    });

    afterAll(async () => {
        log.setLevel(ll);
        await localStorageEmulator.destroy();
    });

    describe.each([
        // ['launchPuppeteer', { launchOptions: { headless: true } }],
        ['launchPlaywright', { launchOptions: { headless: true } }],
    ])('with %s', (launchName, launchContext) => {
        test('injectFile()', async () => {
        /* eslint-disable no-shadow */
            const browser = await Apify[launchName](launchContext);
            const survive = async (browser) => {
            // Survive navigations
                const page = await browser.newPage();
                let result = await page.evaluate(() => window.injectedVariable === 42);
                expect(result).toBe(false);
                await Apify.utils.playwright.injectFile(page, path.join(__dirname, 'data', 'inject_file.txt'), { surviveNavigations: true });
                result = await page.evaluate(() => window.injectedVariable);
                expect(result).toBe(42);
                await page.goto('about:chrome');
                result = await page.evaluate(() => window.injectedVariable);
                expect(result).toBe(42);
                await page.goto('https://www.example.com');
                result = await page.evaluate(() => window.injectedVariable);
                expect(result).toBe(42);
            };
            const remove = async (browser) => {
            // Remove with navigations
                const page = await browser.newPage();
                let result = await page.evaluate(() => window.injectedVariable === 42);
                expect(result).toBe(false);
                await page.goto('about:chrome');
                result = await page.evaluate(() => window.injectedVariable === 42);
                expect(result).toBe(false);
                await Apify.utils.playwright.injectFile(page, path.join(__dirname, 'data', 'inject_file.txt'));
                result = await page.evaluate(() => window.injectedVariable);
                expect(result).toBe(42);
                await page.goto('https://www.example.com');
                result = await page.evaluate(() => window.injectedVariable === 42);
                expect(result).toBe(false);
            };
            try {
                await Promise.all([survive(browser), remove(browser)]);
            } finally {
                await browser.close();
            }
        });

        test('injectJQuery()', async () => {
            const browser = await Apify[launchName](launchContext);

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
                expect(result1).toEqual({
                    isDefined: false,
                });

                await Apify.utils.playwright.injectJQuery(page);

                const result2 = await page.evaluate(() => {
                /* global $ */
                    return {
                        isDefined: window.jQuery === window.$,
                        text: $('h1').text(),
                    };
                });
                expect(result2).toEqual({
                    isDefined: true,
                    text: '',
                });

                await page.reload();

                const result3 = await page.evaluate(() => {
                    return {
                        isDefined: window.jQuery === window.$,
                        text: $('h1').text(),
                    };
                });
                expect(result3).toEqual({
                    isDefined: true,
                    text: '',
                });
            } finally {
                await browser.close();
            }
        });

        test('gotoExtended() works', async () => {
            const browser = await playwright.chromium.launch({ headless: true });

            try {
                const page = await browser.newPage();
                const request = new Apify.Request({
                    url: `http://${HOSTNAME}:${port}/foo`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    payload: '{ "foo": "bar" }',
                });

                const response = await Apify.utils.playwright.gotoExtended(page, request);

                const { method, headers, bodyLength } = JSON.parse(await response.text());
                expect(method).toBe('POST');
                expect(bodyLength).toBe(16);
                expect(headers['content-type']).toBe('application/json; charset=utf-8');
            } finally {
                await browser.close();
            }
        }, 60000);
    });
});
