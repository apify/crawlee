import type { Server } from 'http';
import type { AddressInfo } from 'net';

import { KeyValueStore } from '@crawlee/core';
import type { AdaptivePlaywrightCrawlerOptions } from '@crawlee/playwright';
import { AdaptivePlaywrightCrawler, RequestList } from '@crawlee/playwright';
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
        predict: vi.fn((_url: URL) => prediction),
        storeResult: vi.fn((_url: URL, _label: string | unknown, _renderingType: string) => {}),
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
                async ({ pushData, querySelector }) => {
                    await pushData({
                        heading: (await querySelector('h1')).text(),
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
            expect(renderingTypePredictor.predict).toHaveBeenCalledWith(url, undefined);
            expect(renderingTypePredictor.storeResult).toHaveBeenCalledWith(url, undefined, expectedType);

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

        expect(renderingTypePredictor.predict).toHaveBeenCalledWith(url, undefined);
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
                result.datasetItems.length > 0 && result.datasetItems.every(({ item }) => item.heading?.length > 0),
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

            const requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'] = vi.fn(
                async ({ enqueueLinks }) => {
                    await enqueueLinks();
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

            const enqueuedUrls = (await localStorageEmulator.getRequestQueueItems()).map((item) => item.url);
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
        expect(state.value).toEqual({ count: 3 });
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

        expect((await store.getRecord('1')).value).toEqual({ content: 42 });
        expect((await store.getRecord('2')).value).toEqual({ content: 42 });
        expect((await store.getRecord('3')).value).toEqual({ content: 42 });
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
});
