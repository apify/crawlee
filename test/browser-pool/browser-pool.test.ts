import http from 'node:http';
import { promisify } from 'node:util';

import { sleep } from 'crawlee';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import playwright from 'playwright';
import type { Server as ProxyChainServer } from 'proxy-chain';
// @ts-ignore This only throws when compiled against puppeteer 25+ (ESM only), we only import types, so its alllll gooooood
import type { Page } from 'puppeteer';
// @ts-ignore This only throws when compiled against puppeteer 25+ (ESM only), vitest executes tests as ESM, so its alllll gooooood
import puppeteer from 'puppeteer';

import { addTimeoutToPromise, tryCancel } from '@apify/timeout';

import type { BrowserController } from '../../packages/browser-pool/src/abstract-classes/browser-controller.js';
import { BrowserPool } from '../../packages/browser-pool/src/browser-pool.js';
import { BROWSER_POOL_EVENTS } from '../../packages/browser-pool/src/events.js';
import { BrowserName, OperatingSystemsName } from '../../packages/browser-pool/src/fingerprinting/types.js';
import { PlaywrightPlugin } from '../../packages/browser-pool/src/playwright/playwright-plugin.js';
import { PuppeteerPlugin } from '../../packages/browser-pool/src/puppeteer/puppeteer-plugin.js';
import { createProxyServer } from './browser-plugins/create-proxy-server.js';

