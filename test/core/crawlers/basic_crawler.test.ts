import { readFile, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import type {
    BasicCrawlerOptions,
    EnqueueLinksOptions,
    ErrorHandler,
    RequestHandler,
    RequestOptions,
    Source,
} from '@crawlee/basic';
import type { Session } from '@crawlee/basic';
import {
    BasicCrawler,
    Configuration,
    CriticalError,
    Dataset,
    defaultRoute,
    ErrorTracker,
    EventType,
    KeyValueStore,
    MissingRouteError,
    NonRetryableError,
    ProxyConfiguration,
    Request,
    RequestList,
    RequestManagerTandem,
    RequestQueue,
    RequestValidationError,
    Router,
    serviceLocator,
    SessionPool,
    Statistics,
    ThrottlingRequestManager,
} from '@crawlee/basic';
import type { CalculatedStatistics, IConcurrencySystem, IStatistics } from '@crawlee/core';
import { ConcurrencySystem, MemoryStorageBackend, RequestState } from '@crawlee/core';
import { BaseHttpClient } from '@crawlee/http-client';
import type { Dictionary, ISession, ProxyInfo } from '@crawlee/types';
import { RobotsTxtFile, sleep } from '@crawlee/utils';
import express from 'express';
import type { Mock } from 'vitest';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vitest } from 'vitest';
import { z } from 'zod';

import { startExpressAppPromise } from '../../shared/_helper.js';

import log from '@apify/log';

type MemoryRequestQueueBackend = Awaited<ReturnType<MemoryStorageBackend['createRequestQueueBackend']>>;

