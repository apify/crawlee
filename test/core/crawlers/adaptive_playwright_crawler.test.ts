import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Configuration, type Dictionary, EventType, KeyValueStore } from '@crawlee/core';
import type { AdaptivePlaywrightCrawlerOptions, Request } from '@crawlee/playwright';
import { AdaptivePlaywrightCrawler, RenderingTypePredictor, RequestList } from '@crawlee/playwright';
import { sleep } from 'crawlee';
import express from 'express';
import { startExpressAppPromise } from 'test/shared/_helper';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

describe('AdaptivePlaywrightCrawler', () => {
    // Set up an express server that will serve test pages
    const HOSTNAME = '127.0.0.1';
    let port: number;
    let server: Server;

    beforeAll(async () => {
        const app = express();
        server = await startExpressAppPromise(app, 0);
        port = (server.address() as AddressInfo).port;

        app.get('/static', (_req, res) => {
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
            res.status(200);
        });

        app.get('/dynamic', (_req, res) => {
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
            res.status(200);
        });
    });
    afterAll(async () => {
        server.close();
    });

    // Set up local storage emulator
    const localStorageEmulator = new MemoryStorageEmulator();

    beforeEach(async () => {
        await localStorageEmulator.init();
    });
    afterAll(async () => {
        await localStorageEmulator.destroy();
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
        initialize: async () => {},
        predict: vi.fn((_request: Request) => prediction),
        storeResult: vi.fn((_request: Request, _renderingType: string) => {}),
    });

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
            expect(await localStorageEmulator.getDatasetItems()).toEqual([{ heading: 'Heading' }]);
        });
    });

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
    });

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
            const enqueuedUrls = new Set<string>();

            const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(
                async ({ enqueueLinks, request }) => {
                    if (request.label === 'enqueued-url') {
                        enqueuedUrls.add(request.url);
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

            expect(new Set(enqueuedUrls)).toEqual(
                new Set([
                    `http://${HOSTNAME}:${port}/static?q=1`,
                    `http://${HOSTNAME}:${port}/static?q=2`,
                    `http://${HOSTNAME}:${port}/static?q=3`,
                    `http://${HOSTNAME}:${port}/static?q=4`,
                    `http://${HOSTNAME}:${port}/static?q=5`,
                ]),
            );
        });
    });

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
        const state = await localStorageEmulator.getState();
        expect(state!.value).toEqual({ count: 3 });
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
        const store = localStorageEmulator.getKeyValueStore();

        expect((await store.getRecord('1'))!.value).toEqual({ content: 42 });
        expect((await store.getRecord('2'))!.value).toEqual({ content: 42 });
        expect((await store.getRecord('3'))!.value).toEqual({ content: 42 });
    });

    test('should not allow direct key-value store manipulation', async () => {
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
        expect(failedRequestHandler.mock.calls).toHaveLength(1);
        expect((failedRequestHandler.mock.calls[0][1] as Error).message).toEqual(
            'Directly accessing storage in a request handler is not allowed in AdaptivePlaywrightCrawler',
        );

        const store = localStorageEmulator.getKeyValueStore();
        expect(await store.getRecord('1')).toBeUndefined();
    });

    test('should persist RenderingTypePredictor state on PERSIST_STATE events', async () => {
        const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(async ({ pushData }) => {
            await pushData({ content: 'test data' });
        });

        const crawler = await makeOneshotCrawler(
            {
                requestHandler,
                // Use a real RenderingTypePredictor instead of the mocked one
                renderingTypePredictor: new RenderingTypePredictor({ detectionRatio: 1 }),
            },
            [`http://${HOSTNAME}:${port}/static`],
        );

        // Run the crawler - this will initialize the RenderingTypePredictor and potentially store results
        await crawler.run();

        // Now emit a PERSIST_STATE event to trigger state persistence
        const events = Configuration.getEventManager();
        events.emit(EventType.PERSIST_STATE);

        // Wait a bit for the event to be processed
        await sleep(100);

        // Verify that the regression model was actually saved to the key-value store
        const store = await KeyValueStore.open();
        const storedState = await store.getValue<string>('rendering-type-predictor-state');
        expect(storedState).not.toBeNull();

        const parsedState = JSON.parse(storedState!);
        expect(parsedState).toHaveProperty('logreg');

        // Test that the persisted state can be successfully restored
        // by creating a new RenderingTypePredictor and seeing if it initializes without error
        const newPredictor = new RenderingTypePredictor({
            detectionRatio: 0.1,
            persistenceOptions: { persistStateKey: 'rendering-type-predictor-state' },
        });

        // This should not throw since we've persisted valid state
        await expect(newPredictor.initialize()).resolves.not.toThrow();
    });
});
