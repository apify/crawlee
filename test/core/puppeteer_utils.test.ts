import path from 'path';
import express from 'express';
import log from '@apify/log';
import { KeyValueStore, launchPuppeteer, puppeteerUtils, Request } from '@crawlee/puppeteer';
import type { Dictionary } from '@crawlee/utils';
import type { Browser, Page, ResponseForRequest } from 'puppeteer';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
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
    port = (server.address() as AddressInfo).port; //eslint-disable-line
});

afterAll(() => {
    server.close();
});

describe('puppeteerUtils', () => {
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
        [launchPuppeteer, { launchOptions: { headless: true } }],
    ] as const)('with %s', (method, launchContext) => {
        test('injectFile()', async () => {
            const browser2 = await method(launchContext);
            const survive = async (browser: Browser) => {
                // Survive navigations
                const page = await browser.newPage();
                // @ts-expect-error
                let result = await page.evaluate(() => window.injectedVariable === 42);
                expect(result).toBe(false);
                await puppeteerUtils.injectFile(page, path.join(__dirname, '..', 'shared', 'data', 'inject_file.txt'), { surviveNavigations: true });
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
                await puppeteerUtils.injectFile(page, path.join(__dirname, '..', 'shared', 'data', 'inject_file.txt'));
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
            const browser = await method(launchContext);

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

                await puppeteerUtils.injectJQuery(page);
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
            const browser = await method(launchContext);

            try {
                const page = await browser.newPage();
                await page.goto('https://www.example.com');

                const $ = await puppeteerUtils.parseWithCheerio(page);

                const title = $('h1').text().trim();
                expect(title).toBe('Example Domain');
            } finally {
                await browser.close();
            }
        });

        describe('blockRequests()', () => {
            let browser: Browser = null;
            beforeAll(async () => {
                browser = await method(launchContext);
            });
            afterAll(async () => {
                await browser.close();
            });

            test('works with default values', async () => {
                const loadedUrls: string[] = [];

                const page = await browser.newPage();
                await puppeteerUtils.blockRequests(page);
                page.on('response', (response) => loadedUrls.push(response.url()));
                await page.setContent(`<html><body>
                <link rel="stylesheet" type="text/css" href="https://example.com/style.css">
                <img src="https://example.com/image.png">
                <img src="https://example.com/image.gif">
                <script src="https://example.com/script.js" defer="defer">></script>
            </body></html>`, { waitUntil: 'load' });
                expect(loadedUrls).toEqual(['https://example.com/script.js']);
            });

            test('works with overridden values', async () => {
                const loadedUrls: string[] = [];

                const page = await browser.newPage();
                await puppeteerUtils.blockRequests(page, {
                    urlPatterns: ['.css'],
                });
                page.on('response', (response) => loadedUrls.push(response.url()));
                await page.setContent(`<html><body>
                <link rel="stylesheet" type="text/css" href="https://example.com/style.css">
                <img src="https://example.com/image.png">
                <img src="https://example.com/image.gif">
                <script src="https://example.com/script.js" defer="defer">></script>
            </body></html>`, { waitUntil: 'load' });
                expect(loadedUrls).toEqual(expect.arrayContaining([
                    'https://example.com/image.png',
                    'https://example.com/script.js',
                    'https://example.com/image.gif',
                ]));
            });

            test('blockResources() supports default values', async () => {
                const loadedUrls: string[] = [];

                const page = await browser.newPage();
                await puppeteerUtils.blockResources(page);
                page.on('response', (response) => loadedUrls.push(response.url()));
                await page.setContent(`<html><body>
                <link rel="stylesheet" type="text/css" href="https://example.com/style.css">
                <img src="https://example.com/image.png" />
                <script src="https://example.com/script.js" defer="defer">></script>
            </body></html>`, { waitUntil: 'load' });

                expect(loadedUrls).toEqual(expect.arrayContaining([
                    'https://example.com/script.js',
                ]));
            });

            test('blockResources() supports nondefault values', async () => {
                const loadedUrls: string[] = [];

                const page = await browser.newPage();
                await puppeteerUtils.blockResources(page, ['script']);
                page.on('response', (response) => loadedUrls.push(response.url()));
                await page.setContent(`<html><body>
                <link rel="stylesheet" type="text/css" href="https://example.com/style.css">
                <img src="https://example.com/image.png" />
                <script src="https://example.com/script.js" defer="defer">></script>
            </body></html>`, { waitUntil: 'load' });

                expect(loadedUrls).toEqual(expect.arrayContaining([
                    'https://example.com/style.css',
                    'https://example.com/image.png',
                ]));
            });
        });

        test('supports cacheResponses()', async () => {
            const browser = await method(launchContext);
            const cache: Dictionary<Partial<ResponseForRequest>> = {};

            const getResourcesLoadedFromWiki = async () => {
                let downloadedBytes = 0;
                const page = await browser.newPage();
                await page.setDefaultNavigationTimeout(0);
                // Cache all javascript files, png files and svg files
                await puppeteerUtils.cacheResponses(page, cache, ['.js', /.+\.png/i, /.+\.svg/i]);
                page.on('response', async (response) => {
                    if (cache[response.url()]) return;
                    try {
                        const buffer = await response.buffer();
                        downloadedBytes += buffer.byteLength;
                    } catch (e) {
                    // do nothing
                    }
                });
                await page.goto('https://www.wikipedia.org/', { waitUntil: 'networkidle0', timeout: 60e3 });
                await page.close();
                return downloadedBytes;
            };

            try {
                const bytesDownloadedOnFirstRun = await getResourcesLoadedFromWiki();
                const bytesDownloadedOnSecondRun = await getResourcesLoadedFromWiki();
                expect(bytesDownloadedOnSecondRun).toBeLessThan(bytesDownloadedOnFirstRun);
            } finally {
                await browser.close();
            }
        });

        test('cacheResponses() throws when rule with invalid type is provided', async () => {
            const mockedPage = {
                setRequestInterception: () => {},
                on: () => {},
            };

            const testRuleType = async (value: string | RegExp) => {
                try {
                    await puppeteerUtils.cacheResponses(mockedPage as any, {}, [value]);
                } catch (error) {
                    // this is valid path for this test
                    return;
                }

                expect(`Rule '${value}' should have thrown error`).toBe('');
            };

            // @ts-expect-error
            await testRuleType(0);
            // @ts-expect-error
            await testRuleType(1);
            await testRuleType(null);
            // @ts-expect-error
            await testRuleType([]);
            // @ts-expect-error
            await testRuleType(['']);
            // @ts-expect-error
            await testRuleType(() => {});
        });

        test('compileScript() works', async () => {
            const { compileScript } = puppeteerUtils;
            const scriptStringGood = 'await page.goto("about:blank"); return await page.content();';
            const scriptStringBad = 'for const while';
            const script = compileScript(scriptStringGood);

            expect(typeof script).toBe('function');
            expect(script.toString()).toEqual(`async ({ page, request }) => {${scriptStringGood}}`);

            try {
                compileScript(scriptStringBad);
                throw new Error('Should fail.');
            } catch (err) {
                // TODO figure out why the err.message comes out empty in the logs.
                expect((err as Error).message).toMatch(/Unexpected token '?const'?/);
            }
            const browser = await method(launchContext);
            try {
                const page = await browser.newPage();
                const content = await script({ page } as any);
                expect(typeof content).toBe('string');
                expect(content).toBe('<html><head></head><body></body></html>');
            } finally {
                await browser.close();
            }
        });

        test('gotoExtended() works', async () => {
            const browser = await method(launchContext);

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

                const response = await puppeteerUtils.gotoExtended(page, request);

                // eslint-disable-next-line @typescript-eslint/no-shadow
                const { method, headers, bodyLength } = JSON.parse(await response.text());
                expect(method).toBe('POST');
                expect(bodyLength).toBe(16);
                expect(headers['content-type']).toBe('application/json; charset=utf-8');
            } finally {
                await browser.close();
            }
        });

        describe('infiniteScroll()', () => {
            function isAtBottom() {
                return (window.innerHeight + window.pageYOffset) >= document.body.offsetHeight;
            }

            let browser: Browser;
            beforeAll(async () => {
                browser = await launchPuppeteer({ launchOptions: { headless: true } });
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

                await puppeteerUtils.infiniteScroll(page, { waitForSecs: 0 });

                const after = await page.evaluate(isAtBottom);
                expect(after).toBe(true);
            });

            test('stopScrollCallback works', async () => {
                const before = await page.evaluate(isAtBottom);
                expect(before).toBe(false);

                await puppeteerUtils.infiniteScroll(page, {
                    waitForSecs: Infinity,
                    stopScrollCallback: async () => true,
                });

                const after = await page.evaluate(isAtBottom);
                // It scrolls to the bottom in the first scroll so this is correct.
                // The test passes because the Infinite waitForSecs is broken by the callback.
                // If it didn't, the test would time out.
                expect(after).toBe(true);
            });
        });

        it('saveSnapshot() works', async () => {
            const openKVSSpy = jest.spyOn(KeyValueStore, 'open');
            const browser = await method(launchContext);

            try {
                const page = await browser.newPage();
                const contentHTML = '<html><head></head><body><div style="border: 1px solid black">Div number: 1</div></body></html>';
                await page.setContent(contentHTML);

                const screenshot = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 60 });

                // Test saving both image and html
                const object = { setValue: jest.fn() };
                openKVSSpy.mockResolvedValue(object as any);
                await puppeteerUtils.saveSnapshot(page, { key: 'TEST', keyValueStoreName: 'TEST-STORE', screenshotQuality: 60 });

                expect(object.setValue).toBeCalledWith('TEST.jpg', screenshot, { contentType: 'image/jpeg' });
                expect(object.setValue).toBeCalledWith('TEST.html', contentHTML, { contentType: 'text/html' });
                object.setValue.mockReset();

                // Test saving only image
                await puppeteerUtils.saveSnapshot(page, { saveHtml: false });

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
