import {
    ArgumentValidationError,
    Configuration,
    EventType,
    KeyValueStore,
    MemoryStorageBackend,
    Request,
    RequestList,
    REQUESTS_PERSISTENCE_KEY,
    serviceLocator,
    STATE_PERSISTENCE_KEY,
    StateValidationError,
} from '@crawlee/core';
import { sleep } from '@crawlee/utils';
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

describe('RequestList', () => {
    let ll: number;
    beforeAll(() => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        vitest.restoreAllMocks();
    });

    afterAll(async () => {
        log.setLevel(ll);
    });

    test('should not accept to pages with same uniqueKey', async () => {
        const requestList = await RequestList.open(null, [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/1#same' },
        ]);

        expect((await requestList.checkReadiness()).status).toBe('ready');

        const req = await requestList.fetchNextRequest();

        expect(req!.url).toBe('https://example.com/1');
        expect((await requestList.checkReadiness()).status).toBe('waiting');
        expect(await requestList.fetchNextRequest()).toBe(null);

        await requestList.markRequestAsHandled(req!);

        expect((await requestList.checkReadiness()).status).toBe('finished');
    });

    test('must be initialized before using any of the methods', async () => {
        // @ts-expect-error private constructor
        const requestList = new RequestList({ sources: [{ url: 'https://example.com' }] });
        const requestObj = new Request({ url: 'https://example.com' });

        await expect(requestList.checkReadiness()).rejects.toThrow();
        expect(() => requestList.getState()).toThrowError();
        await expect(requestList.markRequestAsHandled(requestObj)).rejects.toThrow();
        await expect(requestList.fetchNextRequest()).rejects.toThrow();

        const openedList = await RequestList.open(null, [{ url: 'https://example.com' }]);

        await expect(openedList.checkReadiness()).resolves.not.toThrow();
        expect(() => openedList.getState()).not.toThrowError();
        await expect(openedList.fetchNextRequest()).resolves.not.toThrow();
        await expect(openedList.markRequestAsHandled(requestObj)).resolves.not.toThrow();
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

        expect((await newList.checkReadiness()).status).toBe('ready');
        expect((await newList.fetchNextRequest())!.url).toBe('https://example.com/3');
        expect((await newList.fetchNextRequest())!.url).toBe('https://example.com/5');
        expect((await newList.fetchNextRequest())!.url).toBe('https://example.com/6');
        expect((await newList.fetchNextRequest())!.url).toBe('https://example.com/7');
        expect((await newList.fetchNextRequest())!.url).toBe('https://example.com/8');
        // None of the five re-served requests was handled, so they are all still in progress.
        expect((await newList.checkReadiness()).status).toBe('waiting');
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
        expect((await requestList.checkReadiness()).status).toBe('ready');
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
        expect((await requestList.checkReadiness()).status).toBe('waiting');

        await requestList.markRequestAsHandled(request3!);
        expect((await requestList.checkReadiness()).status).toBe('finished');
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
        await requestList.fetchNextRequest();

        // Persist state.
        setValueSpy.mockResolvedValueOnce();
        serviceLocator.getEventManager().emit(EventType.PERSIST_STATE);
        await sleep(20);
        expect(setValueSpy).toHaveBeenCalledTimes(1);
        expect(setValueSpy).toHaveBeenLastCalledWith(`CRAWLEE_${PERSIST_STATE_KEY}`, requestList.getState());

        // Do some other changes and persist it again.
        const request2 = await requestList.fetchNextRequest();
        await requestList.markRequestAsHandled(request2!);
        setValueSpy.mockResolvedValueOnce();
        serviceLocator.getEventManager().emit(EventType.PERSIST_STATE);
        await sleep(20);
        expect(setValueSpy).toHaveBeenCalledTimes(2);
        expect(setValueSpy).toHaveBeenLastCalledWith(`CRAWLEE_${PERSIST_STATE_KEY}`, requestList.getState());

        // Now initiate new request list from saved state and check that it's same as state
        // of original request list.
        getValueSpy.mockResolvedValueOnce(requestList.getState());
        const requestList2 = await RequestList.open(optsCopy);
        expect(requestList2.getState()).toEqual(requestList.getState());
    });

    test('a persisted record that does not match the sources fails validation', async () => {
        const sources = [1, 2, 3].map((i) => ({ url: `https://example.com/${i}` }));
        const store = await KeyValueStore.open();
        await store.setValue('CRAWLEE_state-key', {
            nextIndex: 1,
            nextUniqueKey: 'https://example.com/3',
            inProgress: [],
        });

        await expect(RequestList.open({ sources, persistStateKey: 'state-key' })).rejects.toThrow(StateValidationError);
    });

    test('a persisted record takes precedence over the state option', async () => {
        const sources = [1, 2, 3].map((i) => ({ url: `https://example.com/${i}` }));
        const store = await KeyValueStore.open();
        await store.setValue('CRAWLEE_state-key', {
            nextIndex: 2,
            nextUniqueKey: 'https://example.com/3',
            inProgress: [],
        });

        const requestList = await RequestList.open({
            sources,
            persistStateKey: 'state-key',
            state: { nextIndex: 1, nextUniqueKey: 'https://example.com/2', inProgress: [] },
        });

        expect(requestList.getState().nextIndex).toBe(2);
        await requestList.teardown();
    });

    test('teardown removes the persist state listener when persistStateKey is set', async () => {
        const events = serviceLocator.getEventManager();
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
        /** The keys a spied {@apilink KeyValueStore} method was called with, in call order. */
        const keysPassedTo = (spy: MockedFunction<any>) => spy.mock.calls.map(([key]: [string]) => key);

        test('should work', async () => {
            const getValueSpy = vitest.spyOn(KeyValueStore.prototype, 'getValue');
            const setValueSpy = vitest.spyOn(KeyValueStore.prototype, 'setValue');

            const name = 'xxx';
            const CRAWLEE_KEY = `CRAWLEE_${name}`;
            const sources = [{ url: 'https://example.com' }];

            const rl = await RequestList.open(name, sources);
            expect(rl).toBeInstanceOf(RequestList);
            // An uninitialized list throws here, so this is the observable form of "open() initialized it".
            await expect(rl.checkReadiness()).resolves.toEqual({ status: 'ready' });

            // The persistence keys are derived from the list name, which shows in the keys it reads and writes.
            expect(keysPassedTo(getValueSpy)).toEqual([
                `${CRAWLEE_KEY}-${REQUESTS_PERSISTENCE_KEY}`,
                `${CRAWLEE_KEY}-${STATE_PERSISTENCE_KEY}`,
            ]);
            expect(keysPassedTo(setValueSpy)).toEqual([`${CRAWLEE_KEY}-${REQUESTS_PERSISTENCE_KEY}`]);
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
            expect(rl.requests).toEqual(requests);
            await expect(rl.checkReadiness()).resolves.toEqual({ status: 'ready' });

            expect(keysPassedTo(getValueSpy)).toEqual([
                `${CRAWLEE_KEY}-${REQUESTS_PERSISTENCE_KEY}`,
                `${CRAWLEE_KEY}-${STATE_PERSISTENCE_KEY}`,
            ]);
            expect(keysPassedTo(setValueSpy)).toEqual([`${CRAWLEE_KEY}-${REQUESTS_PERSISTENCE_KEY}`]);
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
            // The counter suffix on the unique key is what `keepDuplicateUrls: true` does.
            expect(rl.requests).toEqual(requests);
            await expect(rl.checkReadiness()).resolves.toEqual({ status: 'ready' });

            // The list name wins over the `persistStateKey` option.
            expect(keysPassedTo(getValueSpy)).toEqual([
                `${CRAWLEE_KEY}-${REQUESTS_PERSISTENCE_KEY}`,
                `${CRAWLEE_KEY}-${STATE_PERSISTENCE_KEY}`,
            ]);
            expect(keysPassedTo(setValueSpy)).toEqual([`${CRAWLEE_KEY}-${REQUESTS_PERSISTENCE_KEY}`]);
        });

        test('should work with null name', async () => {
            const getValueSpy = vitest.spyOn(KeyValueStore.prototype, 'getValue');
            const setValueSpy = vitest.spyOn(KeyValueStore.prototype, 'setValue');

            const name: string | null = null;
            const sources = [{ url: 'https://example.com' }];
            const requests = sources.map(({ url }) => ({ url, uniqueKey: url }));

            const rl = await RequestList.open(name, sources);
            expect(rl).toBeInstanceOf(RequestList);
            expect(rl.requests).toEqual(requests);
            await expect(rl.checkReadiness()).resolves.toEqual({ status: 'ready' });

            // A nameless list has no persistence keys, so it never touches the store.
            expect(getValueSpy).not.toBeCalled();
            expect(setValueSpy).not.toBeCalled();
        });

        test.each([
            [[], 'Invalid input: expected array'],
            [['x', {}], 'Invalid input: expected array'],
            [['x', 6, {}], 'Invalid input: expected array'],
            [['x', [], []], 'Invalid input: expected object'],
            [[6, []], 'Invalid input: expected string, received the number `6`'],
        ])('open(...%j) should throw on invalid argument (%s)', async (args, message) => {
            // @ts-expect-error JS-side validation
            await expect(RequestList.open(...args)).rejects.toThrow(ArgumentValidationError);
            // @ts-expect-error JS-side validation
            await expect(RequestList.open(...args)).rejects.toThrow(message);
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

describe('Request', () => {
    test('alwaysEnqueue makes requests to the same URL have different unique keys', () => {
        const request1 = new Request({ url: 'https://example.com', alwaysEnqueue: true });
        const request2 = new Request({ url: 'https://example.com', alwaysEnqueue: true });

        expect(request1.uniqueKey).not.toBe(request2.uniqueKey);
    });

    test('alwaysEnqueue throws when combined with a custom uniqueKey', () => {
        expect(() => new Request({ url: 'https://example.com', uniqueKey: 'custom', alwaysEnqueue: true })).toThrow();
    });

    test('fromSchema treats null fields of a stored request as unset', () => {
        const request = Request.fromSchema({
            id: 'id',
            url: 'https://example.com',
            uniqueKey: 'https://example.com',
            method: 'GET',
            payload: null,
            noRetry: null,
            retryCount: 0,
            errorMessages: null,
            headers: null,
            userData: {},
            handledAt: null,
            loadedUrl: null,
        });

        expect(request).toMatchObject({ payload: undefined, noRetry: false, errorMessages: [], headers: {} });
        expect(request).toMatchObject({ handledAt: undefined, loadedUrl: undefined });
    });

    test('fromSchema accepts what storages and the constructor accept beyond the declared types', () => {
        const request = Request.fromSchema({
            url: 'https://example.com',
            uniqueKey: 'https://example.com',
            method: 'POST',
            payload: new Uint8Array([1]) as unknown as string,
            errorMessages: [null] as unknown as string[],
            handledAt: new Date('2026-01-01T00:00:00.000Z') as unknown as string,
        });

        expect(request).toMatchObject({ errorMessages: [null], handledAt: '2026-01-01T00:00:00.000Z' });
        expect(request.payload).toBeInstanceOf(Uint8Array);
    });
});
