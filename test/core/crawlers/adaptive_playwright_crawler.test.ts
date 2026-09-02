import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
    BaseCrawleeLogger,
    type CrawleeLogger,
    type CrawleeLoggerOptions,
    Dataset,
    EventType,
    KeyValueStore,
    MemoryStorageBackend,
    serviceLocator,
    Statistics,
} from '@crawlee/core';
import type {
    AdaptivePlaywrightCrawlerContext,
    AdaptivePlaywrightCrawlerOptions,
    LoadedContext,
    Request,
} from '@crawlee/playwright';
import {
    AdaptivePlaywrightCrawler,
    adaptivePlaywrightCrawlerStatisticState,
    BasicCrawler,
    createAdaptivePlaywrightRouter,
    fullResultComparator,
    playwrightBrowserPool,
    RenderingTypePredictor,
    RequestList,
    RequestQueue,
    RequestValidationError,
} from '@crawlee/playwright';
import type { Dictionary } from '@crawlee/types';
import { sleep } from 'crawlee';
import express from 'express';
import { z } from 'zod';

import { startExpressAppPromise } from '../../shared/_helper.js';

// A minimal logger that records every message into a shared array. Child loggers share the same
// array, so messages emitted by the crawler's prefixed child logger are captured as well.
class RecordingLogger extends BaseCrawleeLogger {
    constructor(private readonly messages: string[]) {
        super();
    }

    logWithLevel(_level: number, message: string): void {
        this.messages.push(message);
    }

    protected createChild(_options: Partial<CrawleeLoggerOptions>): CrawleeLogger {
        return new RecordingLogger(this.messages);
    }
}