describe('BasicCrawler', () => {
    let logLevel: number;
    let requestQueueBackend: MemoryRequestQueueBackend;

    const HOSTNAME = '127.0.0.1';
    let port: number;
    let server: Server;

    beforeAll(async () => {
        const app = express();

        app.get('/', (req, res) => {
            res.send(`<html><head><title>Example Domain</title></head></html>`);
        });

        server = await startExpressAppPromise(app, 0);
        port = (server.address() as AddressInfo).port;
    });

    beforeAll(async () => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.OFF);
    });

    beforeEach(async () => {
        vitest.clearAllMocks();
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        const memoryRequestQueue = await RequestQueue.open();
        requestQueueBackend = memoryRequestQueue.backend as MemoryRequestQueueBackend;
    });

    afterAll(async () => {
        log.setLevel(logLevel);
    });

    afterAll(() => {
        server.close();
    });

    test('constructor eagerly resolves the configuration, avoiding a later implicit-configuration warning', () => {
        serviceLocator.reset();
        const warningSpy = vitest.spyOn(serviceLocator.getLogger(), 'warning');

        new BasicCrawler({ requestHandler: async () => {} });
        serviceLocator.getStorageBackend();

        expect(warningSpy).not.toHaveBeenCalledWith(expect.stringMatching(/implicitly set configuration/));

        // restore the shared storage backend expected by the other tests' beforeEach
        serviceLocator.reset();
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    test('crawler-scoped service locator inherits ambient services that are not explicitly overridden', async () => {
        const ambientBackend = serviceLocator.getStorageBackend();

        let seenBackend: unknown;
        // Passing only a `logger` creates a crawler-scoped service locator - it must inherit the
        // ambient storage backend rather than falling back to the default file-system one.
        const crawler = new BasicCrawler({
            logger: serviceLocator.getLogger(),
            requestHandler: async () => {
                seenBackend = serviceLocator.getStorageBackend();
            },
        });

        await crawler.run(['https://example.com']);

        expect(seenBackend).toBe(ambientBackend);
    });

    test('does not leak sigint events', async () => {
        let count = 0;

        const crawler = new BasicCrawler({
            requestHandler: () => {
                count = process.listenerCount('SIGINT');
            },
        });

        await crawler.run(['https://example.com']);

        expect(process.listenerCount('SIGINT')).toBe(count - 1);
    });

    test('setStatusMessage emits a STATUS_MESSAGE event', async () => {
        const events = serviceLocator.getEventManager();
        const received: any[] = [];
        const listener = (data: any) => received.push(data);
        events.on(EventType.STATUS_MESSAGE, listener);

        try {
            const crawler = new BasicCrawler({
                id: 'my-crawler',
                requestHandler: () => {},
            });

            crawler.setStatusMessage('hello there', { level: 'INFO', isStatusMessageTerminal: true });

            expect(received).toEqual([
                { crawlerId: 'my-crawler', message: 'hello there', level: 'INFO', isStatusMessageTerminal: true },
            ]);
        } finally {
            events.off(EventType.STATUS_MESSAGE, listener);
        }
    });

    test('run() broadcasts start and terminal STATUS_MESSAGE events', async () => {
        const events = serviceLocator.getEventManager();
        const messages: string[] = [];
        const listener = (data: any) => messages.push(data.message);
        events.on(EventType.STATUS_MESSAGE, listener);

        try {
            const crawler = new BasicCrawler({
                requestHandler: () => {},
            });

            await crawler.run(['https://example.com']);

            expect(messages.some((m) => m === 'Starting the crawler.')).toBe(true);
            expect(messages.some((m) => m.startsWith('Finished!'))).toBe(true);
        } finally {
            events.off(EventType.STATUS_MESSAGE, listener);
        }
    });

    test('should run in parallel thru all the requests', async () => {
        const sources = [...Array(500).keys()].map((index) => ({ url: `https://example.com/${index}` }));
        const sourcesCopy = JSON.parse(JSON.stringify(sources));

        const processed: { url: string }[] = [];
        const requestList = await RequestList.open(null, sources);
        const requestHandler: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed.push({ url: request.url });
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            minConcurrency: 25,
            maxConcurrency: 25,
            requestHandler,
        });

        await basicCrawler.run();

        expect((basicCrawler.concurrencySystem! as ConcurrencySystem).minConcurrency).toBe(25);
        expect(processed).toEqual(sourcesCopy);
        expect((await requestList.checkReadiness()).status).toBe('finished');
    });

    test('accepts a `requestManager` and crawls from it', async () => {
        const requestManager = await RequestQueue.open();
        await requestManager.addRequest({ url: 'https://example.com/from-request-manager' });

        const processed: string[] = [];
        const crawler = new BasicCrawler({
            requestManager,
            requestHandler: async ({ request }) => {
                processed.push(request.url);
            },
        });

        await crawler.run();

        expect(processed).toEqual(['https://example.com/from-request-manager']);
    });

    test('folds a supplied concurrencySystem into its pool and never tears the system down', async () => {
        const sources = [...Array(20).keys()].map((index) => ({ url: `https://example.com/${index}` }));
        const requestList = await RequestList.open(null, sources);

        const processed: string[] = [];
        const requestHandler: RequestHandler = async ({ request }) => {
            await sleep(1);
            processed.push(request.url);
        };

        const system = new ConcurrencySystem({ minConcurrency: 7, maxConcurrency: 7 });
        const startSpy = vitest.spyOn(system, 'start');
        const stopSpy = vitest.spyOn(system, 'stop');

        const basicCrawler = new BasicCrawler({
            requestList,
            concurrencySystem: system,
            requestHandler,
        });

        // The caller owns a supplied system's lifecycle.
        await system.start();
        await basicCrawler.run();
        await system.stop();

        // The crawler built its own pool but wired the shared governor into it.
        expect(basicCrawler.concurrencySystem!).toBe(system);
        expect((basicCrawler.concurrencySystem! as ConcurrencySystem).minConcurrency).toBe(7);
        // Work actually ran (the crawler kept its own task loop).
        expect(processed).toHaveLength(20);
        // The crawler never touched the borrowed system's lifecycle — only our two explicit calls did.
        expect(startSpy).toHaveBeenCalledTimes(1);
        expect(stopSpy).toHaveBeenCalledTimes(1);
    });

    test('identifies itself to its concurrency system by its own id', async () => {
        const system = new ConcurrencySystem({ minConcurrency: 2, maxConcurrency: 2 });
        const bookings = vitest.spyOn(system, 'tryRegisterTaskStart');

        const makeCrawler = async (id: string) => {
            const requestList = await RequestList.open(`identified-${id}`, [{ url: `https://example.com/${id}` }]);
            return new BasicCrawler({ id, requestList, concurrencySystem: system, requestHandler: async () => {} });
        };

        const [a, b] = await Promise.all([makeCrawler('crawler-a'), makeCrawler('crawler-b')]);

        await system.start();
        await Promise.all([a.run(), b.run()]);
        await system.stop();

        // A shared governor is told which crawler each booking is for, under the same id the crawler is known by
        // elsewhere - so an allocating implementation can keep them from starving each other.
        const bookedFor = new Set(bookings.mock.calls.map(([consumer]) => consumer?.id));
        expect(bookedFor).toEqual(new Set(['crawler-a', 'crawler-b']));
    });

    test.each(['minConcurrency', 'maxConcurrency', 'initialConcurrency', 'maxRequestsPerMinute'] as const)(
        'throws when %s is combined with a supplied concurrencySystem',
        (shortcut) => {
            expect(
                () =>
                    new BasicCrawler({
                        concurrencySystem: new ConcurrencySystem(),
                        [shortcut]: 1,
                        requestHandler: async () => {},
                    }),
            ).toThrow(/cannot be combined with `concurrencySystem`/);
        },
    );

    test('two crawlers sharing a ConcurrencySystem cap their combined concurrency', async () => {
        const system = new ConcurrencySystem({ minConcurrency: 3, maxConcurrency: 3, desiredConcurrency: 3 });

        let combinedCurrent = 0;
        let combinedPeak = 0;

        const makeCrawler = async (offset: number) => {
            const sources = [...Array(30).keys()].map((index) => ({ url: `https://example.com/${offset}-${index}` }));
            const requestList = await RequestList.open(`shared-${offset}`, sources);

            const requestHandler: RequestHandler = async () => {
                combinedCurrent++;
                combinedPeak = Math.max(combinedPeak, combinedCurrent);
                await sleep(3);
                combinedCurrent--;
            };

            return new BasicCrawler({
                requestList,
                concurrencySystem: system,
                requestHandler,
            });
        };

        const [a, b] = await Promise.all([makeCrawler(0), makeCrawler(1)]);
        // The shared system is the caller's to run — the crawlers borrow it and never touch its lifecycle.
        await system.start();
        await Promise.all([a.run(), b.run()]);
        await system.stop();

        expect(combinedPeak).toBeLessThanOrEqual(3);
    });

    test('should allow using run method multiple times', async () => {
        const sources = [...Array(100).keys()].map((index) => `https://example.com/${index}`);
        const sourcesCopy = JSON.parse(JSON.stringify(sources));

        const processed: { url: string }[] = [];
        const requestHandler: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed.push({ url: request.url });
        };

        const basicCrawler = new BasicCrawler({
            minConcurrency: 25,
            maxConcurrency: 25,
            requestHandler,
        });

        const queue = await basicCrawler.getRequestQueue();

        // Nothing is emptied between runs, so the same sources are only re-crawled after a purge.
        await basicCrawler.run(sources);
        await queue.purge?.();
        await basicCrawler.run(sources);
        await queue.purge?.();
        await basicCrawler.run(sources);

        expect(processed).toHaveLength(sourcesCopy.length * 3);
    });

    test('builds a fresh owned ConcurrencySystem for every run', async () => {
        const crawler = new BasicCrawler({
            requestHandler: async () => {},
        });

        await crawler.run(['https://example.com/1']);
        const firstSystem = crawler.concurrencySystem! as ConcurrencySystem;
        // Simulate scaling state left behind by the first run.
        firstSystem.desiredConcurrency = 42;

        await crawler.run(['https://example.com/2']);
        const secondSystem = crawler.concurrencySystem!;

        // The crawler-owned governor is rebuilt per run, so no previous-run state (resource snapshots,
        // autoscaled desired concurrency, per-minute task counts) can distort the next run's scaling.
        expect(secondSystem).not.toBe(firstSystem);
        // The rebuilt governor starts over from the default desired concurrency (the immediate autoscale tick on
        // start may already have nudged it up a step) instead of inheriting the previous run's value.
        expect(secondSystem.desiredConcurrency).toBeLessThanOrEqual(2);
    });

    test('stops the owned ConcurrencySystem when startup fails after it was started', async () => {
        const crawler = new BasicCrawler({
            requestHandler: async () => {},
        });

        const failure = new Error('Could not open the request queue');
        // `init()` starts the concurrency system before it resolves the request manager, so this fails after the
        // system's intervals are already ticking.
        const getRequestManager = vitest
            .spyOn(crawler, 'getRequestManager')
            .mockImplementation(async () => Promise.reject(failure));

        // No initial requests — `addRequests()` would resolve the request manager before `init()` even runs.
        await expect(crawler.run()).rejects.toThrow(failure);

        // The intervals would otherwise keep the event loop alive for the rest of the process's life.
        expect((crawler.concurrencySystem! as ConcurrencySystem).isRunning).toBe(false);

        // A failed startup is not a run, so the crawler must not stay wedged as `running`.
        getRequestManager.mockRestore();
        await crawler.run(['https://example.com/2']);
    });

    test('should process 4 requests total when calling run() twice with maxRequestsPerCrawl: 2', async () => {
        const processed: { url: string }[] = [];

        const requestHandler: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed.push({ url: request.url });
        };

        const crawler = new BasicCrawler({
            maxRequestsPerCrawl: 2,
            minConcurrency: 1,
            maxConcurrency: 1,
            requestHandler,
        });

        // First run should process 2 requests
        await crawler.run([...Array(5).keys()].map((index) => `https://example.com/first/${index}`));
        expect(processed).toHaveLength(2);

        // Make sure no extra requests were enqueued
        await expect(requestQueueBackend.listItems()).resolves.toEqual([]);

        // Second run should process 2 more requests
        await crawler.run([...Array(5).keys()].map((index) => `https://example.com/second/${index}`));
        expect(processed).toHaveLength(4);

        // Make sure no extra requests were enqueued
        await expect(requestQueueBackend.listItems()).resolves.toEqual([]);

        const processedUrls = processed.map((p) => p.url);

        expect(processedUrls).toEqual([
            'https://example.com/first/0',
            'https://example.com/first/1',
            'https://example.com/second/0',
            'https://example.com/second/1',
        ]);
    });

    describe('a crawl that processes nothing', () => {
        const crawlTwice = async (betweenRuns?: (crawler: BasicCrawler) => Promise<void>) => {
            const processed: string[] = [];
            const crawler = new BasicCrawler({
                requestHandler: async ({ request }) => {
                    processed.push(request.url);
                },
            });
            const warning = vitest.spyOn(crawler.log, 'warning');

            await crawler.run(['https://example.com/only']);
            await betweenRuns?.(crawler);
            await crawler.run(['https://example.com/only']);

            return { processed, warning };
        };

        test('leaves already handled requests alone and says so', async () => {
            const { processed, warning } = await crawlTwice();

            expect(processed).toEqual(['https://example.com/only']);
            expect(warning).toHaveBeenCalledWith(expect.stringMatching(/processed no requests/));
        });

        test('re-crawls the requests when the queue is purged in between', async () => {
            const { processed, warning } = await crawlTwice(async (crawler) => {
                await (await crawler.getRequestQueue()).purge?.();
            });

            expect(processed).toEqual(['https://example.com/only', 'https://example.com/only']);
            expect(warning).not.toHaveBeenCalledWith(expect.stringMatching(/processed no requests/));
        });

        test('warns a crawler on its first run, over a queue another crawler exhausted', async () => {
            const requestQueue = await RequestQueue.open();
            const first = new BasicCrawler({ requestQueue, requestHandler: async () => {} });
            await first.run(['https://example.com/only']);

            const second = new BasicCrawler({ requestQueue, requestHandler: async () => {} });
            const warning = vitest.spyOn(second.log, 'warning');

            await second.run(['https://example.com/only']);

            expect(warning).toHaveBeenCalledWith(expect.stringMatching(/processed no requests/));
        });

        test('says nothing when there was nothing to crawl in the first place', async () => {
            // An empty queue is not evidence of a mistake - only requests that turn out to be handled are.
            const crawler = new BasicCrawler({ requestHandler: async () => {} });
            const warning = vitest.spyOn(crawler.log, 'warning');

            await crawler.run();

            expect(warning).not.toHaveBeenCalledWith(expect.stringMatching(/processed no requests/));
        });
    });

    test('addRequests should respect maxCrawlDepth', async () => {
        const processedUrls: string[] = [];

        const requestHandler: RequestHandler = async ({ request, addRequests }) => {
            processedUrls.push(request.url);
            const url = new URL(request.url);
            url.pathname = `${url.pathname}deep/`;

            await addRequests([url.toString()]);
        };

        const crawler = new BasicCrawler({
            maxCrawlDepth: 2,
            maxRequestsPerCrawl: 10, // safeguard against infinite loops
            requestHandler,
        });

        await crawler.run(['https://example.com/']);

        expect(processedUrls).toEqual([
            'https://example.com/',
            'https://example.com/deep/',
            'https://example.com/deep/deep/',
        ]);
    });

    test('enqueueLinks should respect maxCrawlDepth', async () => {
        const processedUrls: string[] = [];

        const requestHandler: RequestHandler = async ({ request, addRequests }) => {
            processedUrls.push(request.url);
            const url = new URL(request.url);
            url.pathname = `${url.pathname}deep/`;

            await addRequests([url.toString()]);
        };

        const crawler = new BasicCrawler({
            maxCrawlDepth: 2,
            maxRequestsPerCrawl: 10, // safeguard against infinite loops
            requestHandler,
        });

        await crawler.run(['https://example.com/']);

        expect(processedUrls).toEqual([
            'https://example.com/',
            'https://example.com/deep/',
            'https://example.com/deep/deep/',
        ]);
    });

    describe('addRequests() filters', () => {
        let onSkippedRequestMock: Mock;
        let addRequestsBatchedMock: Mock;
        let drainedRequests: any[];
        let options: EnqueueLinksOptions;
        let requestQueue: RequestQueue;

        const crawler = new BasicCrawler({ maxCrawlDepth: 3 });

        // Mimics what `context.addRequests()` would have tagged the URLs with, based on the current
        // request's `crawlDepth`.
        const atDepth = (urls: string[], crawlDepth: number) => urls.map((url) => ({ url, crawlDepth }));

        beforeEach(() => {
            drainedRequests = [];
            // `addRequests()` now streams via an async generator (matching how it always fed
            // `addRequestsBatched()`), so the mock has to drain it to see what was actually produced.
            addRequestsBatchedMock = vi.fn().mockImplementation(async (requests: AsyncIterable<unknown>) => {
                for await (const request of requests) {
                    drainedRequests.push(request);
                }
                return { addedRequests: [], waitForAllRequestsToBeAdded: Promise.resolve([]), requestsOverLimit: [] };
            });
            onSkippedRequestMock = vi.fn();

            options = {
                onSkippedRequest: onSkippedRequestMock,
            };
            requestQueue = {
                addRequestsBatched: addRequestsBatchedMock as RequestQueue['addRequestsBatched'],
            } as RequestQueue;
            // eslint-disable-next-line dot-notation -- private field on the crawler, injected for the mock
            crawler['requestManager'] = requestQueue;
        });

        it('should generate requests with maxCrawlDepth', async () => {
            const urls = atDepth(['https://example.com/1/', 'https://example.com/2/'], 3);
            await crawler.addRequests(urls, options);

            expect(drainedRequests).toHaveLength(2);
            expect(drainedRequests[0]).toMatchObject({ url: 'https://example.com/1/', crawlDepth: 3 });
            expect(drainedRequests[1]).toMatchObject({ url: 'https://example.com/2/', crawlDepth: 3 });

            expect(onSkippedRequestMock).not.toBeCalled();
        });

        it('should skip requests with crawlDepth exceeding maxCrawlDepth', async () => {
            const urls = atDepth(['https://example.com/1/', 'https://example.com/2/'], 4);
            await crawler.addRequests(urls, options);

            expect(drainedRequests).toHaveLength(0);

            const skippedRequests = onSkippedRequestMock.mock.calls.map((call) => call[0]);
            expect(skippedRequests).toHaveLength(2);
            expect(skippedRequests[0].reason).toBe('depth');
            expect(skippedRequests[0].request).toBeInstanceOf(Request);
            expect(skippedRequests[0].request.url).toBe('https://example.com/1/');
            expect(skippedRequests[1].reason).toBe('depth');
            expect(skippedRequests[1].request).toBeInstanceOf(Request);
            expect(skippedRequests[1].request.url).toBe('https://example.com/2/');
        });

        it('should respect user provided transformRequestFunction', async () => {
            const urls = atDepth(['https://example.com/1/', 'https://example.com/2/'], 3);
            const transformRequestFunction = vi.fn((req: RequestOptions) => req);
            const optionsWithTransform = { ...options, transformRequestFunction };

            await crawler.addRequests(urls, optionsWithTransform);

            expect(transformRequestFunction).toHaveBeenCalled();

            expect(drainedRequests).toHaveLength(2);
            expect(drainedRequests[0]).toMatchObject({ url: 'https://example.com/1/', crawlDepth: 3 });
        });

        it.each([null, undefined, false] as const)(
            'should skip requests when transformRequestFunction returns %s',
            async (returnValue) => {
                const urls = atDepth(['https://example.com/1/', 'https://example.com/2/'], 3);
                const transformRequestFunction = vi.fn(() => returnValue);
                const optionsWithTransform = { ...options, transformRequestFunction };

                await crawler.addRequests(urls, optionsWithTransform);

                expect(drainedRequests).toHaveLength(0);

                const skippedRequests = onSkippedRequestMock.mock.calls.map((call) => call[0]);
                expect(skippedRequests).toHaveLength(2);
                expect(skippedRequests[0].reason).toBe('transform');
                expect(skippedRequests[0].request.url).toBe('https://example.com/1/');
                expect(skippedRequests[1].reason).toBe('transform');
                expect(skippedRequests[1].request.url).toBe('https://example.com/2/');
            },
        );

        it('should report depth-limited requests with reason "depth" even when user transformRequestFunction is provided', async () => {
            const urls = atDepth(['https://example.com/1/', 'https://example.com/2/'], 4);
            const transformRequestFunction = vi.fn((req: RequestOptions) => req);
            const optionsWithTransform = { ...options, transformRequestFunction };

            await crawler.addRequests(urls, optionsWithTransform);

            expect(drainedRequests).toHaveLength(0);

            // Depth-limited requests should not reach the user's transformRequestFunction
            expect(transformRequestFunction).not.toHaveBeenCalled();

            // The skipped reason should be 'depth', not 'transform'
            const skippedRequests = onSkippedRequestMock.mock.calls.map((call) => call[0]);
            expect(skippedRequests).toHaveLength(2);
            expect(skippedRequests[0].reason).toBe('depth');
            expect(skippedRequests[0].request).toBeInstanceOf(Request);
            expect(skippedRequests[0].request.url).toBe('https://example.com/1/');
            expect(skippedRequests[1].reason).toBe('depth');
            expect(skippedRequests[1].request).toBeInstanceOf(Request);
            expect(skippedRequests[1].request.url).toBe('https://example.com/2/');
        });
    });

    describe('addRequests() background skip reporting', () => {
        test('reports filtered requests discovered in background batches', async () => {
            const onSkippedRequest = vitest.fn();
            const crawler = new BasicCrawler({
                requestHandler: async () => {},
                onSkippedRequest,
            });

            const inScope = Array.from({ length: 2_000 }, (_, i) => `https://example.com/ok/${i}`);
            const outOfScope = Array.from({ length: 50 }, (_, i) => `https://other.com/no/${i}`);

            const { addedRequests, waitForAllRequestsToBeAdded } = await crawler.addRequests(
                [...inScope, ...outOfScope],
                {
                    waitBetweenBatchesMillis: 0,
                    include: ['https://example.com/**'],
                },
            );
            const backgroundAddedRequests = await waitForAllRequestsToBeAdded;

            expect(addedRequests).toHaveLength(1_000);
            expect(backgroundAddedRequests).toHaveLength(1_000);
            expect(onSkippedRequest.mock.calls.map(([{ request, reason }]) => ({ url: request.url, reason }))).toEqual(
                outOfScope.map((url) => ({ url, reason: 'filters' })),
            );
        });

        test('background onSkippedRequest rejection rejects the background completion promise', async () => {
            const crawler = new BasicCrawler({
                requestHandler: async () => {},
                onSkippedRequest: async () => {
                    throw new Error('onSkippedRequest failed');
                },
            });

            const { addedRequests, waitForAllRequestsToBeAdded } = await crawler.addRequests(
                [
                    'https://example.com/1',
                    'https://example.com/2',
                    'https://example.com/3',
                    'https://example.com/4',
                    'https://other.com/no',
                ],
                {
                    batchSize: 2,
                    waitBetweenBatchesMillis: 0,
                    include: ['https://example.com/**'],
                },
            );

            expect(addedRequests).toHaveLength(2);
            await expect(waitForAllRequestsToBeAdded).rejects.toThrow('onSkippedRequest failed');
        });

        test('a background onSkippedRequest rejection stays handled when nobody awaits the addition', async () => {
            const reportStarted = Promise.withResolvers<void>();
            const crawler = new BasicCrawler({
                requestHandler: async () => {},
                onSkippedRequest: async () => {
                    reportStarted.resolve();
                    throw new Error('onSkippedRequest failed');
                },
            });

            const unhandled: unknown[] = [];
            const collectUnhandled = (reason: unknown) => unhandled.push(reason);
            process.on('unhandledRejection', collectUnhandled);

            try {
                // Deliberately dropping `waitForAllRequestsToBeAdded`: that is the default way to call
                // `addRequests`, and the background skip report rejecting there must not take the process down.
                await crawler.addRequests(
                    [
                        'https://example.com/1',
                        'https://example.com/2',
                        'https://example.com/3',
                        'https://example.com/4',
                        'https://other.com/no',
                    ],
                    {
                        batchSize: 2,
                        waitBetweenBatchesMillis: 0,
                        include: ['https://example.com/**'],
                    },
                );

                await reportStarted.promise;
                // Node only flags a rejection as unhandled once the tick's microtasks have drained.
                const nextTick = Promise.withResolvers<void>();
                setImmediate(nextTick.resolve);
                await nextTick.promise;
            } finally {
                process.off('unhandledRejection', collectUnhandled);
            }

            expect(unhandled).toEqual([]);
        });

        test('drains foreground and background robots.txt skips exactly once', async () => {
            const onSkippedRequest = vitest.fn();
            const crawler = new BasicCrawler({
                requestHandler: async () => {},
                onSkippedRequest,
            });
            vitest
                .spyOn(crawler as any, 'isAllowedBasedOnRobotsTxtFile')
                .mockImplementation(async (url: unknown) => !String(url).includes('/denied'));
            const warningSpy = vitest.spyOn(crawler.log, 'warning');

            const foregroundDenied = 'https://example.com/denied/foreground';
            const backgroundDenied = 'https://example.com/denied/background';
            const { waitForAllRequestsToBeAdded } = await crawler.addRequests(
                [
                    foregroundDenied,
                    'https://example.com/1',
                    'https://example.com/2',
                    'https://example.com/3',
                    'https://example.com/4',
                    backgroundDenied,
                ],
                { batchSize: 2, waitBetweenBatchesMillis: 0 },
            );
            await waitForAllRequestsToBeAdded;

            expect(onSkippedRequest.mock.calls.map(([{ request, reason }]) => ({ url: request.url, reason }))).toEqual([
                { url: foregroundDenied, reason: 'robotsTxt' },
                { url: backgroundDenied, reason: 'robotsTxt' },
            ]);
            expect(
                warningSpy.mock.calls
                    .filter(([message]) => message.includes('robots.txt'))
                    .map(([, details]) => details),
            ).toEqual([{ skipped: [foregroundDenied] }, { skipped: [backgroundDenied] }]);
        });
    });

    it('addCrawlDepthRequestGenerator() should generate requests with maxCrawlDepth', async () => {
        type AddCrawlDepthWrapperOptions = Parameters<BasicCrawler['addCrawlDepthRequestGenerator']>;
        class TestCrawler extends BasicCrawler {
            public exposedAddCrawlDepthRequestGenerator(...enqueueLinksOptions: AddCrawlDepthWrapperOptions) {
                return this.addCrawlDepthRequestGenerator(...enqueueLinksOptions);
            }
        }

        const crawler = new TestCrawler();

        const requests = ['https://example.com/1/', { url: 'https://example.com/2/' }];
        const newCrawlDepth = 4;
        const addRequestsGenerator = crawler.exposedAddCrawlDepthRequestGenerator(requests, newCrawlDepth);

        const generatedRequests: Source[] = [];
        for await (const generatedRequest of addRequestsGenerator) {
            generatedRequests.push(generatedRequest);
        }

        expect(generatedRequests).toHaveLength(2);
        expect(generatedRequests[0].url).toBe('https://example.com/1/');
        expect(generatedRequests[0].crawlDepth).toBe(4);

        expect(generatedRequests[1].url).toBe('https://example.com/2/');
        expect(generatedRequests[1].crawlDepth).toBe(4);
    });

    test('concurrency shortcuts configure the default system; an injected system is used as-is', async () => {
        const requestList = await RequestList.open(null, []);
        const requestHandler = async () => {};

        const collect = (crawler: BasicCrawler) => ({
            minConcurrency: (crawler.concurrencySystem! as ConcurrencySystem).minConcurrency,
            maxConcurrency: (crawler.concurrencySystem! as ConcurrencySystem).maxConcurrency,
            desiredConcurrency: (crawler.concurrencySystem! as ConcurrencySystem).desiredConcurrency,
            // eslint-disable-next-line dot-notation -- private member on the governor
            maxTasksPerMinute: (crawler.concurrencySystem! as ConcurrencySystem)['maxTasksPerMinute'],
        });

        // Shortcuts feed the default ConcurrencySystem the crawler builds.
        const shortcuts = new BasicCrawler({
            requestList,
            requestHandler,
            minConcurrency: 123,
            maxConcurrency: 456,
            initialConcurrency: 234,
            maxRequestsPerMinute: 789,
        });

        // An injected system carries its own config (the shortcuts are rejected alongside one, see above).
        const injectedSystem = new ConcurrencySystem({
            minConcurrency: 16,
            maxConcurrency: 32,
            desiredConcurrency: 24,
            maxTasksPerMinute: 64,
        });
        const injected = new BasicCrawler({
            requestList,
            requestHandler,
            concurrencySystem: injectedSystem,
        });

        // An injected system is ours to run - the crawler refuses to run against one that was never started.
        await injectedSystem.start();
        await Promise.all([shortcuts.run(), injected.run()]);
        await injectedSystem.stop();

        expect(collect(shortcuts)).toEqual({
            minConcurrency: 123,
            maxConcurrency: 456,
            desiredConcurrency: 234,
            maxTasksPerMinute: 789,
        });
        expect(collect(injected)).toEqual({
            minConcurrency: 16,
            maxConcurrency: 32,
            desiredConcurrency: 24,
            maxTasksPerMinute: 64,
        });
        // The injected system is the very instance the pool uses.
        expect(injected.concurrencySystem!).toBe(injectedSystem);
    });

    test('auto-saved state object', async () => {
        const sources = [...Array(50).keys()].map((index) => ({ url: `https://example.com/${index}` }));
        const sourcesCopy = JSON.parse(JSON.stringify(sources));

        const processed: { url: string }[] = [];
        const requestList = await RequestList.open(null, sources);
        const requestHandler: RequestHandler = async ({ request, useState }) => {
            await sleep(10);
            const state = await useState({ processed });
            state.processed.push({ url: request.url });
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            requestHandler,
        });

        await basicCrawler.run();
        const state = await basicCrawler.useState();

        expect(processed).toEqual(sourcesCopy);
        expect(state.processed).toEqual(sourcesCopy);
        expect(state.processed).toBe(processed);
        expect(state.processed).toEqual(sourcesCopy);
        expect((await requestList.checkReadiness()).status).toBe('finished');
    });

    test('print a warning on sharing state between two crawlers', async () => {
        function createCrawler() {
            return new BasicCrawler({
                requestHandler: async ({ request, useState }) => {
                    const state = await useState<{ urls: string[] }>({ urls: [] });
                    state.urls.push(request.url);
                },
            });
        }

        const [crawler1, crawler2] = [createCrawler(), createCrawler()];

        const loggerSpy = vitest.spyOn(serviceLocator.getLogger(), 'warningOnce');

        await crawler1.run([`http://${HOSTNAME}:${port}/`]);
        await crawler2.run([`http://${HOSTNAME}:${port}/?page=2`]);

        // Both crawlers should share the same state (backward compatibility)
        const state1 = await crawler1.useState<{ urls: string[] }>();
        const state2 = await crawler2.useState<{ urls: string[] }>();

        expect(state1).toBe(state2);
        expect(state1.urls).toHaveLength(2);
        expect(state1.urls).toContain(`http://${HOSTNAME}:${port}/`);
        expect(state1.urls).toContain(`http://${HOSTNAME}:${port}/?page=2`);
        expect(loggerSpy).toBeCalledWith(expect.stringContaining('Multiple crawler instances are calling useState()'));
    });

    test('shared-state warning is emitted only once regardless of crawler count', async () => {
        // This test guards against a regression where per-instance loggers were used
        // for a class-level (static) concern: each crawler would emit the warning
        // independently, producing N warnings for N crawlers instead of just one.

        // Clear the global logger's dedup state so this test is isolated from others.
        (log as any).warningsOnceLogged.clear();

        // Spy on the underlying warning dispatch to count actual emissions.
        const warningSpy = vitest.spyOn(serviceLocator.getLogger(), 'warning');
        const crawlers = [
            new BasicCrawler({
                requestHandler: async ({ useState }) => {
                    await useState({ count: 0 });
                },
            }),
            new BasicCrawler({
                requestHandler: async ({ useState }) => {
                    await useState({ count: 0 });
                },
            }),
            new BasicCrawler({
                requestHandler: async ({ useState }) => {
                    await useState({ count: 0 });
                },
            }),
        ];

        await crawlers[0].run([`http://${HOSTNAME}:${port}/`]);
        await crawlers[1].run([`http://${HOSTNAME}:${port}/?page=2`]);
        await crawlers[2].run([`http://${HOSTNAME}:${port}/?page=3`]);

        const sharedStateWarnings = warningSpy.mock.calls.filter(
            ([msg]) => typeof msg === 'string' && msg.includes('Multiple crawler instances are calling useState()'),
        );
        expect(sharedStateWarnings).toHaveLength(1);
    });

    test('crawlers with explicit id have isolated state', async () => {
        function createCrawler(id: string) {
            return new BasicCrawler({
                id,
                requestHandler: async ({ request, useState }) => {
                    const state = await useState<{ urls: string[] }>({ urls: [] });
                    state.urls.push(request.url);
                },
            });
        }

        const [crawler1, crawler2] = [createCrawler('crawler-1'), createCrawler('crawler-2')];

        await crawler1.run([`http://${HOSTNAME}:${port}/`]);
        await crawler2.run([`http://${HOSTNAME}:${port}/?page=2`]);

        // Each crawler should have its own isolated state
        const state1 = await crawler1.useState<{ urls: string[] }>();
        const state2 = await crawler2.useState<{ urls: string[] }>();

        expect(state1).not.toBe(state2);
        expect(state1.urls).toHaveLength(1);
        expect(state1.urls).toContain(`http://${HOSTNAME}:${port}/`);
        expect(state2.urls).toHaveLength(1);
        expect(state2.urls).toContain(`http://${HOSTNAME}:${port}/?page=2`);
    });

    test.each([EventType.MIGRATING, EventType.ABORTING])(
        'should pause on %s event and persist RequestList state',
        async (event) => {
            const sources = [...Array(500).keys()].map((index) => ({ url: `https://example.com/${index + 1}` }));

            let persistResolve!: (value?: unknown) => void;
            const persistPromise = new Promise((res) => {
                persistResolve = res;
            });

            // Mock the calls to persist sources.
            const getValueSpy = vitest.spyOn(KeyValueStore.prototype, 'getValue');
            const setValueSpy = vitest.spyOn(KeyValueStore.prototype, 'setValue');
            getValueSpy.mockResolvedValue(null);

            const processed: { url: string }[] = [];
            const requestList = await RequestList.open('reqList', sources);
            const requestHandler: RequestHandler = async ({ request }) => {
                if (request.url.endsWith('200')) serviceLocator.getEventManager().emit(event);
                processed.push({ url: request.url });
            };

            const basicCrawler = new BasicCrawler({
                requestList,
                minConcurrency: 25,
                maxConcurrency: 25,
                requestHandler,
            });

            let finished = false;
            // Mock the call to persist state.
            setValueSpy.mockImplementationOnce(persistResolve as any);
            // The crawler will pause after 200 requests
            const runPromise = basicCrawler.run();
            void runPromise.then(() => {
                finished = true;
            });

            // need to monkeypatch the stats class, otherwise it will never finish
            basicCrawler.statistics.persistState = async () => Promise.resolve();
            await persistPromise;

            expect(finished).toBe(false);
            expect((await requestList.checkReadiness()).status).toBe('ready');
            expect(processed.length).toBe(200);

            expect(getValueSpy).toBeCalled();
            expect(setValueSpy).toBeCalled();

            // clean up
            await basicCrawler.teardown();
        },
    );

    test('should retry failed requests', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const processed: Dictionary<Request> = {};
        const requestList = await RequestList.open(null, sources);

        const requestHandler: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;

            if (request.url === 'http://example.com/2') {
                throw Error(`This is ${request.retryCount}th error!`);
            }

            request.userData.foo = 'bar';
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            maxRequestRetries: 10,
            minConcurrency: 3,
            maxConcurrency: 3,
            requestHandler,
        });

        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).toBe('bar');
        expect(processed['http://example.com/1'].errorMessages).toEqual([]);
        expect(processed['http://example.com/1'].retryCount).toBe(0);
        expect(processed['http://example.com/3'].userData.foo).toBe('bar');
        expect(processed['http://example.com/3'].errorMessages).toEqual([]);
        expect(processed['http://example.com/3'].retryCount).toBe(0);

        expect(processed['http://example.com/2'].userData.foo).toBeUndefined();
        expect(processed['http://example.com/2'].errorMessages).toHaveLength(11);
        expect(processed['http://example.com/2'].retryCount).toBe(10);

        expect((await requestList.checkReadiness()).status).toBe('finished');
    });

    test('should retry failed requests based on `request.maxRetries`', async () => {
        const sources = [
            { url: 'http://example.com/1', maxRetries: 10 },
            { url: 'http://example.com/2', maxRetries: 5 },
            { url: 'http://example.com/3', maxRetries: 1 },
        ];
        const processed: Dictionary<Request> = {};
        const requestList = await RequestList.open(null, sources);

        const requestHandler: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;
            throw Error(`This is ${request.retryCount}th error!`);
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            minConcurrency: 3,
            maxConcurrency: 3,
            requestHandler,
        });

        await basicCrawler.run();

        expect(processed['http://example.com/1'].errorMessages).toHaveLength(11);
        expect(processed['http://example.com/1'].retryCount).toBe(10);
        expect(processed['http://example.com/2'].errorMessages).toHaveLength(6);
        expect(processed['http://example.com/2'].retryCount).toBe(5);
        expect(processed['http://example.com/3'].errorMessages).toHaveLength(2);
        expect(processed['http://example.com/3'].retryCount).toBe(1);

        expect((await requestList.checkReadiness()).status).toBe('finished');
    });

    test('should not retry requests with noRetry set to true', async () => {
        const noRetryRequest = new Request({ url: 'http://example.com/3' });
        noRetryRequest.noRetry = true;

        const sources = [
            { url: 'http://example.com/1', noRetry: true },
            { url: 'http://example.com/2' },
            noRetryRequest,
        ];
        const processed: Dictionary<Request> = {};
        const requestList = await RequestList.open(null, sources);

        const requestHandler: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;
            request.userData.foo = 'bar';
            throw Error(`This is ${request.retryCount}th error!`);
        };

        let failedRequestHandlerCalls = 0;
        const failedRequestHandler = async () => {
            failedRequestHandlerCalls++;
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            maxRequestRetries: 10,
            minConcurrency: 3,
            maxConcurrency: 3,
            requestHandler,
            failedRequestHandler,
        });

        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).toBe('bar');
        expect(processed['http://example.com/1'].errorMessages).toHaveLength(1);
        expect(processed['http://example.com/1'].retryCount).toBe(0);
        expect(processed['http://example.com/3'].userData.foo).toBe('bar');
        expect(processed['http://example.com/3'].errorMessages).toHaveLength(1);
        expect(processed['http://example.com/3'].retryCount).toBe(0);

        expect(processed['http://example.com/2'].userData.foo).toBe('bar');
        expect(processed['http://example.com/2'].errorMessages).toHaveLength(11);
        expect(processed['http://example.com/2'].retryCount).toBe(10);

        expect(failedRequestHandlerCalls).toBe(3);

        expect((await requestList.checkReadiness()).status).toBe('finished');
    });

    test('should correctly track request.state', async () => {
        const sources = [{ url: 'http://example.com/1' }];
        const requestList = await RequestList.open(null, sources);
        const requestStates: RequestState[] = [];

        const requestHandler: RequestHandler = async ({ request }) => {
            requestStates.push(request.state);
            throw new Error('Error');
        };

        const errorHandler: RequestHandler = async ({ request }) => {
            requestStates.push(request.state);
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            maxConcurrency: 1,
            maxRequestRetries: 1,
            requestHandler,
            errorHandler,
        });

        await basicCrawler.run();

        expect(requestStates).toEqual([
            RequestState.REQUEST_HANDLER,
            RequestState.ERROR_HANDLER,
            RequestState.REQUEST_HANDLER,
        ]);
    });

    test('should use errorHandler', async () => {
        const sources = [{ url: 'http://example.com/', label: 'start' }];

        let errorHandlerCalls = 0;
        let failedRequestHandlerCalls = 0;

        const failed: Dictionary<{ request: Request; error: Error }> = {};
        const requestList = await RequestList.open({ sources });

        const requestHandler: RequestHandler = async ({ request }) => {
            expect(request.label).toBe(errorHandlerCalls === 0 ? 'start' : `error_${errorHandlerCalls}`);
            throw new Error(`This is an error ${errorHandlerCalls}`);
        };

        const errorHandler: ErrorHandler = async ({ request }, error) => {
            expect(error.message).toBe(`This is an error ${errorHandlerCalls}`);
            errorHandlerCalls++;
            request.label = `error_${errorHandlerCalls}`;
        };

        const failedRequestHandler: ErrorHandler = async ({ request }, error) => {
            failed[request.url] = { request, error };
            failedRequestHandlerCalls++;
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            requestHandler,
            errorHandler,
            failedRequestHandler,
        });

        await basicCrawler.run();

        expect(errorHandlerCalls).toBe(3);
        expect(failedRequestHandlerCalls).toBe(1);
        expect(Object.values(failed)).toHaveLength(1);
        expect(failed['http://example.com/'].request.label).not.toBe('start');
        expect(failed['http://example.com/'].request.label).toBe('error_3');
        expect(failed['http://example.com/'].error.message).toEqual('This is an error 3');
    });

    test('should allow to handle failed requests', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const processed: Dictionary<Request> = {};
        const failed: Dictionary<Request> = {};
        const errors: Error[] = [];
        const requestList = await RequestList.open(null, sources);

        const requestHandler: RequestHandler = async ({ request }) => {
            await Promise.reject(new Error('some-error'));
            processed[request.url] = request;
        };

        const failedRequestHandler: ErrorHandler = async ({ request }, error) => {
            failed[request.url] = request;
            errors.push(error);
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            requestHandler,
            failedRequestHandler,
        });

        await basicCrawler.run();

        expect(failed['http://example.com/1'].errorMessages).toHaveLength(4);
        expect(failed['http://example.com/1'].retryCount).toBe(3);
        expect(failed['http://example.com/2'].errorMessages).toHaveLength(4);
        expect(failed['http://example.com/2'].retryCount).toBe(3);
        expect(failed['http://example.com/3'].errorMessages).toHaveLength(4);
        expect(failed['http://example.com/3'].retryCount).toBe(3);
        expect(Object.values(failed)).toHaveLength(3);
        expect(Object.values(processed)).toHaveLength(0);
        expect((await requestList.checkReadiness()).status).toBe('finished');
        errors.forEach((error) => expect(error).toBeInstanceOf(Error));
    });

    test('should not retry on NonRetryableError', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const failed: Dictionary<Request> = {};
        const errors: Error[] = [];
        const requestList = await RequestList.open(null, sources);

        const requestHandler: RequestHandler = async () => {
            throw new NonRetryableError('some-error');
        };

        const failedRequestHandler: ErrorHandler = async ({ request }, error) => {
            failed[request.url] = request;
            errors.push(error);
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            requestHandler,
            failedRequestHandler,
        });

        await basicCrawler.run();

        expect(failed['http://example.com/1'].errorMessages).toHaveLength(1);
        expect(failed['http://example.com/1'].retryCount).toBe(0);
        expect(failed['http://example.com/2'].errorMessages).toHaveLength(1);
        expect(failed['http://example.com/2'].retryCount).toBe(0);
        expect(failed['http://example.com/3'].errorMessages).toHaveLength(1);
        expect(failed['http://example.com/3'].retryCount).toBe(0);
        expect(Object.values(failed)).toHaveLength(3);
        expect((await requestList.checkReadiness()).status).toBe('finished');
        errors.forEach((error) => expect(error).toBeInstanceOf(NonRetryableError));
    });

    test('noRetry after calling errorHandler', async () => {
        const sources = [{ url: `http://example.com` }];
        const requestList = await RequestList.open(null, sources);

        let request: Request<Dictionary<any>>;

        const crawler = new BasicCrawler({
            requestList,
            errorHandler: (context, error) => {
                request = context.request;
                context.request.noRetry = true;
            },
            maxRequestRetries: 3,
            requestHandler: () => {
                throw new Error('Failure');
            },
        });

        await crawler.run();

        expect(request!.retryCount).toBe(0);
    });

    test('should crash on CriticalError', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const requestList = await RequestList.open(null, sources);

        const requestHandler: RequestHandler = async () => {
            throw new CriticalError('some-error');
        };

        const failedRequestHandler = vitest.fn() as ErrorHandler;

        const basicCrawler = new BasicCrawler({
            requestList,
            requestHandler,
            failedRequestHandler,
        });

        await expect(basicCrawler.run()).rejects.toThrow(CriticalError);

        expect(failedRequestHandler).not.toBeCalled();
        expect((await requestList.checkReadiness()).status).toBe('ready');
    });

    test('should crash on MissingRouteError', async () => {
        const sources = [
            { url: 'http://example.com/1', label: 'TEST' }, // will match
            { url: 'http://example.com/2', label: 'FOO' }, // will fail as no FOO route or default route exists
            { url: 'http://example.com/3' }, // will fail as no default route exists
        ];
        const requestList = await RequestList.open(null, sources);

        const failedRequestHandler = vitest.fn() as ErrorHandler;

        const basicCrawler = new BasicCrawler({
            requestList,
            failedRequestHandler,
        });
        const testRoute = vitest.fn();
        basicCrawler.router.addHandler('TEST', testRoute);

        await expect(basicCrawler.run()).rejects.toThrow(MissingRouteError);

        expect(failedRequestHandler).not.toBeCalled();
        expect(testRoute).toBeCalled();
        // The crawler crashed on the second request, so it did not process all of them (only the first, matching
        // request was handled before the `MissingRouteError` was thrown).
        expect(testRoute).toBeCalledTimes(1);
    });

    test('should correctly combine RequestList and RequestQueue', async () => {
        const sources = [
            { url: 'http://example.com/0' },
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
        ];
        const processed: Dictionary<Request> = {};
        const requestList = await RequestList.open(null, sources);
        const requestQueue = await RequestQueue.open({ id: 'xxx' });

        const requestHandler: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;

            if (request.url === 'http://example.com/1') {
                throw Error(`This is ${request.retryCount}th error!`);
            }

            request.userData.foo = 'bar';
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            requestQueue,
            maxRequestRetries: 3,
            minConcurrency: 1,
            maxConcurrency: 1,
            requestHandler,
        });

        vitest.spyOn(requestQueue, 'getHandledCount').mockResolvedValueOnce(0);

        vitest
            .spyOn(requestQueue, 'addRequest')
            .mockResolvedValueOnce({ requestId: 'id-0' } as any)
            .mockResolvedValueOnce({ requestId: 'id-1' } as any)
            .mockResolvedValueOnce({ requestId: 'id-2' } as any);

        const request0 = new Request({ id: 'id-0', ...sources[0] });
        const request1 = new Request({ id: 'id-1', ...sources[1] });
        const request2 = new Request({ id: 'id-2', ...sources[2] });

        const queueContent = [request0, request1, request2, request1, request1, request1];

        vitest.spyOn(requestQueue, 'fetchNextRequest').mockImplementation(async () => queueContent.shift() ?? null);

        const markReqHandled = vitest
            .spyOn(requestQueue, 'markRequestAsHandled')
            .mockReturnValue(Promise.resolve() as any);
        const reclaimReq = vitest.spyOn(requestQueue, 'reclaimRequest').mockReturnValue(Promise.resolve() as any);

        // The first probe reporting `finished` is masked by the request list, which still has requests to
        // transfer into the queue at that point.
        vitest
            .spyOn(requestQueue, 'checkReadiness')
            .mockImplementation(async () => (queueContent.length > 0 ? { status: 'ready' } : { status: 'finished' }))
            .mockResolvedValueOnce({ status: 'finished' });

        await basicCrawler.run();

        // 1st try

        expect(reclaimReq).toBeCalledWith(request1, expect.objectContaining({}));
        expect(reclaimReq).toBeCalledTimes(3);

        expect(processed['http://example.com/0'].userData.foo).toBe('bar');
        expect(processed['http://example.com/0'].errorMessages).toEqual([]);
        expect(processed['http://example.com/0'].retryCount).toBe(0);
        expect(processed['http://example.com/2'].userData.foo).toBe('bar');
        expect(processed['http://example.com/2'].errorMessages).toEqual([]);
        expect(processed['http://example.com/2'].retryCount).toBe(0);

        expect(processed['http://example.com/1'].userData.foo).toBeUndefined();
        expect(processed['http://example.com/1'].errorMessages).toHaveLength(4);
        expect(processed['http://example.com/1'].retryCount).toBe(3);

        expect((await requestList.checkReadiness()).status).toBe('finished');

        vitest.restoreAllMocks();
    });

    test('should say that task is not ready requestList is not set and requestQueue is empty', async () => {
        const requestQueue = await RequestQueue.open({ id: 'xxx' });
        requestQueue.checkReadiness = async () => Promise.resolve({ status: 'waiting' });

        const crawler = new BasicCrawler({
            requestQueue,
            requestHandler: async () => {},
        });

        // @ts-expect-error Accessing private prop
        expect(await crawler.isTaskReadyFunction()).toBe(false);
    });

    test('should be possible to override isFinishedFunction and isTaskReadyFunction via taskLoopOptions', async () => {
        const requestQueue = await RequestQueue.open({ id: 'xxx' });
        const processed: Request[] = [];
        const queue: Request[] = [];
        let isFinished = false;
        let isFinishedFunctionCalled = false;
        let isTaskReadyFunctionCalled = false;

        const basicCrawler = new BasicCrawler({
            requestQueue,
            minConcurrency: 1,
            maxConcurrency: 1,
            taskLoopOptions: {
                isFinishedFunction: async () => {
                    isFinishedFunctionCalled = true;
                    return Promise.resolve(isFinished);
                },
                isTaskReadyFunction: async () => {
                    isTaskReadyFunctionCalled = true;
                    return Promise.resolve(!isFinished);
                },
                maybeRunIntervalSecs: 0.05,
            },
            requestHandler: async ({ request }) => {
                await sleep(10);
                processed.push(request);
            },
        });

        const request0 = new Request({ url: 'http://example.com/0' });
        const request1 = new Request({ url: 'http://example.com/1' });

        vitest.spyOn(requestQueue, 'getHandledCount').mockReturnValue(Promise.resolve() as any);

        let handledCount = 0;
        const markRequestAsHandled = vitest.spyOn(requestQueue, 'markRequestAsHandled').mockImplementation(async () => {
            handledCount++;
            // Only set isFinished after both requests have been handled
            if (handledCount >= 2) {
                // Small delay to ensure the test can verify everything
                setTimeout(() => {
                    isFinished = true;
                }, 50);
            }
            return Promise.resolve() as any;
        });

        // The stub reports `finished` as soon as the queue runs dry; the crawl carries on because the task loop
        // defers to the custom `isFinishedFunction`.
        requestQueue.fetchNextRequest = async () => queue.pop()!;
        requestQueue.checkReadiness = async () => (queue.length ? { status: 'ready' } : { status: 'finished' });

        // Add requests with buffer time for crawler startup.
        // Use longer delays to avoid flakiness under CPU load from parallel tests.
        setTimeout(() => queue.push(request0), 500);
        setTimeout(() => queue.push(request1), 1000);

        await basicCrawler.run();

        expect(markRequestAsHandled).toBeCalledWith(request0);
        expect(markRequestAsHandled).toBeCalledWith(request1);
        expect(isFinishedFunctionCalled).toBe(true);
        expect(isTaskReadyFunctionCalled).toBe(true);

        // TODO: see why the request1 was passed as a second parameter to includes
        expect(processed.includes(request0)).toBe(true);

        vitest.restoreAllMocks();
    });

    test('keepAlive', async () => {
        const requestQueue = await RequestQueue.open({ id: 'xxx' });
        const processed: Request[] = [];
        const queue: Request[] = [];

        const basicCrawler = new BasicCrawler({
            requestQueue,
            keepAlive: true,
            taskLoopOptions: {
                maybeRunIntervalSecs: 0.05,
            },
            requestHandler: async ({ request }) => {
                await sleep(10);
                processed.push(request);
            },
        });

        const request0 = new Request({ url: 'http://example.com/0' });
        const request1 = new Request({ url: 'http://example.com/1' });

        vitest.spyOn(requestQueue, 'getHandledCount').mockReturnValue(Promise.resolve() as any);
        const markRequestAsHandled = vitest
            .spyOn(requestQueue, 'markRequestAsHandled')
            .mockReturnValue(Promise.resolve() as any);

        // The stub reports `finished` whenever the queue runs dry - `keepAlive` is what carries the crawler
        // through those gaps, until `teardown()` ends the run.
        requestQueue.fetchNextRequest = async () => Promise.resolve(queue.pop()!);
        requestQueue.checkReadiness = async () => (queue.length ? { status: 'ready' } : { status: 'finished' });

        // Use longer delays to avoid flakiness under CPU load from parallel tests.
        setTimeout(() => queue.push(request0), 500);
        setTimeout(() => queue.push(request1), 1000);
        setTimeout(() => {
            void basicCrawler.teardown();
        }, 3000);

        await basicCrawler.run();

        expect(markRequestAsHandled).toBeCalledWith(request0);
        expect(markRequestAsHandled).toBeCalledWith(request1);

        // TODO: see why the request1 was passed as a second parameter to includes
        expect(processed.includes(request0)).toBe(true);

        vitest.restoreAllMocks();
    });

    test('pause() suspends dispatch without ending the run, resume() picks it back up', async () => {
        const sources = [...Array(10).keys()].map((index) => ({ url: `https://example.com/${index}` }));
        const requestList = await RequestList.open(null, sources);
        const processed: string[] = [];

        let resolvePaused: () => void;
        const paused = new Promise<void>((resolve) => {
            resolvePaused = resolve;
        });

        const crawler = new BasicCrawler({
            requestList,
            // One request at a time, so the pause is triggered by exactly one handler.
            minConcurrency: 1,
            maxConcurrency: 1,
            requestHandler: async ({ request }) => {
                processed.push(request.url);

                if (processed.length === 3) {
                    // Deliberately not awaited: `pause()` only resolves once the in-flight requests have settled,
                    // and this handler is one of them. Dispatch stops synchronously all the same.
                    void crawler.pause().then(() => resolvePaused());
                }

                await sleep(10);
            },
        });

        const runPromise = crawler.run();
        await paused;

        expect(processed).toHaveLength(3);

        // Unlike `stop()`, pausing leaves `run()` pending and dispatches nothing in the meantime.
        await sleep(300);
        expect(processed).toHaveLength(3);

        crawler.resume();
        await runPromise;

        expect(processed).toHaveLength(10);
    });

    test('pause() and resume() warn instead of throwing on a crawler that is not running', async () => {
        const crawler = new BasicCrawler({ requestHandler: async () => {} });
        const warning = vitest.spyOn(crawler.log, 'warning').mockImplementation(() => {});

        // The task loop and the owned governor are both built by `run()`.
        expect(crawler.concurrencySystem).toBeUndefined();

        await crawler.pause();
        crawler.resume();

        expect(warning).toHaveBeenCalledTimes(2);

        vitest.restoreAllMocks();
    });

    test('exposes the concurrency system it is running against', async () => {
        const requestList = await RequestList.open(null, [{ url: 'https://example.com/1' }]);
        let observed: IConcurrencySystem | undefined;

        const crawler = new BasicCrawler({
            requestList,
            maxConcurrency: 17,
            requestHandler: async () => {
                observed = crawler.concurrencySystem;
            },
        });

        await crawler.run();

        // The same (owned, default) governor the handler saw, still readable after the run.
        expect(crawler.concurrencySystem).toBe(observed);
        expect((observed as ConcurrencySystem).maxConcurrency).toBe(17);
    });

    test('should support maxRequestsPerCrawl parameter', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
            { url: 'http://example.com/4' },
            { url: 'http://example.com/5' },
        ];
        const processed: Dictionary<Request> = {};
        const requestList = await RequestList.open(null, sources);

        const requestHandler: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;
            if (request.url === 'http://example.com/2') throw Error();
            request.userData.foo = 'bar';
        };

        let failedRequestHandlerCalls = 0;
        const failedRequestHandler = async () => {
            failedRequestHandlerCalls++;
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            maxRequestRetries: 3,
            maxRequestsPerCrawl: 3,
            maxConcurrency: 1,
            requestHandler,
            failedRequestHandler,
        });

        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).toBe('bar');
        expect(processed['http://example.com/1'].errorMessages).toEqual([]);
        expect(processed['http://example.com/1'].retryCount).toBe(0);
        expect(processed['http://example.com/3'].userData.foo).toBe('bar');
        expect(processed['http://example.com/3'].errorMessages).toEqual([]);
        expect(processed['http://example.com/3'].retryCount).toBe(0);

        // The failing request is reclaimed to the queue, but `maxRequestsPerCrawl` is reached before it can be
        // retried to exhaustion, so it ends up retried just once and the failed handler is not reached.
        expect(processed['http://example.com/2'].userData.foo).toEqual(undefined);
        expect(processed['http://example.com/2'].errorMessages).toHaveLength(1);
        expect(processed['http://example.com/2'].retryCount).toBe(1);

        expect(failedRequestHandlerCalls).toBe(0);

        // The crawler stopped at the `maxRequestsPerCrawl` limit, so the later sources were never processed.
        expect(processed['http://example.com/5']).toBeUndefined();
    });

    test('should timeout after requestHandlerTimeoutSecs', async () => {
        const url = 'https://example.com';
        const requestList = await RequestList.open({ sources: [{ url }] });

        const results: Request[] = [];
        const crawler = new BasicCrawler({
            requestList,
            requestHandlerTimeoutSecs: 0.01,
            maxRequestRetries: 1,
            requestHandler: async () => sleep(1000),
            failedRequestHandler: async ({ request }) => {
                results.push(request);
            },
        });

        await crawler.run();
        expect(results).toHaveLength(1);
        expect(results[0].url).toEqual(url);
        results[0].errorMessages.forEach((msg) => expect(msg).toMatch('requestHandler timed out'));
    });

    test('context.extendTimeout buys a running handler more time', async () => {
        const requestList = await RequestList.open({ sources: [{ url: 'https://example.com' }] });

        const failed: Request[] = [];

        const crawler = new BasicCrawler({
            requestList,
            requestHandlerTimeoutSecs: 0.2,
            maxRequestRetries: 0,
            requestHandler: async ({ extendTimeout }) => {
                await sleep(100);
                // only now do we know we need longer than the 0.2s we were given
                extendTimeout(5);
                await sleep(300);
            },
            failedRequestHandler: async ({ request }) => {
                failed.push(request);
            },
        });

        await crawler.run();

        // the handler needs 400ms in total, so without the extension it would have timed out
        expect(failed).toHaveLength(0);
    });

    test('context.extendTimeout also holds off the internal timeout', async () => {
        // shorter than the 400ms the handler needs, so an unextended backstop would definitely cut it
        serviceLocator.reset();
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        serviceLocator.setConfiguration(new Configuration({ internalTimeoutMillis: 250 }));

        const requestList = await RequestList.open({ sources: [{ url: 'https://example.com' }] });

        const failed: Request[] = [];

        const crawler = new BasicCrawler({
            requestList,
            requestHandlerTimeoutSecs: 0.2,
            maxRequestRetries: 0,
            requestHandler: async ({ extendTimeout }) => {
                await sleep(100);
                extendTimeout(5);
                await sleep(300);
            },
            failedRequestHandler: async ({ request }) => {
                failed.push(request);
            },
        });

        await crawler.run();

        // extending only the handler would be pointless if the backstop cut it down anyway
        expect(failed).toHaveLength(0);
    });

    test('a route can override requestHandlerTimeoutSecs, other routes keep the default', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'https://example.com/list', userData: { label: 'LIST' } },
                { url: 'https://example.com/detail', userData: { label: 'DETAIL' } },
            ],
        });

        const processed: Request[] = [];
        const failed: Request[] = [];

        const router = Router.create();
        // LIST is allowed to take its time, DETAIL is left on the crawler's default and must not be
        router.addHandler(
            'LIST',
            async ({ request }) => {
                await sleep(300);
                processed.push(request as Request);
            },
            { requestHandlerTimeoutSecs: 5 },
        );
        router.addHandler('DETAIL', async ({ request }) => {
            await sleep(300);
            processed.push(request as Request);
        });

        const crawler = new BasicCrawler({
            requestList,
            requestHandlerTimeoutSecs: 0.1,
            maxRequestRetries: 0,
            requestHandler: router,
            failedRequestHandler: async ({ request }) => {
                failed.push(request);
            },
        });

        await crawler.run();

        // only DETAIL is held to the crawler's 0.1s default; LIST got its own 5s and finished
        // (`processed` alone would not prove it - cancellation is cooperative, so a timed out handler
        // keeps running to completion and still pushes)
        expect(failed.map((request) => request.label)).toEqual(['DETAIL']);
        expect(processed.map((request) => request.label)).toContain('LIST');
        failed[0].errorMessages.forEach((msg) => expect(msg).toMatch('requestHandler timed out after 0.1 seconds'));
    });

    test('internal timeout catches a request stuck outside the timed phases', async () => {
        // reset so we can install a configuration with a custom internal timeout before anything resolves it
        serviceLocator.reset();
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        serviceLocator.setConfiguration(new Configuration({ internalTimeoutMillis: 100 }));

        const url = 'https://example.com';
        const requestList = await RequestList.open({ sources: [{ url }] });

        const results: Request[] = [];
        const requestHandler = vitest.fn();

        const crawler = new BasicCrawler({
            requestList,
            maxRequestRetries: 0,
            // keep the handler timeout small so the backstop is not floored above the 100ms set above
            requestHandlerTimeoutSecs: 0.05,
            // `extendContext` is not the navigation, the hooks or the request handler, so none of their
            // timeouts apply to it - only the internal one stands between this and a stuck crawler. It also
            // outlives the backstop, so it is the case where the losing side of the race keeps running.
            extendContext: async () => {
                await sleep(500);
                return {};
            },
            requestHandler,
            failedRequestHandler: async ({ request }) => {
                results.push(request);
            },
        });

        await crawler.run();

        // Wait past the stuck `extendContext`: `run()` resolves when the backstop fails the request, but the
        // pipeline keeps running underneath - the handler must still not fire once it finally gets there.
        await sleep(600);

        expect(requestHandler).not.toHaveBeenCalled();
        expect(results).toHaveLength(1);

        results[0].errorMessages.forEach((msg) => {
            expect(msg).toMatch('Request timed out');
            // the request handler never even started, so blaming it would be a lie
            expect(msg).not.toMatch('requestHandler timed out');
        });
    });

    test('the internal timeout does not cut a request handler short of its own timeout', async () => {
        // deliberately below the request handler timeout - the backstop must still not fire before it
        serviceLocator.reset();
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        serviceLocator.setConfiguration(new Configuration({ internalTimeoutMillis: 100 }));

        const url = 'https://example.com';
        const requestList = await RequestList.open({ sources: [{ url }] });

        const processed: Request[] = [];

        const crawler = new BasicCrawler({
            requestList,
            maxRequestRetries: 0,
            requestHandlerTimeoutSecs: 1,
            requestHandler: async ({ request }) => {
                // comfortably within the 1s handler timeout, but well past the 100ms internal one
                await sleep(500);
                processed.push(request as Request);
            },
        });

        await crawler.run();

        expect(processed).toHaveLength(1);
    });

    test('warns when the internal timeout is shorter than the phase timeouts', async () => {
        serviceLocator.reset();
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        serviceLocator.setConfiguration(new Configuration({ internalTimeoutMillis: 100 }));

        const requestList = await RequestList.open({ sources: [{ url: 'https://example.com' }] });
        const crawler = new BasicCrawler({
            requestList,
            requestHandlerTimeoutSecs: 1, // 1000ms, well above the 100ms internal timeout
            maxRequestRetries: 0,
            requestHandler: async () => {},
        });
        const warnSpy = vitest.spyOn(crawler.log, 'warning');

        await crawler.run();

        const warned = warnSpy.mock.calls.some((call) =>
            String(call[0]).includes('shorter than the navigation and request handler'),
        );
        expect(warned).toBe(true);
    });

    test('timeouted request should not access storages', async () => {
        const url = 'https://example.com';
        const requestList = await RequestList.open({ sources: [{ url }] });

        const results: Request[] = [];
        const crawler = new BasicCrawler({
            requestList,
            requestHandlerTimeoutSecs: 0.01,
            maxRequestRetries: 0,
            requestHandler: async ({ pushData }) => {
                await sleep(10);
                await pushData({ foo: 'bar' });
            },
            failedRequestHandler: async ({ request }) => {
                results.push(request);
                await sleep(100);
            },
        });

        await crawler.run();
        expect(results).toHaveLength(1);
        expect(results[0].url).toEqual(url);
        results[0].errorMessages.forEach((msg) => expect(msg).toMatch('requestHandler timed out'));

        const dataset = await crawler.getDataset();
        expect((await dataset.getInfo()).itemCount).toBe(0);
    });

    test('limits requestHandlerTimeoutSecs and derived vars to a valid value', async () => {
        const url = 'https://example.com';
        const requestList = await RequestList.open({ sources: [{ url }] });

        const results = [];
        const crawler = new BasicCrawler({
            requestList,
            requestHandlerTimeoutSecs: Infinity,
            maxRequestRetries: 1,
            requestHandler: async () => sleep(1000),
            failedRequestHandler: async ({ request }) => {
                results.push(request);
            },
        });

        const maxSignedInteger = 2 ** 31 - 1;
        expect(crawler['resolveRequestHandlerTimeoutMillis'](undefined)).toBe(maxSignedInteger);
        // @ts-expect-error Accessing private prop
        expect(crawler.internalTimeoutMillis).toBe(maxSignedInteger);
    });

    test('should not log stack trace for timeout errors by default', async () => {
        const sources = [{ url: `http://${HOSTNAME}:${port}` }];
        const requestList = await RequestList.open(null, sources);

        const crawler = new BasicCrawler({
            requestList,
            requestHandlerTimeoutSecs: 0.1,
            maxRequestRetries: 3,
            requestHandler: async () => sleep(1e3),
        });

        const warningSpy = vitest.spyOn(crawler.log, 'warning');
        const errorSpy = vitest.spyOn(crawler.log, 'error');

        await crawler.run();

        expect(warningSpy.mock.calls.length).toBe(3);
        for (const args of warningSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(args[0]).toMatch(/Reclaiming failed request back to the list or queue/);
            expect(args[0]).toMatch(/requestHandler timed out after/);
            expect(args[0]).not.toMatch(/at Timeout\._onTimeout/);
            expect(args[1]).toBeDefined();
        }

        expect(errorSpy.mock.calls.length).toBe(1);
        for (const args of errorSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(args[0]).toMatch(/Request failed and reached maximum retries/);
            expect(args[0]).toMatch(/requestHandler timed out after/);
            expect(args[0]).not.toMatch(/at Timeout\._onTimeout/);
            expect(args[1]).toBeDefined();
        }
    });

    test('should log stack trace for non-timeout errors only when request will no longer be retried by default', async () => {
        const sources = [{ url: `http://${HOSTNAME}:${port}` }];
        const requestList = await RequestList.open(null, sources);

        const crawler = new BasicCrawler({
            requestList,
            maxRequestRetries: 3,
            requestHandler: () => {
                throw new Error('Other non-timeout error');
            },
        });

        const warningSpy = vitest.spyOn(crawler.log, 'warning');
        const errorSpy = vitest.spyOn(crawler.log, 'error');

        await crawler.run();

        expect(warningSpy.mock.calls.length).toBe(3);
        for (const args of warningSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(args[0]).toMatch(/Reclaiming failed request back to the list or queue/);
            expect(args[0]).toMatch(/Other non-timeout error/);
            expect(args[0].split('\n').length).toBeLessThanOrEqual(2);
            expect(args[1]).toBeDefined();
        }

        expect(errorSpy.mock.calls.length).toBe(1);
        for (const args of errorSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(args[0]).toMatch(/Request failed and reached maximum retries/);
            expect(args[0]).toMatch(/Other non-timeout error/);
            expect(args[0]).toMatch(/at _?BasicCrawler\.requestHandler/);
            expect(args[1]).toBeDefined();
        }
    });

    test('should log stack trace for timeout errors when verbose log is enabled', async () => {
        log.setLevel(log.LEVELS.INFO);
        process.env.CRAWLEE_VERBOSE_LOG = 'true';
        const sources = [{ url: `http://${HOSTNAME}:${port}` }];
        const requestList = await RequestList.open(null, sources);

        const crawler = new BasicCrawler({
            requestList,
            requestHandlerTimeoutSecs: 0.1,
            maxRequestRetries: 3,
            requestHandler: async () => sleep(1e3),
        });

        const warningSpy = vitest.spyOn(crawler.log, 'warning');
        const errorSpy = vitest.spyOn(crawler.log, 'error');

        await crawler.run();

        expect(warningSpy.mock.calls.length).toBe(3);
        for (const args of warningSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(args[0]).toMatch(/Reclaiming failed request back to the list or queue/);
            expect(args[0]).toMatch(/requestHandler timed out after/);
            expect(args[0]).toMatch(/at Timeout\._onTimeout/);
            expect(args[1]).toBeDefined();
        }

        expect(errorSpy.mock.calls.length).toBe(1);
        for (const args of errorSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(args[0]).toMatch(/Request failed and reached maximum retries/);
            expect(args[0]).toMatch(/requestHandler timed out after/);
            expect(args[0]).toMatch(/at Timeout\._onTimeout/);
            expect(args[1]).toBeDefined();
        }

        log.setLevel(log.LEVELS.OFF);
        process.env.CRAWLEE_VERBOSE_LOG = undefined;
    });

    test('should log stack trace for non-timeout errors when verbose log is enabled', async () => {
        log.setLevel(log.LEVELS.INFO);
        process.env.CRAWLEE_VERBOSE_LOG = 'true';
        const sources = [{ url: `http://${HOSTNAME}:${port}` }];
        const requestList = await RequestList.open(null, sources);

        const crawler = new BasicCrawler({
            requestList,
            maxRequestRetries: 3,
            requestHandler: () => {
                throw new Error('Other non-timeout error');
            },
        });

        const warningSpy = vitest.spyOn(crawler.log, 'warning');
        const errorSpy = vitest.spyOn(crawler.log, 'error');

        await crawler.run();

        expect(warningSpy.mock.calls.length).toBe(3);
        for (const args of warningSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(args[0]).toMatch(/Reclaiming failed request back to the list or queue/);
            expect(args[0]).toMatch(/Other non-timeout error/);
            expect(args[0]).toMatch(/at _?BasicCrawler\.requestHandler/);
            expect(args[1]).toBeDefined();
        }

        expect(errorSpy.mock.calls.length).toBe(1);
        for (const args of errorSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(args[0]).toMatch(/Request failed and reached maximum retries/);
            expect(args[0]).toMatch(/Other non-timeout error/);
            expect(args[0]).toMatch(/at _?BasicCrawler\.requestHandler/);
            expect(args[1]).toBeDefined();
        }

        log.setLevel(log.LEVELS.OFF);
        process.env.CRAWLEE_VERBOSE_LOG = undefined;
    });

    describe('Uses SessionPool', () => {
        it('persists statistics and the session pool once when finishing', async () => {
            const setValue = vitest.spyOn(KeyValueStore.prototype, 'setValue');
            const crawler = new BasicCrawler({
                requestHandler: async () => {
                    setValue.mockClear();
                },
            });

            await crawler.run(['https://example.com']);

            const persistedKeys = setValue.mock.calls.map(([key]) => key);
            expect(persistedKeys.filter((key) => key.startsWith('CRAWLEE_CRAWLER_STATISTICS'))).toHaveLength(1);
            expect(persistedKeys.filter((key) => key.startsWith('CRAWLEE_SESSION_POOL_STATE'))).toHaveLength(1);
        });

        it('persists the session pool once with a shared event manager', async () => {
            await serviceLocator.getEventManager().init();
            const setValue = vitest.spyOn(KeyValueStore.prototype, 'setValue');
            const crawler = new BasicCrawler({
                requestHandler: async () => {
                    setValue.mockClear();
                },
            });

            await crawler.run(['https://example.com']);
            expect(serviceLocator.getEventManager().listenerCount(EventType.PERSIST_STATE)).toBe(0);
            await serviceLocator.getEventManager().close();

            const persistedKeys = setValue.mock.calls.map(([key]) => key);
            expect(persistedKeys.filter((key) => key.startsWith('CRAWLEE_CRAWLER_STATISTICS'))).toHaveLength(1);
            expect(persistedKeys.filter((key) => key.startsWith('CRAWLEE_SESSION_POOL_STATE'))).toHaveLength(1);
        });

        it('should use SessionPool', async () => {
            const url = 'https://example.com';
            const requestList = await RequestList.open({ sources: [{ url }] });
            const results: Request[] = [];

            const crawler = new BasicCrawler({
                requestList,
                requestHandlerTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                sessionPool: new SessionPool({
                    maxPoolSize: 10,
                    persistStateKey: 'POOL',
                }),
                requestHandler: async ({ session }) => {
                    expect(session.constructor.name).toEqual('Session');
                    expect(session.id).toBeDefined();
                },
                failedRequestHandler: async ({ request }) => {
                    results.push(request);
                },
            });

            await crawler.run();
            expect(crawler.sessionPool).toBeDefined();
            expect(results).toHaveLength(0);
        });

        it('should use pass options to sessionPool', async () => {
            const url = 'https://example.com';
            const requestList = await RequestList.open({ sources: [{ url }] });

            const sessionPool = new SessionPool({
                maxPoolSize: 10,
                persistStateKey: 'POOL',
            });

            const crawler = new BasicCrawler({
                requestList,
                requestHandlerTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                sessionPool,
                requestHandler: async () => {},
                failedRequestHandler: async () => {},
            });
            await crawler.run();

            expect(crawler.sessionPool).toBeDefined();
            expect((await sessionPool.getState()).sessions).toHaveLength(1);
        });

        it('should accept a pre-initialized SessionPool instance', async () => {
            const url = 'https://example.com';
            const requestList = await RequestList.open({ sources: [{ url }] });
            const sharedPool = new SessionPool({ maxPoolSize: 25 });

            const crawler = new BasicCrawler({
                requestList,
                sessionPool: sharedPool,
                requestHandler: async ({ session }) => {
                    expect(session).toBeDefined();
                    expect(crawler.sessionPool).toBeDefined();
                    expect(serviceLocator.getEventManager().listenerCount(EventType.PERSIST_STATE)).toEqual(1);
                },
                failedRequestHandler: async () => {},
            });

            await crawler.run();

            expect(crawler.sessionPool).toBe(sharedPool);
            await sharedPool.teardown();
        });

        it('should not tear down an injected SessionPool', async () => {
            const url = 'https://example.com';
            const requestList = await RequestList.open({ sources: [{ url }] });
            const sharedPool = new SessionPool({ maxPoolSize: 25 });
            const teardownSpy = vitest.spyOn(sharedPool, 'teardown');

            const crawler = new BasicCrawler({
                requestList,
                sessionPool: sharedPool,
                requestHandler: async () => {},
            });
            await crawler.run();

            expect(teardownSpy).not.toHaveBeenCalled();
            await sharedPool.teardown();
        });

        it('should share sessions across crawlers using the same SessionPool', async () => {
            const sharedPool = new SessionPool({ maxPoolSize: 5 });
            const crawler1Sessions = new Set<string>();
            const crawler2Sessions = new Set<string>();

            const requestList1 = await RequestList.open({ sources: [{ url: 'https://example.com' }] });
            const crawler1 = new BasicCrawler({
                requestList: requestList1,
                sessionPool: sharedPool,
                requestHandler: async ({ session }) => {
                    crawler1Sessions.add(session.id);
                },
            });
            await crawler1.run();

            expect(crawler1Sessions.size).toBeGreaterThan(0);
            const poolSizeAfterCrawler1 = sharedPool.usableSessionsCount;

            const requestList2 = await RequestList.open({ sources: [{ url: 'https://example.com' }] });
            const crawler2 = new BasicCrawler({
                requestList: requestList2,
                sessionPool: sharedPool,
                requestHandler: async ({ session }) => {
                    crawler2Sessions.add(session.id);
                },
            });
            await crawler2.run();

            expect(crawler1.sessionPool).toBe(crawler2.sessionPool);
            // crawler2 should reuse sessions created by crawler1, not grow the pool further
            expect(sharedPool.usableSessionsCount).toBe(poolSizeAfterCrawler1);
            await sharedPool.teardown();
        });
    });

    describe('statistics injection', () => {
        it('uses the crawler-built default when no instance is supplied', async () => {
            const crawler = new BasicCrawler({
                requestList: await RequestList.open({ sources: [{ url: 'https://example.com' }] }),
                requestHandler: async () => {},
            });

            expect(crawler.statistics).toBeInstanceOf(Statistics);
        });

        it('records into a supplied Statistics instance', async () => {
            const stats = new Statistics({ persistenceOptions: { enable: false } });
            const crawler = new BasicCrawler({
                requestList: await RequestList.open({ sources: [{ url: 'https://example.com' }] }),
                statistics: stats,
                requestHandler: async () => {},
            });

            expect(crawler.statistics).toBe(stats);

            await crawler.run();

            expect(stats.state.requestsFinished).toBe(1);
        });

        it('drives a foreign IStatistics implementation through the interface alone', async () => {
            // A fake that is not a `Statistics` (nor a subclass), recording the lifecycle the crawler drives.
            const calls: string[] = [];
            const customStats: IStatistics = {
                errorTracker: new ErrorTracker(),
                errorTrackerRetry: new ErrorTracker(),
                state: { requestsFinished: 0 } as IStatistics['state'],
                requestRetryHistogram: [],
                startJob: () => calls.push('startJob'),
                finishJob: () => {
                    customStats.state.requestsFinished += 1;
                    calls.push('finishJob');
                },
                failJob: () => {},
                discardJob: () => {},
                registerStatusCode: () => {},
                calculate: () => ({}) as CalculatedStatistics,
                startCapturing: async () => void calls.push('startCapturing'),
                stopCapturing: async () => void calls.push('stopCapturing'),
                // `persistState` is optional on `IStatistics`; this backend omits it.
            };

            const crawler = new BasicCrawler({ statistics: customStats, requestHandler: async () => {} });
            expect(crawler.statistics).toBe(customStats);

            await crawler.run([{ url: 'https://example.com' }]);

            expect(calls).toEqual(['startCapturing', 'startJob', 'finishJob', 'stopCapturing']);
            expect(customStats.state.requestsFinished).toBe(1);
        });

        it('exposes the custom state fields of a supplied instance on crawler.statistics', async () => {
            const stats = new Statistics({
                persistenceOptions: { enable: false },
                stateExtension: { defaultState: { productsFound: 0 } },
            });

            const crawler = new BasicCrawler({
                statistics: stats,
                requestHandler: async () => {
                    stats.state.productsFound += 2;
                },
            });

            await crawler.run([{ url: 'https://example.com' }]);

            // typed through the crawler, not just through the instance we constructed
            expect(crawler.statistics.state.productsFound).toBe(2);
            // @ts-expect-error only the fields declared in `defaultState` are exposed
            void crawler.statistics.state.categoriesFound;
        });

        it('does not reset a supplied instance between runs, but does reset a default', async () => {
            const stats = new Statistics({ persistenceOptions: { enable: false } });
            const injectingCrawler = new BasicCrawler({
                statistics: stats,
                requestHandler: async () => {},
            });
            const resetSpy = vitest.spyOn(stats, 'reset');

            await injectingCrawler.run([{ url: 'https://example.com', uniqueKey: 'run-1' }]);
            await injectingCrawler.run([{ url: 'https://example.com', uniqueKey: 'run-2' }]);

            // Two runs, one request each - the injected instance keeps accumulating instead of being wiped.
            expect(resetSpy).not.toHaveBeenCalled();
            expect(stats.state.requestsFinished).toBe(2);

            const owningCrawler = new BasicCrawler({
                requestHandler: async () => {},
            });
            // `crawler.statistics` is typed as `IStatistics`, which omits the owned-only `reset()` - the default is a
            // concrete `Statistics`, so cast to spy on it.
            const ownedResetSpy = vitest.spyOn(owningCrawler.statistics as Statistics, 'reset');

            await owningCrawler.run([{ url: 'https://example.com', uniqueKey: 'owned-1' }]);
            await owningCrawler.run([{ url: 'https://example.com', uniqueKey: 'owned-2' }]);

            // A crawler-owned default is wiped at the start of each run.
            expect(ownedResetSpy).toHaveBeenCalled();
            expect(owningCrawler.statistics.state.requestsFinished).toBe(1);
        });
    });

    describe('proxyConfiguration', () => {
        it('assigns a proxyInfo from the proxyConfiguration to each Session and exposes it on the context', async () => {
            const proxyUrls = [0, 1, 2].map((n) => `http://proxy.example.com:${1000 + n}`);
            const proxyConfiguration = new ProxyConfiguration({ proxyUrls });

            const sessions: ISession[] = [];
            const proxyInfos: (ProxyInfo | undefined)[] = [];

            const crawler = new BasicCrawler({
                proxyConfiguration,
                requestHandler: async ({ session, proxyInfo }) => {
                    sessions.push(session);
                    proxyInfos.push(proxyInfo);
                },
            });

            await crawler.run([
                { url: 'https://example.com/a' },
                { url: 'https://example.com/b' },
                { url: 'https://example.com/c' },
            ]);

            expect(sessions).toHaveLength(3);
            for (let i = 0; i < sessions.length; i++) {
                const proxyInfo = proxyInfos[i];
                expect(proxyInfo).toBeDefined();
                expect(proxyUrls).toContain(proxyInfo!.url);
                expect(sessions[i].proxyInfo).toBe(proxyInfo);
            }
        });

        it('reuses the same Session across multiple requests when the pool is restricted', async () => {
            const sessions: Session[] = [];
            const proxyInfos: (ProxyInfo | undefined)[] = [];

            const crawler = new BasicCrawler({
                sessionPool: new SessionPool({ maxPoolSize: 1 }),
                requestHandler: async ({ session, proxyInfo }) => {
                    sessions.push(session as Session);
                    proxyInfos.push(proxyInfo);
                },
            });

            await crawler.run([
                { url: 'https://example.com/a' },
                { url: 'https://example.com/b' },
                { url: 'https://example.com/c' },
            ]);

            expect(sessions).toHaveLength(3);
            const firstId = sessions[0].id;
            for (const session of sessions) {
                expect(session.id).toBe(firstId);
                expect(session.proxyInfo).toBe(sessions[0].proxyInfo);
            }
            for (const proxyInfo of proxyInfos) {
                expect(proxyInfo).toBe(sessions[0].proxyInfo);
            }
            expect(sessions[0].usageCount).toBe(3);
        });
    });

    test('extendContext', async () => {
        const url = 'https://example.com';
        const requestHandlerImplementation = vi.fn();

        const crawler = new BasicCrawler({
            extendContext: () => ({ hello: 'world' }),
            requestHandler: async ({ hello }) => {
                requestHandlerImplementation({ hello });
            },
        });

        await crawler.run([url]);
        expect(requestHandlerImplementation).toHaveBeenCalledOnce();
        expect(requestHandlerImplementation.mock.calls[0][0]).toMatchObject({ hello: 'world' });
    });

    describe('sendRequest', () => {
        const html = `<!DOCTYPE html><html><head><title>foobar</title></head><body><p>Hello, world!</p></body></html>`;

        const httpServer = http.createServer((request, response) => {
            response.setHeader('content-type', 'text/html');
            response.end(html);
        });

        let url: string;

        beforeAll(async () => {
            await new Promise<void>((resolve) => {
                httpServer.listen(0, () => {
                    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/`;

                    resolve();
                });
            });
        });

        afterAll(async () => {
            await new Promise((resolve) => httpServer.close(resolve));
        });

        test('works', async () => {
            const responses: { statusCode: number; body: string }[] = [];

            const requestList = await RequestList.open(null, [url]);

            const crawler = new BasicCrawler({
                requestList,
                async requestHandler({ sendRequest }) {
                    const response = await sendRequest();

                    responses.push({
                        statusCode: response.status,
                        body: await response.text(),
                    });
                },
            });

            await crawler.run();

            expect(responses).toStrictEqual([
                {
                    statusCode: 200,
                    body: html,
                },
            ]);
        });

        test('forwards ignoreTlsErrors to the http client', async () => {
            const captured: (boolean | undefined)[] = [];

            const crawler = new BasicCrawler({
                // Carries the BaseHttpClient prototype so the crawler's `z.instanceof` validation accepts it.
                httpClient: Object.assign(Object.create(BaseHttpClient.prototype) as BaseHttpClient, {
                    async sendRequest(_request: globalThis.Request, options?: { ignoreTlsErrors?: boolean }) {
                        captured.push(options?.ignoreTlsErrors);
                        return new Response('ok');
                    },
                }),
                async requestHandler({ sendRequest }) {
                    await sendRequest({}, { ignoreTlsErrors: true });
                },
            });

            await crawler.run([url]);

            expect(captured).toEqual([true]);
        });

        test('proxyUrl TypeScript support', async () => {
            const crawler = new BasicCrawler({
                async requestHandler({ sendRequest }) {
                    await sendRequest({
                        proxyUrl: 'http://example.com',
                    });
                },
            });

            expect(crawler).toBeTruthy();
        });
    });

    describe('Request enqueuing limits with maxRequestsPerCrawl', () => {
        test('should not enqueue more requests than maxRequestsPerCrawl allows', async () => {
            const requestQueue = await RequestQueue.open();
            const addRequestsBatchedSpy = vitest.spyOn(requestQueue, 'addRequestsBatched');

            const crawler = new BasicCrawler({
                requestQueue,
                maxRequestsPerCrawl: 5,
                requestHandler: async () => {},
            });

            crawler.statistics.state.requestsFinished = 2;

            // Try to add 6 requests - should only add 3 due to limit
            const requestsToAdd = [
                'http://example.com/1',
                'http://example.com/2',
                'http://example.com/3',
                'http://example.com/4',
                'http://example.com/5',
                'http://example.com/6',
            ];

            await crawler.addRequests(requestsToAdd);

            // Should only have added the first 3 requests (since 2 were already processed, limit allows 3 more)
            expect(addRequestsBatchedSpy).toHaveBeenCalledOnce();
            await expect(requestQueueBackend.listItems()).resolves.toMatchObject([
                { url: 'http://example.com/1' },
                { url: 'http://example.com/2' },
                { url: 'http://example.com/3' },
            ]);
        });

        test('should not enqueue more requests than maxRequestsPerCrawl allows across multiple addRequests calls', async () => {
            const requestQueue = await RequestQueue.open();
            const addRequestsBatchedSpy = vitest.spyOn(requestQueue, 'addRequestsBatched');

            const crawler = new BasicCrawler({
                requestQueue,
                maxRequestsPerCrawl: 5,
                requestHandler: async () => {},
            });

            crawler.statistics.state.requestsFinished = 1;

            // First call - should add 2 requests (2 more slots to go)
            await crawler.addRequests(['http://example.com/1', 'http://example.com/2']);

            await expect(requestQueueBackend.listItems()).resolves.toMatchObject([
                { url: 'http://example.com/1' },
                { url: 'http://example.com/2' },
            ]);

            // Second call - should add only 2 more requests
            await crawler.addRequests([
                'http://example.com/3',
                'http://example.com/4',
                'http://example.com/5', // This should be ignored
                'http://example.com/6', // This should be ignored
            ]);

            await expect(requestQueueBackend.listItems()).resolves.toMatchObject([
                { url: 'http://example.com/1' },
                { url: 'http://example.com/2' },
                { url: 'http://example.com/3' },
                { url: 'http://example.com/4' },
            ]);

            // Third call - should add no requests (limit already reached)
            await crawler.addRequests(['http://example.com/7', 'http://example.com/8']);

            await expect(requestQueueBackend.listItems()).resolves.toMatchObject([
                { url: 'http://example.com/1' },
                { url: 'http://example.com/2' },
                { url: 'http://example.com/3' },
                { url: 'http://example.com/4' },
            ]);

            expect(addRequestsBatchedSpy).toHaveBeenCalledTimes(3);
        });

        test('should respect robots.txt when limiting requests', async () => {
            const requestQueue = await RequestQueue.open();
            const addRequestsBatchedSpy = vitest.spyOn(requestQueue, 'addRequestsBatched');

            const crawler = new BasicCrawler({
                requestQueue,
                maxRequestsPerCrawl: 2,
                respectRobotsTxtFile: true,
                requestHandler: async () => {},
            });

            crawler.statistics.state.requestsFinished = 0;

            // Mock robots.txt checking to disallow some URLs
            vitest.spyOn(crawler as any, 'isAllowedBasedOnRobotsTxtFile').mockImplementation(async (url) => {
                return url !== 'http://example.com/2';
            });

            await crawler.addRequests([
                'http://example.com/1', // Allowed by robots.txt
                'http://example.com/2', // Blocked by robots.txt
                'http://example.com/3', // Allowed by robots.txt && within limit
                'http://example.com/4', // Would exceed limit
            ]);

            await expect(requestQueueBackend.listItems()).resolves.toMatchObject([
                { url: 'http://example.com/1' },
                { url: 'http://example.com/3' },
            ]);

            // Should only have added the first request (allowed by robots.txt and within limit)
            expect(addRequestsBatchedSpy).toHaveBeenCalledOnce();
        });

        test.each([
            {
                testName: 'custom user-agent robots.txt rules',
                userAgent: 'MyCrawler',
                visitedUrls: [
                    {
                        url: 'http://example.com/yes',
                    },
                    {
                        url: 'http://example.com/my-crawler/anything',
                    },
                ],
            },
            {
                testName: 'catch-all robots.txt rules with custom user-agent',
                userAgent: 'RandomCrawler',
                visitedUrls: [
                    {
                        url: 'http://example.com/yes',
                    },
                ],
            },
        ])('should respect $testName', async ({ userAgent, visitedUrls }) => {
            const requestQueue = await RequestQueue.open();
            const addRequestsBatchedSpy = vitest.spyOn(requestQueue, 'addRequestsBatched');

            const crawler = new (class MockedRobotsTxtCrawler extends BasicCrawler {
                override async getRobotsTxtFileForUrl(_: string) {
                    return RobotsTxtFile.from(
                        'http://example.com/robots.txt',
                        `User-agent: *
                         Disallow: /
                         Allow: /yes

                         User-agent: MyCrawler
                         Disallow: /no
                         Allow: /my-crawler
                        `,
                    );
                }
            })({
                requestQueue,
                respectRobotsTxtFile: { userAgent },
                requestHandler: async () => {},
            });

            await crawler.addRequests([
                'http://example.com/yes', // Allowed by robots.txt
                'http://example.com/no', // Blocked by robots.txt for "MyCrawler"
                'http://example.com/no-globally', // Blocked by robots.txt, "*" rule
                'http://example.com/my-crawler/anything', // Blocked by robots.txt for all user-agents, but allowed for "MyCrawler"
            ]);

            await expect(requestQueueBackend.listItems()).resolves.toMatchObject(visitedUrls);

            // Should only have added the first request (allowed by robots.txt and within limit)
            expect(addRequestsBatchedSpy).toHaveBeenCalledOnce();
        });

        describe('robots.txt crawl-delay', () => {
            const crawlerWithCrawlDelay = (options: Partial<BasicCrawlerOptions>) =>
                new (class MockedRobotsTxtCrawler extends BasicCrawler {
                    override async getRobotsTxtFileForUrl(_: string) {
                        return RobotsTxtFile.from('http://example.com/robots.txt', 'User-agent: *\nCrawl-delay: 5\n');
                    }
                })({ respectRobotsTxtFile: true, requestHandler: async () => {}, ...options } as BasicCrawlerOptions);

            test('is applied when a ThrottlingRequestManager covers the domain', async () => {
                const requestManager = new ThrottlingRequestManager({
                    inner: await RequestQueue.open(),
                    domains: ['example.com'],
                });
                const crawler = crawlerWithCrawlDelay({ requestManager });
                const warning = vitest.spyOn(crawler.log, 'warning').mockImplementation(() => {});

                await crawler.addRequests(['http://example.com/1', 'http://example.com/2']);

                expect(warning).not.toHaveBeenCalled();

                // The robots.txt `Crawl-delay: 5` must have reached the manager, not merely been survivable.
                await requestManager.fetchNextRequest();
                // `domainStates` is TS-private, and deliberately not `#private`, so that tests can read it.
                const { domainStates } = requestManager as unknown as {
                    domainStates: Map<string, { declaredCrawlDelayMs: number; crawlDelayUntil: number }>;
                };
                const state = domainStates.get('example.com')!;
                expect(state.declaredCrawlDelayMs).toBe(5_000);

                // ...and it paces dispatch: the next request is held back rather than served immediately.
                expect(state.crawlDelayUntil).toBeGreaterThan(Date.now() + 4_000);
                expect(await requestManager.fetchNextRequest()).toBeNull();

                const readiness = await requestManager.checkReadiness();
                expect(readiness).toMatchObject({ status: 'waiting' });
                expect(readiness.status === 'waiting' && readiness.readyAt).toBeGreaterThan(Date.now() + 4_000);
            });

            test('warns naming the options that would honour it when nothing paces the domain', async () => {
                const crawler = crawlerWithCrawlDelay({ requestQueue: await RequestQueue.open() });
                const warning = vitest.spyOn(crawler.log, 'warning').mockImplementation(() => {});

                await crawler.addRequests(['http://example.com/1', 'http://example.com/2']);

                expect(warning).toHaveBeenCalledTimes(1);
                expect(warning.mock.calls[0][0]).toMatch(/crawl-delay of 5s/);
                expect(warning.mock.calls[0][0]).toMatch(/`sameDomainDelaySecs`.*`ThrottlingRequestManager`/s);
            });

            test('warns naming the domain when it is missing from the manager `domains` list', async () => {
                const requestManager = new ThrottlingRequestManager({
                    inner: await RequestQueue.open(),
                    domains: ['some-other-domain.com'],
                });
                const crawler = crawlerWithCrawlDelay({ requestManager });
                const warning = vitest.spyOn(crawler.log, 'warning').mockImplementation(() => {});

                await crawler.addRequests(['http://example.com/1']);

                // Same warning as when nothing paces at all - the fix it names covers either case.
                expect(warning).toHaveBeenCalledTimes(1);
                expect(warning.mock.calls[0][0]).toMatch(/does not pace that domain/);
                expect(warning.mock.calls[0][0]).toMatch(/example\.com/);
            });

            test('is honoured for requests that started life in a `requestList`', async () => {
                const visits: number[] = [];
                const crawler = new (class MockedRobotsTxtCrawler extends BasicCrawler {
                    override async getRobotsTxtFileForUrl(_: string) {
                        return RobotsTxtFile.from('http://example.com/robots.txt', 'User-agent: *\nCrawl-delay: 0.5\n');
                    }
                })({
                    respectRobotsTxtFile: true,
                    requestList: await RequestList.open(null, [
                        'http://example.com/1',
                        'http://example.com/2',
                        'http://example.com/3',
                    ]),
                    // Negligible on its own, so the delay observed below can only come from robots.txt.
                    sameDomainDelaySecs: 0.01,
                    requestHandler: async () => {
                        visits.push(Date.now());
                    },
                });

                await crawler.run();

                // robots.txt is only read while the first request is in flight, so the delay it declares first
                // bites between the second and the third.
                expect(visits).toHaveLength(3);
                expect(visits[2] - visits[1]).toBeGreaterThanOrEqual(400);
            });
        });

        describe('sameDomainDelaySecs', () => {
            const crawlerVisiting = async (urls: string[], options: Partial<BasicCrawlerOptions> = {}) => {
                const visits: { url: string; at: number }[] = [];
                const crawler = new BasicCrawler({
                    sameDomainDelaySecs: 0.5,
                    requestHandler: async ({ request }) => {
                        visits.push({ url: request.url, at: Date.now() });
                    },
                    ...options,
                });

                await crawler.run(urls);
                return { crawler, visits };
            };

            test('spaces out requests to one site, subdomains included', async () => {
                const { visits } = await crawlerVisiting(
                    ['http://a.example.com/1', 'http://b.example.com/2', 'http://other.com/1'],
                    { sameDomainDelaySecs: 1 },
                );

                expect(visits).toHaveLength(3);

                const [sameSite, elsewhere] = [
                    visits.filter(({ url }) => url.includes('example.com')),
                    visits.filter(({ url }) => url.includes('other.com')),
                ];

                // The two hosts belong to the same site, so the delay applies across them...
                expect(sameSite[1].at - sameSite[0].at).toBeGreaterThanOrEqual(700);
                // ...while an unrelated domain is served in the meantime rather than queued behind it.
                expect(elsewhere[0].at - sameSite[0].at).toBeLessThan(700);
            });

            test('does not re-enqueue the requests it delays', async () => {
                const reclaimed: string[] = [];
                const requestQueue = await RequestQueue.open();
                const reclaimRequest = requestQueue.reclaimRequest.bind(requestQueue);
                requestQueue.reclaimRequest = async (request, options) => {
                    reclaimed.push(request.url);
                    return reclaimRequest(request, options);
                };

                const { visits } = await crawlerVisiting(['http://example.com/1', 'http://example.com/2'], {
                    requestQueue,
                    sameDomainDelaySecs: 0.2,
                });

                // The point of the exercise: a delayed request waits in its domain's queue instead of being
                // handed out, put back, and handed out again.
                expect(visits).toHaveLength(2);
                expect(reclaimed).toEqual([]);
            });

            test('paces requests that came from a `requestList`, and still finishes the crawl', async () => {
                // The tandem is the only position from which a list's requests reach a per-domain queue, and
                // once there they have to be handed back to it, or the crawl would never finish.
                const requestList = await RequestList.open(null, ['http://example.com/1', 'http://example.com/2']);
                const { visits } = await crawlerVisiting([], { requestList, sameDomainDelaySecs: 0.5 });

                expect(visits.map(({ url }) => url).sort()).toEqual(['http://example.com/1', 'http://example.com/2']);
                expect(visits[1].at - visits[0].at).toBeGreaterThanOrEqual(400);
            });

            test('a second run() does not crawl the same requests again', async () => {
                // The per-domain queues the pacer opened are not emptied between runs either.
                let visits = 0;
                const crawler = new BasicCrawler({
                    sameDomainDelaySecs: 0.05,
                    requestHandler: async () => {
                        visits += 1;
                    },
                });

                await crawler.run(['http://example.com/1']);
                await crawler.run(['http://example.com/1']);

                expect(visits).toBe(1);
            });

            test('wraps a user `requestManager` rather than replacing it', async () => {
                const requestManager = await RequestQueue.open();

                const { crawler, visits } = await crawlerVisiting(['http://example.com/1', 'http://example.com/2'], {
                    requestManager,
                    sameDomainDelaySecs: 0.5,
                });

                const active = await crawler.getRequestManager();
                expect(active).toBeInstanceOf(ThrottlingRequestManager);
                expect((active as ThrottlingRequestManager<RequestQueue>).innerManager).toBe(requestManager);

                expect(visits).toHaveLength(2);
                expect(visits[1].at - visits[0].at).toBeGreaterThanOrEqual(400);
            });

            test('hands the delay to a manager that paces requests itself', async () => {
                const requestManager = new ThrottlingRequestManager({
                    inner: await RequestQueue.open(),
                    domains: 'all',
                    throttleBy: 'registrableDomain',
                });

                const { crawler, visits } = await crawlerVisiting(['http://example.com/1', 'http://example.com/2'], {
                    requestManager,
                    sameDomainDelaySecs: 0.5,
                });

                // Nothing was built around it, so the caller's manager is still the only thing pacing.
                await expect(crawler.getRequestManager()).resolves.toBe(requestManager);

                expect(visits).toHaveLength(2);
                expect(visits[1].at - visits[0].at).toBeGreaterThanOrEqual(400);
            });

            test('reaches a pacing manager through a wrapper', async () => {
                // A tandem is not a pacer but forwards signals, so the throttler behind it takes the floor -
                // no wrapper type is inspected on the way.
                const throttler = new ThrottlingRequestManager({
                    inner: await RequestQueue.open(),
                    domains: 'all',
                    throttleBy: 'registrableDomain',
                });
                const requestManager = new RequestManagerTandem(
                    await RequestList.open(null, ['http://example.com/1', 'http://example.com/2']),
                    throttler,
                );

                const { crawler, visits } = await crawlerVisiting([], { requestManager, sameDomainDelaySecs: 0.5 });

                await expect(crawler.getRequestManager()).resolves.toBe(requestManager);

                expect(visits).toHaveLength(2);
                expect(visits[1].at - visits[0].at).toBeGreaterThanOrEqual(400);
            });

            test('refuses a manager that paces only some of the domains it holds', async () => {
                // Taking a floor that covers every domain would leave everything but `example.com` unpaced.
                const requestManager = new ThrottlingRequestManager({
                    inner: await RequestQueue.open(),
                    domains: ['example.com'],
                    throttleBy: 'registrableDomain',
                });

                expect(
                    () =>
                        new BasicCrawler({
                            requestManager,
                            sameDomainDelaySecs: 1,
                            requestHandler: async () => {},
                        }),
                ).toThrow(/domains: 'all'/);
            });
        });

        test('enqueueLinks should respect custom user-agent robots.txt rules', async () => {
            const requestQueue = await RequestQueue.open();
            const visitedUrls: string[] = [];

            const crawler = new (class MockedRobotsTxtCrawler extends BasicCrawler {
                override async getRobotsTxtFileForUrl(_: string) {
                    return RobotsTxtFile.from(
                        'http://example.com/robots.txt',
                        `User-agent: *
                         Disallow: /
                         Allow: /yes

                         User-agent: MyCrawler
                         Disallow: /no
                         Allow: /my-crawler
                        `,
                    );
                }
            })({
                requestQueue,
                maxConcurrency: 1,
                respectRobotsTxtFile: { userAgent: 'MyCrawler' },
                requestHandler: async (context) => {
                    visitedUrls.push(context.request.url);

                    if (context.request.label) {
                        return;
                    }

                    await context.addRequests(
                        [
                            'http://example.com/yes',
                            'http://example.com/no',
                            'http://example.com/no-globally',
                            'http://example.com/my-crawler/anything',
                        ],
                        { label: 'child' },
                    );
                },
            });

            await crawler.run(['http://example.com/start']);

            expect(visitedUrls).toEqual([
                'http://example.com/start',
                'http://example.com/yes',
                'http://example.com/my-crawler/anything',
            ]);
        });

        test('enqueueLinks forwards respectRobotsTxtFile.userAgent to the robots.txt check', async () => {
            const requestQueue = await RequestQueue.open();
            const isAllowedSpy = vitest.fn(() => true);

            const crawler = new (class MockedRobotsTxtCrawler extends BasicCrawler {
                override async getRobotsTxtFileForUrl(_: string) {
                    return { isAllowed: isAllowedSpy, getCrawlDelay: () => undefined } as unknown as RobotsTxtFile;
                }
            })({
                requestQueue,
                maxConcurrency: 1,
                respectRobotsTxtFile: { userAgent: 'MyCrawler' },
                requestHandler: async (context) => {
                    if (context.request.label) return;
                    await context.addRequests(['http://example.com/child'], { label: 'child' });
                },
            });

            await crawler.run(['http://example.com/start']);

            expect(isAllowedSpy).toHaveBeenCalledWith('http://example.com/child', 'MyCrawler');
        });

        test('enqueueLinks should respect maxRequestsPerCrawl', async () => {
            const requestQueue = await RequestQueue.open();
            const addRequestsBatchedSpy = vitest.spyOn(requestQueue, 'addRequestsBatched');

            // Will try to add 6 requests - should only add 3 due to limit
            const requestsToAdd = [
                'http://example.com/1',
                'http://example.com/2',
                'http://example.com/3',
                'http://example.com/4',
                'http://example.com/5',
                'http://example.com/6',
            ];
            const visitedUrls: string[] = [];

            const crawler = new BasicCrawler({
                requestQueue,
                maxRequestsPerCrawl: 5,
                requestHandler: async (context) => {
                    visitedUrls.push(context.request.url);

                    if (context.request.label) {
                        return;
                    }

                    crawler.statistics.state.requestsFinished = 2;

                    await context.addRequests(requestsToAdd, { label: 'not-undefined' });
                },
            });

            await crawler.run(['http://example.com']);

            expect(visitedUrls).toEqual([
                'http://example.com', // added by crawler.run()
                'http://example.com/1',
                'http://example.com/2',
            ]);

            // Should only have added the first 2 requests (since 2 were already processed and 1 is in progress, limit allows 2 more)
            expect(addRequestsBatchedSpy).toHaveBeenCalledTimes(2);
        });

        test('enqueueLinks limit log message should only be logged once', async () => {
            const requestQueue = await RequestQueue.open();

            // Will try to add 10 requests with a limit of 2
            const requestsToAdd = Array.from({ length: 10 }, (_, i) => `http://example.com/${i}`);

            const crawler = new BasicCrawler({
                requestQueue,
                requestHandler: async (context) => {
                    if (context.request.label) {
                        return;
                    }

                    await context.addRequests(requestsToAdd, { limit: 2, label: 'child' });
                },
            });

            const infoSpy = vitest.spyOn(crawler.log, 'info');

            await crawler.run(['http://example.com']);

            // The enqueueLinks limit message should only appear once, not 8 times (for each skipped request)
            const enqueueLimitMessages = infoSpy.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].includes('enqueueLinks limit'),
            );
            expect(enqueueLimitMessages).toHaveLength(1);
        });

        test('enqueueLinks limit log message should be logged again on subsequent runs', async () => {
            const requestQueue = await RequestQueue.open();

            const requestsToAdd = Array.from({ length: 5 }, (_, i) => `http://example.com/${i}`);

            const crawler = new BasicCrawler({
                requestQueue,
                requestHandler: async (context) => {
                    if (context.request.label) {
                        return;
                    }

                    await context.addRequests(requestsToAdd, { limit: 1, label: 'child' });
                },
            });

            const infoSpy = vitest.spyOn(crawler.log, 'info');

            // First run
            await crawler.run(['http://example.com/first']);

            // Second run with a new start URL
            await crawler.run(['http://example.com/second']);

            // The enqueueLinks limit message should appear twice (once per run)
            const enqueueLimitMessages = infoSpy.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].includes('enqueueLinks limit'),
            );
            expect(enqueueLimitMessages).toHaveLength(2);
        });

        test('enqueueLinks limit log message should be logged once per request handler, not once per run', async () => {
            const requestQueue = await RequestQueue.open();

            // Each handler will try to add 5 URLs with a limit of 1
            const requestsToAdd = Array.from({ length: 5 }, (_, i) => `http://example.com/child${i}`);

            const crawler = new BasicCrawler({
                requestQueue,
                requestHandler: async (context) => {
                    if (context.request.label === 'child') {
                        return;
                    }

                    await context.addRequests(requestsToAdd, { limit: 1, label: 'child' });
                },
            });

            const infoSpy = vitest.spyOn(crawler.log, 'info');

            // Single run with two initial requests - both will trigger the limit
            await crawler.run(['http://example.com/first', 'http://example.com/second']);

            // The enqueueLinks limit message should appear twice (once per request handler that triggered the limit)
            const enqueueLimitMessages = infoSpy.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].includes('enqueueLinks limit'),
            );
            expect(enqueueLimitMessages).toHaveLength(2);
        });

        test('maxCrawlDepth limit log message should only be logged once per run', async () => {
            const requestQueue = await RequestQueue.open();

            // Each handler will try to add URLs that exceed maxCrawlDepth
            const requestsToAdd = Array.from({ length: 5 }, (_, i) => `http://example.com/child${i}`);

            const crawler = new BasicCrawler({
                requestQueue,
                maxCrawlDepth: 1, // Only allow depth 0 (initial) and depth 1 (first level children)
                requestHandler: async (context) => {
                    // Stop processing at depth 2 to avoid infinite loops
                    if (context.request.crawlDepth >= 2) {
                        return;
                    }

                    // This will add requests at depth+1, so initial requests add at depth 1 (allowed)
                    // and depth 1 requests add at depth 2 (blocked by maxCrawlDepth)
                    await context.addRequests(requestsToAdd, {
                        label: `depth-${context.request.crawlDepth + 1}`,
                    });
                },
            });

            const infoSpy = vitest.spyOn(crawler.log, 'info');

            // Run with two initial requests
            // Each will enqueue children at depth 1, then those children will try to enqueue at depth 2 (blocked)
            await crawler.run(['http://example.com/first', 'http://example.com/second']);

            // The maxCrawlDepth limit message should only appear once per run, even though multiple requests triggered it
            const maxCrawlDepthMessages = infoSpy.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].includes('maxCrawlDepth'),
            );
            expect(maxCrawlDepthMessages).toHaveLength(1);
        });

        test('should not count duplicate URLs toward maxRequestsPerCrawl limit (addRequests)', async () => {
            const requestQueue = await RequestQueue.open();

            const crawler = new BasicCrawler({
                requestQueue,
                maxRequestsPerCrawl: 5,
                requestHandler: async () => {},
            });

            // 10 duplicate links to the same URL + 1 unique link at the end
            const requestsToAdd = [
                ...Array.from({ length: 10 }, () => 'http://example.com/same'),
                'http://example.com/new',
            ];

            await crawler.addRequests(requestsToAdd);

            // Both unique URLs should have been enqueued — duplicates should not consume the budget
            await expect(requestQueueBackend.listItems()).resolves.toMatchObject([
                { url: 'http://example.com/same' },
                { url: 'http://example.com/new' },
            ]);
        });

        test('addRequestsBatched with maxNewRequests should correctly report requestsOverLimit for array input', async () => {
            const queue = await RequestQueue.open();

            const result = await queue.addRequestsBatched(
                [
                    { url: 'http://example.com/a' },
                    { url: 'http://example.com/b' },
                    { url: 'http://example.com/c' },
                    { url: 'http://example.com/d' },
                    { url: 'http://example.com/e' },
                ],
                { maxNewRequests: 2 },
            );

            const addedUrls = result.addedRequests.filter((r) => !r.wasAlreadyPresent).map((r) => r.uniqueKey);

            const overLimitUrls = (result.requestsOverLimit ?? []).map((r) => (typeof r === 'string' ? r : r.url));

            expect(addedUrls).toHaveLength(2);
            expect(overLimitUrls).toHaveLength(3);
        });

        test('addRequestsBatched with maxNewRequests should correctly report requestsOverLimit for generator input', async () => {
            const queue = await RequestQueue.open();

            async function* urls() {
                yield { url: 'http://example.com/a' };
                yield { url: 'http://example.com/b' };
                yield { url: 'http://example.com/c' };
                yield { url: 'http://example.com/d' };
                yield { url: 'http://example.com/e' };
            }

            const result = await queue.addRequestsBatched(urls(), { maxNewRequests: 2 });

            const addedUrls = result.addedRequests.filter((r) => !r.wasAlreadyPresent).map((r) => r.uniqueKey);

            const overLimitUrls = (result.requestsOverLimit ?? []).map((r) => (typeof r === 'string' ? r : r.url));

            expect(addedUrls).toHaveLength(2);
            expect(overLimitUrls).toHaveLength(3);
        });

        test('should not count duplicate URLs toward maxRequestsPerCrawl limit (enqueueLinks)', async () => {
            const requestQueue = await RequestQueue.open();

            const visitedUrls: string[] = [];

            const crawler = new BasicCrawler({
                requestQueue,
                maxRequestsPerCrawl: 5,
                requestHandler: async (context) => {
                    visitedUrls.push(context.request.url);

                    if (context.request.label) {
                        return;
                    }

                    // Enqueue 10 duplicate links + 1 new unique link
                    const urls = [...Array.from({ length: 10 }, () => 'http://example.com/'), 'http://example.com/new'];

                    await context.addRequests(urls, { label: 'child' });
                },
            });

            await crawler.run(['http://example.com/']);

            // Both the start URL and the new URL should have been visited
            expect(visitedUrls).toContain('http://example.com/');
            expect(visitedUrls).toContain('http://example.com/new');
        });

        test('enqueueLinks should respect maxRequestsPerCrawl when passed an explicitly undefined limit', async () => {
            const requestQueue = await RequestQueue.open();
            const onSkippedRequest = vitest.fn();

            const requestsToAdd = Array.from({ length: 6 }, (_, i) => `http://example.com/${i + 1}`);

            const crawler = new BasicCrawler({
                requestQueue,
                maxRequestsPerCrawl: 5,
                onSkippedRequest,
                requestHandler: async (context) => {
                    if (context.request.label) {
                        return;
                    }

                    crawler.statistics.state.requestsFinished = 2;

                    // e.g. `enqueueLinks({ urls, limit: config.limit })` where `config.limit` is not set
                    await context.addRequests(requestsToAdd, { limit: undefined, label: 'child' });
                },
            });

            await crawler.run(['http://example.com']);

            // 2 requests already finished and 1 is in progress, so only 2 more fit into the limit
            expect(await requestQueue.getTotalCount()).toBe(3);

            const skippedUrls = onSkippedRequest.mock.calls
                .map((call) => call[0])
                .filter(({ reason }) => reason === 'limit')
                .map(({ request }) => request.url)
                .sort();

            expect(skippedUrls).toEqual([
                'http://example.com/3',
                'http://example.com/4',
                'http://example.com/5',
                'http://example.com/6',
            ]);
        });

        test('enqueueLinks should clamp an explicit limit to the remaining maxRequestsPerCrawl budget', async () => {
            const requestQueue = await RequestQueue.open();

            const requestsToAdd = Array.from({ length: 6 }, (_, i) => `http://example.com/${i + 1}`);

            const crawler = new BasicCrawler({
                requestQueue,
                maxRequestsPerCrawl: 5,
                requestHandler: async (context) => {
                    if (context.request.label) {
                        return;
                    }

                    crawler.statistics.state.requestsFinished = 2;

                    await context.addRequests(requestsToAdd, { limit: 4, label: 'child' });
                },
            });

            const infoSpy = vitest.spyOn(crawler.log, 'info');

            await crawler.run(['http://example.com']);

            // The user limit of 4 is higher than what's left of maxRequestsPerCrawl, so only 2 are enqueued
            expect(await requestQueue.getTotalCount()).toBe(3);

            // ...and the log message must not blame the user limit of 4 for it
            expect(infoSpy).toHaveBeenCalledWith(
                expect.stringContaining('due to the remaining maxRequestsPerCrawl budget of 2'),
            );
        });

        test('enqueueLinks should keep reporting skipped requests when the user passes onSkippedRequest', async () => {
            const requestQueue = await RequestQueue.open();
            const crawlerOnSkippedRequest = vitest.fn();
            const userOnSkippedRequest = vitest.fn();

            const requestsToAdd = Array.from({ length: 3 }, (_, i) => `http://example.com/${i + 1}`);

            const crawler = new BasicCrawler({
                requestQueue,
                onSkippedRequest: crawlerOnSkippedRequest,
                requestHandler: async (context) => {
                    if (context.request.label) {
                        return;
                    }

                    await context.addRequests(requestsToAdd, {
                        limit: 1,
                        label: 'child',
                        onSkippedRequest: userOnSkippedRequest,
                    });
                },
            });

            await crawler.run(['http://example.com']);

            for (const mock of [crawlerOnSkippedRequest, userOnSkippedRequest]) {
                const skipped = mock.mock.calls
                    .map((call) => ({ url: call[0].request.url, reason: call[0].reason }))
                    .sort((a, b) => a.url.localeCompare(b.url));

                expect(skipped).toEqual([
                    { url: 'http://example.com/2', reason: 'limit' },
                    { url: 'http://example.com/3', reason: 'limit' },
                ]);
            }
        });
    });

    describe('transactional storage', () => {
        test('a failing request handler leaves no dataset/KVS writes, but write-through enqueues survive', async () => {
            const crawler = new BasicCrawler({
                maxRequestRetries: 0,
                requestHandler: async ({ request, pushData, addRequests }) => {
                    if (request.label === 'FAIL') {
                        await pushData({ from: 'failing-handler' });
                        await (await KeyValueStore.open()).setValue('failing-key', { a: 1 });
                        await addRequests([{ url: `http://${HOSTNAME}:${port}/child`, label: 'CHILD' }]);
                        throw new Error('handler failed');
                    }

                    await pushData({ from: 'child-handler' });
                },
            });

            await crawler.run([{ url: `http://${HOSTNAME}:${port}/`, label: 'FAIL' }]);

            // The write-through enqueue survived the failure and the child was crawled...
            const dataset = await Dataset.open();
            await expect(dataset.getData()).resolves.toMatchObject({ items: [{ from: 'child-handler' }] });

            // ...while the failing handler's other writes were rolled back.
            await expect(KeyValueStore.getValue('failing-key')).resolves.toBeNull();
        });

        test('a retried handler does not double-write, and the deferred queue policy reaches the transaction', async () => {
            const crawler = new BasicCrawler({
                maxRequestRetries: 1,
                transactionalStorage: { requestQueue: 'deferred' },
                requestHandler: async ({ request, pushData, addRequests }) => {
                    if (request.label === 'CHILD') {
                        return;
                    }

                    await pushData({ attempt: request.retryCount });
                    // A different child per attempt, so `uniqueKey` dedup cannot mask a write-through
                    // enqueue of the failed attempt.
                    await addRequests([
                        { url: `http://${HOSTNAME}:${port}/child-${request.retryCount}`, label: 'CHILD' },
                    ]);

                    if (request.retryCount === 0) {
                        throw new Error('first attempt fails');
                    }
                },
            });

            await crawler.run([`http://${HOSTNAME}:${port}/`]);

            // Exactly one copy of the data, from the successful attempt.
            const dataset = await Dataset.open();
            await expect(dataset.getData()).resolves.toMatchObject({ total: 1, items: [{ attempt: 1 }] });

            // Only the successful attempt's enqueue reached the queue: the seed plus `child-1`.
            // A write-through enqueue of the failed attempt would have left `child-0` behind as well.
            await expect((await crawler.getRequestQueue()).getTotalCount()).resolves.toBe(2);
        });

        test('errorHandler and failedRequestHandler writes reach real storage', async () => {
            const crawler = new BasicCrawler({
                maxRequestRetries: 1,
                requestHandler: async ({ pushData }) => {
                    await pushData({ from: 'handler' });
                    throw new Error('always fails');
                },
                errorHandler: async () => {
                    await (await KeyValueStore.open()).setValue('error-handler', { ran: true });
                },
                failedRequestHandler: async () => {
                    await (await KeyValueStore.open()).setValue('failed-request-handler', { ran: true });
                },
            });

            await crawler.run([`http://${HOSTNAME}:${port}/`]);

            await expect(KeyValueStore.getValue('error-handler')).resolves.toEqual({ ran: true });
            await expect(KeyValueStore.getValue('failed-request-handler')).resolves.toEqual({ ran: true });

            const dataset = await Dataset.open();
            await expect(dataset.getData()).resolves.toMatchObject({ total: 0 });
        });

        test('transactionalStorage: false disables the mechanism entirely', async () => {
            const crawler = new BasicCrawler({
                maxRequestRetries: 0,
                transactionalStorage: false,
                requestHandler: async ({ pushData }) => {
                    await pushData({ from: 'failing-handler' });
                    throw new Error('handler failed');
                },
            });

            await crawler.run([`http://${HOSTNAME}:${port}/`]);

            // Without transactions, the write of the failing handler lands immediately and stays.
            const dataset = await Dataset.open();
            await expect(dataset.getData()).resolves.toMatchObject({ items: [{ from: 'failing-handler' }] });
        });

        test('an unclosed transaction on a normal pipeline return is discarded and logged', async () => {
            const crawler = new BasicCrawler({ requestHandler: async () => {} });
            const errorSpy = vitest.spyOn((crawler as any).log, 'error').mockImplementation(() => {});

            // Simulate the wiring bug the guard exists for: the pipeline callback returns normally while
            // its transaction is still open (handleRequest failed to commit or roll it back).
            let leaked: any;
            await (crawler as any).runInStorageTransaction(async () => {
                leaked = (await import('@crawlee/core')).currentStorageTransaction();
            });

            expect(leaked.state).toBe('rolledBack'); // discarded, not left open
            expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/still open after the request pipeline/));

            errorSpy.mockRestore();
        });

        test('the crawler never fetches the next request inside a storage transaction', async () => {
            // The invariant that lets the request manager stay ignorant of transactions: fetching is
            // crawler bookkeeping that runs *before* the request's transaction opens. If a refactor ever
            // moved the fetch inside the transaction scope, a buffered add/transfer could be rolled back
            // after the source request was consumed - losing the request. Observed through the public
            // `requestManager` option, so the assertion sits on a documented seam, not crawler internals.
            const { currentStorageTransaction } = await import('@crawlee/core');

            const realManager = await RequestQueue.open();
            await realManager.addRequests([
                `http://${HOSTNAME}:${port}/one`,
                `http://${HOSTNAME}:${port}/two`,
                `http://${HOSTNAME}:${port}/three`,
            ]);

            let fetches = 0;
            let fetchedInsideTransaction = false;

            // A pass-through manager: delegates everything to a real queue, only observing whether a
            // transaction is active at fetch time.
            const observingManager = new Proxy(realManager, {
                get(target, prop, receiver) {
                    if (prop === 'fetchNextRequest') {
                        return async (...args: unknown[]) => {
                            fetches += 1;
                            if (currentStorageTransaction()?.isActive) fetchedInsideTransaction = true;
                            return (target.fetchNextRequest as (...a: unknown[]) => unknown)(...args);
                        };
                    }
                    const value = Reflect.get(target, prop, receiver);
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            });

            const crawler = new BasicCrawler({
                requestQueue: observingManager as unknown as RequestQueue,
                requestHandler: async () => {},
            });

            await crawler.run();

            expect(fetches).toBeGreaterThan(0);
            expect(fetchedInsideTransaction).toBe(false);
        });

        test('onSkippedRequest bookkeeping survives an in-pipeline robots.txt skip', async () => {
            const crawler = new BasicCrawler({
                maxRequestRetries: 0,
                respectRobotsTxtFile: true,
                requestHandler: async () => {},
                onSkippedRequest: async ({ request, reason }) => {
                    await (await KeyValueStore.open()).setValue('skipped', { url: request.url, reason });
                },
            });

            // Let the request into the crawler's queue, then disallow it during processing, so the skip
            // happens inside the request's transaction scope.
            const queue = await crawler.getRequestQueue();
            await queue.addRequest({ url: `http://${HOSTNAME}:${port}/disallowed` });
            vitest.spyOn(crawler as any, 'isAllowedBasedOnRobotsTxtFile').mockResolvedValue(false);

            await crawler.run();

            await expect(KeyValueStore.getValue('skipped')).resolves.toMatchObject({ reason: 'robotsTxt' });
        });

        test('a crawler started from inside a request handler runs outside the caller transaction', async () => {
            const handled: string[] = [];

            const inner = new BasicCrawler({
                requestHandler: async ({ request }) => {
                    handled.push(request.url);
                },
            });

            const outer = new BasicCrawler({
                maxRequestRetries: 0,
                requestHandler: async () => {
                    const run = inner.run([`http://${HOSTNAME}:${port}/inner`]);
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    await run;
                },
            });

            await outer.run([`http://${HOSTNAME}:${port}/outer`]);

            expect(handled).toEqual([`http://${HOSTNAME}:${port}/inner`]);
        });

        test('a nested crawl is not cancelled by the calling request handler timing out', async () => {
            const handled: string[] = [];

            const inner = new BasicCrawler({
                maxRequestRetries: 0,
                requestHandler: async ({ request }) => {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    handled.push(request.url);
                },
            });

            const outer = new BasicCrawler({
                maxRequestRetries: 0,
                requestHandlerTimeoutSecs: 1,
                requestHandler: async () => {
                    void inner.run([`http://${HOSTNAME}:${port}/inner`]);
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                },
            });

            await outer.run([`http://${HOSTNAME}:${port}/outer`]);
            await expect.poll(() => handled).toEqual([`http://${HOSTNAME}:${port}/inner`]);
        });

        test('an unrecognized write policy is rejected instead of falling back to the default', () => {
            const make = (transactionalStorage: unknown) =>
                new BasicCrawler({ requestHandler: async () => {}, transactionalStorage } as any);

            expect(() => make({ requestQueue: 'defered' })).toThrow(/requestQueue/);
            expect(() => make({ dataset: 'deferred' })).toThrow(/dataset/);

            expect(() => make(true)).not.toThrow();
            expect(() => make(false)).not.toThrow();
            expect(() => make({})).not.toThrow();
            expect(() => make({ requestQueue: 'deferred' })).not.toThrow();
            expect(() => make({ requestQueue: 'writeThrough' })).not.toThrow();
        });
    });

    describe('addRequests input validation', () => {
        test('should throw error when passed a non-iterable value', async () => {
            const crawler = new BasicCrawler({
                requestHandler: async () => {},
            });

            await expect(crawler.addRequests(new WeakSet() as any)).rejects.toThrow(
                'Expected an iterable or async iterable, got weakset',
            );
        });
    });

    describe('Dataset helpers, crawler parallelism', () => {
        const payload: Dictionary[] = [{ foo: 'bar', baz: 123 }];
        const getPayload: (id: string) => Dictionary[] = (id) => [{ foo: id }];

        const tmpDir = `${import.meta.dirname}/tmp/foo/bar`;

        beforeAll(async () => {
            await rm(tmpDir, { recursive: true, force: true });
        });

        test('should expose default Dataset methods', async () => {
            const crawler = new BasicCrawler();

            await crawler.pushData(payload);

            expect((await crawler.getData()).items).toEqual(payload);
        });

        test('export data', async () => {
            const row: Dictionary = { foo: 'bar', baz: 123 };
            const crawler = new BasicCrawler();

            await crawler.pushData(row);
            await crawler.pushData(row);
            await crawler.pushData(row);

            await crawler.exportData(`${tmpDir}/result.csv`);
            await crawler.exportData(`${tmpDir}/result.json`);

            const csv = await readFile(`${tmpDir}/result.csv`);
            expect(csv.toString()).toBe('foo,baz\nbar,123\nbar,123\nbar,123\n');
            const json = await readFile(`${tmpDir}/result.json`);
            expect(json.toString()).toBe(
                '[\n' +
                    '    {\n' +
                    '        "foo": "bar",\n' +
                    '        "baz": 123\n' +
                    '    },\n' +
                    '    {\n' +
                    '        "foo": "bar",\n' +
                    '        "baz": 123\n' +
                    '    },\n' +
                    '    {\n' +
                    '        "foo": "bar",\n' +
                    '        "baz": 123\n' +
                    '    }\n' +
                    ']\n',
            );

            await rm(`${tmpDir}/result.csv`);
            await rm(`${tmpDir}/result.json`);
        });

        test('exports do not fail on empty dataset', async () => {
            const crawler = new BasicCrawler();

            await crawler.exportData(`${tmpDir}/result.csv`);
            await crawler.exportData(`${tmpDir}/result.json`);

            const csv = await readFile(`${tmpDir}/result.csv`);
            expect(csv.toString()).toBe('');
            const json = await readFile(`${tmpDir}/result.json`);
            expect(json.toString()).toBe('[]\n');

            await rm(`${tmpDir}/result.csv`);
            await rm(`${tmpDir}/result.json`);
        });

        test('should expose pushData helper', async () => {
            const crawler = new BasicCrawler({
                requestHandler: async ({ pushData }) => pushData(payload),
            });

            await crawler.run([
                {
                    url: `http://${HOSTNAME}:${port}`,
                },
            ]);

            expect((await crawler.getData()).items).toEqual(payload);
        });

        test('crawler.exportData works with `collectAllKeys`', async () => {
            const crawler = new BasicCrawler();
            await crawler.pushData([{ foo: 'bar', baz: 123 }]);
            await crawler.pushData([{ foo: 'baz', qux: 456 }]);

            await crawler.exportData(`${tmpDir}/result.csv`, 'csv', { collectAllKeys: true });

            const csv = await readFile(`${tmpDir}/result.csv`);
            expect(csv.toString()).toBe('foo,baz,qux\nbar,123,\nbaz,,456\n');

            await rm(`${tmpDir}/result.csv`);
        });

        test("Crawlers with different storage backends don't share Datasets", async () => {
            // Each crawler gets its own MemoryStorageBackend instance; every instance has a unique
            // per-instance cache key, so they end up in separate cache partitions.
            const storageA = new MemoryStorageBackend();
            const storageB = new MemoryStorageBackend();

            const crawlerA = new BasicCrawler({ storageBackend: storageA });
            const crawlerB = new BasicCrawler({ storageBackend: storageB });

            await crawlerA.pushData(getPayload('A'));
            await crawlerB.pushData(getPayload('B'));

            expect((await crawlerA.getData()).items).toEqual(getPayload('A'));

            expect((await crawlerB.getData()).items).toEqual(getPayload('B'));
        });

        test('Crawlers with different storage backends run separately', async () => {
            const storageA = new MemoryStorageBackend();
            const storageB = new MemoryStorageBackend();

            const crawlerA = new BasicCrawler({
                requestHandler: () => {},
                storageBackend: storageA,
            });
            const crawlerB = new BasicCrawler({
                requestHandler: () => {},
                storageBackend: storageB,
            });

            await crawlerA.run([{ url: `http://${HOSTNAME}:${port}` }]);
            await crawlerB.run([{ url: `http://${HOSTNAME}:${port}` }]);

            expect(crawlerA.statistics.state.requestsFinished).toBe(1);
            expect(crawlerB.statistics.state.requestsFinished).toBe(1);
        });
    });

    describe('schema validation on add', () => {
        const makeCrawler = () => {
            const router = Router.create({
                DETAIL: z.object({ id: z.string() }),
            });
            router.addHandler('DETAIL', async () => {});

            return new BasicCrawler({ requestHandler: router });
        };

        test('crawler.addRequests rejects userData that does not match the label schema', async () => {
            const crawler = makeCrawler();

            await expect(
                crawler.addRequests([
                    { url: 'https://example.com/a', label: 'DETAIL', userData: { id: 123 } },
                ] as never),
            ).rejects.toThrow(RequestValidationError);
        });

        test('crawler.run rejects userData that does not match the label schema', async () => {
            const crawler = makeCrawler();

            await expect(
                crawler.run([{ url: 'https://example.com/a', label: 'DETAIL', userData: { id: 123 } }] as never),
            ).rejects.toThrow(RequestValidationError);
        });

        test('crawler.addRequests accepts matching userData', async () => {
            const crawler = makeCrawler();

            await crawler.addRequests([{ url: 'https://example.com/b', label: 'DETAIL', userData: { id: 'ok' } }]);

            const queue = await crawler.getRequestQueue();
            expect((await queue.checkReadiness()).status).toBe('ready');
        });

        test('crawler.addRequests excludes the Crawlee-managed label when validating (strict schemas)', async () => {
            const router = Router.create({ DETAIL: z.strictObject({ id: z.string() }) });
            router.addHandler('DETAIL', async () => {});
            const crawler = new BasicCrawler({ requestHandler: router });

            // a Request instance stores `label` inside `userData`; it must not trip the strict schema
            await crawler.addRequests([
                new Request({ url: 'https://example.com/s', label: 'DETAIL', userData: { id: 'ok' } }),
            ]);

            const queue = await crawler.getRequestQueue();
            expect((await queue.checkReadiness()).status).toBe('ready');
        });

        test('a schema that declares the label opts into validating it', async () => {
            const router = Router.create({
                DETAIL: z.object({ label: z.literal('DETAIL'), id: z.string() }),
            });
            router.addHandler('DETAIL', async () => {});
            const crawler = new BasicCrawler({ requestHandler: router });

            // the label is not part of the source's `userData`, yet a schema declaring it still validates
            await crawler.addRequests([
                { url: 'https://example.com/l', label: 'DETAIL', userData: { id: 'ok' } },
            ] as never);

            const queue = await crawler.getRequestQueue();
            expect((await queue.fetchNextRequest())?.userData).toMatchObject({ label: 'DETAIL', id: 'ok' });
        });

        test('a schema declaring the label reports only genuine issues', async () => {
            const router = Router.create({
                DETAIL: z.object({ label: z.literal('DETAIL'), id: z.string() }),
            });
            router.addHandler('DETAIL', async () => {});
            const crawler = new BasicCrawler({ requestHandler: router });

            // the label matches, so the only reported issue must be the bad `id` — not a spurious label one
            const error = await crawler
                .addRequests([{ url: 'https://example.com/m', label: 'DETAIL', userData: { id: 123 } }] as never)
                .catch((err: Error) => err);

            expect(error).toBeInstanceOf(RequestValidationError);
            expect((error as Error).message).toContain('id:');
            expect((error as Error).message).not.toContain('label:');
        });

        test('the parsed (coerced) userData is what gets stored in the queue', async () => {
            const router = Router.create({
                DETAIL: z.object({ id: z.string(), price: z.coerce.number() }),
            });
            router.addHandler('DETAIL', async () => {});
            const crawler = new BasicCrawler({ requestHandler: router });

            await crawler.addRequests([
                { url: 'https://example.com/c', label: 'DETAIL', userData: { id: 'ok', price: '42' } },
            ] as never);

            const queue = await crawler.getRequestQueue();
            const request = await queue.fetchNextRequest();

            // the queue holds the coerced number, not the raw '42' string that was passed in
            expect(request?.userData.price).toBe(42);
        });

        test('a defaultRoute schema validates userData added for unregistered labels', async () => {
            const router = Router.create({
                DETAIL: z.object({ id: z.string() }),
                [defaultRoute]: z.object({ page: z.number() }),
            });
            router.addHandler('DETAIL', async () => {});
            router.addDefaultHandler(async () => {});
            const crawler = new BasicCrawler({ requestHandler: router });

            // an unregistered label is validated against the default-route schema on add
            await expect(
                crawler.addRequests([
                    { url: 'https://example.com/l', label: 'LIST', userData: { page: 'nope' } },
                ] as never),
            ).rejects.toThrow(RequestValidationError);

            // a registered label uses its own schema, and a matching default-route request is accepted
            await crawler.addRequests([
                { url: 'https://example.com/d', label: 'DETAIL', userData: { id: 'ok' } },
                { url: 'https://example.com/p', label: 'LIST', userData: { page: 2 } },
            ] as never);
            const queue = await crawler.getRequestQueue();
            expect((await queue.checkReadiness()).status).toBe('ready');
        });

        test('context.addRequests validates userData against the label schema', async () => {
            const router = Router.create({ DETAIL: z.object({ id: z.string() }) });
            let caught: unknown;
            router.addDefaultHandler(async ({ addRequests }) => {
                try {
                    await addRequests(['https://example.com/x'], {
                        label: 'DETAIL',
                        userData: { id: 123 },
                    } as never);
                } catch (err) {
                    caught = err;
                }
            });

            const crawler = new BasicCrawler({ requestHandler: router });
            await crawler.run([`http://${HOSTNAME}:${port}/`]);

            expect(caught).toBeInstanceOf(RequestValidationError);
        });

        test('requests with a label that has no registered schema are not validated', async () => {
            const crawler = makeCrawler();

            await crawler.addRequests([
                { url: 'https://example.com/d', label: 'OTHER', userData: { whatever: true } },
            ] as never);

            const queue = await crawler.getRequestQueue();
            expect((await queue.checkReadiness()).status).toBe('ready');
        });

        test('a plain (non-router) requestHandler skips validation entirely', async () => {
            const crawler = new BasicCrawler({ requestHandler: async () => {} });

            await crawler.addRequests([{ url: 'https://example.com/e', label: 'DETAIL', userData: { id: 123 } }]);

            const queue = await crawler.getRequestQueue();
            expect((await queue.checkReadiness()).status).toBe('ready');
        });

        test('validation runs at the crawler level; direct requestQueue calls bypass it', async () => {
            let validateCount = 0;
            // `version` has to stay the literal `1` the spec declares; an object literal widens it to `number`
            const countingSchema = {
                '~standard': {
                    version: 1 as const,
                    vendor: 'test',
                    validate: (value: unknown) => {
                        validateCount += 1;
                        return { value };
                    },
                },
            };

            const makeRouterCrawler = () => {
                const router = Router.create({ DETAIL: countingSchema });
                router.addHandler('DETAIL', async () => {});

                return new BasicCrawler({ requestHandler: router });
            };

            // crawler.addRequests validates each request exactly once
            validateCount = 0;
            await makeRouterCrawler().addRequests([
                { url: 'https://example.com/a', label: 'DETAIL', userData: { id: 'a' } },
            ]);
            expect(validateCount).toBe(1);

            // a direct requestQueue.addRequest / addRequests bypasses the crawler and is not validated
            validateCount = 0;
            const queue = await makeRouterCrawler().getRequestQueue();
            await queue.addRequest({ url: 'https://example.com/b', label: 'DETAIL', userData: { id: 'b' } });
            await queue.addRequestsBatched([{ url: 'https://example.com/c', label: 'DETAIL', userData: { id: 'c' } }]);
            expect(validateCount).toBe(0);
        });
    });
});
