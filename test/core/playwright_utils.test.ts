import type { Server } from 'http';
import path from 'path';

import log from '@apify/log';
import { KeyValueStore, Request, launchPlaywright, playwrightUtils } from '@crawlee/playwright';
import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import { runExampleComServer } from 'test/shared/_helper';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

let serverAddress = 'http://localhost:';
let port: number;
let server: Server;

beforeAll(async () => {
    [server, port] = await runExampleComServer();
    serverAddress += port;
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
                await page.goto(serverAddress);
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
                await page.goto(serverAddress);
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
                await page.goto(serverAddress);

                const $ = await playwrightUtils.parseWithCheerio(page);

                const title = $('h1').text().trim();
                expect(title).toBe('Example Domain');
            } finally {
                await browser.close();
            }
        });

        describe('blockRequests()', () => {
            let browser: Browser = null;
            beforeAll(async () => {
                browser = await launchName(launchContext);
            });
            afterAll(async () => {
                await browser.close();
            });

            test('works with default values', async () => {
                const loadedUrls: string[] = [];

                const page = await browser.newPage();
                await playwrightUtils.blockRequests(page);
                page.on('response', (response) => loadedUrls.push(response.url()));
                await page.setContent(`<html><body>
                <link rel="stylesheet" type="text/css" href="${serverAddress}/style.css">
                <img src="${serverAddress}/image.png">
                <img src="${serverAddress}/image.gif">
                <script src="${serverAddress}/script.js" defer="defer">></script>
            </body></html>`, { waitUntil: 'load' });
                expect(loadedUrls).toEqual([`${serverAddress}/script.js`]);
            });

            test('works with overridden values', async () => {
                const loadedUrls: string[] = [];

                const page = await browser.newPage();
                await playwrightUtils.blockRequests(page, {
                    urlPatterns: ['.css'],
                });
                page.on('response', (response) => loadedUrls.push(response.url()));
                await page.setContent(`<html><body>
                <link rel="stylesheet" type="text/css" href="${serverAddress}/style.css">
                <img src="${serverAddress}/image.png">
                <img src="${serverAddress}/image.gif">
                <script src="${serverAddress}/script.js" defer="defer">></script>
            </body></html>`, { waitUntil: 'load' });
                expect(loadedUrls).toEqual(expect.arrayContaining([
                    `${serverAddress}/image.png`,
                    `${serverAddress}/script.js`,
                    `${serverAddress}/image.gif`,
                ]));
            });
        });

        test('gotoExtended() works', async () => {
            const browser = await chromium.launch({ headless: true });

            try {
                const page = await browser.newPage();
                const request = new Request({
                    url: `${serverAddress}/special/getDebug`,
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

        describe('infiniteScroll()', () => {
            function isAtBottom() {
                return (window.innerHeight + window.pageYOffset) >= document.body.offsetHeight;
            }

            let browser: Browser;
            beforeAll(async () => {
                browser = await chromium.launch({ headless: true });
            });
            afterAll(async () => {
                await browser.close();
            });

            let page: Page;
            beforeEach(async () => {
                page = await browser.newPage();
                let count = 0;
                const content = Array(1000).fill(null).map(() => {
                    return `<div style="border: 1px solid black">Div number: ${count++}</div>`;
                });
                const contentHTML = `<html><body>${content}</body></html>`;
                await page.setContent(contentHTML);
            });
            afterEach(async () => {
                await page.close();
            });

            test('works', async () => {
                const before = await page.evaluate(isAtBottom);
                expect(before).toBe(false);

                await playwrightUtils.infiniteScroll(page, { waitForSecs: 0 });

                const after = await page.evaluate(isAtBottom);
                expect(after).toBe(true);
            });

            test('maxScrollHeight works', async () => {
                const before = await page.evaluate(isAtBottom);
                expect(before).toBe(false);

                await playwrightUtils.infiniteScroll(page, {
                    waitForSecs: Infinity,
                    maxScrollHeight: 1000,
                    stopScrollCallback: async () => true,
                });

                const after = await page.evaluate(isAtBottom);
                // It scrolls to the bottom in the first scroll so this is correct.
                // The test passes because the Infinite waitForSecs is broken by the height requirement.
                // If it didn't, the test would time out.
                expect(after).toBe(true);
            });

            test('stopScrollCallback works', async () => {
                const before = await page.evaluate(isAtBottom);
                expect(before).toBe(false);

                await playwrightUtils.infiniteScroll(page, {
                    waitForSecs: Infinity,
                    stopScrollCallback: async () => true,
                });

                const after = await page.evaluate(isAtBottom);
                expect(after).toBe(true);
            });
        });

        test('saveSnapshot() works', async () => {
            const openKVSSpy = jest.spyOn(KeyValueStore, 'open');
            const browser = await chromium.launch({ headless: true });

            try {
                const page = await browser.newPage();
                const contentHTML = '<html><head></head><body><div style="border: 1px solid black">Div number: 1</div></body></html>';
                await page.setContent(contentHTML);

                const screenshot = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 60 });

                // Test saving both image and html
                const object = { setValue: jest.fn() };
                openKVSSpy.mockResolvedValue(object as any);
                await playwrightUtils.saveSnapshot(page, { key: 'TEST', keyValueStoreName: 'TEST-STORE', screenshotQuality: 60 });

                expect(object.setValue).toBeCalledWith('TEST.jpg', screenshot, { contentType: 'image/jpeg' });
                expect(object.setValue).toBeCalledWith('TEST.html', contentHTML, { contentType: 'text/html' });
                object.setValue.mockReset();

                // Test saving only image
                await playwrightUtils.saveSnapshot(page, { saveHtml: false });

                // Default quality is 50
                const screenshot2 = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 50 });
                expect(object.setValue).toBeCalledWith('SNAPSHOT.jpg', screenshot2, { contentType: 'image/jpeg' });
            } finally {
                openKVSSpy.mockRestore();
                await browser.close();
            }
        });
    });
});
