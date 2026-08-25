import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';

import type { PlaywrightCrawlingContext, Request } from '@crawlee/playwright';
import { type ConcurrencySystem, MemoryStorageBackend, serviceLocator } from '@crawlee/core';
import {
    createPlaywrightRouter,
    PlaywrightCrawler,
    playwrightBrowserPool,
    RequestList,
    RequestValidationError,
} from '@crawlee/playwright';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { sleep } from '@crawlee/utils';
import express from 'express';
import playwright from 'playwright';
import { z } from 'zod';

import log from '@apify/log';

import { startExpressAppPromise } from '../../shared/_helper.js';

if (os.platform() === 'win32') vitest.setConfig({ testTimeout: 2 * 60 * 1e3 });

describe('PlaywrightCrawler', () => {
    let prevEnvHeadless: string | undefined;
    let logLevel: number;
    let requestList: RequestList;

    const HOSTNAME = '127.0.0.1';
    let port: number;
    let server: Server;

    beforeAll(async () => {
        const app = express();
        server = await startExpressAppPromise(app, 0);
        port = (server.address() as AddressInfo).port;
        app.get('/', (_req, res) => {
            res.send(`<html><head><title>Example Domain</title></head></html>`);
            res.status(200);
        });
        // never responds, so a navigation to it runs until the navigation timeout
        app.get('/hang', () => {});
        app.get('/page-with-download', (_req, res) => {
            res.status(200).send(
                `<html><body><a id="download-link" href="/download-file" download="hello.txt">download</a></body></html>`,
            );
        });
        app.get('/download-file', (_req, res) => {
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', 'attachment; filename="hello.txt"');
            res.send('hello');
        });
    });

    beforeAll(async () => {
        prevEnvHeadless = process.env.CRAWLEE_HEADLESS;
        process.env.CRAWLEE_HEADLESS = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());

        const sources = [`http://${HOSTNAME}:${[port]}/`];
        requestList = await RequestList.open(`sources-${Math.random() * 10000}`, sources);
    });

    afterAll(async () => {
        log.setLevel(logLevel);
        process.env.CRAWLEE_HEADLESS = prevEnvHeadless;
    });
    afterAll(async () => {
        server.close();
    });

    vitest.setConfig({ testTimeout: 2 * 60 * 1e3 });
    describe('should work', () => {
        // @TODO: add webkit
        test.each(['chromium', 'firefox'] as const)('with %s', async (browser) => {
            const sourcesLarge = [
                { url: `http://${HOSTNAME}:${port}/?q=1` },
                { url: `http://${HOSTNAME}:${port}/?q=2` },
                { url: `http://${HOSTNAME}:${port}/?q=3` },
                { url: `http://${HOSTNAME}:${port}/?q=4` },
                { url: `http://${HOSTNAME}:${port}/?q=5` },
                { url: `http://${HOSTNAME}:${port}/?q=6` },
            ];
            const sourcesCopy = JSON.parse(JSON.stringify(sourcesLarge));
            const processed: Request[] = [];
            const failed: Request[] = [];
            const requestListLarge = await RequestList.open({ sources: sourcesLarge });
            const requestHandler = async ({ page, request, response, useState }: PlaywrightCrawlingContext) => {
                await useState([]);
                expect(response!.status()).toBe(200);
                request.userData.title = await page.title();
                processed.push(request);
                expect(response!.request().headers()['user-agent']).not.toMatch(/headless/i);

                // firefox now also returns `webdriver: true` since playwright 1.45, we are masking this via fingerprints,
                // but this test has them disabled, so we can check the default handling (= there is non-default UA even without them)
                if (browser !== 'firefox') {
                    await expect(page.evaluate(() => window.navigator.webdriver)).resolves.toBeFalsy();
                }
            };

            const playwrightCrawler = new PlaywrightCrawler({
                browserPool: playwrightBrowserPool({
                    launchContext: { launcher: playwright[browser] },
                    useFingerprints: false,
                }),
                requestList: requestListLarge,
                minConcurrency: 1,
                maxConcurrency: 1,
                requestHandler,
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            await playwrightCrawler.run();

            expect((playwrightCrawler.concurrencySystem! as ConcurrencySystem).minConcurrency).toBe(1);
            expect(processed).toHaveLength(6);
            expect(failed).toHaveLength(0);

            processed.forEach((request, id) => {
                expect(request.url).toEqual(sourcesCopy[id].url);
                expect(request.userData.title).toBe('Example Domain');
            });
        });
    });

    // https://github.com/apify/crawlee/issues/3670
    test('should not silently drop requests when BrowserPool.newPage() times out', async () => {
        const success: string[] = [];
        const failure: string[] = [];

        const crawler = new PlaywrightCrawler({
            maxRequestRetries: 0,
            browserPool: playwrightBrowserPool({ operationTimeoutSecs: 0.001 }),
            requestHandler: async ({ request }) => {
                success.push(request.url);
            },
            failedRequestHandler: async ({ request }) => {
                failure.push(request.url);
            },
        });

        const urls = [
            `http://${HOSTNAME}:${port}/?q=1`,
            `http://${HOSTNAME}:${port}/?q=2`,
            `http://${HOSTNAME}:${port}/?q=3`,
            `http://${HOSTNAME}:${port}/?q=4`,
            `http://${HOSTNAME}:${port}/?q=5`,
        ];

        const stats = await crawler.run(urls);

        // Every request must be accounted for by either requestHandler or failedRequestHandler.
        expect(success.length + failure.length).toBe(urls.length);
        // With operationTimeoutSecs=0.001, no request can actually succeed, so every one must fail.
        expect(stats.requestsFinished).toBe(0);
        expect(stats.requestsFailed).toBe(urls.length);
    });

    test('should override goto timeout with navigationTimeoutSecs', async () => {
        const timeoutSecs = 10;
        // Captured by value: `navigate()` narrows the live `gotoOptions` down to the remaining navigation window.
        let gotoTimeout: number | undefined;
        const playwrightCrawler = new PlaywrightCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: () => {},
            preNavigationHooks: [
                ({ gotoOptions }) => {
                    gotoTimeout = gotoOptions.timeout;
                },
            ],
            navigationTimeoutSecs: timeoutSecs,
        });

        await playwrightCrawler.run();
        expect(gotoTimeout).toEqual(timeoutSecs * 1000);
    });

    test('does not mutate the launchContext it was given', () => {
        const options = {
            launchContext: {},
            headless: false,
            requestHandler: async () => {},
        };

        void new PlaywrightCrawler(options);

        expect(options.launchContext).toEqual({});
    });

    describe('playwrightBrowserPool', () => {
        test('runs a plugin for the requested browser and forwards the pool options', () => {
            const browserPool = playwrightBrowserPool({
                maxOpenPagesPerBrowser: 3,
                headless: false,
                launchContext: { launcher: playwright.firefox },
            });

            expect(browserPool.maxOpenPagesPerBrowser).toBe(3);
            expect(browserPool.browserPlugins).toHaveLength(1);
            expect(browserPool.browserPlugins[0].library).toBe(playwright.firefox);
            expect(browserPool.browserPlugins[0].launchOptions).toMatchObject({ headless: false });
        });

        test('turns off fingerprint injection when a custom userAgent is given', () => {
            expect(
                playwrightBrowserPool({ launchContext: { userAgent: 'Definitely Not A Crawler' } }).useFingerprints,
            ).toBe(false);
        });

        test('is rejected by the crawler alongside the options that would configure its own pool', () => {
            const browserPool = playwrightBrowserPool();

            expect(() => new PlaywrightCrawler({ browserPool, headless: false })).toThrow(
                'PlaywrightCrawler: `headless` cannot be combined with `browserPool`',
            );
            expect(
                () => new PlaywrightCrawler({ browserPool, launchContext: { launcher: playwright.firefox } }),
            ).toThrow('PlaywrightCrawler: `launchContext` cannot be combined with `browserPool`');
            expect(() => new PlaywrightCrawler({ browserPool })).not.toThrow();
        });
    });

    test.each([{ useIncognitoPages: true }, { useIncognitoPages: false }])(
        'should apply launchOptions with useIncognitoPages: $useIncognitoPages',
        async ({ useIncognitoPages }) => {
            // Some launch options apply to the browser, while some apply to the context.
            // Here we use some context options to verify that those are actually applied.
            const launchOptions = {
                locale: 'cz-CZ',
                reducedMotion: 'reduce' as const,
                timezoneId: 'Pacific/Tahiti',
            };

            let [timezone, locale, reducedMotion] = ['', '', ''];

            const playwrightCrawler = new PlaywrightCrawler({
                maxConcurrency: 1,
                browserPool: playwrightBrowserPool({
                    launchContext: { useIncognitoPages, launchOptions },
                    // don't overwrite locale with fingerprint's locale
                    useFingerprints: false,
                }),
                requestHandler: async ({ page }) => {
                    [timezone, locale, reducedMotion] = await Promise.all([
                        page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
                        page.evaluate(() => navigator.language),
                        page.evaluate(() => {
                            return window.matchMedia('(prefers-reduced-motion: reduce)').matches
                                ? 'reduce'
                                : 'no-preference';
                        }),
                    ]);
                },
            });

            await playwrightCrawler.run([`http://${HOSTNAME}:${port}/`]);

            expect(timezone).toBe(launchOptions.timezoneId);
            expect(locale).toBe(launchOptions.locale);
            expect(reducedMotion).toBe(launchOptions.reducedMotion);
        },
    );

    test('exposes triggered downloads via listDownloads()', async () => {
        let countBefore = -1;
        let countAfter = -1;
        let suggestedFilename: string | undefined;

        const playwrightCrawler = new PlaywrightCrawler({
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: async ({ page, listDownloads }) => {
                countBefore = (await listDownloads()).length;

                const downloadPromise = page.waitForEvent('download');
                await page.click('a#download-link');
                await downloadPromise;

                const downloads = await listDownloads();
                countAfter = downloads.length;
                suggestedFilename = downloads[0]?.suggestedFilename();
            },
        });

        await playwrightCrawler.run([`http://${HOSTNAME}:${port}/page-with-download`]);

        expect(countBefore).toBe(0);
        expect(countAfter).toBe(1);
        expect(suggestedFilename).toBe('hello.txt');
    });

    test('should have correct types in crawling context', async () => {
        const requestHandler = async (crawlingContext: PlaywrightCrawlingContext) => {
            // Checking that types are correct
            const $ = await crawlingContext.parseWithCheerio();

            const _apiType: CheerioAPI = $;
            const _cheerioElementType: Cheerio<Element> = $('div');
        };

        const playwrightCrawler = new PlaywrightCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler,
        });
        await playwrightCrawler.run();
    });

    test('validates userData against the router schema when adding requests', async () => {
        const router = createPlaywrightRouter({
            DETAIL: z.object({ id: z.string() }),
        });
        router.addHandler('DETAIL', async () => {});

        const crawler = new PlaywrightCrawler({ requestHandler: router });

        await expect(
            crawler.addRequests([
                { url: `http://${HOSTNAME}:${port}/`, label: 'DETAIL', userData: { id: 123 } },
            ] as never),
        ).rejects.toThrow(RequestValidationError);
    });

    describe('timeouts', () => {
        test('a hanging preNavigationHook times out after navigationTimeoutSecs', async () => {
            const failed: Request[] = [];
            const requestHandler = vitest.fn();

            const crawler = new PlaywrightCrawler({
                requestList,
                navigationTimeoutSecs: 0.1,
                maxRequestRetries: 0,
                preNavigationHooks: [async () => sleep(3000)],
                requestHandler,
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            await crawler.run();

            expect(requestHandler).not.toHaveBeenCalled();
            expect(failed).toHaveLength(1);
            expect(failed[0].errorMessages[0]).toMatch('Navigation timed out');
            // the hook is neither the navigation nor the request handler
            expect(failed[0].errorMessages[0]).not.toMatch('requestHandler timed out');
        });

        test('a slow navigation reports the configured window, not the driver value', async () => {
            const failed: Request[] = [];
            const requestList = await RequestList.open(`sources-${Math.random() * 10000}`, [
                `http://${HOSTNAME}:${port}/hang`,
            ]);

            const crawler = new PlaywrightCrawler({
                requestList,
                navigationTimeoutSecs: 2,
                maxRequestRetries: 0,
                // eat most of the window, so the goto is handed a small remaining budget - the driver would
                // otherwise report that raw value ("Timeout NNNms exceeded") instead of the configured window
                preNavigationHooks: [async () => sleep(1500)],
                requestHandler: () => {},
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            await crawler.run();

            expect(failed).toHaveLength(1);
            expect(failed[0].errorMessages[0]).toMatch('Navigation timed out after 2 seconds');
            expect(failed[0].errorMessages[0]).not.toMatch(/Timeout \d+ms exceeded/);
        });

        test('a hook can disable the navigation timeout with gotoOptions.timeout = 0', async () => {
            const processed: Request[] = [];
            const failed: Request[] = [];

            const crawler = new PlaywrightCrawler({
                requestList,
                navigationTimeoutSecs: 0.5,
                maxRequestRetries: 0,
                // `0` is Playwright's "no timeout"; it must be honoured verbatim, not clamped to 1ms (which would
                // make the navigation time out immediately)
                preNavigationHooks: [
                    ({ gotoOptions }) => {
                        gotoOptions.timeout = 0;
                    },
                ],
                requestHandler: ({ request }) => {
                    processed.push(request);
                },
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            await crawler.run();

            expect(failed).toHaveLength(0);
            expect(processed).toHaveLength(1);
        });

        test('extendTimeout from a preNavigationHook keeps it from timing out', async () => {
            const processed: Request[] = [];
            const failed: Request[] = [];

            const crawler = new PlaywrightCrawler({
                requestList,
                navigationTimeoutSecs: 0.3,
                maxRequestRetries: 0,
                // 600ms total, past the 0.3s window - only survives because the hook asks for more time
                preNavigationHooks: [
                    async ({ extendTimeout }) => {
                        await sleep(150);
                        extendTimeout(5);
                        await sleep(450);
                    },
                ],
                requestHandler: ({ request }) => {
                    processed.push(request);
                },
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            await crawler.run();

            expect(failed).toHaveLength(0);
            expect(processed).toHaveLength(1);
        });

        test('extendTimeout from a postNavigationHook keeps it from timing out', async () => {
            const processed: Request[] = [];
            const failed: Request[] = [];

            const crawler = new PlaywrightCrawler({
                requestList,
                // enough for the navigation, but far short of the hook below
                navigationTimeoutSecs: 1,
                maxRequestRetries: 0,
                postNavigationHooks: [
                    async ({ extendTimeout }) => {
                        // the navigation already spent part of the shared window, so ask for more up front,
                        // then take far longer than the window would otherwise have allowed
                        extendTimeout(5);
                        await sleep(2000);
                    },
                ],
                requestHandler: ({ request }) => {
                    processed.push(request);
                },
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            await crawler.run();

            expect(failed).toHaveLength(0);
            expect(processed).toHaveLength(1);
        });

        test('a route can override requestHandlerTimeoutSecs, other routes keep the default', async () => {
            const requestList = await RequestList.open(`sources-${Math.random() * 10000}`, [
                { url: `http://${HOSTNAME}:${port}/?type=list`, label: 'LIST' },
                { url: `http://${HOSTNAME}:${port}/?type=detail`, label: 'DETAIL' },
            ]);

            const processed: (string | undefined)[] = [];
            const failed: (string | undefined)[] = [];

            const router = createPlaywrightRouter();
            // LIST is allowed to take its time, DETAIL is left on the crawler's short default
            router.addHandler(
                'LIST',
                async ({ request }) => {
                    await sleep(600);
                    processed.push(request.label);
                },
                { requestHandlerTimeoutSecs: 5 },
            );
            router.addHandler('DETAIL', async ({ request }) => {
                await sleep(600);
                processed.push(request.label);
            });

            const crawler = new PlaywrightCrawler({
                requestList,
                requestHandlerTimeoutSecs: 0.3,
                maxRequestRetries: 0,
                maxConcurrency: 2,
                requestHandler: router,
                failedRequestHandler: ({ request }) => {
                    failed.push(request.label);
                },
            });

            await crawler.run();

            // only DETAIL is held to the 0.3s default; LIST got its own 5s and finished
            expect(failed).toEqual(['DETAIL']);
            expect(processed).toContain('LIST');
        });

        test('extendTimeout from the request handler keeps it from timing out', async () => {
            const processed: Request[] = [];
            const failed: Request[] = [];

            const crawler = new PlaywrightCrawler({
                requestList,
                requestHandlerTimeoutSecs: 0.3,
                maxRequestRetries: 0,
                requestHandler: async ({ request, extendTimeout }) => {
                    await sleep(150);
                    extendTimeout(5);
                    await sleep(450);
                    processed.push(request);
                },
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            await crawler.run();

            expect(failed).toHaveLength(0);
            expect(processed).toHaveLength(1);
        });
    });
});