describe('AdaptivePlaywrightCrawler', () => {
    // Set up an express server that will serve test pages
    const HOSTNAME = '127.0.0.1';
    let port: number;
    let server: Server;
    let lastDynamicRequestUserAgent: string | undefined;

    beforeAll(async () => {
        const app = express();
        server = await startExpressAppPromise(app, 0);
        port = (server.address() as AddressInfo).port;

        app.get('/static', (_req, res) => {
            res.status(200);
            res.send(`
                <html>
                    <head>
                        <title>Example Domain</title>
                    </head>
                    <body>
                        <h1>Heading</h1>
                        <a href="/static?q=1">Link 1</a>
                        <a href="/static?q=2">Link 2</a>
                        <a href="/static?q=3">Link 3</a>
                        <a href="/static?q=4">Link 4</a>
                        <a href="/static?q=5">Link 5</a>
                    </body>
                </html>
             `);
        });

        app.get('/dynamic', (req, res) => {
            lastDynamicRequestUserAgent = req.headers['user-agent'];
            res.status(200);
            res.send(`
                <html>
                    <head>
                        <title>Example Domain</title>
                        <script type="text/javascript">
                            setTimeout(() => {
                                document.body.innerHTML = [
                                    '<h1>Heading</h1>',
                                    '<a href="/static?q=1">Link 1</a>',
                                    '<a href="/static?q=2">Link 2</a>',
                                    '<a href="/static?q=3">Link 3</a>',
                                    '<a href="/static?q=4">Link 4</a>',
                                    '<a href="/static?q=5">Link 5</a>',
                                ].join(" ")
                            }, 500)
                        </script>
                    </head>
                    <body>
                    </body>
                </html>
             `);
        });

        app.get('/external-links', (_req, res) => {
            res.status(200);
            res.send(`
                <html>
                    <head>
                        <title>Example Domain</title>
                    </head>
                    <body>
                        <h1>Heading</h1>
                        <a href="/external-redirect">External redirect</a>
                        <a href="https://google.com/">Outbound link</a>
                    </body>
                </html>
             `);
        });

        app.get('/external-redirect', (_req, res) => {
            res.status(302);
            res.setHeader('Location', 'https://google.com');
            res.send('Redirecting...');
        });
    });
    afterAll(async () => {
        server.close();
    });

    beforeEach(async () => {
        // The global test setup (`test/vitest.setup.ts`) already calls `serviceLocator.reset()` before
        // each test, which clears the storage-instance cache; here we just install a fresh in-memory
        // storage backend for this suite.
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        // `BasicCrawler` keeps a process-global instance counter that assigns each crawler a distinct
        // default request queue (the first one uses the shared default queue, later ones get their own
        // `__default_<n>__` alias). Since every test wipes storage and starts fresh, the counter must be
        // reset too — otherwise later crawlers open aliased queues that are out of sync with the freshly
        // reset storage, and the crawler restores a stale handled-request count and processes nothing.
        // @ts-expect-error Reset private static instance counter for test isolation
        BasicCrawler.instanceCount = 0;
        lastDynamicRequestUserAgent = undefined;
    });

    // Test setup helpers
    const makeOneshotCrawler = async (
        options: Required<Pick<AdaptivePlaywrightCrawlerOptions, 'requestHandler' | 'renderingTypePredictor'>> &
            Partial<AdaptivePlaywrightCrawlerOptions>,
        sources: string[],
    ) =>
        new AdaptivePlaywrightCrawler({
            renderingTypeDetectionRatio: 0.1,
            maxConcurrency: 1,
            maxRequestRetries: 0,
            maxRequestsPerCrawl: 1,
            requestList: await RequestList.open({ sources }),
            ...options,
        });

    const makeRiggedRenderingTypePredictor = (prediction: {
        detectionProbabilityRecommendation: number;
        renderingType: 'clientOnly' | 'static';
    }) => ({
        predict: vi.fn((_request: Request) => prediction),
        storeResult: vi.fn((_request: Request, _renderingType: string) => {}),
    });

    test.each([
        ['/static', 'static'],
        ['/dynamic', 'clientOnly'],
    ] as const)(
        'extendContext is visible to pre/post-navigation hooks and the request handler (%s)',
        async (path, renderingType) => {
            const renderingTypePredictor = makeRiggedRenderingTypePredictor({
                detectionProbabilityRecommendation: 0,
                renderingType,
            });
            const url = new URL(`http://${HOSTNAME}:${port}${path}`);

            const seenIn: Record<string, unknown> = {};

            // Instantiated directly (rather than via `makeOneshotCrawler`) so that the `ContextExtension`
            // generic is inferred from `extendContext` and the hooks/handler see it without casts.
            const crawler = new AdaptivePlaywrightCrawler({
                renderingTypeDetectionRatio: 0.1,
                maxConcurrency: 1,
                maxRequestRetries: 0,
                maxRequestsPerCrawl: 1,
                requestList: await RequestList.open({ sources: [url.toString()] }),
                renderingTypePredictor,
                extendContext: () => ({ injected: 'from-extend-context' }),
                preNavigationHooks: [
                    async (context) => {
                        seenIn.preNavigation = context.injected;
                    },
                ],
                postNavigationHooks: [
                    async (context) => {
                        seenIn.postNavigation = context.injected;
                    },
                ],
                requestHandler: async (context) => {
                    seenIn.requestHandler = context.injected;
                },
            });

            await crawler.run();

            expect(seenIn.preNavigation).toBe('from-extend-context');
            expect(seenIn.postNavigation).toBe('from-extend-context');
            expect(seenIn.requestHandler).toBe('from-extend-context');
        },
    );

    describe('should detect page rendering type', () => {
        test.each([
            ['/static', 'static'],
            ['/dynamic', 'clientOnly'],
        ] as const)('for %s', async (path, expectedType) => {
            const renderingTypePredictor = makeRiggedRenderingTypePredictor({
                detectionProbabilityRecommendation: 1,
                renderingType: 'clientOnly',
            });
            const url = new URL(`http://${HOSTNAME}:${port}${path}`);

            const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(
                async ({ pushData, parseWithCheerio }) => {
                    const $ = await parseWithCheerio('h1');
                    await pushData({
                        heading: $('h1').text(),
                    });
                },
            );

            const crawler = await makeOneshotCrawler(
                {
                    requestHandler,
                    renderingTypePredictor,
                },
                [url.toString()],
            );

            await crawler.run();

            // Check the detection result
            expect(renderingTypePredictor.predict).toHaveBeenCalledOnce();
            expect(renderingTypePredictor.predict.mock.lastCall?.[0]).toMatchObject({ url, label: undefined });

            expect(renderingTypePredictor.storeResult).toHaveBeenCalledOnce();
            expect(renderingTypePredictor.storeResult.mock.lastCall?.[0]).toMatchObject({ url, label: undefined });
            expect(renderingTypePredictor.storeResult.mock.lastCall?.[1]).toEqual(expectedType);

            // Check if the request handler was called twice
            expect(requestHandler).toHaveBeenCalledTimes(2);

            // Check if only one item was added to the dataset
            expect((await Dataset.getData()).items).toEqual([{ heading: 'Heading' }]);
        });
    });

    describe('querySelector and querySelectorAll', () => {
        test.each([
            ['/static', 'static'],
            ['/dynamic', 'clientOnly'],
        ] as const)('return first vs. all matched elements (%s)', async (path, renderingType) => {
            const renderingTypePredictor = makeRiggedRenderingTypePredictor({
                detectionProbabilityRecommendation: 0,
                renderingType,
            });
            const url = new URL(`http://${HOSTNAME}:${port}${path}`);

            const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(
                async ({ pushData, querySelector, querySelectorAll }) => {
                    const first = await querySelector('a');
                    const all = await querySelectorAll('a');
                    await pushData({
                        firstCount: first.length,
                        firstText: first.text(),
                        allCount: all.length,
                    });
                },
            );

            const crawler = await makeOneshotCrawler(
                {
                    requestHandler,
                    renderingTypePredictor,
                },
                [url.toString()],
            );

            await crawler.run();

            // `querySelector` returns only the first match, `querySelectorAll` returns the whole collection.
            expect((await Dataset.getData()).items).toEqual([{ firstCount: 1, firstText: 'Link 1', allCount: 5 }]);
        });
    });

    describe('fullResultComparator', () => {
        // The `/dynamic` page renders its links only after JS runs, so the static (plain HTTP) run enqueues
        // no links while the browser run enqueues five. The pushed dataset item is constant in both runs.
        const makeCrawler = async (options: Partial<AdaptivePlaywrightCrawlerOptions>) => {
            const renderingTypePredictor = makeRiggedRenderingTypePredictor({
                detectionProbabilityRecommendation: 1, // always run detection
                renderingType: 'clientOnly',
            });
            const url = new URL(`http://${HOSTNAME}:${port}/dynamic`);

            const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(
                async ({ pushData, enqueueLinks }) => {
                    await pushData({ heading: 'Heading' }); // identical in both runs
                    await enqueueLinks(); // differs between static (0 links) and browser (5 links)
                },
            );

            const crawler = await makeOneshotCrawler(
                {
                    requestHandler,
                    renderingTypePredictor,
                    // The enqueue budget derived from `maxRequestsPerCrawl` applies to the transaction
                    // journal too (only requests that would really be enqueued are recorded), so the seed
                    // request needs room for its five links. The crawl is stopped right after the seed's
                    // rendering type detection (see below), so the enqueued links are never crawled.
                    maxRequestsPerCrawl: 10,
                    ...options,
                },
                [url.toString()],
            );

            renderingTypePredictor.storeResult.mockImplementation(() => void crawler.stop());

            return { crawler, renderingTypePredictor };
        };

        test('default comparator ignores enqueued links and detects the page as static', async () => {
            const { crawler, renderingTypePredictor } = await makeCrawler({});

            await crawler.run();

            expect(renderingTypePredictor.storeResult).toHaveBeenCalledOnce();
            expect(renderingTypePredictor.storeResult.mock.lastCall?.[1]).toEqual('static');
        });

        test('fullResultComparator takes enqueued links into account and detects the page as clientOnly', async () => {
            const { crawler, renderingTypePredictor } = await makeCrawler({
                resultComparator: fullResultComparator,
            });

            await crawler.run();

            expect(renderingTypePredictor.storeResult).toHaveBeenCalledOnce();
            expect(renderingTypePredictor.storeResult.mock.lastCall?.[1]).toEqual('clientOnly');
        });
    });

    test.each([['static'], ['clientOnly']] as const)(
        'should replay request handler logs (%s)',
        async (renderingType) => {
            const renderingTypePredictor = makeRiggedRenderingTypePredictor({
                detectionProbabilityRecommendation: 0,
                renderingType,
            });
            const url = new URL(`http://${HOSTNAME}:${port}/static`);

            const messages: string[] = [];
            const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(async ({ log }) => {
                log.info('handler log message');
            });

            const crawler = await makeOneshotCrawler(
                {
                    requestHandler,
                    renderingTypePredictor,
                    logger: new RecordingLogger(messages),
                },
                [url.toString()],
            );

            await crawler.run();

            expect(requestHandler).toHaveBeenCalled();
            expect(messages).toContain('handler log message');
        },
    );

    test('should not store detection results on non-detection runs', async () => {
        const renderingTypePredictor = makeRiggedRenderingTypePredictor({
            detectionProbabilityRecommendation: 0,
            renderingType: 'static',
        });
        const url = new URL(`http://${HOSTNAME}:${port}/static`);

        const crawler = await makeOneshotCrawler(
            {
                requestHandler: async () => {},
                renderingTypePredictor,
            },
            [url.toString()],
        );

        await crawler.run();

        expect(renderingTypePredictor.predict).toHaveBeenCalledOnce();
        expect(renderingTypePredictor.predict.mock.lastCall?.[0]).toMatchObject({ url, label: undefined });

        expect(renderingTypePredictor.storeResult).not.toHaveBeenCalled();
    });

    test('should retry with browser if result checker returns false', async () => {
        const renderingTypePredictor = makeRiggedRenderingTypePredictor({
            detectionProbabilityRecommendation: 0,
            renderingType: 'static',
        });
        const url = new URL(`http://${HOSTNAME}:${port}/dynamic`);

        const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(
            async ({ pushData, querySelector }) => {
                await pushData({
                    heading: (await querySelector('h1')).text(),
                });
            },
        );

        const resultChecker: AdaptivePlaywrightCrawlerOptions['resultChecker'] = vi.fn(
            (result) =>
                result.datasetItems.length > 0 &&
                result.datasetItems.every(({ item }: Dictionary) => item.heading?.length > 0),
        );

        const crawler = await makeOneshotCrawler(
            {
                requestHandler,
                renderingTypePredictor,
                resultChecker,
            },
            [url.toString()],
        );

        await crawler.run();

        expect(requestHandler).toHaveBeenCalledTimes(2);
        expect(resultChecker).toHaveBeenCalledTimes(1);

        expect(crawler.statistics.state).toMatchObject({
            httpOnlyRequestHandlerRuns: 1,
            renderingTypeMispredictions: 1,
            browserRequestHandlerRuns: 1,
        });
    });

    test('should track its own fields alongside those of an injected statistics instance', async () => {
        const statistics = new Statistics({
            stateExtension: {
                deserialize: adaptivePlaywrightCrawlerStatisticState.deserialize.extend({
                    productsFound: z.number().default(0),
                }),
            },
        });

        // Instantiated directly (rather than via `makeOneshotCrawler`) so that the `StatisticStateExtension`
        // generic is inferred from the injected instance rather than defaulted by the helper's parameter type.
        const crawler = new AdaptivePlaywrightCrawler({
            statistics,
            renderingTypeDetectionRatio: 0.1,
            maxConcurrency: 1,
            maxRequestRetries: 0,
            maxRequestsPerCrawl: 1,
            requestList: await RequestList.open({
                sources: [new URL(`http://${HOSTNAME}:${port}/static`).toString()],
            }),
            renderingTypePredictor: makeRiggedRenderingTypePredictor({
                detectionProbabilityRecommendation: 0,
                renderingType: 'static',
            }),
            requestHandler: async ({ querySelectorAll }) => {
                statistics.state.productsFound += (await querySelectorAll('h1')).length;
            },
        });

        await crawler.run();

        expect(crawler.statistics.state.productsFound).toEqual(1);
        expect(crawler.statistics.state.httpOnlyRequestHandlerRuns).toEqual(1);
    });

    describe('shouldPropagateError', () => {
        const renderingTypePredictor = makeRiggedRenderingTypePredictor({
            detectionProbabilityRecommendation: 0,
            renderingType: 'static',
        });
        const failedRequestHandler = vi.fn();
        const testError = new Error('HTTP handler failed');
        const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(async () => {
            throw testError;
        });

        beforeEach(() => {
            vi.clearAllMocks();
        });

        test('should fall back to browser when shouldPropagateError returns false', async () => {
            const shouldPropagateError = vi.fn(() => false);
            const url = new URL(`http://${HOSTNAME}:${port}/static`);

            const crawler = await makeOneshotCrawler(
                {
                    requestHandler,
                    renderingTypePredictor,
                    shouldPropagateError,
                    failedRequestHandler,
                },
                [url.toString()],
            );

            await crawler.run();

            expect(shouldPropagateError).toHaveBeenCalledOnce();
            expect(shouldPropagateError).toHaveBeenCalledWith(testError, expect.anything());
            expect(requestHandler).toHaveBeenCalledTimes(2);
        });

        test('should propagate error when shouldPropagateError returns true', async () => {
            const shouldPropagateError = vi.fn(() => true);
            const url = new URL(`http://${HOSTNAME}:${port}/static`);

            const crawler = await makeOneshotCrawler(
                {
                    requestHandler,
                    renderingTypePredictor,
                    shouldPropagateError,
                    failedRequestHandler,
                },
                [url.toString()],
            );

            await crawler.run();

            expect(shouldPropagateError).toHaveBeenCalledOnce();
            expect(shouldPropagateError).toHaveBeenCalledWith(testError, expect.anything());
            expect(requestHandler).toHaveBeenCalledTimes(1);
            expect(failedRequestHandler).toHaveBeenCalledOnce();
            expect(failedRequestHandler.mock.calls[0][1]).toBe(testError);
        });
    });

    test.each([['static'], ['clientOnly']] as const)(
        'crawlingContext.addRequests() should add requests correctly (%s)',
        async (renderingType) => {
            const renderingTypePredictor = makeRiggedRenderingTypePredictor({
                detectionProbabilityRecommendation: 0,
                renderingType,
            });
            const url = new URL(`http://${HOSTNAME}:${port}`).toString();

            let requestContext: LoadedContext<AdaptivePlaywrightCrawlerContext> | undefined;
            const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = async (context) => {
                const isStartUrl = context.request.url === url;

                if (isStartUrl) await context.addRequests([`${url}/1`]);
                else requestContext = context;
            };

            const crawler = await makeOneshotCrawler(
                { requestHandler, renderingTypePredictor, maxRequestsPerCrawl: 10 },
                [],
            );

            await crawler.run([{ url, crawlDepth: 2 }]);

            assert(requestContext);
            expect(requestContext.request).toMatchObject({ url: `${url}/1`, crawlDepth: 3 });
        },
    );

    describe('should enqueue links correctly', () => {
        test.each([
            ['/static', 'static'],
            ['/dynamic', 'clientOnly'],
        ] as const)('for %s', async (path, renderingType) => {
            const renderingTypePredictor = makeRiggedRenderingTypePredictor({
                detectionProbabilityRecommendation: 0,
                renderingType,
            });
            const url = new URL(`http://${HOSTNAME}:${port}${path}`);
            const enqueuedRequests: Request[] = [];

            const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(
                async ({ enqueueLinks, request }) => {
                    if (request.label === 'enqueued-url') {
                        enqueuedRequests.push(request);
                    } else {
                        await enqueueLinks({ label: 'enqueued-url' });
                    }
                },
            );

            const crawler = await makeOneshotCrawler(
                {
                    requestHandler,
                    renderingTypePredictor,
                    maxRequestsPerCrawl: 10,
                },
                [url.toString()],
            );

            await crawler.run();

            const enqueuedUrls = Array.from(enqueuedRequests).map((request) => request.url);
            expect(new Set(enqueuedUrls)).toEqual(
                new Set([
                    `http://${HOSTNAME}:${port}/static?q=1`,
                    `http://${HOSTNAME}:${port}/static?q=2`,
                    `http://${HOSTNAME}:${port}/static?q=3`,
                    `http://${HOSTNAME}:${port}/static?q=4`,
                    `http://${HOSTNAME}:${port}/static?q=5`,
                ]),
            );

            expect(enqueuedRequests[0]).toMatchObject({
                url: enqueuedUrls[0],
                label: 'enqueued-url',
                crawlDepth: 1,
            });
        });
    });

    test.each([['static'], ['clientOnly']] as const)(
        'should respect the strategy option for enqueueLinks (%s)',
        async (renderingType) => {
            const renderingTypePredictor = makeRiggedRenderingTypePredictor({
                detectionProbabilityRecommendation: 0,
                renderingType,
            });
            const url = new URL(`http://${HOSTNAME}:${port}/external-links`);
            const enqueuedUrls = new Set<string>();
            const visitedUrls = new Set<string>();

            const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(
                async ({ enqueueLinks, request }) => {
                    visitedUrls.add(request.loadedUrl);

                    if (!request.label) {
                        const result = await enqueueLinks({
                            label: 'enqueued-url',
                            strategy: 'same-hostname',
                        });

                        for (const addedRequest of result.addedRequests) {
                            enqueuedUrls.add(addedRequest.uniqueKey);
                        }
                    }
                },
            );

            const crawler = await makeOneshotCrawler(
                {
                    requestHandler,
                    renderingTypePredictor,
                    maxRequestsPerCrawl: 10,
                },
                [url.toString()],
            );

            await crawler.run();

            expect(new Set(visitedUrls)).toEqual(new Set([`http://${HOSTNAME}:${port}/external-links`]));
            expect(new Set(enqueuedUrls)).toEqual(new Set([`http://${HOSTNAME}:${port}/external-redirect`]));
        },
    );

    test('should persist crawler state', async () => {
        const renderingTypePredictor = makeRiggedRenderingTypePredictor({
            detectionProbabilityRecommendation: 0,
            renderingType: 'static',
        });

        const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(async ({ useState }) => {
            const state = await useState({ count: 0 });
            state.count += 1;
        });

        const crawler = await makeOneshotCrawler(
            {
                requestHandler,
                renderingTypePredictor,
                maxRequestsPerCrawl: 3,
            },
            [
                `http://${HOSTNAME}:${port}/static?q=1`,
                `http://${HOSTNAME}:${port}/static?q=2`,
                `http://${HOSTNAME}:${port}/static?q=3`,
            ],
        );

        await crawler.run();
        // Reading through the KeyValueStore frontend parses the JSON value for us.
        expect(await (await KeyValueStore.open()).getValue('CRAWLEE_STATE')).toEqual({ count: 3 });
    });

    test('should return deeply equal but not identical state objects across handler runs', async () => {
        // Force detection to happen
        const renderingTypePredictor = makeRiggedRenderingTypePredictor({
            detectionProbabilityRecommendation: 1,
            renderingType: 'clientOnly',
        });

        // We'll store state references to compare them later
        const stateReferences: any[] = [];

        const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(async ({ useState }) => {
            const state = await useState({ data: { nested: { value: 42 } } });
            stateReferences.push(JSON.parse(JSON.stringify(state)));
            state.randomNumber = Math.random();
        });

        // Run the crawler
        const crawler = await makeOneshotCrawler(
            {
                requestHandler,
                renderingTypePredictor,
            },
            [`http://${HOSTNAME}:${port}/static`],
        );

        await crawler.run();

        // The request handler should have run twice (once in browser, once in HTTP-only mode for detection)
        expect(requestHandler).toHaveBeenCalledTimes(2);
        expect(stateReferences).toHaveLength(2);

        // The state objects should be deeply equal (same values)
        expect(stateReferences[0]).toEqual(stateReferences[1]);

        // But they should not be the same object instance (different references)
        // This is important to ensure that state objects are properly cloned between handler runs
        // and that modifications to one state object don't affect others
        expect(stateReferences[0]).not.toBe(stateReferences[1]);
    });

    test('should persist key-value store changes', async () => {
        const renderingTypePredictor = makeRiggedRenderingTypePredictor({
            detectionProbabilityRecommendation: 0,
            renderingType: 'static',
        });

        const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(
            async ({ request, getKeyValueStore }) => {
                const store = await getKeyValueStore();
                const search = new URLSearchParams(new URL(request.url).search);
                store.setValue(search.get('q'), { content: 42 });
            },
        );

        const crawler = await makeOneshotCrawler(
            {
                requestHandler,
                renderingTypePredictor,
                maxRequestsPerCrawl: 3,
            },
            [
                `http://${HOSTNAME}:${port}/static?q=1`,
                `http://${HOSTNAME}:${port}/static?q=2`,
                `http://${HOSTNAME}:${port}/static?q=3`,
            ],
        );

        await crawler.run();

        const store = await KeyValueStore.open();

        await expect(store.getValue('1')).resolves.toEqual({ content: 42 });
        await expect(store.getValue('2')).resolves.toEqual({ content: 42 });
        await expect(store.getValue('3')).resolves.toEqual({ content: 42 });
    });

    test('should reject transactionalStorage: false at construction', () => {
        expect(
            () =>
                new AdaptivePlaywrightCrawler({
                    transactionalStorage: false,
                    requestHandler: async () => {},
                }),
        ).toThrow(/requires transactional storage/);
    });

    test('should name transactionalStorage in the validation error', () => {
        expect(
            () =>
                new AdaptivePlaywrightCrawler({
                    // @ts-expect-error invalid value on purpose
                    transactionalStorage: 'yes',
                    requestHandler: async () => {},
                }),
        ).toThrow('at `transactionalStorage` in `AdaptivePlaywrightCrawlerOptions`');
    });

    test('should capture direct key-value store manipulation and commit it with the winning attempt', async () => {
        const renderingTypePredictor = makeRiggedRenderingTypePredictor({
            detectionProbabilityRecommendation: 0,
            renderingType: 'static',
        });

        const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(async () => {
            const store = await KeyValueStore.open();
            await store.setValue('1', { content: 42 });
        });

        const failedRequestHandler = vi.fn();

        const crawler = await makeOneshotCrawler(
            {
                requestHandler,
                renderingTypePredictor,
                maxRequestsPerCrawl: 3,
                maxRequestRetries: 0,
                failedRequestHandler,
            },
            [`http://${HOSTNAME}:${port}/static`],
        );

        await crawler.run();
        expect(failedRequestHandler).not.toHaveBeenCalled();

        const store = await KeyValueStore.open();
        expect(await store.getValue('1')).toEqual({ content: 42 });
    });

    test('should persist RenderingTypePredictor state on PERSIST_STATE events', async () => {
        const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(async ({ pushData }) => {
            await pushData({ content: 'test data' });
        });

        // Use a real RenderingTypePredictor instead of the mocked one. An injected predictor is borrowed -
        // the crawler never initializes it, so restoring its persisted state is up to us.
        const renderingTypePredictor = new RenderingTypePredictor({ detectionRatio: 1 });
        await renderingTypePredictor.initialize();

        const crawler = await makeOneshotCrawler(
            {
                requestHandler,
                renderingTypePredictor,
            },
            [`http://${HOSTNAME}:${port}/static`],
        );

        // Run the crawler - this will potentially store rendering type detection results
        await crawler.run();

        // Now emit a PERSIST_STATE event to trigger state persistence
        const events = serviceLocator.getEventManager();
        events.emit(EventType.PERSIST_STATE);

        // Wait a bit for the event to be processed
        await sleep(100);

        // Verify that the regression model was actually saved to the key-value store
        const store = await KeyValueStore.open();
        const storedState = await store.getValue('rendering-type-predictor-state');
        expect(storedState).toHaveProperty('logreg');

        // Test that the persisted state can be successfully restored
        // by creating a new RenderingTypePredictor and seeing if it initializes without error
        const newPredictor = new RenderingTypePredictor({
            detectionRatio: 0.1,
            persistenceOptions: { persistStateKey: 'rendering-type-predictor-state' },
        });

        // This should not throw since we've persisted valid state
        await expect(newPredictor.initialize()).resolves.not.toThrow();
    });

    describe('rendering type predictor lifecycle', () => {
        const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = async ({ pushData }) => {
            await pushData({ content: 'test data' });
        };

        test('initializes the default predictor it built itself', async () => {
            const crawler = new AdaptivePlaywrightCrawler({
                requestHandler,
                // No `renderingTypePredictor` - the crawler builds (and therefore owns) its own.
                renderingTypeDetectionRatio: 1,
                maxConcurrency: 1,
                maxRequestRetries: 0,
                maxRequestsPerCrawl: 1,
                requestList: await RequestList.open({ sources: [`http://${HOSTNAME}:${port}/static`] }),
            });

            await crawler.run();

            // Persistence only happens for an initialized predictor, so a stored state proves the crawler
            // did initialize the predictor it owns.
            serviceLocator.getEventManager().emit(EventType.PERSIST_STATE);
            await sleep(100);

            const store = await KeyValueStore.open();
            await expect(store.getValue<string>('rendering-type-predictor-state')).resolves.not.toBeNull();
        });

        test('tears down the predictor it built itself', async () => {
            const crawler = new AdaptivePlaywrightCrawler({
                requestHandler,
                renderingTypeDetectionRatio: 1,
                maxConcurrency: 1,
                maxRequestRetries: 0,
                maxRequestsPerCrawl: 1,
                requestList: await RequestList.open({ sources: [`http://${HOSTNAME}:${port}/static`] }),
            });

            await crawler.run();

            // The predictor keeps a PERSIST_STATE listener from the moment it is initialized, so a leftover
            // listener after the run means the owned predictor was never torn down.
            expect(serviceLocator.getEventManager().listenerCount(EventType.PERSIST_STATE)).toBe(0);
        });

        test('does not initialize or tear down an injected predictor', async () => {
            const renderingTypePredictor = {
                ...makeRiggedRenderingTypePredictor({
                    detectionProbabilityRecommendation: 0,
                    renderingType: 'static',
                }),
                // Not part of the predictor contract the crawler depends on - a borrowed instance is set up (and
                // disposed of) by whoever created it, so the crawler must keep its hands off.
                initialize: vi.fn(async () => {}),
                teardown: vi.fn(async () => {}),
            };

            const crawler = await makeOneshotCrawler({ requestHandler, renderingTypePredictor }, [
                `http://${HOSTNAME}:${port}/static`,
            ]);

            await crawler.run();

            expect(renderingTypePredictor.predict).toHaveBeenCalledOnce();
            expect(renderingTypePredictor.initialize).not.toHaveBeenCalled();
            expect(renderingTypePredictor.teardown).not.toHaveBeenCalled();
        });
    });

    test('validates userData against the router schema when adding requests', async () => {
        const router = createAdaptivePlaywrightRouter({ DETAIL: z.object({ id: z.string() }) });
        router.addHandler('DETAIL', async () => {});

        const crawler = new AdaptivePlaywrightCrawler({ requestHandler: router });

        await expect(
            crawler.addRequests([{ url: 'https://example.com/a', label: 'DETAIL', userData: { id: 123 } }] as never),
        ).rejects.toThrow(RequestValidationError);
    });

    test('reserves a request for the longest route timeout override', async () => {
        const requestQueue = await RequestQueue.open(`rq-adaptive-${Math.random() * 10000}`);
        const hintSpy = vitest.spyOn(requestQueue, 'setExpectedRequestProcessingTimeSecs');

        const router = createAdaptivePlaywrightRouter();
        router.addHandler('LIST', async () => {}, { requestHandlerTimeoutSecs: 300 });

        const crawler = new AdaptivePlaywrightCrawler({ requestQueue, requestHandler: router });
        await crawler.getRequestManager();

        const maxHint = Math.max(...hintSpy.mock.calls.map((call) => call[0]));
        expect(maxHint).toBeGreaterThanOrEqual(300);
    });

    test('proxied logger supports non-intercepted methods accessing private #-fields without throwing', async () => {
        let warningCalled = false;
        const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = async ({ log }) => {
            // Calling log.warning calls BaseCrawleeLogger methods reading #-fields (#options, #warningsLogged)
            expect(() => log.warning('test warning message')).not.toThrow();
            warningCalled = true;
        };

        const crawler = await makeOneshotCrawler(
            {
                requestHandler,
                renderingTypePredictor: makeRiggedRenderingTypePredictor({
                    renderingType: 'clientOnly',
                    detectionProbabilityRecommendation: 0,
                }),
            },
            [`http://${HOSTNAME}:${port}/static`],
        );

        await crawler.run();
        expect(warningCalled).toBe(true);
    });

    test('forwards browser options to the inner PlaywrightCrawler', () => {
        // `headless` can only collide with `browserPool` in the strict-object validation of the inner
        // `PlaywrightCrawler` if both options actually reached it - proving the options are wired through.
        expect(() => new AdaptivePlaywrightCrawler({ browserPool: playwrightBrowserPool(), headless: false })).toThrow(
            'PlaywrightCrawler: `headless` cannot be combined with `browserPool`',
        );
    });

    test('launchContext reaches the browser launched for the browser-rendering path', async () => {
        const renderingTypePredictor = makeRiggedRenderingTypePredictor({
            renderingType: 'clientOnly',
            detectionProbabilityRecommendation: 0,
        });

        const distinctiveUserAgent = 'CrawleeAdaptiveBrowserOptionsTest/1.0';

        const crawler = await makeOneshotCrawler(
            {
                requestHandler: async () => {},
                renderingTypePredictor,
                launchContext: { userAgent: distinctiveUserAgent },
            },
            [`http://${HOSTNAME}:${port}/dynamic`],
        );

        await crawler.run();

        expect(lastDynamicRequestUserAgent).toBe(distinctiveUserAgent);
    });
});
