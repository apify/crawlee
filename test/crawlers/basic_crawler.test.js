import _ from 'underscore';
import sinon from 'sinon';
import log from 'apify-shared/log';
import { ACTOR_EVENT_NAMES } from 'apify-shared/consts';
import * as Apify from '../../build';
import * as keyValueStore from '../../build/key_value_store';
import { RequestQueue, RequestQueueLocal } from '../../build/request_queue';
import { sleep } from '../../build/utils';
import events from '../../build/events';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';

describe('BasicCrawler', () => {
    let logLevel;
    let localStorageEmulator;
    let LOCAL_STORAGE_DIR;

    beforeAll(async () => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.OFF);
        localStorageEmulator = new LocalStorageDirEmulator();
        await localStorageEmulator.init();
        LOCAL_STORAGE_DIR = localStorageEmulator.localStorageDir;
    });

    beforeEach(async () => {
        await localStorageEmulator.clean();
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
        log.setLevel(logLevel);
    });

    test('should run in parallel thru all the requests', async () => {
        const sources = _.range(0, 500).map(index => ({ url: `https://example.com/${index}` }));

        const processed = [];
        const requestList = new Apify.RequestList({ sources });
        const handleRequestFunction = async ({ request }) => {
            await sleep(10);
            processed.push(_.pick(request, 'url'));
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            minConcurrency: 25,
            maxConcurrency: 25,
            handleRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(basicCrawler.autoscaledPool.minConcurrency).toBe(25);
        expect(processed).toEqual(sources);
        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
    });

    test(
        'should pause on migration event and persist RequestList state',
        async () => {
            const sources = _.range(500).map(index => ({ url: `https://example.com/${index + 1}` }));

            let persistResolve;
            const persistPromise = new Promise((res) => { persistResolve = res; });

            // Mock the calls to persist sources.
            const mock = sinon.mock(keyValueStore);
            mock.expects('getValue').twice().resolves(null);
            mock.expects('setValue').once().resolves();

            const processed = [];
            const requestList = await Apify.openRequestList('reqList', sources);
            const handleRequestFunction = async ({ request }) => {
                if (request.url.endsWith('200')) Apify.events.emit(ACTOR_EVENT_NAMES.MIGRATING);
                processed.push(_.pick(request, 'url'));
            };

            const basicCrawler = new Apify.BasicCrawler({
                requestList,
                minConcurrency: 25,
                maxConcurrency: 25,
                handleRequestFunction,
            });

            let finished = false;
            // Mock the call to persist state.
            mock.expects('setValue').once().callsFake(async () => { persistResolve(); });
            // The crawler will pause after 200 requests
            const runPromise = basicCrawler.run();
            runPromise.then(() => { finished = true; });
            await persistPromise;

            expect(finished).toBe(false);
            expect(await requestList.isFinished()).toBe(false);
            expect(await requestList.isEmpty()).toBe(false);
            expect(processed.length).toBe(200);

            mock.verify();

            // clean up
            await basicCrawler.autoscaledPool._destroy(); // eslint-disable-line no-underscore-dangle
        },
    );

    test('should retry failed requests', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const processed = {};
        const requestList = new Apify.RequestList({ sources });

        const handleRequestFunction = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;

            if (request.url === 'http://example.com/2') {
                throw Error(`This is ${request.retryCount}th error!`);
            }

            request.userData.foo = 'bar';
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            maxRequestRetries: 10,
            minConcurrency: 3,
            maxConcurrency: 3,
            handleRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).toBe('bar');
        expect(processed['http://example.com/1'].errorMessages).toBeNull();
        expect(processed['http://example.com/1'].retryCount).toBe(0);
        expect(processed['http://example.com/3'].userData.foo).toBe('bar');
        expect(processed['http://example.com/3'].errorMessages).toBeNull();
        expect(processed['http://example.com/3'].retryCount).toBe(0);

        expect(processed['http://example.com/2'].userData.foo).toBeUndefined();
        expect(processed['http://example.com/2'].errorMessages).toHaveLength(11);
        expect(processed['http://example.com/2'].retryCount).toBe(10);

        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
    });

    test('should not retry requests with noRetry set to true ', async () => {
        const noRetryRequest = new Apify.Request({ url: 'http://example.com/3' });
        try {
            noRetryRequest.doNotRetry('no retry');
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).toBe('no retry');
        }

        const sources = [
            { url: 'http://example.com/1', noRetry: true },
            { url: 'http://example.com/2' },
            noRetryRequest,
        ];
        const processed = {};
        const requestList = new Apify.RequestList({ sources });

        const handleRequestFunction = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;
            request.userData.foo = 'bar';
            throw Error(`This is ${request.retryCount}th error!`);
        };

        let handleFailedRequestFunctionCalls = 0;
        const handleFailedRequestFunction = () => {
            handleFailedRequestFunctionCalls++;
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            maxRequestRetries: 10,
            minConcurrency: 3,
            maxConcurrency: 3,
            handleRequestFunction,
            handleFailedRequestFunction,
        });

        await requestList.initialize();
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

        expect(handleFailedRequestFunctionCalls).toBe(3);

        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
    });

    test('should allow to handle failed requests', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const processed = {};
        const failed = {};
        const errors = [];
        const requestList = new Apify.RequestList({ sources });

        const handleRequestFunction = async ({ request }) => {
            await Promise.reject(new Error('some-error'));
            processed[request.url] = request;
        };

        const handleFailedRequestFunction = async ({ request, error }) => {
            failed[request.url] = request;
            errors.push(error);
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            handleRequestFunction,
            handleFailedRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(failed['http://example.com/1'].errorMessages).toHaveLength(4);
        expect(failed['http://example.com/1'].retryCount).toBe(3);
        expect(failed['http://example.com/2'].errorMessages).toHaveLength(4);
        expect(failed['http://example.com/2'].retryCount).toBe(3);
        expect(failed['http://example.com/3'].errorMessages).toHaveLength(4);
        expect(failed['http://example.com/3'].retryCount).toBe(3);
        expect(_.values(failed)).toHaveLength(3);
        expect(_.values(processed)).toHaveLength(0);
        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
        errors.forEach(error => expect(error).toBeInstanceOf(Error));
    });

    test('should require at least one of RequestQueue and RequestList', () => {
        const requestList = new Apify.RequestList({ sources: [] });
        const requestQueue = new RequestQueue('xxx');
        const handleRequestFunction = () => {};

        expect(() => new Apify.BasicCrawler({ handleRequestFunction })).toThrowError();
        expect(() => new Apify.BasicCrawler({ handleRequestFunction, requestList })).not.toThrowError();
        expect(() => new Apify.BasicCrawler({ handleRequestFunction, requestQueue })).not.toThrowError();
        expect(() => new Apify.BasicCrawler({ handleRequestFunction, requestQueue, requestList })).not.toThrowError();
    });

    test('should also support RequestQueueLocal', () => {
        const requestQueue = new RequestQueue('xxx');
        const requestQueueLocal = new RequestQueueLocal('xxx', LOCAL_STORAGE_DIR);
        const handleRequestFunction = () => {};

        expect(() => new Apify.BasicCrawler({ handleRequestFunction, requestQueue })).not.toThrowError();
        expect(() => new Apify.BasicCrawler({ handleRequestFunction, requestQueue: requestQueueLocal })).not.toThrowError();
    });

    test('should correctly combine RequestList and RequestQueue', async () => {
        const sources = [
            { url: 'http://example.com/0' },
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
        ];
        const processed = {};
        const requestList = new Apify.RequestList({ sources });
        const requestQueue = new RequestQueue('xxx');

        const handleRequestFunction = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;

            if (request.url === 'http://example.com/1') {
                throw Error(`This is ${request.retryCount}th error!`);
            }

            request.userData.foo = 'bar';
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            requestQueue,
            maxRequestRetries: 3,
            minConcurrency: 1,
            maxConcurrency: 1,
            handleRequestFunction,
        });

        // It enqueues all requests from RequestList to RequestQueue.
        const mock = sinon.mock(requestQueue);
        mock.expects('handledCount')
            .once()
            .returns(Promise.resolve(0));
        mock.expects('addRequest')
            .once()
            .withArgs(new Apify.Request(sources[0]), { forefront: true })
            .returns(Promise.resolve({ requestId: 'id-0' }));
        mock.expects('addRequest')
            .once()
            .withArgs(new Apify.Request(sources[1]), { forefront: true })
            .returns(Promise.resolve({ requestId: 'id-1' }));
        mock.expects('addRequest')
            .once()
            .withArgs(new Apify.Request(sources[2]), { forefront: true })
            .returns(Promise.resolve({ requestId: 'id-2' }));

        const request0 = new Apify.Request(Object.assign({ id: 'id-0' }, sources[0]));
        const request1 = new Apify.Request(Object.assign({ id: 'id-1' }, sources[1]));
        const request2 = new Apify.Request(Object.assign({ id: 'id-2' }, sources[2]));

        // 1st try
        mock.expects('fetchNextRequest').once().returns(Promise.resolve(request0));
        mock.expects('fetchNextRequest').once().returns(Promise.resolve(request1));
        mock.expects('fetchNextRequest').once().returns(Promise.resolve(request2));
        mock.expects('markRequestHandled')
            .once()
            .withArgs(request0)
            .returns(Promise.resolve());
        mock.expects('reclaimRequest')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());
        mock.expects('markRequestHandled')
            .once()
            .withArgs(request2)
            .returns(Promise.resolve());

        // 2nd try
        mock.expects('fetchNextRequest')
            .once()
            .returns(Promise.resolve(request1));
        mock.expects('reclaimRequest')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());

        // 3rd try
        mock.expects('fetchNextRequest')
            .once()
            .returns(Promise.resolve(request1));
        mock.expects('reclaimRequest')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());

        // 4rd try
        mock.expects('fetchNextRequest')
            .once()
            .returns(Promise.resolve(request1));
        mock.expects('markRequestHandled')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());

        mock.expects('isEmpty')
            .exactly(3)
            .returns(Promise.resolve(false));
        mock.expects('isEmpty')
            .once()
            .returns(Promise.resolve(true));
        mock.expects('isFinished')
            .once()
            .returns(Promise.resolve(true));

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed['http://example.com/0'].userData.foo).toBe('bar');
        expect(processed['http://example.com/0'].errorMessages).toBeNull();
        expect(processed['http://example.com/0'].retryCount).toBe(0);
        expect(processed['http://example.com/2'].userData.foo).toBe('bar');
        expect(processed['http://example.com/2'].errorMessages).toBeNull();
        expect(processed['http://example.com/2'].retryCount).toBe(0);

        expect(processed['http://example.com/1'].userData.foo).toBeUndefined();
        expect(processed['http://example.com/1'].errorMessages).toHaveLength(4);
        expect(processed['http://example.com/1'].retryCount).toBe(3);

        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);

        mock.verify();
    });

    test(
        'should say that task is not ready requestList is not set and requestQueue is empty',
        async () => {
            const requestQueue = new RequestQueue('xxx');
            requestQueue.isEmpty = () => Promise.resolve(true);

            const crawler = new Apify.BasicCrawler({
                requestQueue,
                handleRequestFunction: () => {},
            });

            expect(await crawler._isTaskReadyFunction()).toBe(false); // eslint-disable-line no-underscore-dangle
        },
    );

    test(
        'should be possible to override isFinishedFunction of underlying AutoscaledPool',
        async () => {
            const requestQueue = new RequestQueue('xxx');
            const processed = [];
            const queue = [];
            let isFinished = false;

            const basicCrawler = new Apify.BasicCrawler({
                requestQueue,
                autoscaledPoolOptions: {
                    minConcurrency: 1,
                    maxConcurrency: 1,
                    isFinishedFunction: () => {
                        return Promise.resolve(isFinished);
                    },
                },
                handleRequestFunction: async ({ request }) => {
                    await sleep(10);
                    processed.push(request);
                },
            });

            // Speed up the test
            basicCrawler.autoscaledPoolOptions.maybeRunIntervalMillis = 50;

            const request0 = new Apify.Request({ url: 'http://example.com/0' });
            const request1 = new Apify.Request({ url: 'http://example.com/1' });

            const mock = sinon.mock(requestQueue);
            mock.expects('handledCount').once().returns(Promise.resolve());
            mock.expects('markRequestHandled').once().withArgs(request0).returns(Promise.resolve());
            mock.expects('markRequestHandled').once().withArgs(request1).returns(Promise.resolve());
            mock.expects('isFinished').never();
            requestQueue.fetchNextRequest = () => Promise.resolve(queue.pop());
            requestQueue.isEmpty = () => Promise.resolve(!queue.length);

            setTimeout(() => queue.push(request0), 10);
            setTimeout(() => queue.push(request1), 100);
            setTimeout(() => { isFinished = true; }, 150);

            await basicCrawler.run();

            expect(processed.includes(request0, request1)).toBe(true);

            mock.verify();
            sinon.restore();
        },
    );

    test('should support maxRequestsPerCrawl parameter', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
            { url: 'http://example.com/4' },
            { url: 'http://example.com/5' },
        ];
        const processed = {};
        const requestList = new Apify.RequestList({ sources });

        const handleRequestFunction = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;
            if (request.url === 'http://example.com/2') throw Error();
            request.userData.foo = 'bar';
        };

        let handleFailedRequestFunctionCalls = 0;
        const handleFailedRequestFunction = () => {
            handleFailedRequestFunctionCalls++;
        };

        const basicCrawler = new Apify.BasicCrawler({
            requestList,
            maxRequestRetries: 3,
            maxRequestsPerCrawl: 3,
            maxConcurrency: 1,
            handleRequestFunction,
            handleFailedRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).toBe('bar');
        expect(processed['http://example.com/1'].errorMessages).toBeNull();
        expect(processed['http://example.com/1'].retryCount).toBe(0);
        expect(processed['http://example.com/3'].userData.foo).toBe('bar');
        expect(processed['http://example.com/3'].errorMessages).toBeNull();
        expect(processed['http://example.com/3'].retryCount).toBe(0);

        expect(processed['http://example.com/2'].userData.foo).toEqual(undefined);
        expect(processed['http://example.com/2'].errorMessages).toHaveLength(4);
        expect(processed['http://example.com/2'].retryCount).toBe(3);

        expect(handleFailedRequestFunctionCalls).toBe(1);

        expect(await requestList.isFinished()).toBe(false);
        expect(await requestList.isEmpty()).toBe(false);
    });

    test('should load handledRequestCount from storages', async () => {
        const requestQueue = new RequestQueue('id');
        requestQueue.isEmpty = async () => false;
        requestQueue.isFinished = async () => false;
        requestQueue.fetchNextRequest = async () => (new Apify.Request({ id: 'id', url: 'http://example.com' }));
        requestQueue.markRequestHandled = async () => {};
        let stub = sinon
            .stub(requestQueue, 'handledCount')
            .returns(33);

        let count = 0;
        let crawler = new Apify.BasicCrawler({
            requestQueue,
            maxConcurrency: 1,
            handleRequestFunction: async () => {
                await sleep(1);
                count++;
            },
            maxRequestsPerCrawl: 40,
        });

        await crawler.run();
        sinon.assert.called(stub);
        expect(count).toBe(7);
        sinon.restore();

        const sources = _.range(1, 10).map(i => ({ url: `http://example.com/${i}` }));
        let requestList = new Apify.RequestList({ sources });
        await requestList.initialize();
        stub = sinon
            .stub(requestList, 'handledCount')
            .returns(33);

        count = 0;
        crawler = new Apify.BasicCrawler({
            requestList,
            maxConcurrency: 1,
            handleRequestFunction: async () => {
                await sleep(1);
                count++;
            },
            maxRequestsPerCrawl: 40,
        });

        await crawler.run();
        sinon.assert.called(stub);
        expect(count).toBe(7);
        sinon.restore();

        requestList = new Apify.RequestList({ sources });
        await requestList.initialize();
        const listStub = sinon
            .stub(requestList, 'handledCount')
            .returns(20);

        const queueStub = sinon
            .stub(requestQueue, 'handledCount')
            .returns(33);

        const addRequestStub = sinon
            .stub(requestQueue, 'addRequest')
            .returns(Promise.resolve());

        count = 0;
        crawler = new Apify.BasicCrawler({
            requestList,
            requestQueue,
            maxConcurrency: 1,
            handleRequestFunction: async () => {
                await sleep(1);
                count++;
            },
            maxRequestsPerCrawl: 40,
        });

        await crawler.run();
        sinon.assert.called(queueStub);
        sinon.assert.notCalled(listStub);
        sinon.assert.callCount(addRequestStub, 7);
        expect(count).toBe(7);
        sinon.restore();
    });

    test('should timeout after handleRequestTimeoutSecs', async () => {
        const url = 'https://example.com';
        const requestList = new Apify.RequestList({ sources: [{ url }] });
        await requestList.initialize();

        const results = [];
        const crawler = new Apify.BasicCrawler({
            requestList,
            handleRequestTimeoutSecs: 0.01,
            maxRequestRetries: 1,
            handleRequestFunction: () => sleep(1000),
            handleFailedRequestFunction: ({ request }) => results.push(request),
        });

        await crawler.run();
        expect(results).toHaveLength(1);
        expect(results[0].url).toEqual(url);
        results[0].errorMessages.forEach(msg => expect(msg).toMatch('handleRequestFunction timed out'));
    });

    describe('Uses SessionPool', () => {
        it('should use SessionPool when useSessionPool is true ', async () => {
            const url = 'https://example.com';
            const requestList = new Apify.RequestList({ sources: [{ url }] });
            await requestList.initialize();
            const results = [];

            const crawler = new Apify.BasicCrawler({
                requestList,
                handleRequestTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                useSessionPool: true,
                sessionPoolOptions: {
                    maxPoolSize: 10,
                    persistStateKey: 'POOL',
                },
                handleRequestFunction: async ({ session }) => {
                    expect(session.constructor.name).toEqual('Session');
                    expect(session.id).toBeDefined();
                },
                handleFailedRequestFunction: ({ request }) => results.push(request),
            });

            await crawler.run();
            expect(crawler.sessionPool).toBeDefined();
            expect(results).toHaveLength(0);
        });

        it('should use pass options to sessionPool', async () => {
            const url = 'https://example.com';
            const requestList = new Apify.RequestList({ sources: [{ url }] });
            await requestList.initialize();

            const crawler = new Apify.BasicCrawler({
                requestList,
                handleRequestTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                useSessionPool: true,
                sessionPoolOptions: {
                    maxPoolSize: 10,
                    persistStateKey: 'POOL',
                },
                handleRequestFunction: async () => {},
                handleFailedRequestFunction: () => {},
            });
            await crawler.run();

            expect(crawler.sessionPool.maxPoolSize).toEqual(10);
        });

        it('should destroy Session pool after it is finished', async () => {
            const url = 'https://example.com';
            const requestList = new Apify.RequestList({ sources: [{ url }] });
            await requestList.initialize();
            events.removeAllListeners(ACTOR_EVENT_NAMES.PERSIST_STATE);

            const crawler = new Apify.BasicCrawler({
                requestList,
                handleRequestTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                useSessionPool: true,
                sessionPoolOptions: {
                    maxPoolSize: 10,
                },
                handleRequestFunction: async () => {},
                handleFailedRequestFunction: () => {},
            });

            crawler._loadHandledRequestCount = () => { // eslint-disable-line
                expect(crawler.sessionPool).toBeDefined();
                expect(events.listenerCount(ACTOR_EVENT_NAMES.PERSIST_STATE)).toEqual(1);
            };

            await crawler.run();
            expect(events.listenerCount(ACTOR_EVENT_NAMES.PERSIST_STATE)).toEqual(0);
            expect(crawler.sessionPool.maxPoolSize).toEqual(10);
        });

        it('should not use SessionPool by default', async () => {
            const url = 'https://example.com';
            const requestList = new Apify.RequestList({ sources: [{ url }] });
            await requestList.initialize();

            const crawler = new Apify.BasicCrawler({
                requestList,
                handleRequestTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                handleRequestFunction: async () => {},
                handleFailedRequestFunction: () => {},
            });
            await crawler.run();

            expect(crawler.sessionPool).toBeUndefined();
        });
    });
});
