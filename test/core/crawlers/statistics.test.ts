import type { StatisticPersistedState, StatisticState } from '@crawlee/core';
import { EventType, KeyValueStore, MemoryStorageBackend, serviceLocator, Statistics } from '@crawlee/core';
import type { Dictionary } from '@crawlee/types';

describe('Statistics', () => {
    const getPerMinute = (jobCount: number, totalTickMillis: number) => {
        return Math.round(jobCount / (totalTickMillis / 1000 / 60));
    };

    const persistStateKey = (statistics: Statistics) => `CRAWLEE_CRAWLER_STATISTICS_${statistics.id}`;

    let stats: Statistics;
    let store: KeyValueStore;

    beforeAll(async () => {
        vitest.useFakeTimers();
    });

    beforeEach(async () => {
        // Restarted for every test so that the timestamps of a persisted record are predictable.
        vitest.setSystemTime(0);
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        stats = new Statistics();
        store = await KeyValueStore.open();
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
            vitest.advanceTimersByTime(1000);
            stats.startJob(0);
            vitest.advanceTimersByTime(100);
            stats.finishJob(0, 1);
            stats.registerStatusCode(200);

            await stats.startCapturing();
            await stats.stopCapturing();

            const restored = new Statistics({ id: stats.id });
            vitest.advanceTimersByTime(5000);
            await restored.startCapturing();

            expect(restored.state).toMatchObject({
                requestsFinished: 1,
                requestsRetries: 1,
                requestTotalFinishedDurationMillis: 100,
                requestMinDurationMillis: 100,
                requestMaxDurationMillis: 100,
                crawlerStartedAt: stats.state.crawlerStartedAt,
            });
            // JSON writes the hole left by a retry count that never occurred as a `null` - it is restored as the
            // zero requests it stands for.
            expect(restored.requestRetryHistogram).toEqual([0, 1]);
            // The gap between the two runs is not counted, but the first run's runtime is.
            expect(restored.calculate().crawlerRuntimeMillis).toEqual(1100);

            await restored.stopCapturing();
        });

        test('should restore an Infinity minimum duration written out as null', async () => {
            await stats.startCapturing();
            await stats.stopCapturing();

            const record = await store.getValue<StatisticPersistedState>(persistStateKey(stats));
            expect(record!.requestMinDurationMillis).toBeNull();

            const restored = new Statistics({ id: stats.id });
            await restored.startCapturing();

            expect(restored.state.requestMinDurationMillis).toEqual(Infinity);

            // The whole point of the minimum - a `duration < null` comparison would never win.
            restored.startJob(0);
            vitest.advanceTimersByTime(100);
            restored.finishJob(0, 0);
            expect(restored.state.requestMinDurationMillis).toEqual(100);

            await restored.stopCapturing();
        });

        test('should start from scratch on a record it cannot make sense of', async () => {
            await stats.startCapturing();
            stats.startJob(0);
            vitest.advanceTimersByTime(100);
            stats.finishJob(0, 0);
            await stats.stopCapturing();

            const record = (await store.getValue<StatisticPersistedState>(persistStateKey(stats)))!;
            await store.setValue(persistStateKey(stats), { ...record, requestsFinished: 'plenty' });

            const restored = new Statistics({ id: stats.id });
            // @ts-expect-error Accessing private prop
            const warningSpy = vitest.spyOn(restored.log, 'warning').mockImplementation(() => {});

            // A corrupt counter must not take the crawl down with it, and must not be trusted either - an
            // increment on a string would poison every later one.
            await restored.startCapturing();

            expect(warningSpy).toHaveBeenCalledWith(
                expect.stringContaining('starting the statistics from scratch'),
                expect.objectContaining({ persistStateKey: persistStateKey(stats) }),
            );
            expect(restored.state.requestsFinished).toEqual(0);
            expect(restored.state.requestTotalFinishedDurationMillis).toEqual(0);

            await restored.stopCapturing();
        });

        test('should persist the extra fields of a subclass', async () => {
            type ExtendedState = StatisticState & { productsFound: number };

            class ExtendedStatistics extends Statistics {
                override get state(): ExtendedState {
                    return super.state as ExtendedState;
                }

                protected override defaultState(): ExtendedState {
                    return { ...super.defaultState(), productsFound: 0 };
                }
            }

            const extended = new ExtendedStatistics({ id: 'extended' });
            await extended.startCapturing();
            extended.state.productsFound = 7;
            await extended.persistState();

            // The record schema knows nothing about them, and must not drop them on the way through.
            expect(await store.getValue(persistStateKey(extended))).toMatchObject({ productsFound: 7 });

            await extended.stopCapturing();
        });

        test('should keep the shape of the persisted record', async () => {
            stats.startJob(0);
            vitest.advanceTimersByTime(100);
            stats.finishJob(0, 0);
            stats.registerStatusCode(200);

            await stats.startCapturing();
            await stats.persistState();

            const record = (await store.getValue<StatisticPersistedState>(persistStateKey(stats)))!;

            expect(record).toEqual({
                requestsFinished: 1,
                requestsFailed: 0,
                requestsRetries: 0,
                requestsFailedPerMinute: 0,
                requestsFinishedPerMinute: 600,
                requestMinDurationMillis: 100,
                requestMaxDurationMillis: 100,
                requestTotalFailedDurationMillis: 0,
                requestTotalFinishedDurationMillis: 100,
                crawlerStartedAt: '1970-01-01T00:00:00.100Z',
                crawlerFinishedAt: null,
                statsPersistedAt: '1970-01-01T00:00:00.100Z',
                crawlerRuntimeMillis: 100,
                crawlerLastStartTimestamp: 0,
                requestRetryHistogram: [1],
                statsId: stats.id,
                requestAvgFailedDurationMillis: null,
                requestAvgFinishedDurationMillis: 100,
                requestTotalDurationMillis: 100,
                requestsTotal: 1,
                requestsWithStatusCode: { 200: 1 },
                errors: {},
                retryErrors: {},
            });

            // The record is read by tooling outside Crawlee - the key order is part of its shape.
            expect(Object.keys(record)).toEqual([
                'requestsFinished',
                'requestsFailed',
                'requestsRetries',
                'requestsFailedPerMinute',
                'requestsFinishedPerMinute',
                'requestMinDurationMillis',
                'requestMaxDurationMillis',
                'requestTotalFailedDurationMillis',
                'requestTotalFinishedDurationMillis',
                'crawlerStartedAt',
                'crawlerFinishedAt',
                'statsPersistedAt',
                'crawlerRuntimeMillis',
                'crawlerLastStartTimestamp',
                'requestRetryHistogram',
                'statsId',
                'requestAvgFailedDurationMillis',
                'requestAvgFinishedDurationMillis',
                'requestTotalDurationMillis',
                'requestsTotal',
                'requestsWithStatusCode',
                'errors',
                'retryErrors',
            ]);

            await stats.stopCapturing();
        });

        test('should remove persist state event listener', async () => {
            const events = serviceLocator.getEventManager();
            await stats.startCapturing();
            expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(1);
            await stats.stopCapturing();

            expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(0);
            await stats.startCapturing();
            expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(1);
            await stats.stopCapturing();

            expect(events.listenerCount(EventType.PERSIST_STATE)).toEqual(0);
        });

        test('on persistState event', async () => {
            stats.startJob(0);
            vitest.advanceTimersByTime(100);
            stats.finishJob(0, 0);

            await stats.startCapturing();

            const state = stats.toJSON();

            serviceLocator.getEventManager().emit(EventType.PERSIST_STATE);
            await serviceLocator.getEventManager().waitForAllListenersToComplete();

            // `Infinity` does not survive JSON, so compare against what a record can hold.
            expect(await store.getValue(persistStateKey(stats))).toEqual(JSON.parse(JSON.stringify(state)));

            await stats.stopCapturing();
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

        // Resetting the counters does not end the capture - stopCapturing() is what does.
        expect(serviceLocator.getEventManager().listenerCount(EventType.PERSIST_STATE)).toEqual(1);
        await stats.stopCapturing();
    });

    test('should throw when startCapturing is called while already capturing', async () => {
        await stats.startCapturing();

        await expect(stats.startCapturing()).rejects.toThrow('already capturing');

        await stats.stopCapturing();
        // stopCapturing tears the interval down, so capturing can be resumed on the same instance.
        await expect(stats.startCapturing()).resolves.toBeUndefined();
        await stats.stopCapturing();
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
