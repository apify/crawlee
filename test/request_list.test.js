import _ from 'underscore';
import sinon from 'sinon';
import log from '../build/utils_log';
import { ACTOR_EVENT_NAMES_EX } from '../build/constants';
import { deserializeArray } from '../build/serialization';
import Apify from '../build/index';
import * as keyValueStore from '../build/key_value_store';
import * as utils from '../build/utils';
import * as requestUtils from '../build/utils_request';

describe('Apify.RequestList', () => {
    let ll;
    beforeAll(() => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterAll(() => {
        log.setLevel(ll);
    });

    test('should not accept to pages with same uniqueKey', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'https://example.com/1' },
                { url: 'https://example.com/1#same' },
            ],
        });

        await requestList.initialize();

        expect(await requestList.isEmpty()).toBe(false);

        const req = await requestList.fetchNextRequest();

        expect(req.url).toBe('https://example.com/1');
        expect(await requestList.isEmpty()).toBe(true);
        expect(await requestList.isFinished()).toBe(false);
        expect(await requestList.fetchNextRequest()).toBe(null);

        await requestList.markRequestHandled(req);

        expect(await requestList.isEmpty()).toBe(true);
        expect(await requestList.isFinished()).toBe(true);
    });

    test('must be initialized before using any of the methods', async () => {
        const requestList = new Apify.RequestList({ sources: [{ url: 'https://example.com' }] });
        const requestObj = new Apify.Request({ url: 'https://example.com' });

        await expect(requestList.isEmpty()).rejects.toThrow();
        await expect(requestList.isFinished()).rejects.toThrow();
        expect(() => requestList.getState()).toThrowError();
        await expect(requestList.markRequestHandled(requestObj)).rejects.toThrow();
        await expect(requestList.reclaimRequest(requestObj)).rejects.toThrow();
        await expect(requestList.fetchNextRequest()).rejects.toThrow();

        await requestList.initialize();

        await expect(requestList.isEmpty()).resolves.not.toThrow();
        await expect(requestList.isFinished()).resolves.not.toThrow();
        expect(() => requestList.getState()).not.toThrowError();
        await expect(requestList.fetchNextRequest()).resolves.not.toThrow();
        await expect(requestList.reclaimRequest(requestObj)).resolves.not.toThrow();
        await expect(requestList.fetchNextRequest()).resolves.not.toThrow();
        await expect(requestList.markRequestHandled(requestObj)).resolves.not.toThrow();
    });

    test('should correctly initialize itself', async () => {
        const sources = [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/2' },
            { url: 'https://example.com/3' },
            { url: 'https://example.com/4' },
            { url: 'https://example.com/5' },
            { url: 'https://example.com/6' },
            { url: 'https://example.com/7' },
            { url: 'https://example.com/8' },
        ];
        const sourcesCopy = JSON.parse(JSON.stringify(sources));

        const originalList = new Apify.RequestList({ sources });
        await originalList.initialize();

        const r1 = await originalList.fetchNextRequest(); // 1
        const r2 = await originalList.fetchNextRequest(); // 2
        await originalList.fetchNextRequest(); // 3
        const r4 = await originalList.fetchNextRequest(); // 4
        const r5 = await originalList.fetchNextRequest(); // 5
        await originalList.fetchNextRequest(); // 6

        await originalList.markRequestHandled(r1);
        await originalList.markRequestHandled(r2);
        await originalList.markRequestHandled(r4);
        await originalList.reclaimRequest(r5);

        const newList = new Apify.RequestList({
            sources: sourcesCopy,
            state: originalList.getState(),
        });
        await newList.initialize();

        expect(await newList.isEmpty()).toBe(false);
        expect((await newList.fetchNextRequest()).url).toBe('https://example.com/3');
        expect((await newList.fetchNextRequest()).url).toBe('https://example.com/5');
        expect((await newList.fetchNextRequest()).url).toBe('https://example.com/6');
        expect((await newList.fetchNextRequest()).url).toBe('https://example.com/7');
        expect((await newList.fetchNextRequest()).url).toBe('https://example.com/8');
        expect(await newList.isEmpty()).toBe(true);
    });

    test(
        'should correctly load list from hosted files in correct order',
        async () => {
            const mock = sinon.mock(utils.publicUtils);
            const list1 = [
                'https://example.com',
                'https://google.com',
                'https://wired.com',
            ];
            const list2 = [
                'https://another.com',
                'https://page.com',
            ];

            mock.expects('downloadListOfUrls')
                .once()
                .withArgs({ url: 'http://example.com/list-1', urlRegExp: undefined })
                .returns(new Promise(resolve => setTimeout(resolve(list1), 100)));

            mock.expects('downloadListOfUrls')
                .once()
                .withArgs({ url: 'http://example.com/list-2', urlRegExp: undefined })
                .returns(Promise.resolve(list2), 0);

            const requestList = new Apify.RequestList({
                sources: [
                    { method: 'GET', requestsFromUrl: 'http://example.com/list-1' },
                    { method: 'POST', requestsFromUrl: 'http://example.com/list-2' },
                ],
            });

            await requestList.initialize();

            expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list1[0] });
            expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list1[1] });
            expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list1[2] });
            expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'POST', url: list2[0] });
            expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'POST', url: list2[1] });

            mock.verify();
            mock.restore();
        },
    );

    test('should use regex parameter to parse urls', async () => {
        const mock = sinon.mock(requestUtils);
        const listStr = 'kjnjkn"https://example.com/a/b/c?q=1#abc";,"HTTP://google.com/a/b/c";dgg:dd';
        const listArr = ['https://example.com', 'HTTP://google.com'];

        mock.expects('requestAsBrowser')
            .once()
            .withArgs({ url: 'http://example.com/list-1', encoding: 'utf8' })
            .resolves({ body: listStr });

        const regex = /(https:\/\/example.com|HTTP:\/\/google.com)/g;
        const requestList = new Apify.RequestList({
            sources: [
                {
                    method: 'GET',
                    requestsFromUrl: 'http://example.com/list-1',
                    regex,
                },
            ],
        });

        await requestList.initialize();

        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: listArr[0] });
        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: listArr[1] });

        mock.verify();
        mock.restore();
    });

    test('should handle requestsFromUrl with no URLs', async () => {
        const mock = sinon.mock(utils.publicUtils);
        mock.expects('downloadListOfUrls')
            .once()
            .withArgs({ url: 'http://example.com/list-1', urlRegExp: undefined })
            .returns(Promise.resolve([]));

        const requestList = new Apify.RequestList({
            sources: [
                {
                    method: 'GET',
                    requestsFromUrl: 'http://example.com/list-1',
                },
            ],
        });

        await requestList.initialize();

        expect(await requestList.fetchNextRequest()).toBe(null);

        mock.verify();
        mock.restore();
    });

    test('should correctly handle reclaimed pages', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'https://example.com/1' },
                { url: 'https://example.com/2' },
                { url: 'https://example.com/3' },
                { url: 'https://example.com/4' },
                { url: 'https://example.com/5' },
                { url: 'https://example.com/6' },
            ],
        });

        await requestList.initialize();

        //
        // Fetch first 5 urls
        //

        const request1 = await requestList.fetchNextRequest();
        const request2 = await requestList.fetchNextRequest();
        const request3 = await requestList.fetchNextRequest();
        const request4 = await requestList.fetchNextRequest();
        const request5 = await requestList.fetchNextRequest();

        expect(request1.url).toBe('https://example.com/1');
        expect(request2.url).toBe('https://example.com/2');
        expect(request3.url).toBe('https://example.com/3');
        expect(request4.url).toBe('https://example.com/4');
        expect(request5.url).toBe('https://example.com/5');
        expect(requestList.getState()).toEqual({
            inProgress: {
                'https://example.com/1': true,
                'https://example.com/2': true,
                'https://example.com/3': true,
                'https://example.com/4': true,
                'https://example.com/5': true,
            },
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(await requestList.isEmpty()).toBe(false);
        expect(await requestList.isFinished()).toBe(false);
        expect(requestList.inProgress).toMatchObject(requestList.reclaimed);

        //
        // Mark 1st, 2nd handled
        // Reclaim 3rd 4th
        //

        await requestList.markRequestHandled(request1);
        await requestList.markRequestHandled(request2);
        await requestList.reclaimRequest(request3);
        await requestList.reclaimRequest(request4);

        expect(requestList.getState()).toEqual({
            inProgress: {
                'https://example.com/3': true,
                'https://example.com/4': true,
                'https://example.com/5': true,
            },
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(await requestList.isEmpty()).toBe(false);
        expect(await requestList.isFinished()).toBe(false);
        expect(requestList.inProgress).toEqual(expect.objectContaining(requestList.reclaimed));

        //
        // Mark 5th handled
        //

        await requestList.markRequestHandled(request5);

        expect(requestList.getState()).toEqual({
            inProgress: {
                'https://example.com/3': true,
                'https://example.com/4': true,
            },
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(await requestList.isEmpty()).toBe(false);
        expect(await requestList.isFinished()).toBe(false);
        expect(requestList.inProgress).toEqual(expect.objectContaining(requestList.reclaimed));

        //
        // Fetch 3rd and 4th
        // Mark 4th handled
        //

        const reclaimed3 = await requestList.fetchNextRequest();
        expect(reclaimed3.url).toBe('https://example.com/3');
        const reclaimed4 = await requestList.fetchNextRequest();
        expect(reclaimed4.url).toBe('https://example.com/4');
        await requestList.markRequestHandled(request4);

        expect(requestList.getState()).toEqual({
            inProgress: {
                'https://example.com/3': true,
            },
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(await requestList.isEmpty()).toBe(false);
        expect(await requestList.isFinished()).toBe(false);
        expect(requestList.inProgress).toEqual(expect.objectContaining(requestList.reclaimed));

        //
        // Mark 3rd handled
        //

        await requestList.markRequestHandled(request3);

        expect(requestList.getState()).toEqual({
            inProgress: {},
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(await requestList.isEmpty()).toBe(false);
        expect(await requestList.isFinished()).toBe(false);
        expect(requestList.inProgress).toEqual(expect.objectContaining(requestList.reclaimed));

        //
        // Fetch 6th
        //

        const request6 = await requestList.fetchNextRequest();

        expect(request6.url).toBe('https://example.com/6');
        expect(await requestList.fetchNextRequest()).toBe(null);
        expect(requestList.getState()).toEqual({
            inProgress: {
                'https://example.com/6': true,
            },
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(await requestList.isEmpty()).toBe(true);
        expect(await requestList.isFinished()).toBe(false);
        expect(requestList.inProgress).toEqual(expect.objectContaining(requestList.reclaimed));

        //
        // Reclaim 6th
        //

        await requestList.reclaimRequest(request6);

        expect(requestList.getState()).toEqual({
            inProgress: {
                'https://example.com/6': true,
            },
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(await requestList.isEmpty()).toBe(false);
        expect(await requestList.isFinished()).toBe(false);
        expect(requestList.inProgress).toEqual(expect.objectContaining(requestList.reclaimed));

        //
        // Fetch 6th
        //

        const reclaimed6 = await requestList.fetchNextRequest();

        expect(reclaimed6.url).toBe('https://example.com/6');
        expect(requestList.getState()).toEqual({
            inProgress: {
                'https://example.com/6': true,
            },
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(await requestList.isEmpty()).toBe(true);
        expect(await requestList.isFinished()).toBe(false);
        expect(requestList.inProgress).toEqual(expect.objectContaining(requestList.reclaimed));

        //
        // Mark 6th handled
        //

        await requestList.markRequestHandled(reclaimed6);

        expect(requestList.getState()).toEqual({
            inProgress: {},
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(await requestList.isEmpty()).toBe(true);
        expect(await requestList.isFinished()).toBe(true);
        expect(requestList.inProgress).toEqual(expect.objectContaining(requestList.reclaimed));
    });

    test(
        'should correctly persist its state when persistStateKey is set',
        async () => {
            const PERSIST_STATE_KEY = 'some-key';
            const SDK_KEY = `SDK_${PERSIST_STATE_KEY}`;
            const mock = sinon.mock(keyValueStore);

            mock.expects('getValue')
                .once()
                .withArgs(SDK_KEY)
                .returns(null);

            const opts = {
                sources: [
                    { url: 'https://example.com/1' },
                    { url: 'https://example.com/2' },
                    { url: 'https://example.com/3' },
                ],
                persistStateKey: PERSIST_STATE_KEY,
            };
            const optsCopy = JSON.parse(JSON.stringify(opts));

            const requestList = new Apify.RequestList(opts);
            await requestList.initialize();
            expect(requestList.isStatePersisted).toBe(true);

            // Fetch one request and check that state is not persisted.
            const request1 = await requestList.fetchNextRequest();
            expect(requestList.isStatePersisted).toBe(false);

            // Persist state.
            mock.expects('setValue')
                .once()
                .withArgs(SDK_KEY, requestList.getState())
                .returns(Promise.resolve());
            Apify.events.emit(ACTOR_EVENT_NAMES_EX.PERSIST_STATE);
            await utils.sleep(1);
            expect(requestList.isStatePersisted).toBe(true);

            // Do some other changes and persist it again.
            const request2 = await requestList.fetchNextRequest();
            expect(requestList.isStatePersisted).toBe(false);
            await requestList.markRequestHandled(request2);
            expect(requestList.isStatePersisted).toBe(false);
            mock.expects('setValue')
                .once()
                .withArgs(SDK_KEY, requestList.getState())
                .returns(Promise.resolve());
            Apify.events.emit(ACTOR_EVENT_NAMES_EX.PERSIST_STATE);
            await utils.sleep(1);
            expect(requestList.isStatePersisted).toBe(true);

            // Reclaim event doesn't change the state.
            await requestList.reclaimRequest(request1);
            expect(requestList.isStatePersisted).toBe(true);

            // Now initiate new request list from saved state and check that it's same as state
            // of original request list.
            mock.expects('getValue')
                .once()
                .withArgs(SDK_KEY)
                .returns(Promise.resolve(requestList.getState()));
            const requestList2 = new Apify.RequestList(optsCopy);
            await requestList2.initialize();
            expect(requestList2.getState()).toEqual(requestList.getState());

            mock.verify();
        },
    );

    test(
        'should correctly persist its sources when persistRequestsKey is set',
        async () => {
            const PERSIST_REQUESTS_KEY = 'some-key';
            const SDK_KEY = `SDK_${PERSIST_REQUESTS_KEY}`;
            const getValueStub = sinon.stub(keyValueStore, 'getValue');
            const setValueStub = sinon.stub(keyValueStore, 'setValue');

            let persistedRequests;

            const opts = {
                sources: [
                    { url: 'https://example.com/1' },
                    { url: 'https://example.com/2' },
                    { url: 'https://example.com/3' },
                ],
                persistRequestsKey: PERSIST_REQUESTS_KEY,
            };

            const requestList = new Apify.RequestList(opts);
            expect(requestList.areRequestsPersisted).toBe(false);

            // Expect an attempt to load sources.
            getValueStub.withArgs(SDK_KEY)
                .onFirstCall()
                .resolves(null)
                // See second RequestList below.
                .onSecondCall()
                .callsFake(() => {
                    return persistedRequests;
                });

            // Expect persist sources.
            setValueStub.withArgs(SDK_KEY)
                .callsFake(async (key, value) => {
                    persistedRequests = value;
                });

            await requestList.initialize();
            expect(requestList.areRequestsPersisted).toBe(true);

            const opts2 = {
                sources: [
                    { url: 'https://test.com/1' },
                    { url: 'https://test.com/2' },
                    { url: 'https://test.com/3' },
                ],
                persistRequestsKey: PERSIST_REQUESTS_KEY,
            };

            const requestList2 = new Apify.RequestList(opts2);
            expect(requestList2.areRequestsPersisted).toBe(false);

            // Now initialize new request list from saved sources and check that
            // they are same as state of original request list.
            await requestList2.initialize();
            expect(requestList2.areRequestsPersisted).toBe(true);
            expect(requestList2.requests).toEqual(requestList.requests);

            getValueStub.restore();
            setValueStub.restore();
        },
    );

    test(
        'should correctly persist sources from requestsFromUrl if persistRequestsKey is set',
        async () => {
            const PERSIST_REQUESTS_KEY = 'some-key';
            const SDK_KEY = `SDK_${PERSIST_REQUESTS_KEY}`;
            const kvsMock = sinon.mock(keyValueStore);
            const publicUtilsMock = sinon.mock(utils.publicUtils);

            let persistedRequests;

            const opts = {
                sources: [
                    { url: 'https://example.com/1' },
                    { url: 'https://example.com/2' },
                    { requestsFromUrl: 'http://example.com/list-urls.txt', userData: { isFromUrl: true } },
                    { url: 'https://example.com/5' },
                ],
                persistRequestsKey: PERSIST_REQUESTS_KEY,
            };

            const urlsFromTxt = ['http://example.com/3', 'http://example.com/4'];

            const requestList = new Apify.RequestList(opts);
            expect(requestList.areRequestsPersisted).toBe(false);

            // Expect an attempt to load sources.
            kvsMock.expects('getValue')
                .once()
                .withArgs(SDK_KEY)
                .resolves(null);

            // Expect persist sources.
            kvsMock.expects('setValue')
                .once()
                .withArgs(SDK_KEY)
                .callsFake((key, value) => {
                    persistedRequests = value;
                });
            // Expect downloadListOfUrls returns list of URLs
            publicUtilsMock.expects('downloadListOfUrls')
                .once()
                .withArgs({ url: 'http://example.com/list-urls.txt', urlRegExp: undefined })
                .returns(Promise.resolve(urlsFromTxt));

            await requestList.initialize();
            expect(requestList.areRequestsPersisted).toBe(true);
            const requests = await deserializeArray(persistedRequests);
            expect(requestList.requests).toHaveLength(5);
            expect(requests).toEqual(requestList.requests);

            kvsMock.verify();
            publicUtilsMock.verify();
        },
    );

    test('handles correctly inconsistent inProgress fields in state', async () => {
        // NOTE: This is a test for the deleteFromInProgress hotfix - see RequestList.initialize()

        const sources = [
            { url: 'https://www.ams360.com' },
            { url: 'https://www.anybus.com' },
            { url: 'https://www.anychart.com' },
            { url: 'https://www.example.com' },
        ];

        const state = {
            nextIndex: 2,
            nextUniqueKey: 'https://www.anychart.com',
            inProgress: {
                'https://www.ams360.com': true,
                'https://www.anybus.com': true,
                'https://www.anychart.com': true,
            },
        };

        const requestList = new Apify.RequestList({
            sources,
            state,
        });

        await requestList.initialize();

        // Get requests from list
        let reqs = [];
        for (let i = 0; i < 5; i++) {
            const request = await requestList.fetchNextRequest(); // eslint-disable-line
            if (!request) break;
            reqs.push(request);
        }

        reqs = _.shuffle(reqs);

        for (let i = 0; i < reqs.length; i++) {
            await requestList.reclaimRequest(reqs[i]); // eslint-disable-line
        }
    });

    test('it gets correct length()', async () => {
        const sources = [
            { url: 'https://www.example.com' },
            { url: 'https://www.ams360.com' },
            { url: 'https://www.anybus.com' },
            { url: 'https://www.anychart.com' },
            { url: 'https://www.example.com' },
        ];

        const requestList = new Apify.RequestList({
            sources,
        });

        await requestList.initialize();

        expect(requestList.length()).toBe(4);
    });

    test('it gets correct handledCount()', async () => {
        const sources = [
            { url: 'https://www.example.com' },
            { url: 'https://www.ams360.com' },
            { url: 'https://www.anybus.com' },
            { url: 'https://www.anychart.com' },
            { url: 'https://www.example.com' },
        ];

        const requestList = new Apify.RequestList({
            sources,
        });

        await requestList.initialize();

        const req1 = await requestList.fetchNextRequest();
        const req2 = await requestList.fetchNextRequest();
        const req3 = await requestList.fetchNextRequest();
        expect(requestList.handledCount()).toBe(0);

        await requestList.markRequestHandled(req2);
        expect(requestList.handledCount()).toBe(1);

        await requestList.markRequestHandled(req3);
        expect(requestList.handledCount()).toBe(2);

        await requestList.reclaimRequest(req1);
        expect(requestList.handledCount()).toBe(2);
    });

    test(
        'should correctly keep duplicate URLs while keepDuplicateUrls is set',
        async () => {
            const sources = [
                { url: 'https://www.example.com' },
                { url: 'https://www.example.com' },
                { url: 'https://www.example.com' },
                { url: 'https://www.ex2mple.com' },
            ];
            const sourcesCopy = JSON.parse(JSON.stringify(sources));

            let requestList = new Apify.RequestList({
                sources,
                keepDuplicateUrls: true,
            });

            await requestList.initialize();
            expect(requestList.length()).toBe(4);

            log.setLevel(log.LEVELS.INFO);
            const logStub = sinon.stub(console, 'warn');

            requestList = new Apify.RequestList({
                sources: sourcesCopy.concat([
                    { url: 'https://www.example.com', uniqueKey: '123' },
                    { url: 'https://www.example.com', uniqueKey: '123' },
                    { url: 'https://www.example.com', uniqueKey: '456' },
                    { url: 'https://www.ex2mple.com', uniqueKey: '456' },
                ]),
                keepDuplicateUrls: true,
            });

            await requestList.initialize();
            expect(requestList.length()).toBe(6);
            expect(logStub.called).toBe(true);
            expect(logStub.getCall(0).args[0]).toMatch('Check your sources\' unique keys.');

            logStub.restore();
            log.setLevel(log.LEVELS.ERROR);
        },
    );

    describe('Apify.openRequestList()', () => {
        test('should work', async () => {
            const mock = sinon.mock(keyValueStore);
            mock.expects('getValue').atLeast(1).resolves();
            mock.expects('setValue').atLeast(1).resolves();

            const name = 'xxx';
            const SDK_KEY = `SDK_${name}`;
            const sources = [{ url: 'https://example.com' }];

            const rl = await Apify.openRequestList(name, sources);
            expect(rl).toBeInstanceOf(Apify.RequestList);
            expect(rl.persistStateKey.startsWith(SDK_KEY)).toBe(true);
            expect(rl.persistRequestsKey.startsWith(SDK_KEY)).toBe(true);
            expect(rl.sources).toEqual([]);
            expect(rl.isInitialized).toBe(true);

            mock.verify();
        });
        test('should work with string sources', async () => {
            const mock = sinon.mock(keyValueStore);
            mock.expects('getValue').atLeast(1).resolves();
            mock.expects('setValue').atLeast(1).resolves();

            const name = 'xxx';
            const SDK_KEY = `SDK_${name}`;
            const sources = ['https://example.com'];
            const requests = sources.map(url => new Apify.Request({ url }));

            const rl = await Apify.openRequestList(name, sources);
            expect(rl).toBeInstanceOf(Apify.RequestList);
            expect(rl.persistStateKey.startsWith(SDK_KEY)).toBe(true);
            expect(rl.persistRequestsKey.startsWith(SDK_KEY)).toBe(true);
            expect(rl.requests).toEqual(requests);
            expect(rl.isInitialized).toBe(true);

            mock.verify();
        });
        test('should correctly pass options', async () => {
            const mock = sinon.mock(keyValueStore);
            mock.expects('getValue').atLeast(1).resolves();
            mock.expects('setValue').atLeast(1).resolves();

            const name = 'xxx';
            const SDK_KEY = `SDK_${name}`;
            let counter = 0;
            const sources = [{ url: 'https://example.com' }];
            const requests = sources.map(({ url }) => new Apify.Request({ url, uniqueKey: `${url}-${counter++}` }));
            const options = {
                keepDuplicateUrls: true,
                persistStateKey: 'yyy',
            };

            const rl = await Apify.openRequestList(name, sources, options);
            expect(rl).toBeInstanceOf(Apify.RequestList);
            expect(rl.persistStateKey.startsWith(SDK_KEY)).toBe(true);
            expect(rl.persistRequestsKey.startsWith(SDK_KEY)).toBe(true);
            expect(rl.requests).toEqual(requests);
            expect(rl.isInitialized).toBe(true);
            expect(rl.keepDuplicateUrls).toBe(true);

            mock.verify();
        });
        test('should work with null name', async () => {
            const mock = sinon.mock(keyValueStore);
            mock.expects('getValue').never().resolves();
            mock.expects('setValue').never().resolves();

            const name = null;
            const sources = [{ url: 'https://example.com' }];
            const requests = sources.map(({ url }) => new Apify.Request({ url }));

            const rl = await Apify.openRequestList(name, sources);
            expect(rl).toBeInstanceOf(Apify.RequestList);
            expect(rl.persistStateKey == null).toBe(true);
            expect(rl.persistRequestsKey == null).toBe(true);
            expect(rl.requests).toEqual(requests);
            expect(rl.isInitialized).toBe(true);

            mock.verify();
        });
        test('should throw on invalid parameters', async () => {
            const args = [
                [],
                ['x', {}],
                ['x', 6, {}],
                ['x', [], []],
            ];
            for (const arg of args) {
                try {
                    await Apify.openRequestList(...arg);
                    throw new Error('wrong error');
                } catch (err) {
                    expect(err.message).not.toBe('wrong error');
                    expect(err.message).toMatch('Parameter');
                    expect(err.message).toMatch('must');
                }
            }
        });
    });

    // This test is here to run locally. It would take too long
    // when running a test suite and in CI with large source arrays
    // and would be flaky with small source arrays, so manual inspection
    // looks like the best idea, since multiple runs with various values
    // need to be tested and compared (read: I'm too lazy to automate this)

    // test('memory consumption does not spike', async () => {
    //     function getMemoryInMbytes() {
    //         const memory = process.memoryUsage();
    //         return (memory.heapUsed + memory.external) / 1024 / 1024;
    //     }
    //     const sources = [];
    //     for (let i = 0; i < 1e6; i++) {
    //         sources.push({ url: `https://example.com?page=${i}` });
    //     }
    //     const startingMemory = getMemoryInMbytes();
    //     console.log(startingMemory, 'MB');
    //
    //     process.env.APIFY_LOCAL_STORAGE_DIR = 'tmp';
    //     const rl = new Apify.RequestList({ sources, persistRequestsKey: null });
    //     const instanceMemory = getMemoryInMbytes();
    //     console.log(instanceMemory, 'MB');
    //
    //     await rl.initialize();
    //     const initMemory = getMemoryInMbytes();
    //     console.log(initMemory, 'MB');
    // });
});
