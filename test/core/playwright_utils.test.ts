import express from 'express';
import path from 'path';
import log from '@apify/log';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Request, launchPlaywright, playwrightUtils } from '@crawlee/playwright';
import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';
import { startExpressAppPromise } from '../shared/_helper';

const HOSTNAME = '127.0.0.1';
let port: number;
let server: Server;

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
    port = (server.address() as AddressInfo).port;
});

afterAll(() => {
    server.close();
});

describe('playwrightUtils', () => {
    let ll: number;
    const localStorageEmulator = new MemoryStorageEmulator();

    beforeAll(async () => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        await localStorageEmulator.init();
    });

    afterAll(async () => {
        log.setLevel(ll);
        await localStorageEmulator.destroy();
    });

    describe.each([
        [launchPlaywright, { launchOptions: { headless: true } }],
    ] as const)('with %s', (launchName, launchContext) => {
        test('injectFile()', async () => {
            const browser2 = await launchName(launchContext);
            const survive = async (browser: Browser) => {
                // Survive navigations
                const page = await browser.newPage();
                // @ts-expect-error
                let result = await page.evaluate(() => window.injectedVariable === 42);
                expect(result).toBe(false);
                await playwrightUtils.injectFile(page, path.join(__dirname, '..', 'shared', 'data', 'inject_file.txt'), { surviveNavigations: true });
                // @ts-expect-error
                result = await page.evaluate(() => window.injectedVariable);
                expect(result).toBe(42);
                await page.goto('about:chrome');
                // @ts-expect-error
                result = await page.evaluate(() => window.injectedVariable);
                expect(result).toBe(42);
                await page.goto('https://www.example.com');
                // @ts-expect-error
                result = await page.evaluate(() => window.injectedVariable);
                expect(result).toBe(42);
            };
            const remove = async (browser: Browser) => {
                // Remove with navigations
                const page = await browser.newPage();
                // @ts-expect-error
                let result = await page.evaluate(() => window.injectedVariable === 42);
                expect(result).toBe(false);
                await page.goto('about:chrome');
                // @ts-expect-error
                result = await page.evaluate(() => window.injectedVariable === 42);
                expect(result).toBe(false);
                await playwrightUtils.injectFile(page, path.join(__dirname, '..', 'shared', 'data', 'inject_file.txt'));
                // @ts-expect-error
                result = await page.evaluate(() => window.injectedVariable);
                expect(result).toBe(42);
                await page.goto('https://www.example.com');
                // @ts-expect-error
                result = await page.evaluate(() => window.injectedVariable === 42);
                expect(result).toBe(false);
            };
            try {
                await Promise.all([survive(browser2), remove(browser2)]);
            } finally {
                await browser2.close();
            }
        });

        test('injectJQuery()', async () => {
            const browser = await launchName(launchContext);

            try {
                const page = await browser.newPage();
                await page.goto('about:blank');

                // NOTE: Chrome already defines window.$ as alias to document.querySelector(),
                // (https://developers.google.com/web/tools/chrome-devtools/console/command-line-reference#queryselector)
                const result1 = await page.evaluate(() => {
                    return {
                        // @ts-expect-error
                        isDefined: window.jQuery !== undefined,
                    };
                });
                expect(result1).toEqual({
                    isDefined: false,
                });

                await playwrightUtils.injectJQuery(page);

                const result2 = await page.evaluate(() => {
                    /* global $ */
                    return {
                        // @ts-expect-error
                        isDefined: window.jQuery === window.$,
                        // @ts-expect-error
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
                        // @ts-expect-error
                        isDefined: window.jQuery === window.$,
                        // @ts-expect-error
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

        test('parseWithCheerio() works', async () => {
            const browser = await launchName(launchContext);

            try {
                const page = await browser.newPage();
                await page.goto('https://www.example.com');

                const $ = await playwrightUtils.parseWithCheerio(page);

                const title = $('h1').text().trim();
                expect(title).toBe('Example Domain');
            } finally {
                await browser.close();
            }
        });

        test('gotoExtended() works', async () => {
            const browser = await chromium.launch({ headless: true });

            try {
                const page = await browser.newPage();
                const request = new Request({
                    url: `http://${HOSTNAME}:${port}/foo`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    payload: '{ "foo": "bar" }',
                });

                const response = await playwrightUtils.gotoExtended(page, request);

                const { method, headers, bodyLength } = JSON.parse(await response.text());
                expect(method).toBe('POST');
                expect(bodyLength).toBe(16);
                expect(headers['content-type']).toBe('application/json; charset=utf-8');
            } finally {
                await browser.close();
            }
        }, 60_000);
    });
});
