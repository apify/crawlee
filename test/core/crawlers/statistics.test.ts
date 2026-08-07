import type { StatisticsOptions } from '@crawlee/core';
import { EventType, KeyValueStore, MemoryStorageBackend, serviceLocator, Statistics } from '@crawlee/core';
import type { Dictionary } from '@crawlee/types';
import { z } from 'zod';

describe('Statistics', () => {
    const getPerMinute = (jobCount: number, totalTickMillis: number) => {
        return Math.round(jobCount / (totalTickMillis / 1000 / 60));
    };

    let stats: Statistics;
    beforeAll(async () => {
        vitest.useFakeTimers();
    });

    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        stats = new Statistics();
    });

    afterEach(async () => {
        serviceLocator.getEventManager().off(EventType.PERSIST_STATE);
        stats = null as any;
    });

    afterAll(async () => {
        // eslint-disable-next-line dot-notation
        Statistics['id'] = 0;
    });

    describe('persist state', () => {
        // needs to go first for predictability
        test('should increment id by each new consecutive instance', () => {
            expect(stats.id).toEqual('0');
            // @ts-expect-error Accessing private prop
            expect(Statistics.id).toEqual(1);
            // @ts-expect-error Accessing private prop
            expect(stats.persistStateKey).toEqual('CRAWLEE_CRAWLER_STATISTICS_0');
            const [n1, n2] = [new Statistics(), new Statistics()];
            expect(n1.id).toEqual('1');
            expect(n2.id).toEqual('2');
            // @ts-expect-error Accessing private prop
            expect(Statistics.id).toEqual(3);
        });

        test('should persist the state to KV and load again', async () => {
            const startedAt = 1000;
            vitest.advanceTimersByTime(startedAt);
            stats.startJob(0);
            vitest.advanceTimersByTime(100);
            stats.finishJob(0, 0);

            await stats.startCapturing();
            await stats.persistState();

            // console.dir(stats);
            // @ts-expect-error Accessing private prop
            const state = await stats.keyValueStore.getValue(stats.persistStateKey);

            /*
            expect(state).toEqual({
                crawlerFinishedAt: null,
                crawlerLastStartTimestamp: 0,
                crawlerRuntimeMillis: 1100,
                crawlerStartedAt: toISOString(startedAt + 100),
                requestAvgFailedDurationMillis: null,
                requestAvgFinishedDurationMillis: 100,
                requestMaxDurationMillis: 100,
                requestMinDurationMillis: 100,
                requestTotalDurationMillis: 100,
                requestRetryHistogram: [1],
                requestTotalFailedDurationMillis: 0,
                requestTotalFinishedDurationMillis: 100,
                requestsFailed: 0,
                requestsFailedPerMinute: 0,
                requestsFinished: 1,
                requestsFinishedPerMinute: 55,
                requestsRetries: 0,
                requestsTotal: 1,
                statsId: stats.id,
                statsPersistedAt: toISOString(startedAt + 100),
            });

            await stats.stopCapturing();
            stats.reset();

            expect(stats.toJSON()).toEqual({
                crawlerFinishedAt: null,
                crawlerRuntimeMillis: 0,
                crawlerLastStartTimestamp: 1100,
                crawlerStartedAt: null,
                requestAvgFailedDurationMillis: Infinity,
                requestAvgFinishedDurationMillis: Infinity,
                requestMaxDurationMillis: 0,
                requestMinDurationMillis: Infinity,
                requestRetryHistogram: [],
                requestTotalDurationMillis: 0,
                requestTotalFailedDurationMillis: 0,
                requestTotalFinishedDurationMillis: 0,
                requestsFailed: 0,
                requestsFailedPerMinute: 0,
                requestsFinished: 0,
                requestsFinishedPerMinute: 0,
                requestsRetries: 0,
                requestsTotal: 0,
                statsId: stats.id,
                statsPersistedAt: toISOString(startedAt + 100),
            });

            await stats.startCapturing();

            stats.startJob(1);
            vitest.advanceTimersByTime(100);
            stats.finishJob(1);

            vitest.advanceTimersByTime(1000);

            expect(stats.toJSON()).toEqual({
                crawlerRuntimeMillis: 2200,
                crawlerLastStartTimestamp: 0,
                crawlerFinishedAt: toISOString(startedAt + 100),
                crawlerStartedAt: toISOString(startedAt + 100),
                requestAvgFailedDurationMillis: Infinity,
                requestAvgFinishedDurationMillis: 100,
                requestMaxDurationMillis: 100,
                requestMinDurationMillis: 100,
                requestRetryHistogram: [2],
                requestTotalDurationMillis: 200,
                requestTotalFailedDurationMillis: 0,
                requestTotalFinishedDurationMillis: 200,
                requestsFailed: 0,
                requestsFailedPerMinute: 0,
                requestsFinished: 2,
                requestsFinishedPerMinute: 55,
                requestsRetries: 0,
                requestsTotal: 2,
                statsId: stats.id,
                statsPersistedAt: toISOString(startedAt + 1200),
            });

            vitest.advanceTimersByTime(10000);

            expect(stats.calculate()).toEqual({
                crawlerRuntimeMillis: 12200,
                requestAvgFailedDurationMillis: Infinity,
                requestAvgFinishedDurationMillis: 100,
                requestTotalDurationMillis: 200,
                requestsFailedPerMinute: 0,
                requestsFinishedPerMinute: getPerMinute(2, 12200),
                requestsTotal: 2,
            });

             */
        });

        test('should remove persist state event listener', async () => {
            const events = serviceLocator.getEventManager();
            await stats.startCapturing();
            expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(1);
            await stats.stopCapturing();

            expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(0);
            await stats.startCapturing();
            expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(1);
            stats.reset();

            expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(0);
        });

        test('on persistState event', async () => {
            stats.startJob(0);
            vitest.advanceTimersByTime(100);
            stats.finishJob(0, 0);

            await stats.startCapturing(); // keyValueStore is initialized here

            const state = stats.toJSON();
            // @ts-expect-error Accessing private prop
            const setValueSpy = vitest.spyOn(stats.keyValueStore, 'setValue');

            serviceLocator.getEventManager().emit(EventType.PERSIST_STATE);

            // TODO: these properties don't exist on the calculate return type
            // @ts-expect-error Incorrect types?
            const { retryHistogram, finished, failed, ...rest } = stats.calculate();

            expect(setValueSpy).toBeCalledWith(
                // @ts-expect-error Accessing private prop
                stats.persistStateKey,
                { ...state, ...rest },
            );
        }, 2000);
    });

    test('should finish a job', () => {
        stats.startJob(0);
        vitest.advanceTimersByTime(1);
        stats.finishJob(0, 0);
        vitest.advanceTimersByTime(1);
        const current = stats.calculate();
        expect(current).toEqual({
            crawlerRuntimeMillis: 2,
            requestAvgFailedDurationMillis: Infinity,
            requestAvgFinishedDurationMillis: 1,
            requestTotalDurationMillis: 1,
            requestsFailedPerMinute: 0,
            requestsFinishedPerMinute: getPerMinute(1, 2),
            requestsTotal: 1,
        });
    });

    test('should fail a job', () => {
        stats.startJob(0);
        vitest.advanceTimersByTime(0);
        stats.failJob(0, 0);
        vitest.advanceTimersByTime(1);
        const current = stats.calculate();
        expect(current).toEqual({
            crawlerRuntimeMillis: 1,
            requestAvgFailedDurationMillis: Infinity,
            requestAvgFinishedDurationMillis: Infinity,
            requestTotalDurationMillis: 0,
            requestsFailedPerMinute: 60000,
            requestsFinishedPerMinute: 0,
            requestsTotal: 1,
        });
        expect(stats.requestRetryHistogram).toEqual([1]);
    });

    test('should collect retries', () => {
        stats.startJob(0);
        stats.startJob(1);
        stats.startJob(2);
        stats.finishJob(0, 0);
        stats.finishJob(1, 1);
        stats.finishJob(2, 2);
        const current = stats.calculate();
        expect(current).toEqual({
            crawlerRuntimeMillis: 0,
            requestAvgFailedDurationMillis: Infinity,
            requestAvgFinishedDurationMillis: Infinity,
            requestTotalDurationMillis: 0,
            requestsFailedPerMinute: 0,
            requestsFinishedPerMinute: Infinity,
            requestsTotal: 3,
        });
        expect(stats.requestRetryHistogram).toEqual([1, 1, 1]);
    });

    test('should return correct stats for multiple parallel jobs', () => {
        stats.startJob(0);
        vitest.advanceTimersByTime(1);
        stats.startJob(1);
        vitest.advanceTimersByTime(1);
        stats.startJob(2);
        vitest.advanceTimersByTime(2);
        stats.finishJob(1, 0); // runtime: 3ms
        vitest.advanceTimersByTime(1); // since startedAt: 5ms
        stats.failJob(0, 0); // runtime: irrelevant
        vitest.advanceTimersByTime(10);
        stats.finishJob(2, 0); // runtime: 13ms
        vitest.advanceTimersByTime(10); // since startedAt: 25ms

        const current = stats.calculate();
        expect(current).toEqual({
            crawlerRuntimeMillis: 25,
            requestAvgFailedDurationMillis: 5,
            requestAvgFinishedDurationMillis: (13 + 3) / 2,
            requestTotalDurationMillis: 21,
            requestsFailedPerMinute: 2400,
            requestsFinishedPerMinute: getPerMinute(2, 25),
            requestsTotal: 3,
        });
        expect(stats.state).toMatchObject({
            requestsFailed: 1,
            requestsFinished: 2,
        });
        expect(stats.requestRetryHistogram).toEqual([3]);
    });

    test('should regularly log stats', async () => {
        const logged: [string, Dictionary | undefined | null][] = [];
        // @ts-expect-error Accessing private prop
        const infoSpy = vitest.spyOn(stats.log, 'info');
        infoSpy.mockImplementation((message: string, data?: Record<string, any> | null) => {
            logged.push([message, data]);
        });

        stats.startJob(0);
        vitest.advanceTimersByTime(1);
        stats.finishJob(0, 0);
        await stats.startCapturing();
        vitest.advanceTimersByTime(50000);
        expect(logged).toHaveLength(0);
        vitest.advanceTimersByTime(10001);
        expect(logged).toHaveLength(1);
        expect(logged[0][0]).toBe('Statistics');
        expect(logged[0][1]).toEqual({
            crawlerRuntimeMillis: 60001,
            requestAvgFailedDurationMillis: Infinity,
            requestAvgFinishedDurationMillis: 1,
            requestTotalDurationMillis: 1,
            requestsFailedPerMinute: 0,
            requestsFinishedPerMinute: 1,
            requestsTotal: 1,
            retryHistogram: [1],
        });
        await stats.stopCapturing();
        vitest.advanceTimersByTime(60001);
        expect(logged).toHaveLength(1);
        expect(logged[0][0]).toBe('Statistics');
        expect(logged[0][1]).toEqual({
            crawlerRuntimeMillis: 60001,
            requestAvgFailedDurationMillis: Infinity,
            requestAvgFinishedDurationMillis: 1,
            requestTotalDurationMillis: 1,
            requestsFailedPerMinute: 0,
            requestsFinishedPerMinute: 1,
            requestsTotal: 1,
            retryHistogram: [1],
        });
    });

    test('should reset stats', async () => {
        await stats.startCapturing();
        stats.startJob(1);
        vitest.advanceTimersByTime(3);
        stats.finishJob(1, 0);
        expect(stats.state.requestsFinished).toEqual(1);
        expect(stats.requestRetryHistogram).toEqual([1]);
        stats.reset();
        expect(stats.state.requestsFinished).toEqual(0);
        expect(stats.requestRetryHistogram).toEqual([]);
    });

    test('should throw when startCapturing is called while already capturing', async () => {
        await stats.startCapturing();

        await expect(stats.startCapturing()).rejects.toThrow('already capturing');

        await stats.stopCapturing();
        // stopCapturing tears the interval down, so capturing can be resumed on the same instance.
        await expect(stats.startCapturing()).resolves.toBeUndefined();
        await stats.stopCapturing();
    });

    describe('custom state fields', () => {
        /** Persists `productsFound: 7` and one finished request under `id`, returning the key it was written to. */
        const persistCustomState = async (id: string) => {
            const stats = new Statistics({ id, defaultState: { productsFound: 0 } });

            await stats.startCapturing();
            stats.startJob(0);
            stats.finishJob(0, 0);
            stats.state.productsFound = 7;
            await stats.stopCapturing();

            // @ts-expect-error Accessing protected prop
            return stats.persistStateKey as string;
        };

        /** Loads whatever was persisted under `options.id` and returns the resulting state. */
        const loadState = async <T extends object>(options: StatisticsOptions<T>) => {
            const stats = new Statistics(options);

            await stats.startCapturing();
            await stats.stopCapturing();

            return stats.state;
        };

        test('should expose the custom fields and restore their defaults on reset', () => {
            const stats = new Statistics({
                defaultState: { productsFound: 0, seenPerDomain: {} as Record<string, number> },
            });

            stats.state.productsFound += 3;
            stats.state.seenPerDomain['example.com'] = 1;
            stats.reset();

            expect(stats.state.productsFound).toEqual(0);
            // the nested default is cloned per reset, not shared with the previous state
            expect(stats.state.seenPerDomain).toEqual({});

            // @ts-expect-error `categoriesFound` was not declared in `defaultState`
            stats.state.categoriesFound = 1;
        });

        test('should restore the persisted custom fields, keeping the defaults of ones the record lacks', async () => {
            await persistCustomState('grown-stats');

            const state = await loadState({
                id: 'grown-stats',
                // `categoriesFound` was declared after the state above was persisted
                defaultState: { productsFound: 0, categoriesFound: 42 },
            });

            expect(state.productsFound).toEqual(7);
            expect(state.categoriesFound).toEqual(42);
        });

        test('should restore the custom fields through the schema', async () => {
            await persistCustomState('schema-stats');

            const state = await loadState({
                id: 'schema-stats',
                defaultState: { productsFound: 0 },
                stateSchema: z.object({ productsFound: z.number() }),
            });

            expect(state.productsFound).toEqual(7);
        });

        test('should fall back to the defaults when the persisted custom fields fail the schema', async () => {
            const persistStateKey = await persistCustomState('validated-stats');

            const store = await KeyValueStore.open();
            const persisted = await store.getValue<Dictionary>(persistStateKey);
            await store.setValue(persistStateKey, { ...persisted, productsFound: 'not a number' });

            const state = await loadState({
                id: 'validated-stats',
                defaultState: { productsFound: 0 },
                stateSchema: z.object({ productsFound: z.number() }),
            });

            expect(state.productsFound).toEqual(0);
            // the built-in fields still load - only the custom ones are rejected
            expect(state.requestsFinished).toEqual(1);
        });
    });

    describe('explicit id option', () => {
        test('statistics with same explicit id should share persisted state', async () => {
            const stats1 = new Statistics({ id: 'shared-stats' });
            stats1.startJob(0);
            vitest.advanceTimersByTime(100);
            stats1.finishJob(0, 0);

            await stats1.startCapturing();
            await stats1.persistState();
            await stats1.stopCapturing();

            const stats2 = new Statistics({ id: 'shared-stats' });
            await stats2.startCapturing();

            expect(stats2.state.requestsFinished).toEqual(1);

            await stats2.stopCapturing();
        });

        test('statistics with different explicit ids should have isolated state', async () => {
            const statsA = new Statistics({ id: 'stats-a' });
            statsA.startJob(0);
            vitest.advanceTimersByTime(100);
            statsA.finishJob(0, 0);

            await statsA.startCapturing();
            await statsA.persistState();
            await statsA.stopCapturing();

            const statsB = new Statistics({ id: 'stats-b' });
            await statsB.startCapturing();

            expect(statsB.state.requestsFinished).toEqual(0);

            await statsB.stopCapturing();
        });
    });
});
