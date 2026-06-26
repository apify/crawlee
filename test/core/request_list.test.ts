import {
    Configuration,
    deserializeArray,
    EventType,
    KeyValueStore,
    ProxyConfiguration,
    Request,
    RequestList,
    serviceLocator,
} from '@crawlee/core';
import { sleep } from '@crawlee/utils';
import { MemoryStorageEmulator } from '../shared/MemoryStorageEmulator.js';
import { beforeAll, type MockedFunction } from 'vitest';

import log from '@apify/log';

/**
 * Stand-in for underscore.js shuffle (weird, but how else?)
 */
function shuffle(array: unknown[]): unknown[] {
    const out = [...array];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

let mockHttpClient = vitest.mockObject({
    async sendRequest(_request: any, _options?: any) {
        return new Response();
    },
    async stream() {
        return new Response();
    },
});

beforeEach(async () => {
    mockHttpClient = vitest.mockObject({
        async sendRequest() {
            return new Response();
        },
        async stream() {
            return new Response();
        },
    });
});

describe('RequestList', () => {
    let ll: number;
    const emulator = new MemoryStorageEmulator();
    beforeAll(() => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        await emulator.init();
        vitest.restoreAllMocks();
    });

    afterAll(async () => {
        log.setLevel(ll);
        await emulator.destroy();
    });

    test('should not accept to pages with same uniqueKey', async () => {
        const requestList = await RequestList.open(null, [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/1#same' },
        ]);

        expect(await requestList.isEmpty()).toBe(false);

        const req = await requestList.fetchNextRequest();

        expect(req!.url).toBe('https://example.com/1');
        expect(await requestList.isEmpty()).toBe(true);
        expect(await requestList.isFinished()).toBe(false);
        expect(await requestList.fetchNextRequest()).toBe(null);

        await requestList.markRequestAsHandled(req!);

        expect(await requestList.isEmpty()).toBe(true);
        expect(await requestList.isFinished()).toBe(true);
    });

    test('must be initialized before using any of the methods', async () => {
        // @ts-expect-error private constructor
        const requestList = new RequestList({ sources: [{ url: 'https://example.com' }] });
        const requestObj = new Request({ url: 'https://example.com' });

        await expect(requestList.isEmpty()).rejects.toThrow();
        await expect(requestList.isFinished()).rejects.toThrow();
        expect(() => requestList.getState()).toThrowError();
        await expect(requestList.markRequestAsHandled(requestObj)).rejects.toThrow();
        await expect(requestList.fetchNextRequest()).rejects.toThrow();

        await requestList.initialize();

        await expect(requestList.isEmpty()).resolves.not.toThrow();
        await expect(requestList.isFinished()).resolves.not.toThrow();
        expect(() => requestList.getState()).not.toThrowError();
        await expect(requestList.fetchNextRequest()).resolves.not.toThrow();
        await expect(requestList.markRequestAsHandled(requestObj)).resolves.not.toThrow();
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

        const originalList = await RequestList.open(null, sources);

        const r1 = await originalList.fetchNextRequest(); // 1
        const r2 = await originalList.fetchNextRequest(); // 2
        await originalList.fetchNextRequest(); // 3 - left in progress
        const r4 = await originalList.fetchNextRequest(); // 4
        await originalList.fetchNextRequest(); // 5 - left in progress
        await originalList.fetchNextRequest(); // 6 - left in progress

        await originalList.markRequestAsHandled(r1!);
        await originalList.markRequestAsHandled(r2!);
        await originalList.markRequestAsHandled(r4!);

        // Requests 3, 5 and 6 were in progress when the state was persisted, so they must be
        // re-crawled (before the remaining, never-fetched requests 7 and 8).
        const newList = await RequestList.open({
            sources: sourcesCopy,
            state: originalList.getState(),
        });

        expect(await newList.isEmpty()).toBe(false);
        expect((await newList.fetchNextRequest())!.url).toBe('https://example.com/3');
        expect((await newList.fetchNextRequest())!.url).toBe('https://example.com/5');
        expect((await newList.fetchNextRequest())!.url).toBe('https://example.com/6');
        expect((await newList.fetchNextRequest())!.url).toBe('https://example.com/7');
        expect((await newList.fetchNextRequest())!.url).toBe('https://example.com/8');
        expect(await newList.isEmpty()).toBe(true);
    });

    test('`RequestList` is `for .. await` iterable', async () => {
        const sources = [
            'https://example.com/1',
            'https://example.com/2',
            'https://example.com/3',
            'https://example.com/4',
            'https://example.com/5',
            'https://example.com/6',
            'https://example.com/7',
            'https://example.com/8',
        ];
        const requestList = await RequestList.open(null, sources);

        for await (const request of requestList) {
            expect(request?.url).toBe(sources.shift());
        }
    });

    test('should correctly load list from hosted files in correct order', async () => {
        const spy = vitest.spyOn(RequestList.prototype as any, '_downloadListOfUrls');
        const list1 = ['https://example.com', 'https://google.com', 'https://wired.com'];
        const list2 = ['https://another.com', 'https://page.com'];
        spy.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(list1) as any, 100)) as any);
        spy.mockResolvedValueOnce(list2);

        const requestList = await RequestList.open({
            sources: [
                { method: 'GET', requestsFromUrl: 'http://example.com/list-1' },
                { method: 'POST', requestsFromUrl: 'http://example.com/list-2' },
            ],
        });

        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list1[0] });
        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list1[1] });
        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list1[2] });
        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'POST', url: list2[0] });
        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'POST', url: list2[1] });

        expect(spy).toBeCalledTimes(2);
        expect(spy).toBeCalledWith({ url: 'http://example.com/list-1', urlRegExp: undefined });
        expect(spy).toBeCalledWith({ url: 'http://example.com/list-2', urlRegExp: undefined });
    });

    test('should use regex parameter to parse urls', async () => {
        const listStr = 'kjnjkn"https://example.com/a/b/c?q=1#abc";,"HTTP://google.com/a/b/c";dgg:dd';
        const listArr = ['https://example.com', 'HTTP://google.com'];

        const regex = /(https:\/\/example.com|HTTP:\/\/google.com)/g;

        mockHttpClient.sendRequest.mockResolvedValueOnce(new Response(listStr));

        const requestList = await RequestList.open({
            sources: [
                {
                    method: 'GET',
                    requestsFromUrl: 'http://example.com/list-1',
                    regex,
                },
            ],
            httpClient: mockHttpClient,
        });

        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: listArr[0] });
        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: listArr[1] });

        expect(mockHttpClient.sendRequest).toBeCalled();
        expect(mockHttpClient.sendRequest.mock.calls[0][0].url).toBe('http://example.com/list-1');
    });

    test('should fix gdoc sharing url in `requestsFromUrl` automatically (GH issue #639)', async () => {
        const list = ['https://example.com', 'https://google.com', 'https://wired.com'];
        const wrongUrls = [
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/edit?usp=sharing',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/123123132',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/?q=blablabla',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/edit#gid=0',
        ];
        const correctUrl =
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/gviz/tq?tqx=out:csv';

        mockHttpClient.sendRequest.mockImplementation(async () => new Response(list.join('\n')));

        const requestList = await RequestList.open({
            sources: wrongUrls.map((requestsFromUrl) => ({ requestsFromUrl })),
            httpClient: mockHttpClient,
        });

        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[0] });
        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[1] });
        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[2] });

        expect(mockHttpClient.sendRequest.mock.calls[0][0]?.url).toBe(correctUrl);
    });

    test('should handle requestsFromUrl with no URLs', async () => {
        const spy = vitest.spyOn(RequestList.prototype as any, '_downloadListOfUrls');
        spy.mockResolvedValueOnce([]);

        const requestList = await RequestList.open({
            sources: [
                {
                    method: 'GET',
                    requestsFromUrl: 'http://example.com/list-1',
                },
            ],
        });

        expect(await requestList.fetchNextRequest()).toBe(null);

        expect(spy).toBeCalledTimes(1);
        expect(spy).toBeCalledWith({ url: 'http://example.com/list-1', urlRegExp: undefined });
    });

    test('should use the defined proxy server when using `requestsFromUrl`', async () => {
        const proxyUrls = ['http://proxyurl.usedforthe.download', 'http://another.proxy.url'];

        const spy = vitest.spyOn(RequestList.prototype as any, '_downloadListOfUrls');
        spy.mockResolvedValue([]);

        const proxyConfiguration = new ProxyConfiguration({
            proxyUrls,
        });

        const requestList = await RequestList.open({
            sources: [
                { requestsFromUrl: 'http://example.com/list-1' },
                { requestsFromUrl: 'http://example.com/list-2' },
                { requestsFromUrl: 'http://example.com/list-3' },
            ],
            proxyConfiguration,
        });

        expect(spy).not.toBeCalledWith(expect.not.objectContaining({ proxyUrl: expect.any(String) }));
    });

    test('tracks in-progress requests through the crawl lifecycle', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'https://example.com/1' },
                { url: 'https://example.com/2' },
                { url: 'https://example.com/3' },
            ],
        });

        const request1 = await requestList.fetchNextRequest();
        const request2 = await requestList.fetchNextRequest();

        expect(request1!.url).toBe('https://example.com/1');
        expect(request2!.url).toBe('https://example.com/2');
        expect(requestList.getState()).toEqual({
            inProgress: ['https://example.com/1', 'https://example.com/2'],
            nextIndex: 2,
            nextUniqueKey: 'https://example.com/3',
        });
        expect(await requestList.isEmpty()).toBe(false);
        expect(await requestList.isFinished()).toBe(false);
        expect(requestList.inProgress.size).toBe(2);

        await requestList.markRequestAsHandled(request1!);
        await requestList.markRequestAsHandled(request2!);

        expect(requestList.getState()).toEqual({
            inProgress: [],
            nextIndex: 2,
            nextUniqueKey: 'https://example.com/3',
        });

        const request3 = await requestList.fetchNextRequest();
        expect(request3!.url).toBe('https://example.com/3');
        expect(await requestList.fetchNextRequest()).toBe(null);
        expect(await requestList.isEmpty()).toBe(true);
        expect(await requestList.isFinished()).toBe(false);

        await requestList.markRequestAsHandled(request3!);
        expect(await requestList.isFinished()).toBe(true);
    });

    test('should correctly persist its state when persistStateKey is set', async () => {
        const PERSIST_STATE_KEY = 'some-key';
        const getValueSpy = vitest.spyOn(KeyValueStore.prototype, 'getValue');
        const setValueSpy = vitest.spyOn(KeyValueStore.prototype, 'setValue');

        getValueSpy.mockResolvedValueOnce(null);

        const opts = {
            sources: [
                { url: 'https://example.com/1' },
                { url: 'https://example.com/2' },
                { url: 'https://example.com/3' },
            ],
            persistStateKey: PERSIST_STATE_KEY,
        };
        const optsCopy = JSON.parse(JSON.stringify(opts));

        const requestList = await RequestList.open(opts);
        expect(requestList.isStatePersisted).toBe(true);

        // Fetch one request and check that state is not persisted.
        await requestList.fetchNextRequest();
        expect(requestList.isStatePersisted).toBe(false);

        // Persist state.
        setValueSpy.mockResolvedValueOnce();
        serviceLocator.getEventManager().emit(EventType.PERSIST_STATE);
        await sleep(20);
        expect(requestList.isStatePersisted).toBe(true);

        // Do some other changes and persist it again.
        const request2 = await requestList.fetchNextRequest();
        expect(requestList.isStatePersisted).toBe(false);
        await requestList.markRequestAsHandled(request2!);
        expect(requestList.isStatePersisted).toBe(false);
        setValueSpy.mockResolvedValueOnce();
        serviceLocator.getEventManager().emit(EventType.PERSIST_STATE);
        await sleep(20);
        expect(requestList.isStatePersisted).toBe(true);

        // Now initiate new request list from saved state and check that it's same as state
        // of original request list.
        getValueSpy.mockResolvedValueOnce(requestList.getState());
        const requestList2 = await RequestList.open(optsCopy);
        expect(requestList2.getState()).toEqual(requestList.getState());
    });

    test('teardown removes the persist state listener when persistStateKey is set', async () => {
        const listenerCountBefore = events.listenerCount(EventType.PERSIST_STATE);

        const requestList = await RequestList.open({
            sources: [{ url: 'https://example.com/1' }],
            persistStateKey: 'teardown-key',
        });

        expect(events.listenerCount(EventType.PERSIST_STATE)).toBe(listenerCountBefore + 1);

        await requestList.teardown();

        expect(events.listenerCount(EventType.PERSIST_STATE)).toBe(listenerCountBefore);
    });

    test('should correctly persist its sources when persistRequestsKey is set', async () => {
        const PERSIST_REQUESTS_KEY = 'some-key';
        const getValueSpy = vitest.spyOn(KeyValueStore.prototype, 'getValue');
        const setValueSpy = vitest.spyOn(KeyValueStore.prototype, 'setValue');

        let persistedRequests;

        const opts = {
            sources: [
                { url: 'https://example.com/1' },
                { url: 'https://example.com/2' },
                { url: 'https://example.com/3' },
            ],
            persistRequestsKey: PERSIST_REQUESTS_KEY,
        };

        // Expect an attempt to load sources.
        getValueSpy.mockResolvedValueOnce(null);

        // Expect persist sources.
        setValueSpy.mockImplementationOnce(async (_key, value) => {
            persistedRequests = value;
        });

        const requestList = await RequestList.open(opts);
        expect(requestList.areRequestsPersisted).toBe(true);

        const opts2 = {
            sources: [{ url: 'https://test.com/1' }, { url: 'https://test.com/2' }, { url: 'https://test.com/3' }],
            persistRequestsKey: PERSIST_REQUESTS_KEY,
        };

        getValueSpy.mockResolvedValueOnce(persistedRequests);

        const requestList2 = await RequestList.open(opts2);
        expect(requestList2.areRequestsPersisted).toBe(true);
        expect(requestList2.requests).toEqual(requestList.requests);
    });

    test('should correctly persist sources from requestsFromUrl if persistRequestsKey is set', async () => {
        const PERSIST_REQUESTS_KEY = 'some-key';
        const getValueSpy = vitest.spyOn(KeyValueStore.prototype, 'getValue');
        const setValueSpy = vitest.spyOn(KeyValueStore.prototype, 'setValue');
        const spy = vitest.spyOn(RequestList.prototype as any, '_downloadListOfUrls');
        let persistedRequests: any;

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
        spy.mockResolvedValueOnce(urlsFromTxt);

        getValueSpy.mockResolvedValueOnce(null);
        setValueSpy.mockImplementationOnce(async (_key, value) => {
            persistedRequests = value;
        });

        const requestList = await RequestList.open(opts);
        expect(requestList.areRequestsPersisted).toBe(true);
        const requests = await deserializeArray(persistedRequests);
        expect(requestList.requests).toHaveLength(5);
        expect(requests).toEqual(requestList.requests);

        expect(spy).toBeCalledTimes(1);
        expect(spy).toBeCalledWith({ url: 'http://example.com/list-urls.txt', urlRegExp: undefined });
    });

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
            inProgress: ['https://www.ams360.com', 'https://www.anybus.com', 'https://www.anychart.com'],
        };

        const requestList = await RequestList.open({
            sources,
            state,
        });

        // Get requests from list
        let reqs: Request[] = [];
        for (let i = 0; i < 5; i++) {
            const request = await requestList.fetchNextRequest();
            if (!request) break;
            reqs.push(request);
        }

        reqs = shuffle(reqs) as typeof reqs;

        for (let i = 0; i < reqs.length; i++) {
            await requestList.markRequestAsHandled(reqs[i]);
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

        const requestList = await RequestList.open({
            sources,
        });

        await expect(requestList.getTotalCount()).resolves.toBe(4);
    });

    test('it gets correct handledCount()', async () => {
        const sources = [
            { url: 'https://www.example.com' },
            { url: 'https://www.ams360.com' },
            { url: 'https://www.anybus.com' },
            { url: 'https://www.anychart.com' },
            { url: 'https://www.example.com' },
        ];

        const requestList = await RequestList.open({
            sources,
        });

        await requestList.fetchNextRequest();
        const req2 = await requestList.fetchNextRequest();
        const req3 = await requestList.fetchNextRequest();
        expect(await requestList.getHandledCount()).toBe(0);

        await requestList.markRequestAsHandled(req2!);
        expect(await requestList.getHandledCount()).toBe(1);

        await requestList.markRequestAsHandled(req3!);
        expect(await requestList.getHandledCount()).toBe(2);
    });

    test('should correctly keep duplicate URLs while keepDuplicateUrls is set', async () => {
        const sources = [
            { url: 'https://www.example.com' },
            { url: 'https://www.example.com' },
            { url: 'https://www.example.com' },
            { url: 'https://www.ex2mple.com' },
        ];
        const sourcesCopy = JSON.parse(JSON.stringify(sources));

        let requestList = await RequestList.open({
            sources,
            keepDuplicateUrls: true,
        });

        await expect(requestList.getTotalCount()).resolves.toBe(4);

        log.setLevel(log.LEVELS.INFO);
        const warnSpy = vitest.spyOn(console, 'warn').mockImplementation(() => {});

        requestList = await RequestList.open({
            sources: sourcesCopy.concat([
                { url: 'https://www.example.com', uniqueKey: '123' },
                { url: 'https://www.example.com', uniqueKey: '123' },
                { url: 'https://www.example.com', uniqueKey: '456' },
                { url: 'https://www.ex2mple.com', uniqueKey: '456' },
            ]),
            keepDuplicateUrls: true,
        });

        await expect(requestList.getTotalCount()).resolves.toBe(6);
        expect(warnSpy).toBeCalled();
        expect(warnSpy.mock.calls[0][0]).toMatch(`Check your sources' unique keys.`);

        log.setLevel(log.LEVELS.ERROR);
    });

    describe('Apify.RequestList.open()', () => {
        test('should work', async () => {
            const getValueSpy = vitest.spyOn(KeyValueStore.prototype, 'getValue');
            const setValueSpy = vitest.spyOn(KeyValueStore.prototype, 'setValue');

            const name = 'xxx';
            const CRAWLEE_KEY = `CRAWLEE_${name}`;
            const sources = [{ url: 'https://example.com' }];

            const rl = await RequestList.open(name, sources);
            expect(rl).toBeInstanceOf(RequestList);
            // @ts-expect-error accessing private var
            expect(rl.persistStateKey.startsWith(CRAWLEE_KEY)).toBe(true);
            // @ts-expect-error accessing private var
            expect(rl.persistRequestsKey.startsWith(CRAWLEE_KEY)).toBe(true);
            // @ts-expect-error accessing private var
            expect(rl.sources).toEqual([]);
            // @ts-expect-error accessing private var
            expect(rl.isInitialized).toBe(true);

            expect(getValueSpy).toBeCalledTimes(2);
            expect(setValueSpy).toBeCalledTimes(1);
        });

        test('should work with string sources', async () => {
            const getValueSpy = vitest.spyOn(KeyValueStore.prototype, 'getValue');
            const setValueSpy = vitest.spyOn(KeyValueStore.prototype, 'setValue');

            const name = 'xxx';
            const CRAWLEE_KEY = `CRAWLEE_${name}`;
            const sources = ['https://example.com'];
            const requests = sources.map((url) => ({ url, uniqueKey: url }));

            const rl = await RequestList.open(name, sources);
            expect(rl).toBeInstanceOf(RequestList);
            // @ts-expect-error accessing private var
            expect(rl.persistStateKey.startsWith(CRAWLEE_KEY)).toBe(true);
            // @ts-expect-error accessing private var
            expect(rl.persistRequestsKey.startsWith(CRAWLEE_KEY)).toBe(true);
            expect(rl.requests).toEqual(requests);
            // @ts-expect-error accessing private var
            expect(rl.isInitialized).toBe(true);

            expect(getValueSpy).toBeCalledTimes(2);
            expect(setValueSpy).toBeCalledTimes(1);
        });

        test('should correctly pass options', async () => {
            const getValueSpy = vitest.spyOn(KeyValueStore.prototype, 'getValue');
            const setValueSpy = vitest.spyOn(KeyValueStore.prototype, 'setValue');

            const name = 'xxx';
            const CRAWLEE_KEY = `CRAWLEE_${name}`;
            let counter = 0;
            const sources = [{ url: 'https://example.com' }];
            const requests = sources.map(({ url }) => ({ url, uniqueKey: `${url}-${counter++}` }));
            const options = {
                keepDuplicateUrls: true,
                persistStateKey: 'yyy',
            };

            const rl = await RequestList.open(name, sources, options);
            expect(rl).toBeInstanceOf(RequestList);
            // @ts-expect-error accessing private var
            expect(rl.persistStateKey.startsWith(CRAWLEE_KEY)).toBe(true);
            // @ts-expect-error accessing private var
            expect(rl.persistRequestsKey.startsWith(CRAWLEE_KEY)).toBe(true);
            expect(rl.requests).toEqual(requests);
            // @ts-expect-error accessing private var
            expect(rl.isInitialized).toBe(true);
            // @ts-expect-error accessing private var
            expect(rl.keepDuplicateUrls).toBe(true);

            expect(getValueSpy).toBeCalledTimes(2);
            expect(setValueSpy).toBeCalledTimes(1);
        });

        test('should work with null name', async () => {
            const getValueSpy = vitest.spyOn(KeyValueStore.prototype, 'getValue');
            const setValueSpy = vitest.spyOn(KeyValueStore.prototype, 'setValue');

            const name: string | null = null;
            const sources = [{ url: 'https://example.com' }];
            const requests = sources.map(({ url }) => ({ url, uniqueKey: url }));

            const rl = await RequestList.open(name, sources);
            expect(rl).toBeInstanceOf(RequestList);
            // @ts-expect-error accessing private var
            expect(rl.persistStateKey == null).toBe(true);
            // @ts-expect-error accessing private var
            expect(rl.persistRequestsKey == null).toBe(true);
            expect(rl.requests).toEqual(requests);
            // @ts-expect-error accessing private var
            expect(rl.isInitialized).toBe(true);

            expect(getValueSpy).not.toBeCalled();
            expect(setValueSpy).not.toBeCalled();
        });

        test('should throw on invalid parameters', async () => {
            const args = [[], ['x', {}], ['x', 6, {}], ['x', [], []]] as const;
            for (const arg of args) {
                try {
                    // @ts-ignore
                    await RequestList.open(...arg);
                    throw new Error('wrong error');
                } catch (err) {
                    const e = err as Error;
                    expect(e.message).not.toBe('wrong error');
                    if (/argument to be of type `string`/.exec(e.message)) {
                        expect(e.message).toMatch('received type `undefined`');
                    } else if (/argument to be of type `array`/.exec(e.message)) {
                        const isMatched =
                            /received type `Object`/.exec(e.message) ||
                            /received type `number`/.exec(e.message) ||
                            /received type `undefined`/.exec(e.message);
                        expect(isMatched).toBeTruthy();
                    } else if (/argument to be of type `null`/.exec(e.message)) {
                        expect(e.message).toMatch('received type `undefined`');
                    }
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
    //     const rl = await RequestList.open({ sources, persistRequestsKey: null });
    //     const instanceMemory = getMemoryInMbytes();
    //     console.log(instanceMemory, 'MB');
    //
    //     const initMemory = getMemoryInMbytes();
    //     console.log(initMemory, 'MB');
    // });
});