const fingerprintingMatrix: [string, PlaywrightPlugin | PuppeteerPlugin][] = [
    [
        'Playwright - persistent',
        new PlaywrightPlugin(playwright.chromium, {
            useIncognitoPages: false,
        }),
    ],
    [
        'Playwright - Incognito',
        new PlaywrightPlugin(playwright.chromium, {
            useIncognitoPages: true,
        }),
    ],
    [
        'Puppeteer - Persistent',
        new PuppeteerPlugin(puppeteer, {
            useIncognitoPages: false,
        }),
    ],
    [
        'Puppeteer - Incognito',
        new PuppeteerPlugin(puppeteer, {
            useIncognitoPages: true,
        }),
    ],
];
// Tests could be generated from this blueprint for each plugin
describe.each([
    ['Puppeteer', new PuppeteerPlugin(puppeteer)],
    ['Playwright', new PlaywrightPlugin(playwright.chromium)], // Chromium is faster than firefox and webkit
])('BrowserPool - %s', (_, plugin) => {
    let browserPool: BrowserPool<{ browserPlugins: [typeof plugin]; closeInactiveBrowserAfterSecs: 2 }>;

    beforeEach(async () => {
        vitest.clearAllMocks();
        browserPool = new BrowserPool({
            browserPlugins: [plugin],
            closeInactiveBrowserAfterSecs: 2,
            retireInactiveBrowserAfterSecs: 2,
        });
    });

    afterEach(async () => {
        await browserPool?.destroy();
    });

    /**
     * Makes the browser's own `page.close()` never settle, before the pool wraps it - a browser that
     * acknowledges the close and then never destroys the target. Patching the page afterwards would
     * replace the pool's wrapper instead of the close it wraps.
     */
    const hangEveryPageClose = () => {
        const createController = plugin.createController.bind(plugin);
        // The two-plugin matrix makes the controller a union, so its own `newPage` signature is the
        // corresponding intersection and nothing satisfies it. Only `close` matters here.
        interface AnyController {
            newPage: (...args: never[]) => Promise<{ close: () => Promise<void> }>;
        }

        const patched = (() => {
            const controller = createController();
            const view = controller as unknown as AnyController;
            const newPage = view.newPage.bind(controller);
            view.newPage = async (...args: never[]) => {
                const page = await newPage(...args);
                page.close = async () => new Promise<void>(() => {});
                return page;
            };
            return controller;
        }) as unknown as typeof createController;

        vitest.spyOn(plugin, 'createController').mockImplementation(patched);
    };

    let target: http.Server;
    let unprotectedProxy: ProxyChainServer;
    let protectedProxy: ProxyChainServer;

    beforeAll(async () => {
        target = http.createServer((request, response) => {
            response.end(request.socket.remoteAddress);
        });
        await promisify(target.listen.bind(target) as any)(0, '127.0.0.1');

        unprotectedProxy = createProxyServer('127.0.0.2', '', '');
        await unprotectedProxy.listen();

        protectedProxy = createProxyServer('127.0.0.3', 'foo', 'bar');
        await protectedProxy.listen();
    });

    afterAll(async () => {
        await promisify(target.close.bind(target))();

        await unprotectedProxy.close(false);
        await protectedProxy.close(false);
    });

    describe('Initialization & retirement', () => {
        test('should retire browsers', async () => {
            // The pool's controller sets are private; retirement is observable through the event.
            const retiredControllers: BrowserController[] = [];
            browserPool.on(BROWSER_POOL_EVENTS.BROWSER_RETIRED, (controller) => {
                retiredControllers.push(controller);
            });

            const page = await browserPool.newPage();
            const controller = browserPool.getBrowserControllerByPage(page)!;

            browserPool.retireAllBrowsers();

            expect(retiredControllers).toEqual([controller]);
        });

        test('should destroy pool', async () => {
            const page = await browserPool.newPage();
            const browserController = browserPool.getBrowserControllerByPage(page)!;
            vitest.spyOn(browserController, 'close');

            await browserPool.destroy();

            expect(browserController.close).toHaveBeenCalled();
            expect(browserPool['browserKillerInterval']).toBeUndefined();
        });
    });

    describe('Basic user functionality', () => {
        // Basic user facing functionality
        test('should open new page', async () => {
            const page = await browserPool.newPage();

            expect(page.goto).toBeDefined();
            expect(page.close).toBeDefined();
        });

        // https://github.com/apify/crawlee/issues/3670
        test('should not leak aborted cancelTask between concurrent newPage calls', async () => {
            // The pool's timeout mirror is private, so the tiny timeout is set at construction.
            await browserPool.destroy();
            browserPool = new BrowserPool({
                browserPlugins: [plugin],
                closeInactiveBrowserAfterSecs: 2,
                retireInactiveBrowserAfterSecs: 2,
                operationTimeoutSecs: 0.001,
            });

            // Each newPage call is wrapped in its own outer addTimeoutToPromise,
            // matching how BasicCrawler wraps _runRequestHandler. Without the fix,
            // queued limiter callbacks inherit the previous task's aborted
            // cancelTask via AsyncLocalStorage propagation through p-limit, causing
            // their first tryCancel() to throw InternalTimeoutError pre-emptively;
            // that error then gets silently swallowed by the outer wrap.
            const results = await Promise.allSettled(
                Array.from({ length: 5 }, () =>
                    addTimeoutToPromise(async () => browserPool.newPage(), 60_000, 'outer timed out'),
                ),
            );

            browserPool.retireAllBrowsers();

            // All calls must reject — none should silently resolve with undefined.
            expect(results.every((r) => r.status === 'rejected')).toBe(true);

            // Each rejection should reflect this call's own newPage timeout, not
            // a leaked "canceled due to a timeout" from a sibling's aborted context.
            for (const r of results) {
                expect(r.status === 'rejected' && (r.reason as Error).message).toMatch(
                    /browserController\.newPage\(\) (failed|timed out)/,
                );
            }
        });

        // TODO: this test is very flaky in the CI
        test.skip('should allow early aborting in case of outer timeout', async () => {
            // One counter across all four launch/page-creation hook phases, standing in for the
            // pool's own hook dispatch.
            const hook = vitest.fn(async () => {});
            await browserPool.destroy();
            browserPool = new BrowserPool({
                browserPlugins: [plugin],
                closeInactiveBrowserAfterSecs: 2,
                retireInactiveBrowserAfterSecs: 2,
                operationTimeoutSecs: 0.5,
                preLaunchHooks: [hook],
                postLaunchHooks: [hook],
                prePageCreateHooks: [hook],
                postPageCreateHooks: [hook],
            });

            await browserPool.newPage();
            expect(hook).toBeCalledTimes(4);
            hook.mockClear();

            await expect(
                addTimeoutToPromise(async () => browserPool.newPage(), 10, 'opening new page timed out'),
            ).rejects.toThrowError('opening new page timed out');

            // We terminated early enough so only preLaunchHooks were not executed,
            // thanks to `tryCancel()` calls after each await. If we did not run
            // inside `addTimeoutToPromise()`, this would not work and we would get
            // 4 calls instead of just one.
            expect(hook).toBeCalledTimes(1);

            browserPool.retireAllBrowsers();
        });

        test('should open new page in incognito context', async () => {
            const browserPoolIncognito = new BrowserPool({
                browserPlugins: [new PlaywrightPlugin(playwright.chromium, { useIncognitoPages: true })],
                closeInactiveBrowserAfterSecs: 2,
            });

            const page = await browserPoolIncognito.newPage();
            await browserPoolIncognito.newPage();
            await browserPoolIncognito.newPage();

            expect(page.context().pages()).toHaveLength(1);
        });

        test('should open new page in new browser', async () => {
            vitest.spyOn(plugin, 'launch');

            await browserPool.newPage();
            await browserPool.newPageInNewBrowser();
            await browserPool.newPageInNewBrowser();

            expect(plugin.launch).toHaveBeenCalledTimes(3);
        });

        test('should correctly override page close', async () => {
            const page = await browserPool.newPage();

            const controller = browserPool.getBrowserControllerByPage(page)!;

            expect(controller.activePages).toEqual(1);
            expect(controller.totalPages).toEqual(1);

            await page.close();

            expect(controller.activePages).toEqual(0);
            expect(controller.totalPages).toEqual(1);
        });

        test("should do the pool's bookkeeping for a page whose close never settles", async () => {
            hangEveryPageClose();

            const page = await browserPool.newPage();
            const pageId = browserPool.getPageId(page)!;
            const controller = browserPool.getBrowserControllerByPage(page)!;
            const pageClosed = vitest.fn();
            browserPool.on(BROWSER_POOL_EVENTS.PAGE_CLOSED, pageClosed);

            expect(controller.activePages).toEqual(1);

            await page.close();

            // None of this used to run: the override was parked on the un-timed close, so the
            // browser kept a slot it could never get back.
            expect(controller.activePages).toEqual(0);
            expect(browserPool['pages'].has(pageId)).toBe(false);
            expect(pageClosed).toHaveBeenCalled();

            // The page is still attached, so the browser cannot be trusted with more work.
            expect(browserPool['activeBrowserControllers'].has(controller)).toBe(false);
            expect(browserPool['retiredBrowserControllers'].has(controller)).toBe(true);
        });

        test('should not retire the browser when only a post-close hook hangs', async () => {
            let hookStarted = false;
            let hookFinished = false;
            let releaseHook!: () => void;

            // Its own pool, because the page here closes for real and only the hook hangs, so
            // `activePages` drops to 0 on the page's own `close` event. With the suite's
            // `retireInactiveBrowserAfterSecs: 2` the unrelated idle-browser retirement would then
            // fire while we wait the hook out, and this test would be measuring that instead.
            const pool = new BrowserPool({
                browserPlugins: [plugin],
                retireInactiveBrowserAfterSecs: 600,
                closeInactiveBrowserAfterSecs: 600,
                postPageCloseHooks: [
                    () =>
                        new Promise<void>((resolve) => {
                            hookStarted = true;
                            releaseHook = () => {
                                hookFinished = true;
                                resolve();
                            };
                        }),
                ],
            });

            try {
                const page = await pool.newPage();
                const pageId = pool.getPageId(page)!;
                const controller = pool.getBrowserControllerByPage(page)!;

                await page.close();

                expect(hookStarted).toBe(true);
                expect(hookFinished).toBe(false);
                expect(controller.activePages).toEqual(0);
                expect(pool['pages'].has(pageId)).toBe(false);
                // Retirement is keyed on the page, not on the timeout, so a slow hook must not
                // cost a browser that closed its page just fine.
                expect(pool['activeBrowserControllers'].has(controller)).toBe(true);
                expect(pool['retiredBrowserControllers'].has(controller)).toBe(false);
            } finally {
                releaseHook?.();
                await pool.destroy();
            }
        }, 30_000);

        test('should not count the page twice when its close event arrives later', async () => {
            hangEveryPageClose();

            // `any` because the two-plugin matrix makes `page` a union, while the controller it
            // came from is a union too, so its parameter is the corresponding intersection.
            const page: any = await browserPool.newPage();
            const controller = browserPool.getBrowserControllerByPage(page)!;

            await page.close();
            expect(controller.activePages).toEqual(0);

            // Closing the browser does eventually deliver the event the page never sent. Counting
            // it again would push `activePages` negative and hand the browser work it cannot take.
            page.emit('close');

            expect(controller.activePages).toEqual(0);
        });

        test('should run a page teardown even when the close event never arrives', async () => {
            hangEveryPageClose();

            const page: any = await browserPool.newPage();
            const controller = browserPool.getBrowserControllerByPage(page)!;

            // Stands in for what the controllers register per page: an anonymizing proxy server,
            // an incognito context. Both used to hang off the `close` event, which does not
            // arrive for a page the browser never destroyed.
            let tornDown = 0;
            (controller as any).registerPageTeardown(page, async () => {
                tornDown++;
            });

            await page.close();
            await new Promise((resolve) => setImmediate(resolve));

            expect(tornDown).toEqual(1);

            page.emit('close');
            await new Promise((resolve) => setImmediate(resolve));

            expect(tornDown).toEqual(1);
        });

        test('should let closePage() return on a page whose close never settles', async () => {
            hangEveryPageClose();

            const page = await browserPool.newPage();
            const pageId = browserPool.getPageId(page)!;
            const controller = browserPool.getBrowserControllerByPage(page)!;

            // `closePage` is the documented way a crawler returns a page, and the bound it needs
            // lives in the override it calls. Bounding it here as well used to time that override
            // out from the outside, which is what abandoned the bookkeeping below.
            await expect(browserPool.closePage(page)).resolves.toBeUndefined();

            expect(controller.activePages).toEqual(0);
            expect(browserPool['pages'].has(pageId)).toBe(false);
            expect(browserPool['retiredBrowserControllers'].has(controller)).toBe(true);
        }, 30_000);

        test("should not cancel the caller's task when it gives up on a close", async () => {
            // The bound on the close is a `Promise.race`, not `addTimeoutToPromise`: the latter
            // takes its AbortController from the calling frame, so firing it here would cancel
            // the request handler that closed the page.
            hangEveryPageClose();

            const page = await browserPool.newPage();

            await expect(
                addTimeoutToPromise(
                    async () => {
                        await page.close();
                        tryCancel();
                        return 'caller survived';
                    },
                    30_000,
                    'the caller was timed out',
                ),
            ).resolves.toEqual('caller survived');
        }, 45_000);

        test('should retire browser after page count', async () => {
            await browserPool.destroy();
            browserPool = new BrowserPool({
                browserPlugins: [plugin],
                closeInactiveBrowserAfterSecs: 2,
                retireInactiveBrowserAfterSecs: 2,
                retireBrowserAfterPageCount: 2,
            });

            vitest.spyOn(browserPool, 'retireBrowserController');

            await browserPool.newPage();
            await browserPool.newPage();
            await browserPool.newPage();

            expect(browserPool.retireBrowserController).toBeCalledTimes(1);
        });

        test('should allow max pages per browser', async () => {
            await browserPool.destroy();
            browserPool = new BrowserPool({
                browserPlugins: [plugin],
                closeInactiveBrowserAfterSecs: 2,
                retireInactiveBrowserAfterSecs: 2,
                maxOpenPagesPerBrowser: 1,
            });
            vitest.spyOn(plugin, 'launch');

            await browserPool.newPage();
            await browserPool.newPage();
            await browserPool.newPage();

            expect(plugin.launch).toBeCalledTimes(3);
        });

        test('should allow max pages per browser - no race condition', async () => {
            await browserPool.destroy();
            browserPool = new BrowserPool({
                browserPlugins: [plugin],
                closeInactiveBrowserAfterSecs: 2,
                retireInactiveBrowserAfterSecs: 2,
                maxOpenPagesPerBrowser: 1,
            });
            vitest.spyOn(plugin, 'launch');

            const usePlugin = {
                browserPlugin: plugin,
            };

            await Promise.all([browserPool.newPage(usePlugin), browserPool.newPage(usePlugin)]);

            expect(browserPool['activeBrowserControllers'].size).toBe(2);

            expect(plugin.launch).toBeCalledTimes(2);
        });

        test('should close retired browsers', async () => {
            // Own pool: the reaper sweeps once per `closeInactiveBrowserAfterSecs`, and the 2s
            // default from `beforeEach` would make this test wait for it.
            const pool = new BrowserPool({
                browserPlugins: [plugin],
                closeInactiveBrowserAfterSecs: 0.1,
                retireBrowserAfterPageCount: 1,
            });

            try {
                expect(pool['retiredBrowserControllers'].size).toBe(0);

                const page = await pool.newPage();
                const controller = pool.getBrowserControllerByPage(page)!;
                vitest.spyOn(controller, 'close');

                expect(pool['retiredBrowserControllers'].size).toBe(1);
                await page.close();

                await vitest.waitFor(() => expect(pool['retiredBrowserControllers'].size).toBe(0), {
                    timeout: 10_000,
                });
                expect(controller.close).toHaveBeenCalled();
            } finally {
                await pool.destroy();
            }
        });

        describe('hooks', () => {
            test('should run hooks in series with custom args', async () => {
                const indexArray: number[] = [];
                const createAsyncHookReturningIndex = (i: number) => async () => {
                    const index = await new Promise<number>((resolve) => setTimeout(() => resolve(i), 100));
                    indexArray.push(index);
                };

                await browserPool.destroy();
                browserPool = new BrowserPool({
                    browserPlugins: [plugin],
                    closeInactiveBrowserAfterSecs: 2,
                    retireInactiveBrowserAfterSecs: 2,
                    preLaunchHooks: Array.from({ length: 10 }, (_, i) => createAsyncHookReturningIndex(i)),
                });

                await browserPool.newPage();
                expect(indexArray).toHaveLength(10);
                indexArray.forEach((v, index) => expect(v).toEqual(index));
            });

            test('browser lifecycle works correctly', async () => {
                // A browser whose launch hooks have not resolved yet must survive both inactivity
                // sweeps. Sub-second windows let each sweep run several
                // times during the wait, instead of sleeping past the 2s defaults from beforeEach.
                // The waits stay real: a live browser is launching underneath, and faking the clock
                // would stall the driver's own timeouts along with the pool's.

                let resolvePreLaunchHook: (() => void) | null = null;
                let resolvePostLaunchHook: (() => void) | null = null;

                const preLaunchPromise = new Promise<void>((resolve) => {
                    resolvePreLaunchHook = resolve;
                });
                const postLaunchPromise = new Promise<void>((resolve) => {
                    resolvePostLaunchHook = resolve;
                });

                const pool = new BrowserPool({
                    browserPlugins: [plugin],
                    closeInactiveBrowserAfterSecs: 0.5,
                    retireInactiveBrowserAfterSecs: 0.5,
                    preLaunchHooks: [async () => preLaunchPromise],
                    postLaunchHooks: [async () => postLaunchPromise],
                });
                clearInterval(pool['browserKillerInterval']!);
                pool['browserKillerInterval'] = setInterval(async () => pool['closeInactiveRetiredBrowsers'](), 100);

                // The hook arrays are private, so they are supplied at construction above. Launch and
                // retire bookkeeping is observed through the pool's events instead of its internals.
                let launchedBrowsers = 0;
                let retiredBrowsers = 0;
                pool.on(BROWSER_POOL_EVENTS.BROWSER_LAUNCHED, () => {
                    launchedBrowsers++;
                });
                pool.on(BROWSER_POOL_EVENTS.BROWSER_RETIRED, () => {
                    retiredBrowsers++;
                });

                try {
                    const newPagePromise = pool.newPage();

                    await sleep(200);

                    // The browser is still starting - and it must not be retired while its hooks run.
                    expect(launchedBrowsers).toBe(0);
                    expect(retiredBrowsers).toBe(0);

                    await sleep(1200);

                    resolvePreLaunchHook!();
                    resolvePostLaunchHook!();

                    const page = await newPagePromise;

                    expect(launchedBrowsers).toBe(1);
                    expect(retiredBrowsers).toBe(0);

                    // Make sure the page is usable. The Puppeteer and Playwright `evaluate`
                    // overloads have no compatible signature, so the union is not callable as-is.
                    await (page.evaluate as unknown as (script: string) => Promise<void>)('() => {}');
                    await page.close();
                } finally {
                    await pool.destroy();
                }
            });

            describe('preLaunchHooks', () => {
                test('should evaluate hook before launching browser with correct args', async () => {
                    const myAsyncHook = vitest.fn(async () => {});
                    await browserPool.destroy();
                    browserPool = new BrowserPool({
                        browserPlugins: [plugin],
                        closeInactiveBrowserAfterSecs: 2,
                        retireInactiveBrowserAfterSecs: 2,
                        preLaunchHooks: [myAsyncHook],
                    });

                    const page = await browserPool.newPage();
                    const pageId = browserPool.getPageId(page)!;
                    const { launchContext } = browserPool.getBrowserControllerByPage(page)!;

                    expect(myAsyncHook).toHaveBeenCalledWith(pageId, launchContext);
                });

                // We had a problem where if the first newPage() call, which launches
                // a browser failed in hooks, then the browserController would get stuck
                // in limbo and subsequent newPage() calls would never resolve.
                test('error in hook does not leave browser stuck in limbo', async () => {
                    const errorMessage = 'pre-launch failed';
                    await browserPool.destroy();
                    browserPool = new BrowserPool({
                        browserPlugins: [plugin],
                        closeInactiveBrowserAfterSecs: 2,
                        retireInactiveBrowserAfterSecs: 2,
                        preLaunchHooks: [
                            async () => {
                                throw new Error(errorMessage);
                            },
                        ],
                    });

                    let launchedBrowsers = 0;
                    browserPool.on(BROWSER_POOL_EVENTS.BROWSER_LAUNCHED, () => {
                        launchedBrowsers++;
                    });

                    const attempts = 5;
                    for (let i = 0; i < attempts; i++) {
                        try {
                            await browserPool.newPage();
                        } catch (err) {
                            expect((err as Error).message).toBe(errorMessage);
                        }
                    }

                    expect(launchedBrowsers).toBe(0);
                    expect.assertions(attempts + 1);
                });
            });

            describe('postLaunchHooks', () => {
                test('should evaluate hook after launching browser with correct args', async () => {
                    const myAsyncHook = vitest.fn(async () => {});
                    await browserPool.destroy();
                    browserPool = new BrowserPool({
                        browserPlugins: [plugin],
                        closeInactiveBrowserAfterSecs: 2,
                        retireInactiveBrowserAfterSecs: 2,
                        postLaunchHooks: [myAsyncHook],
                    });

                    const page = await browserPool.newPage();
                    const pageId = browserPool.getPageId(page)!;
                    const browserController = browserPool.getBrowserControllerByPage(page)!;

                    expect(myAsyncHook).toHaveBeenCalledWith(pageId, browserController);
                });

                // We had a problem where if the first newPage() call, which launches
                // a browser failed in hooks, then the browserController would get stuck
                // in limbo and subsequent newPage() calls would never resolve.
                test('error in hook does not leave browser stuck in limbo', async () => {
                    const errorMessage = 'post-launch failed';
                    const controllers: BrowserController[] = [];
                    await browserPool.destroy();
                    browserPool = new BrowserPool({
                        browserPlugins: [plugin],
                        closeInactiveBrowserAfterSecs: 2,
                        retireInactiveBrowserAfterSecs: 2,
                        postLaunchHooks: [
                            async (_pageId, browserController) => {
                                controllers.push(browserController);
                                throw new Error(errorMessage);
                            },
                        ],
                    });

                    let launchedBrowsers = 0;
                    browserPool.on(BROWSER_POOL_EVENTS.BROWSER_LAUNCHED, () => {
                        launchedBrowsers++;
                    });

                    const attempts = 5;
                    for (let i = 0; i < attempts; i++) {
                        try {
                            await browserPool.newPage();
                        } catch (err) {
                            expect((err as Error).message).toBe(errorMessage);
                        }
                    }

                    // Wait until all browsers are closed. This will only resolve if all close,
                    // if it does not resolve, the test will timeout and fail.
                    await new Promise<void>((resolve) => {
                        const int = setInterval(() => {
                            const stillWaiting = controllers.some((c) => c.isActive);
                            if (!stillWaiting) {
                                clearInterval(int);
                                resolve();
                            }
                        }, 10);
                    });

                    expect(launchedBrowsers).toBe(0);
                    expect.assertions(attempts + 1);
                });
            });

            describe('prePageCreateHooks', () => {
                test('should evaluate hook after launching browser with correct args', async () => {
                    const myAsyncHook = vitest.fn(async () => {});
                    await browserPool.destroy();
                    browserPool = new BrowserPool({
                        browserPlugins: [plugin],
                        closeInactiveBrowserAfterSecs: 2,
                        retireInactiveBrowserAfterSecs: 2,
                        prePageCreateHooks: [myAsyncHook],
                    });

                    const page = await browserPool.newPage();
                    const pageId = browserPool.getPageId(page)!;
                    const browserController = browserPool.getBrowserControllerByPage(page)!;

                    expect(myAsyncHook).toHaveBeenCalledWith(
                        pageId,
                        browserController,
                        browserController.launchContext.useIncognitoPages ? {} : undefined,
                    );
                });
            });

            describe('postPageCreateHooks', () => {
                test('should evaluate hook after launching browser with correct args', async () => {
                    const myAsyncHook = vitest.fn(async () => {});
                    await browserPool.destroy();
                    browserPool = new BrowserPool({
                        browserPlugins: [plugin],
                        closeInactiveBrowserAfterSecs: 2,
                        retireInactiveBrowserAfterSecs: 2,
                        postPageCreateHooks: [myAsyncHook],
                    });

                    const page = await browserPool.newPage();
                    const browserController = browserPool.getBrowserControllerByPage(page);

                    expect(myAsyncHook).toHaveBeenCalledWith(page, browserController);
                });
            });

            describe('prePageCloseHooks', () => {
                test('should evaluate hook after launching browser with correct args', async () => {
                    const myAsyncHook = vitest.fn(async () => {});
                    await browserPool.destroy();
                    browserPool = new BrowserPool({
                        browserPlugins: [plugin],
                        closeInactiveBrowserAfterSecs: 2,
                        retireInactiveBrowserAfterSecs: 2,
                        prePageCloseHooks: [myAsyncHook],
                    });

                    const page = await browserPool.newPage();
                    await page.close();

                    const browserController = browserPool.getBrowserControllerByPage(page);
                    expect(myAsyncHook).toHaveBeenCalledWith(page, browserController);
                });
            });

            describe('postPageCloseHooks', () => {
                test('should evaluate hook after launching browser with correct args', async () => {
                    const myAsyncHook = vitest.fn(async () => {});
                    await browserPool.destroy();
                    browserPool = new BrowserPool({
                        browserPlugins: [plugin],
                        closeInactiveBrowserAfterSecs: 2,
                        retireInactiveBrowserAfterSecs: 2,
                        postPageCloseHooks: [myAsyncHook],
                    });

                    const page = await browserPool.newPage();
                    const pageId = browserPool.getPageId(page);
                    await page.close();

                    const browserController = browserPool.getBrowserControllerByPage(page);
                    expect(myAsyncHook).toHaveBeenCalledWith(pageId, browserController);
                });
            });
        });

        describe('events', () => {
            test(`should emit ${BROWSER_POOL_EVENTS.BROWSER_LAUNCHED} event`, async () => {
                await browserPool.destroy();
                browserPool = new BrowserPool({
                    browserPlugins: [plugin],
                    closeInactiveBrowserAfterSecs: 2,
                    retireInactiveBrowserAfterSecs: 2,
                    maxOpenPagesPerBrowser: 1,
                });

                let calls = 0;
                let argument;

                browserPool.on(BROWSER_POOL_EVENTS.BROWSER_LAUNCHED, (arg) => {
                    argument = arg;
                    calls++;
                });
                await browserPool.newPage();
                const page = await browserPool.newPage();

                expect(calls).toEqual(2);
                expect(argument).toEqual(browserPool.getBrowserControllerByPage(page));
            });

            test(`should emit ${BROWSER_POOL_EVENTS.BROWSER_RETIRED} event`, async () => {
                await browserPool.destroy();
                browserPool = new BrowserPool({
                    browserPlugins: [plugin],
                    closeInactiveBrowserAfterSecs: 2,
                    retireInactiveBrowserAfterSecs: 2,
                    retireBrowserAfterPageCount: 1,
                });

                let calls = 0;
                let argument;
                browserPool.on(BROWSER_POOL_EVENTS.BROWSER_RETIRED, (arg) => {
                    argument = arg;
                    calls++;
                });

                await browserPool.newPage();
                const page = await browserPool.newPage();

                expect(calls).toEqual(2);
                expect(argument).toEqual(browserPool.getBrowserControllerByPage(page));
            });

            test(`should emit ${BROWSER_POOL_EVENTS.PAGE_CREATED} event`, async () => {
                let calls = 0;
                let argument;
                browserPool.on(BROWSER_POOL_EVENTS.PAGE_CREATED, (arg) => {
                    argument = arg;
                    calls++;
                });

                const page = await browserPool.newPage();
                expect(argument).toEqual(page);
                const page2 = await browserPool.newPage();
                expect(calls).toEqual(2);
                expect(argument).toEqual(page2);
            });

            test(`should emit ${BROWSER_POOL_EVENTS.PAGE_CLOSED} event`, async () => {
                let calls = 0;
                let argument;
                browserPool.on(BROWSER_POOL_EVENTS.PAGE_CLOSED, (arg) => {
                    argument = arg;
                    calls++;
                });

                const page = await browserPool.newPage();
                await page.close();
                expect(argument).toEqual(page);
                const page2 = await browserPool.newPage();
                await page2.close();
                expect(calls).toEqual(2);
                expect(argument).toEqual(page2);
            });
        });
    });
});

