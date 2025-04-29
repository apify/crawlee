import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import type { CrawlingContext, ErrorHandler, RequestHandler } from '@crawlee/basic';
import {
    BasicCrawler,
    Configuration,
    CriticalError,
    EventType,
    KeyValueStore,
    MissingRouteError,
    NonRetryableError,
    Request,
    RequestList,
    RequestQueue,
} from '@crawlee/basic';
import { RequestState } from '@crawlee/core';
import type { Dictionary } from '@crawlee/utils';
import { sleep } from '@crawlee/utils';
import express from 'express';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

import log from '@apify/log';

import { startExpressAppPromise } from '../../shared/_helper';

describe('BasicCrawler', () => {
    let logLevel: number;
    const localStorageEmulator = new MemoryStorageEmulator();
    const events = Configuration.getEventManager();

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
        await localStorageEmulator.init();
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    afterAll(async () => {
        log.setLevel(logLevel);
    });

    afterAll(() => {
        server.close();
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

        expect(basicCrawler.autoscaledPool!.minConcurrency).toBe(25);
        expect(processed).toEqual(sourcesCopy);
        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
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

        await basicCrawler.run(sources);
        await basicCrawler.run(sources);
        await basicCrawler.run(sources);

        expect(processed).toHaveLength(sourcesCopy.length * 3);
    });

    test('should correctly combine shorthand and full length options', async () => {
        const shorthandOptions = {
            minConcurrency: 123,
            maxConcurrency: 456,
            maxRequestsPerMinute: 789,
        };

        const autoscaledPoolOptions = {
            minConcurrency: 16,
            maxConcurrency: 32,
            maxTasksPerMinute: 64,
        };

        const collectResults = (crawler: BasicCrawler): typeof shorthandOptions | typeof autoscaledPoolOptions => {
            return {
                minConcurrency: crawler.autoscaledPool!.minConcurrency,
                maxConcurrency: crawler.autoscaledPool!.maxConcurrency,
                // eslint-disable-next-line dot-notation -- accessing a private member
                maxRequestsPerMinute: crawler.autoscaledPool!['maxTasksPerMinute'],
                // eslint-disable-next-line dot-notation
                maxTasksPerMinute: crawler.autoscaledPool!['maxTasksPerMinute'],
            };
        };

        const requestList = await RequestList.open(null, []);
        const requestHandler = async () => {};

        const results = await Promise.all(
            [
                new BasicCrawler({
                    requestList,
                    requestHandler,
                    ...shorthandOptions,
                }),
                new BasicCrawler({
                    requestList,
                    requestHandler,
                    autoscaledPoolOptions,
                }),
                new BasicCrawler({
                    requestList,
                    requestHandler,
                    ...shorthandOptions,
                    autoscaledPoolOptions,
                }),
            ].map(async (c) => {
                await c.run();
                return collectResults(c);
            }),
        );

        expect(results[0]).toEqual(expect.objectContaining(shorthandOptions));

        expect(results[1]).toEqual(expect.objectContaining(autoscaledPoolOptions));

        expect(results[2]).toEqual(expect.objectContaining(shorthandOptions));
    });

    test('auto-saved state object', async () => {
        const sources = [...Array(50).keys()].map((index) => ({ url: `https://example.com/${index}` }));
        const sourcesCopy = JSON.parse(JSON.stringify(sources));

        const processed: { url: string }[] = [];
        const requestList = await RequestList.open(null, sources);
        const requestHandler: RequestHandler = async ({ request, crawler }) => {
            await sleep(10);
            const state = await crawler.useState({ processed });
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
        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
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
                if (request.url.endsWith('200')) events.emit(event);
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
            basicCrawler.stats.persistState = async () => Promise.resolve();
            await persistPromise;

            expect(finished).toBe(false);
            expect(await requestList.isFinished()).toBe(false);
            expect(await requestList.isEmpty()).toBe(false);
            expect(processed.length).toBe(200);

            expect(getValueSpy).toBeCalled();
            expect(setValueSpy).toBeCalled();

            // clean up
            // @ts-expect-error Accessing private method
            await basicCrawler.autoscaledPool!._destroy();
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

        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
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

        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
    });

    test('should not retry requests with noRetry set to true ', async () => {
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

        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
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
        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
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
        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
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
        expect(await requestList.isFinished()).toBe(false);
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
        expect(await requestList.isFinished()).toBe(false);
    });

    test('should correctly combine RequestList and RequestQueue', async () => {
        const sources = [
            { url: 'http://example.com/0' },
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
        ];
        const processed: Dictionary<Request> = {};
        const requestList = await RequestList.open(null, sources);
        const requestQueue = new RequestQueue({ id: 'xxx', client: Configuration.getStorageClient() });

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

        vitest.spyOn(requestQueue, 'handledCount').mockResolvedValueOnce(0);

        vitest
            .spyOn(requestQueue, 'addRequest')
            .mockResolvedValueOnce({ requestId: 'id-0' } as any)
            .mockResolvedValueOnce({ requestId: 'id-1' } as any)
            .mockResolvedValueOnce({ requestId: 'id-2' } as any);

        const request0 = new Request({ id: 'id-0', ...sources[0] });
        const request1 = new Request({ id: 'id-1', ...sources[1] });
        const request2 = new Request({ id: 'id-2', ...sources[2] });

        vitest
            .spyOn(requestQueue, 'fetchNextRequest')
            .mockResolvedValueOnce(request0)
            .mockResolvedValueOnce(request1)
            .mockResolvedValueOnce(request2)
            .mockResolvedValueOnce(request1)
            .mockResolvedValueOnce(request1)
            .mockResolvedValueOnce(request1);

        const markReqHandled = vitest
            .spyOn(requestQueue, 'markRequestHandled')
            .mockReturnValue(Promise.resolve() as any);
        const reclaimReq = vitest.spyOn(requestQueue, 'reclaimRequest').mockReturnValue(Promise.resolve() as any);

        vitest
            .spyOn(requestQueue, 'isEmpty')
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        vitest.spyOn(requestQueue, 'isFinished').mockResolvedValueOnce(true);

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

        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);

        vitest.restoreAllMocks();
    });

    test('should say that task is not ready requestList is not set and requestQueue is empty', async () => {
        const requestQueue = new RequestQueue({ id: 'xxx', client: Configuration.getStorageClient() });
        requestQueue.isEmpty = async () => Promise.resolve(true);

        const crawler = new BasicCrawler({
            requestQueue,
            requestHandler: async () => {},
        });

        // @ts-expect-error Accessing private prop
        expect(await crawler._isTaskReadyFunction()).toBe(false);
    });

    test('should be possible to override isFinishedFunction and isTaskReadyFunction of underlying AutoscaledPool', async () => {
        const requestQueue = new RequestQueue({ id: 'xxx', client: Configuration.getStorageClient() });
        const processed: Request[] = [];
        const queue: Request[] = [];
        let isFinished = false;
        let isFinishedFunctionCalled = false;
        let isTaskReadyFunctionCalled = false;

        const basicCrawler = new BasicCrawler({
            requestQueue,
            autoscaledPoolOptions: {
                minConcurrency: 1,
                maxConcurrency: 1,
                isFinishedFunction: async () => {
                    isFinishedFunctionCalled = true;
                    return Promise.resolve(isFinished);
                },
                isTaskReadyFunction: async () => {
                    isTaskReadyFunctionCalled = true;
                    return Promise.resolve(!isFinished);
                },
            },
            requestHandler: async ({ request }) => {
                await sleep(10);
                processed.push(request);
            },
        });

        // Speed up the test
        // @ts-expect-error Accessing private prop
        basicCrawler.autoscaledPoolOptions.maybeRunIntervalSecs = 0.05;

        const request0 = new Request({ url: 'http://example.com/0' });
        const request1 = new Request({ url: 'http://example.com/1' });

        vitest.spyOn(requestQueue, 'handledCount').mockReturnValue(Promise.resolve() as any);
        const markRequestHandled = vitest
            .spyOn(requestQueue, 'markRequestHandled')
            .mockReturnValue(Promise.resolve() as any);

        const isFinishedOrig = vitest.spyOn(requestQueue, 'isFinished');

        requestQueue.fetchNextRequest = async () => queue.pop()!;
        requestQueue.isEmpty = async () => Promise.resolve(!queue.length);

        setTimeout(() => queue.push(request0), 10);
        setTimeout(() => queue.push(request1), 100);
        setTimeout(() => {
            isFinished = true;
        }, 150);

        await basicCrawler.run();

        expect(markRequestHandled).toBeCalledWith(request0);
        expect(markRequestHandled).toBeCalledWith(request1);
        expect(isFinishedOrig).not.toBeCalled();
        expect(isFinishedFunctionCalled).toBe(true);
        expect(isTaskReadyFunctionCalled).toBe(true);

        // TODO: see why the request1 was passed as a second parameter to includes
        expect(processed.includes(request0)).toBe(true);

        vitest.restoreAllMocks();
    });

    test('keepAlive', async () => {
        const requestQueue = new RequestQueue({ id: 'xxx', client: Configuration.getStorageClient() });
        const processed: Request[] = [];
        const queue: Request[] = [];

        const basicCrawler = new BasicCrawler({
            requestQueue,
            keepAlive: true,
            requestHandler: async ({ request }) => {
                await sleep(10);
                processed.push(request);
            },
        });

        // Speed up the test
        // @ts-expect-error Accessing private prop
        basicCrawler.autoscaledPoolOptions.maybeRunIntervalSecs = 0.05;

        const request0 = new Request({ url: 'http://example.com/0' });
        const request1 = new Request({ url: 'http://example.com/1' });

        vitest.spyOn(requestQueue, 'handledCount').mockReturnValue(Promise.resolve() as any);
        const markRequestHandled = vitest
            .spyOn(requestQueue, 'markRequestHandled')
            .mockReturnValue(Promise.resolve() as any);

        const isFinishedOrig = vitest.spyOn(requestQueue, 'isFinished');

        requestQueue.fetchNextRequest = async () => Promise.resolve(queue.pop()!);
        requestQueue.isEmpty = async () => Promise.resolve(!queue.length);

        setTimeout(() => queue.push(request0), 10);
        setTimeout(() => queue.push(request1), 100);
        setTimeout(() => {
            void basicCrawler.teardown();
        }, 300);

        await basicCrawler.run();

        expect(markRequestHandled).toBeCalledWith(request0);
        expect(markRequestHandled).toBeCalledWith(request1);
        expect(isFinishedOrig).not.toBeCalled();

        // TODO: see why the request1 was passed as a second parameter to includes
        expect(processed.includes(request0)).toBe(true);

        vitest.restoreAllMocks();
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

        expect(processed['http://example.com/2'].userData.foo).toEqual(undefined);
        expect(processed['http://example.com/2'].errorMessages).toHaveLength(4);
        expect(processed['http://example.com/2'].retryCount).toBe(3);

        expect(failedRequestHandlerCalls).toBe(1);

        expect(await requestList.isFinished()).toBe(false);
        expect(await requestList.isEmpty()).toBe(false);
    });

    test('should load handledRequestCount from storages', async () => {
        const requestQueue = new RequestQueue({ id: 'id', client: Configuration.getStorageClient() });
        requestQueue.isEmpty = async () => false;
        requestQueue.isFinished = async () => false;

        requestQueue.fetchNextRequest = async () => new Request({ id: 'id', url: 'http://example.com' });
        // @ts-expect-error Overriding the method for testing purposes
        requestQueue.markRequestHandled = async () => {};

        const requestQueueStub = vitest.spyOn(requestQueue, 'handledCount').mockResolvedValue(33);

        let count = 0;
        let crawler = new BasicCrawler({
            requestQueue,
            maxConcurrency: 1,
            requestHandler: async () => {
                await sleep(1);
                count++;
            },
            maxRequestsPerCrawl: 40,
        });

        await crawler.run();
        expect(requestQueueStub).toBeCalled();
        expect(count).toBe(7);
        vitest.restoreAllMocks();

        const sources = Array.from(Array(10).keys(), (x) => x + 1).map((i) => ({ url: `http://example.com/${i}` }));
        const sourcesCopy = JSON.parse(JSON.stringify(sources));
        let requestList = await RequestList.open({ sources });
        const requestListStub = vitest.spyOn(requestList, 'handledCount').mockReturnValue(33);

        count = 0;
        crawler = new BasicCrawler({
            requestList,
            maxConcurrency: 1,
            requestHandler: async () => {
                await sleep(1);
                count++;
            },
            maxRequestsPerCrawl: 40,
        });

        await crawler.run();
        expect(requestListStub).toBeCalled();
        expect(count).toBe(7);
        vitest.restoreAllMocks();

        requestList = await RequestList.open({ sources: sourcesCopy });
        const listStub = vitest.spyOn(requestList, 'handledCount').mockReturnValue(20);
        const queueStub = vitest.spyOn(requestQueue, 'handledCount').mockResolvedValue(33);
        const addRequestStub = vitest.spyOn(requestQueue, 'addRequest').mockReturnValue(Promise.resolve() as any);

        count = 0;
        crawler = new BasicCrawler({
            requestList,
            requestQueue,
            maxConcurrency: 1,
            requestHandler: async () => {
                await sleep(1);
                count++;
            },
            maxRequestsPerCrawl: 40,
        });

        await crawler.run();

        expect(queueStub).toBeCalled();
        expect(listStub).not.toBeCalled();
        expect(addRequestStub).toBeCalledTimes(7);
        expect(count).toBe(7);

        vitest.restoreAllMocks();
    });

    test('should timeout after handleRequestTimeoutSecs', async () => {
        const url = 'https://example.com';
        const requestList = await RequestList.open({ sources: [{ url }] });

        const results: Request[] = [];
        const crawler = new BasicCrawler({
            requestList,
            handleRequestTimeoutSecs: 0.01,
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

    test('limits handleRequestTimeoutSecs and derived vars to a valid value', async () => {
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
        // @ts-expect-error Accessing private prop
        expect(crawler.requestHandlerTimeoutMillis).toBe(maxSignedInteger);
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
            expect(/Reclaiming failed request back to the list or queue/.test(args[0])).toBe(true);
            expect(/requestHandler timed out after/.test(args[0])).toBe(true);
            expect(/at Timeout\._onTimeout/.test(args[0])).toBe(false);
            expect(args[1]).toBeDefined();
        }

        expect(errorSpy.mock.calls.length).toBe(1);
        for (const args of errorSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(/Request failed and reached maximum retries/.test(args[0])).toBe(true);
            expect(/requestHandler timed out after/.test(args[0])).toBe(true);
            expect(/at Timeout\._onTimeout/.test(args[0])).toBe(false);
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
            expect(/Reclaiming failed request back to the list or queue/.test(args[0])).toBe(true);
            expect(/Other non-timeout error/.test(args[0])).toBe(true);
            expect(args[0].split('\n').length).toBeLessThanOrEqual(2);
            expect(args[1]).toBeDefined();
        }

        expect(errorSpy.mock.calls.length).toBe(1);
        for (const args of errorSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(/Request failed and reached maximum retries/.test(args[0])).toBe(true);
            expect(/Other non-timeout error/.test(args[0])).toBe(true);
            expect(/at _?BasicCrawler\.requestHandler/.test(args[0])).toBe(true);
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
            expect(/Reclaiming failed request back to the list or queue/.test(args[0])).toBe(true);
            expect(/requestHandler timed out after/.test(args[0])).toBe(true);
            expect(/at Timeout\._onTimeout/.test(args[0])).toBe(true);
            expect(args[1]).toBeDefined();
        }

        expect(errorSpy.mock.calls.length).toBe(1);
        for (const args of errorSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(/Request failed and reached maximum retries/.test(args[0])).toBe(true);
            expect(/requestHandler timed out after/.test(args[0])).toBe(true);
            expect(/at Timeout\._onTimeout/.test(args[0])).toBe(true);
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
            expect(/Reclaiming failed request back to the list or queue/.test(args[0])).toBe(true);
            expect(/Other non-timeout error/.test(args[0])).toBe(true);
            expect(/at _?BasicCrawler\.requestHandler/.test(args[0])).toBe(true);
            expect(args[1]).toBeDefined();
        }

        expect(errorSpy.mock.calls.length).toBe(1);
        for (const args of errorSpy.mock.calls) {
            expect(args.length).toBe(2);
            expect(typeof args[0]).toBe('string');
            expect(/Request failed and reached maximum retries/.test(args[0])).toBe(true);
            expect(/Other non-timeout error/.test(args[0])).toBe(true);
            expect(/at _?BasicCrawler\.requestHandler/.test(args[0])).toBe(true);
            expect(args[1]).toBeDefined();
        }

        log.setLevel(log.LEVELS.OFF);
        process.env.CRAWLEE_VERBOSE_LOG = undefined;
    });

    describe('Uses SessionPool', () => {
        it('should use SessionPool when useSessionPool is true ', async () => {
            const url = 'https://example.com';
            const requestList = await RequestList.open({ sources: [{ url }] });
            const results: Request[] = [];

            const crawler = new BasicCrawler({
                requestList,
                handleRequestTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                useSessionPool: true,
                sessionPoolOptions: {
                    maxPoolSize: 10,
                    persistStateKey: 'POOL',
                },
                requestHandler: async ({ session }) => {
                    expect(session!.constructor.name).toEqual('Session');
                    expect(session!.id).toBeDefined();
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

            const crawler = new BasicCrawler({
                requestList,
                handleRequestTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                useSessionPool: true,
                sessionPoolOptions: {
                    maxPoolSize: 10,
                    persistStateKey: 'POOL',
                },
                requestHandler: async () => {},
                failedRequestHandler: async () => {},
            });
            await crawler.run();

            // @ts-expect-error private symbol
            expect(crawler.sessionPool.maxPoolSize).toEqual(10);
        });

        it('should destroy Session pool after it is finished', async () => {
            const url = 'https://example.com';
            const requestList = await RequestList.open({ sources: [{ url }] });
            events.off(EventType.PERSIST_STATE);

            const crawler = new BasicCrawler({
                requestList,
                handleRequestTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                useSessionPool: true,
                sessionPoolOptions: {
                    maxPoolSize: 10,
                },
                requestHandler: async () => {},
                failedRequestHandler: async () => {},
            });

            // @ts-expect-error Accessing private prop
            crawler._loadHandledRequestCount = () => {
                expect(crawler.sessionPool).toBeDefined();
                expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(1);
            };

            await crawler.run();
            expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(0);
            // @ts-expect-error private symbol
            expect(crawler.sessionPool.maxPoolSize).toEqual(10);
        });
    });

    describe('CrawlingContext', () => {
        test('should be kept and later deleted', async () => {
            const urls = [
                'https://example.com/0',
                'https://example.com/1',
                'https://example.com/2',
                'https://example.com/3',
            ];
            const requestList = await RequestList.open(null, urls);
            let counter = 0;
            let finish: (value?: unknown) => void;
            const allFinishedPromise = new Promise((resolve) => {
                finish = resolve;
            });
            const mainContexts: CrawlingContext[] = [];
            const otherContexts: CrawlingContext[][] = [];
            const crawler = new BasicCrawler({
                requestList,
                minConcurrency: 4,
                async requestHandler(crawlingContext) {
                    // @ts-expect-error Accessing private prop
                    mainContexts[counter] = crawler.crawlingContexts.get(crawlingContext.id);
                    // @ts-expect-error Accessing private prop
                    otherContexts[counter] = Array.from(crawler.crawlingContexts).map(([, v]) => v);
                    counter++;
                    if (counter === 4) finish();
                    await allFinishedPromise;
                },
            });
            await crawler.run();

            expect(counter).toBe(4);
            expect(mainContexts).toHaveLength(4);
            expect(otherContexts).toHaveLength(4);
            // @ts-expect-error Accessing private prop
            expect(crawler.crawlingContexts.size).toBe(0);
            mainContexts.forEach((ctx, idx) => {
                expect(typeof ctx.id).toBe('string');
                expect(otherContexts[idx]).toContain(ctx);
            });
            otherContexts.forEach((list, idx) => {
                expect(list).toHaveLength(idx + 1);
            });
        });
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
                useSessionPool: true,
                requestList,
                async requestHandler({ sendRequest }) {
                    const response = await sendRequest();

                    responses.push({
                        statusCode: response.statusCode,
                        body: response.body,
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

        test('works without session', async () => {
            const requestList = await RequestList.open(null, [url]);

            const responses: { statusCode: number; body: string }[] = [];

            const crawler = new BasicCrawler({
                useSessionPool: false,
                requestList,
                async requestHandler({ sendRequest }) {
                    const response = await sendRequest();

                    responses.push({
                        statusCode: response.statusCode,
                        body: response.body,
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

        test('proxyUrl TypeScript support', async () => {
            const crawler = new BasicCrawler({
                useSessionPool: true,
                async requestHandler({ sendRequest }) {
                    await sendRequest({
                        proxyUrl: 'http://example.com',
                    });
                },
            });

            expect(crawler).toBeTruthy();
        });
    });

    describe('Dataset helpers, crawler parallelism', () => {
        const payload: Dictionary[] = [{ foo: 'bar', baz: 123 }];
        const getPayload: (id: string) => Dictionary[] = (id) => [{ foo: id }];

        const tmpDir = `${__dirname}/tmp/foo/bar`;

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

        test("Crawlers with different Configurations don't share Datasets", async () => {
            const crawlerA = new BasicCrawler({}, new Configuration({ persistStorage: false }));
            const crawlerB = new BasicCrawler({}, new Configuration({ persistStorage: false }));

            await crawlerA.pushData(getPayload('A'));
            await crawlerB.pushData(getPayload('B'));

            expect((await crawlerA.getData()).items).toEqual(getPayload('A'));

            expect((await crawlerB.getData()).items).toEqual(getPayload('B'));
        });

        test('Crawlers with different Configurations run separately', async () => {
            const crawlerA = new BasicCrawler(
                { requestHandler: () => {} },
                new Configuration({ persistStorage: false }),
            );
            const crawlerB = new BasicCrawler(
                { requestHandler: () => {} },
                new Configuration({ persistStorage: false }),
            );

            await crawlerA.run([{ url: `http://${HOSTNAME}:${port}` }]);
            await crawlerB.run([{ url: `http://${HOSTNAME}:${port}` }]);

            expect(crawlerA.stats.state.requestsFinished).toBe(1);
            expect(crawlerB.stats.state.requestsFinished).toBe(1);
        });
    });
});
