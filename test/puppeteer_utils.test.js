import sinon from 'sinon';
import path from 'path';
import express from 'express';
import Apify from '../build/index';
import * as keyValueStore from '../build/storages/key_value_store';
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

describe('Apify.utils.puppeteer', () => {
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
        ['launchPuppeteer', { launchOptions: { headless: true } }],
        // ['launchPlaywright', { launchOptions: { headless: true } }],
    ])('with %s', (launchName, launchContext) => {
        test('injectFile()', async () => {
        /* eslint-disable no-shadow */
            const browser = await Apify[launchName](launchContext);
            const survive = async (browser) => {
            // Survive navigations
                const page = await browser.newPage();
                let result = await page.evaluate(() => window.injectedVariable === 42);
                expect(result).toBe(false);
                await Apify.utils.puppeteer.injectFile(page, path.join(__dirname, 'data', 'inject_file.txt'), { surviveNavigations: true });
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
                await Apify.utils.puppeteer.injectFile(page, path.join(__dirname, 'data', 'inject_file.txt'));
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

                await Apify.utils.puppeteer.injectJQuery(page);
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

        test('injectUnderscore()', async () => {
            const browser = await Apify[launchName](launchContext);

            try {
                const page = await browser.newPage();
                await page.goto('about:blank');

                const result1 = await page.evaluate(() => {
                    return { isDefined: window._ !== undefined };
                });
                expect(result1).toEqual({ isDefined: false });

                await Apify.utils.puppeteer.injectUnderscore(page);
                const result2 = await page.evaluate(() => {
                /* global _ */
                    return { isDefined: _.isEmpty({}) };
                });
                expect(result2).toEqual({ isDefined: true });
            } finally {
                await browser.close();
            }
        });

        describe('blockRequests()', () => {
            let browser = null;
            beforeAll(async () => {
                browser = await Apify[launchName](launchContext);
            });
            afterAll(async () => {
                await browser.close();
            });

            test('works with default values', async () => {
                const loadedUrls = [];

                const page = await browser.newPage();
                await Apify.utils.puppeteer.blockRequests(page);
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
                const loadedUrls = [];

                const page = await browser.newPage();
                await Apify.utils.puppeteer.blockRequests(page, {
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
                const loadedUrls = [];

                const page = await browser.newPage();
                await Apify.utils.puppeteer.blockResources(page);
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
                const loadedUrls = [];

                const page = await browser.newPage();
                await Apify.utils.puppeteer.blockResources(page, ['script']);
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
            const browser = await Apify[launchName](launchContext);
            const cache = {};

            const getResourcesLoadedFromWiki = async () => {
                let downloadedBytes = 0;
                const page = await browser.newPage();
                await page.setDefaultNavigationTimeout(0);
                // Cache all javascript files, png files and svg files
                await Apify.utils.puppeteer.cacheResponses(page, cache, ['.js', /.+\.png/i, /.+\.svg/i]);
                page.on('response', async (response) => {
                    if (cache[response.url()]) return;
                    try {
                        const buffer = await response.buffer();
                        downloadedBytes += buffer.byteLength;
                    } catch (e) {
                    // do nothing
                    }
                });
                await page.goto('https://www.wikipedia.org/', { waitUntil: 'networkidle0' });
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

        test(
            'cacheResponses() throws when rule with invalid type is provided',
            async () => {
                const mockedPage = {
                    setRequestInterception: () => {},
                    on: () => {},
                };

                const testRuleType = async (value) => {
                    try {
                        await Apify.utils.puppeteer.cacheResponses(mockedPage, {}, [value]);
                    } catch (error) {
                    // this is valid path for this test
                        return;
                    }

                    expect(`Rule '${value}' should have thrown error`).toBe('');
                };
                await testRuleType(0);
                await testRuleType(1);
                await testRuleType(null);
                await testRuleType([]);
                await testRuleType(['']);
                await testRuleType(() => {});
            },
        );

        test('compileScript() works', async () => {
            const { compileScript } = Apify.utils.puppeteer;
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
                expect(err.message).toMatch(/Unexpected token '?const'?/);
            }
            const browser = await Apify[launchName](launchContext);
            try {
                const page = await browser.newPage();
                const content = await script({ page });
                expect(typeof content).toBe('string');
                expect(content).toBe('<html><head></head><body></body></html>');
            } finally {
                await browser.close();
            }
        });

        test('gotoExtended() works', async () => {
            const browser = await Apify[launchName](launchContext);

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

                const response = await Apify.utils.puppeteer.gotoExtended(page, request);

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

            let browser;
            beforeAll(async () => {
                browser = await Apify.launchPuppeteer({ launchOptions: { headless: true } });
            });
            afterAll(async () => {
                await browser.close();
            });

            let page;
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

                await Apify.utils.puppeteer.infiniteScroll(page, { waitForSecs: 0 });

                const after = await page.evaluate(isAtBottom);
                expect(after).toBe(true);
            });

            test('stopScrollCallback works', async () => {
                const before = await page.evaluate(isAtBottom);
                expect(before).toBe(false);

                await Apify.utils.puppeteer.infiniteScroll(page, {
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
            const mock = sinon.mock(keyValueStore);
            const browser = await Apify[launchName](launchContext);
            try {
                const page = await browser.newPage();
                const contentHTML = '<html><head></head><body><div style="border: 1px solid black">Div number: 1</div></body></html>';
                await page.setContent(contentHTML);

                const screenshot = await page.screenshot({ fullPage: true, type: 'jpeg', screenshotQuality: 60 });

                // Test saving both image and html
                const object = { setValue: async () => {} };
                const stub = sinon.stub(object, 'setValue');

                mock.expects('openKeyValueStore')
                    .once()
                    .withExactArgs('TEST-STORE')
                    .resolves(object);

                await Apify.utils.puppeteer.saveSnapshot(page, { key: 'TEST', keyValueStoreName: 'TEST-STORE', screenshotQuality: 60 });

                expect(stub.calledWithExactly('TEST.jpg', screenshot, { contentType: 'image/jpeg' })).toBe(true);
                expect(stub.calledWithExactly('TEST.html', contentHTML, { contentType: 'text/html' })).toBe(true);

                // Test saving only image
                const object2 = { setValue: async () => {} };
                const stub2 = sinon.stub(object2, 'setValue');
                mock.expects('openKeyValueStore')
                    .withExactArgs(undefined)
                    .resolves(object2);

                await Apify.utils.puppeteer.saveSnapshot(page, { saveHtml: false });

                // Default quality is 50
                const screenshot2 = await page.screenshot({ fullPage: true, type: 'jpeg', screenshotQuality: 50 });
                expect(stub2.calledOnceWithExactly('SNAPSHOT.jpg', screenshot2, { contentType: 'image/jpeg' })).toBe(true);

                mock.verify();
            } finally {
                await browser.close();
            }
        });
    });
});