// These suites bring their own plugins, so they are independent of the plugin parametrization
// above - nesting them inside it ran every one of them twice with identical inputs.
describe('BrowserPool - fingerprints', () => {
    describe('default browser automation masking', () => {
        describe.each(fingerprintingMatrix)('%s', (_name, fingerprintPlugin) => {
            let browserPoolWithDefaults: BrowserPool;
            let page: any;

            beforeEach(async () => {
                browserPoolWithDefaults = new BrowserPool({
                    browserPlugins: [fingerprintPlugin],
                    closeInactiveBrowserAfterSecs: 2,
                });
                page = await browserPoolWithDefaults.newPage();
            });

            afterEach(async () => {
                if (page) await page.close();

                await browserPoolWithDefaults.destroy();
            });

            test('should hide webdriver', async () => {
                await page.goto(`file://${import.meta.dirname}/test.html`);
                const webdriver = await page.evaluate(() => {
                    return navigator.webdriver;
                });
                // Can be undefined or false, depending on the chrome version.
                expect(webdriver).toBeFalsy();
            });
        });
    });

    describe('fingerprinting', () => {
        describe.each(fingerprintingMatrix)('%s', (_name, fingerprintPlugin) => {
            let browserPoolWithFP: BrowserPool;
            let page: any;

            beforeEach(async () => {
                browserPoolWithFP = new BrowserPool({
                    browserPlugins: [fingerprintPlugin],
                    closeInactiveBrowserAfterSecs: 2,
                    useFingerprints: true,
                });
                page = await browserPoolWithFP.newPage();
            });

            afterEach(async () => {
                if (page) await page.close();

                await browserPoolWithFP.destroy();
            });

            test('should override fingerprint', async () => {
                await page.goto(`file://${import.meta.dirname}/test.html`);
                // @ts-expect-error mistypings
                const browserController = browserPoolWithFP.getBrowserControllerByPage(page);

                const data: { hardwareConcurrency: number; userAgent: string } = await page.evaluate(() => {
                    return {
                        hardwareConcurrency: navigator.hardwareConcurrency,
                        userAgent: navigator.userAgent,
                    };
                });
                // @ts-expect-error mistypings
                const { fingerprint } = browserController!.launchContext!.fingerprint as BrowserFingerprintWithHeaders;

                expect(data.hardwareConcurrency).toBe(fingerprint?.navigator.hardwareConcurrency);
                expect(data.userAgent).toBe(fingerprint?.navigator.userAgent);
            });

            test('should hide webdriver', async () => {
                await page.goto(`file://${import.meta.dirname}/test.html`);
                const webdriver = await page.evaluate(() => {
                    return navigator.webdriver;
                });
                // Can be undefined or false, depending on the chrome version.
                expect(webdriver).toBeFalsy();
            });
        });

        describe('caching', () => {
            const commonOptions = {
                browserPlugins: [
                    new PlaywrightPlugin(playwright.chromium, {
                        useIncognitoPages: true,
                    }),
                ],
            };
            let browserPoolCache: BrowserPool;

            afterEach(async () => {
                await browserPoolCache.destroy();
            });
            test('should use fingerprint cache by default', async () => {
                browserPoolCache = new BrowserPool({
                    ...commonOptions,
                    useFingerprints: true,
                });

                expect(browserPoolCache.fingerprintCache).toBeDefined();
            });

            test('should turn off cache', async () => {
                browserPoolCache = new BrowserPool({
                    ...commonOptions,
                    useFingerprints: true,
                    fingerprintOptions: {
                        useFingerprintCache: false,
                    },
                });

                expect(browserPoolCache.fingerprintCache).toBeUndefined();
            });

            test('should limit cache size', async () => {
                browserPoolCache = new BrowserPool({
                    ...commonOptions,
                    useFingerprints: true,
                    fingerprintOptions: {
                        fingerprintCacheSize: 1,
                    },
                });
                // cast to any type in order to access the maxSize property for testing purposes.
                const cache: any = browserPoolCache!.fingerprintCache!;
                expect(cache.maxSize).toBe(1);
            });

            test('should cache fingerprints', async () => {
                browserPoolCache = new BrowserPool({
                    ...commonOptions,
                    useFingerprints: true,
                    preLaunchHooks: [
                        (_pageId, launchContext) => {
                            // @ts-expect-error issue caused by generics
                            launchContext.extend({ session: { id: '123' } });
                        },
                    ],
                });
                const mock = vitest.fn();
                browserPoolCache.fingerprintInjector!.attachFingerprintToPlaywright = mock;
                const page: Page = await browserPoolCache.newPageInNewBrowser();
                expect(mock.mock.calls[0][1]).toBeDefined();
                const page2: Page = await browserPoolCache.newPageInNewBrowser();
                await page.close();
                await page2.close();
                // expect fingerprint parameter of the first call to equal fingerprint parameter of the second call
                expect(mock.mock.calls[0][1]).toBe(mock.mock.calls[1][1]);
            });
        });
    });
    describe('generator configuration', () => {
        const commonOptions = {
            browserPlugins: [
                new PlaywrightPlugin(playwright.firefox, {
                    useIncognitoPages: true,
                }),
            ],
        };
        let browserPoolConfig: BrowserPool;
        afterEach(async () => {
            await browserPoolConfig.destroy();
        });
        test('should use native os and browser', async () => {
            browserPoolConfig = new BrowserPool({
                ...commonOptions,
                useFingerprints: true,
            });
            const oldGet = browserPoolConfig.fingerprintGenerator!.getFingerprint;
            const mock = vitest.fn((options) => {
                return oldGet.bind(browserPoolConfig.fingerprintGenerator)(options);
            });
            browserPoolConfig.fingerprintGenerator!.getFingerprint = mock;

            const page: Page = await browserPoolConfig.newPage();
            await page.close();
            const defaultOptions = mock.mock.calls[0][0];

            expect(defaultOptions.browsers.includes('firefox')).toBe(true);

            let os: string;
            switch (process.platform) {
                case 'darwin':
                    os = 'macos';
                    break;
                case 'win32':
                    os = 'windows';
                    break;
                default:
                    os = 'linux';
            }
            expect(defaultOptions.operatingSystems.includes(os)).toBe(true);
        });

        test('should allow changing options', async () => {
            browserPoolConfig = new BrowserPool({
                ...commonOptions,
                useFingerprints: true,
                fingerprintOptions: {
                    fingerprintGeneratorOptions: {
                        operatingSystems: [OperatingSystemsName.windows],
                        browsers: [BrowserName.chrome],
                    },
                },
            });
            const oldGet = browserPoolConfig.fingerprintGenerator!.getFingerprint;
            const mock = vitest.fn((options) => {
                return oldGet.bind(browserPoolConfig.fingerprintGenerator)(options);
            });
            browserPoolConfig.fingerprintGenerator!.getFingerprint = mock;
            const page: Page = await browserPoolConfig.newPageInNewBrowser();
            await page.close();
            const [options] = mock.mock.calls[0];
            expect(options.operatingSystems.includes('windows')).toBe(true);
            expect(options.browsers.includes('chrome')).toBe(true);
        });
    });
});
