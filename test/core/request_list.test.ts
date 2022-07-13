import log from '@apify/log';
import { Configuration, deserializeArray, EventType, KeyValueStore, ProxyConfiguration, Request, RequestList } from '@crawlee/core';
import { sleep } from '@crawlee/utils';
import { gotScraping } from 'got-scraping';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

/**
 * Stand-in for underscore.js shuffle (weird, but how else?)
 */
function shuffle(array: unknown[]) : unknown[] {
    const out = [...array];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

jest.mock('got-scraping', () => {
    const original: typeof import('got-scraping') = jest.requireActual('got-scraping');
    return {
        ...original,
        gotScraping: jest.fn(original.gotScraping),
    };
});

const gotScrapingSpy = gotScraping as jest.MockedFunction<typeof gotScraping>;
const originalGotScraping = gotScrapingSpy.getMockImplementation()!;

afterEach(() => {
    gotScrapingSpy.mockReset();
    gotScrapingSpy.mockImplementation(originalGotScraping);
});

afterAll(() => {
    jest.unmock('got-scraping');
});

describe('RequestList', () => {
    let ll: number;
    const emulator = new MemoryStorageEmulator();
    const events = Configuration.getEventManager();

    beforeAll(() => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        await emulator.init();
        jest.restoreAllMocks();
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

        expect(req.url).toBe('https://example.com/1');
        expect(await requestList.isEmpty()).toBe(true);
        expect(await requestList.isFinished()).toBe(false);
        expect(await requestList.fetchNextRequest()).toBe(null);

        await requestList.markRequestHandled(req);

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

        const originalList = await RequestList.open(null, sources);

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

        const newList = await RequestList.open({
            sources: sourcesCopy,
            state: originalList.getState(),
        });

        expect(await newList.isEmpty()).toBe(false);
        expect((await newList.fetchNextRequest()).url).toBe('https://example.com/3');
        expect((await newList.fetchNextRequest()).url).toBe('https://example.com/5');
        expect((await newList.fetchNextRequest()).url).toBe('https://example.com/6');
        expect((await newList.fetchNextRequest()).url).toBe('https://example.com/7');
        expect((await newList.fetchNextRequest()).url).toBe('https://example.com/8');
        expect(await newList.isEmpty()).toBe(true);
    });

    test('should correctly load list from hosted files in correct order', async () => {
        const spy = jest.spyOn(RequestList.prototype as any, '_downloadListOfUrls');
        const list1 = [
            'https://example.com',
            'https://google.com',
            'https://wired.com',
        ];
        const list2 = [
            'https://another.com',
            'https://page.com',
        ];
        spy.mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve(list1) as any, 100)) as any);
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
        spy.mockRestore();
    });

    test('should use regex parameter to parse urls', async () => {
        const listStr = 'kjnjkn"https://example.com/a/b/c?q=1#abc";,"HTTP://google.com/a/b/c";dgg:dd';
        const listArr = ['https://example.com', 'HTTP://google.com'];
        gotScrapingSpy.mockResolvedValue({ body: listStr } as any);

        const regex = /(https:\/\/example.com|HTTP:\/\/google.com)/g;
        const requestList = await RequestList.open({
            sources: [
                {
                    method: 'GET',
                    requestsFromUrl: 'http://example.com/list-1',
                    regex,
                },
            ],
        });

        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: listArr[0] });
        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: listArr[1] });

        expect(gotScrapingSpy).toBeCalledWith({ url: 'http://example.com/list-1', encoding: 'utf8' });
        gotScrapingSpy.mockRestore();
    });

    test('should fix gdoc sharing url in `requestsFromUrl` automatically (GH issue #639)', async () => {
        const list = [
            'https://example.com',
            'https://google.com',
            'https://wired.com',
        ];
        const wrongUrls = [
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/edit?usp=sharing',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/123123132',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/?q=blablabla',
            'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/edit#gid=0',
        ];
        const correctUrl = 'https://docs.google.com/spreadsheets/d/11UGSBOSXy5Ov2WEP9nr4kSIxQJmH18zh-5onKtBsovU/gviz/tq?tqx=out:csv';

        gotScrapingSpy.mockResolvedValueOnce({ body: JSON.stringify(list) } as any);

        const requestList = await RequestList.open({
            sources: wrongUrls.map((requestsFromUrl) => ({ requestsFromUrl })),
        });

        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[0] });
        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[1] });
        expect(await requestList.fetchNextRequest()).toMatchObject({ method: 'GET', url: list[2] });

        expect(gotScrapingSpy).toBeCalledWith({ url: correctUrl, encoding: 'utf8' });
        gotScrapingSpy.mockRestore();
    });

    test('should handle requestsFromUrl with no URLs', async () => {
        const spy = jest.spyOn(RequestList.prototype as any, '_downloadListOfUrls');
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
        spy.mockRestore();
    });

    test('should use the defined proxy server when using `requestsFromUrl`', async () => {
        const proxyUrls = [
            'http://proxyurl.usedforthe.download',
            'http://another.proxy.url',
        ];

        const spy = jest.spyOn(RequestList.prototype as any, '_downloadListOfUrls');
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

        spy.mockRestore();
    });

    test('should correctly handle reclaimed pages', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'https://example.com/1' },
                { url: 'https://example.com/2' },
                { url: 'https://example.com/3' },
                { url: 'https://example.com/4' },
                { url: 'https://example.com/5' },
                { url: 'https://example.com/6' },
            ],
        });

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
            inProgress: [
                'https://example.com/1',
                'https://example.com/2',
                'https://example.com/3',
                'https://example.com/4',
                'https://example.com/5',
            ],
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(await requestList.isEmpty()).toBe(false);
        expect(await requestList.isFinished()).toBe(false);
        expect(requestList.inProgress.size).toBe(5);
        expect(requestList.reclaimed.size).toBe(0);

        //
        // Mark 1st, 2nd handled
        // Reclaim 3rd 4th
        //

        await requestList.markRequestHandled(request1);
        await requestList.markRequestHandled(request2);
        await requestList.reclaimRequest(request3);
        await requestList.reclaimRequest(request4);

        expect(requestList.getState()).toEqual({
            inProgress: [
                'https://example.com/3',
                'https://example.com/4',
                'https://example.com/5',
            ],
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
            inProgress: [
                'https://example.com/3',
                'https://example.com/4',
            ],
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
            inProgress: [
                'https://example.com/3',
            ],
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
            inProgress: [],
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
            inProgress: [
                'https://example.com/6',
            ],
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
            inProgress: [
                'https://example.com/6',
            ],
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
            inProgress: [
                'https://example.com/6',
            ],
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
            inProgress: [],
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(await requestList.isEmpty()).toBe(true);
        expect(await requestList.isFinished()).toBe(true);
        expect(requestList.inProgress).toEqual(expect.objectContaining(requestList.reclaimed));
    });

    test('should correctly persist its state when persistStateKey is set', async () => {
        const PERSIST_STATE_KEY = 'some-key';
        const getValueSpy = jest.spyOn(KeyValueStore.prototype, 'getValue');
        const setValueSpy = jest.spyOn(KeyValueStore.prototype, 'setValue');

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
        const request1 = await requestList.fetchNextRequest();
        expect(requestList.isStatePersisted).toBe(false);

        // Persist state.
        setValueSpy.mockResolvedValueOnce();
        events.emit(EventType.PERSIST_STATE);
        await sleep(20);
        expect(requestList.isStatePersisted).toBe(true);

        // Do some other changes and persist it again.
        const request2 = await requestList.fetchNextRequest();
        expect(requestList.isStatePersisted).toBe(false);
        await requestList.markRequestHandled(request2);
        expect(requestList.isStatePersisted).toBe(false);
        setValueSpy.mockResolvedValueOnce();
        events.emit(EventType.PERSIST_STATE);
        await sleep(20);
        expect(requestList.isStatePersisted).toBe(true);

        // Reclaim event doesn't change the state.
        await requestList.reclaimRequest(request1);
        expect(requestList.isStatePersisted).toBe(true);

        // Now initiate new request list from saved state and check that it's same as state
        // of original request list.
        getValueSpy.mockResolvedValueOnce(requestList.getState());
        const requestList2 = await RequestList.open(optsCopy);
        expect(requestList2.getState()).toEqual(requestList.getState());
    });

    test('should correctly persist its sources when persistRequestsKey is set', async () => {
        const PERSIST_REQUESTS_KEY = 'some-key';
        const getValueSpy = jest.spyOn(KeyValueStore.prototype, 'getValue');
        const setValueSpy = jest.spyOn(KeyValueStore.prototype, 'setValue');

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
            sources: [
                { url: 'https://test.com/1' },
                { url: 'https://test.com/2' },
                { url: 'https://test.com/3' },
            ],
            persistRequestsKey: PERSIST_REQUESTS_KEY,
        };

        getValueSpy.mockResolvedValueOnce(persistedRequests);

        const requestList2 = await RequestList.open(opts2);
        expect(requestList2.areRequestsPersisted).toBe(true);
        expect(requestList2.requests).toEqual(requestList.requests);
    });

    test('should correctly persist sources from requestsFromUrl if persistRequestsKey is set', async () => {
        const PERSIST_REQUESTS_KEY = 'some-key';
        const getValueSpy = jest.spyOn(KeyValueStore.prototype, 'getValue');
        const setValueSpy = jest.spyOn(KeyValueStore.prototype, 'setValue');
        const spy = jest.spyOn(RequestList.prototype as any, '_downloadListOfUrls');
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
        spy.mockRestore();
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
            inProgress: [
                'https://www.ams360.com',
                'https://www.anybus.com',
                'https://www.anychart.com',
            ],
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
            await requestList.reclaimRequest(reqs[i]);
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

        const requestList = await RequestList.open({
            sources,
        });

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

        expect(requestList.length()).toBe(4);

        log.setLevel(log.LEVELS.INFO);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

        requestList = await RequestList.open({
            sources: sourcesCopy.concat([
                { url: 'https://www.example.com', uniqueKey: '123' },
                { url: 'https://www.example.com', uniqueKey: '123' },
                { url: 'https://www.example.com', uniqueKey: '456' },
                { url: 'https://www.ex2mple.com', uniqueKey: '456' },
            ]),
            keepDuplicateUrls: true,
        });

        expect(requestList.length()).toBe(6);
        expect(warnSpy).toBeCalled();
        expect(warnSpy.mock.calls[0][0]).toMatch(`Check your sources' unique keys.`);

        warnSpy.mockRestore();
        log.setLevel(log.LEVELS.ERROR);
    });

    describe('Apify.RequestList.open()', () => {
        test('should work', async () => {
            const getValueSpy = jest.spyOn(KeyValueStore.prototype, 'getValue');
            const setValueSpy = jest.spyOn(KeyValueStore.prototype, 'setValue');

            const name = 'xxx';
            const SDK_KEY = `SDK_${name}`;
            const sources = [{ url: 'https://example.com' }];

            const rl = await RequestList.open(name, sources);
            expect(rl).toBeInstanceOf(RequestList);
            // @ts-expect-error accessing private var
            expect(rl.persistStateKey.startsWith(SDK_KEY)).toBe(true);
            // @ts-expect-error accessing private var
            expect(rl.persistRequestsKey.startsWith(SDK_KEY)).toBe(true);
            // @ts-expect-error accessing private var
            expect(rl.sources).toEqual([]);
            // @ts-expect-error accessing private var
            expect(rl.isInitialized).toBe(true);

            expect(getValueSpy).toBeCalledTimes(2);
            expect(setValueSpy).toBeCalledTimes(1);
        });

        test('should work with string sources', async () => {
            const getValueSpy = jest.spyOn(KeyValueStore.prototype, 'getValue');
            const setValueSpy = jest.spyOn(KeyValueStore.prototype, 'setValue');

            const name = 'xxx';
            const SDK_KEY = `SDK_${name}`;
            const sources = ['https://example.com'];
            const requests = sources.map((url) => new Request({ url }));

            const rl = await RequestList.open(name, sources);
            expect(rl).toBeInstanceOf(RequestList);
            // @ts-expect-error accessing private var
            expect(rl.persistStateKey.startsWith(SDK_KEY)).toBe(true);
            // @ts-expect-error accessing private var
            expect(rl.persistRequestsKey.startsWith(SDK_KEY)).toBe(true);
            expect(rl.requests).toEqual(requests);
            // @ts-expect-error accessing private var
            expect(rl.isInitialized).toBe(true);

            expect(getValueSpy).toBeCalledTimes(2);
            expect(setValueSpy).toBeCalledTimes(1);
        });

        test('should correctly pass options', async () => {
            const getValueSpy = jest.spyOn(KeyValueStore.prototype, 'getValue');
            const setValueSpy = jest.spyOn(KeyValueStore.prototype, 'setValue');

            const name = 'xxx';
            const SDK_KEY = `SDK_${name}`;
            let counter = 0;
            const sources = [{ url: 'https://example.com' }];
            const requests = sources.map(({ url }) => new Request({ url, uniqueKey: `${url}-${counter++}` }));
            const options = {
                keepDuplicateUrls: true,
                persistStateKey: 'yyy',
            };

            const rl = await RequestList.open(name, sources, options);
            expect(rl).toBeInstanceOf(RequestList);
            // @ts-expect-error accessing private var
            expect(rl.persistStateKey.startsWith(SDK_KEY)).toBe(true);
            // @ts-expect-error accessing private var
            expect(rl.persistRequestsKey.startsWith(SDK_KEY)).toBe(true);
            expect(rl.requests).toEqual(requests);
            // @ts-expect-error accessing private var
            expect(rl.isInitialized).toBe(true);
            // @ts-expect-error accessing private var
            expect(rl.keepDuplicateUrls).toBe(true);

            expect(getValueSpy).toBeCalledTimes(2);
            expect(setValueSpy).toBeCalledTimes(1);
        });

        test('should work with null name', async () => {
            const getValueSpy = jest.spyOn(KeyValueStore.prototype, 'getValue');
            const setValueSpy = jest.spyOn(KeyValueStore.prototype, 'setValue');

            const name: string = null;
            const sources = [{ url: 'https://example.com' }];
            const requests = sources.map(({ url }) => new Request({ url }));

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
            const args = [
                [],
                ['x', {}],
                ['x', 6, {}],
                ['x', [], []],
            ] as const;
            for (const arg of args) {
                try {
                    // @ts-ignore
                    await RequestList.open(...arg);
                    throw new Error('wrong error');
                } catch (err) {
                    const e = err as Error;
                    expect(e.message).not.toBe('wrong error');
                    if (e.message.match('argument to be of type `string`')) {
                        expect(e.message).toMatch('received type `undefined`');
                    } else if (e.message.match('argument to be of type `array`')) {
                        const isMatched = e.message.match('received type `Object`')
                            || e.message.match('received type `number`')
                            || e.message.match('received type `undefined`');
                        expect(isMatched).toBeTruthy();
                    } else if (e.message.match('argument to be of type `null`')) {
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
