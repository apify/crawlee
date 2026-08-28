import type { StatisticsOptions } from '@crawlee/core';
import type { StatisticPersistedState } from '@crawlee/core';
import { EventType, KeyValueStore, MemoryStorageBackend, serviceLocator, Statistics } from '@crawlee/core';
import type { Dictionary } from '@crawlee/types';
import { z } from 'zod';

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

    describe('persist state', () => {
        // needs to go first for predictability
        test('should increment id by each new consecutive instance', async () => {
            expect(stats.id).toEqual('0');

            // the id is what the record is keyed by
            await stats.startCapturing();
            await stats.stopCapturing();
            expect(await store.getValue('CRAWLEE_CRAWLER_STATISTICS_0')).not.toBeNull();

            const [n1, n2] = [new Statistics(), new Statistics()];
            expect(n1.id).toEqual('1');
            expect(n2.id).toEqual('2');
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

        test('should write the record when the run is too short to have a rate', async () => {
            // Everything inside one millisecond: `calculate()` divides by a zero-length run and reports the
            // per-minute rates as `Infinity`, which the record can only carry as `null`.
            stats.startJob(0);
            stats.finishJob(0, 0);
            stats.startJob(1);
            stats.failJob(1, 0);

            await stats.startCapturing();
            await stats.persistState();

            expect(await store.getValue<StatisticPersistedState>(persistStateKey(stats))).toMatchObject({
                requestsFinished: 1,
                requestsFailed: 1,
                requestsFinishedPerMinute: null,
                requestsFailedPerMinute: null,
            });

            await stats.stopCapturing();
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

        test('an explicit id restores state across instances under a stable key', async () => {
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

    describe('custom state fields', () => {
        /** Persists `productsFound: 7` and one finished request under `id`. */
        const persistCustomState = async (id: string) => {
            const stats = new Statistics({ id, stateExtension: { defaultState: { productsFound: 0 } } });

            await stats.startCapturing();
            stats.startJob(0);
            stats.finishJob(0, 0);
            stats.state.productsFound = 7;
            await stats.stopCapturing();
        };

        /** Loads whatever was persisted under `options.id` and returns the resulting state. */
        const loadState = async <T extends object, P extends object = T>(options: StatisticsOptions<T, P>) => {
            const stats = new Statistics(options);

            await stats.startCapturing();
            await stats.stopCapturing();

            return stats.state;
        };

        test('should expose the custom fields and restore their defaults on reset', () => {
            const stats = new Statistics({
                stateExtension: { defaultState: { productsFound: 0, seenPerDomain: {} as Record<string, number> } },
            });

            stats.state.productsFound += 3;
            stats.state.seenPerDomain['example.com'] = 1;
            stats.reset();

            expect(stats.state.productsFound).toEqual(0);
            // the nested default is cloned per reset, not shared with the previous state
            expect(stats.state.seenPerDomain).toEqual({});

            // @ts-expect-error `categoriesFound` was not declared
            stats.state.categoriesFound = 1;
        });

        test('should restore the persisted custom fields, keeping the defaults of ones the record lacks', async () => {
            await persistCustomState('grown-stats');

            const state = await loadState({
                id: 'grown-stats',
                // `categoriesFound` was declared after the state above was persisted
                stateExtension: { defaultState: { productsFound: 0, categoriesFound: 42 } },
            });

            expect(state.productsFound).toEqual(7);
            expect(state.categoriesFound).toEqual(42);
        });

        test('should reject a custom field that collides with a built-in one', () => {
            expect(() => new Statistics({ stateExtension: { defaultState: { requestsFinished: 999 } } })).toThrow(
                /`requestsFinished` collides with a built-in one/,
            );
        });

        test('should keep a default value that JSON cannot carry', () => {
            const stats = new Statistics({ stateExtension: { defaultState: { budget: Infinity } } });

            stats.state.budget -= 1;
            stats.reset();

            // `structuredClone`, as in RecoverableState - the JSON the record is written as would make this a `null`
            expect(stats.state.budget).toEqual(Infinity);
        });

        describe('with a deserialize conversion', () => {
            const productsFound = z.object({ productsFound: z.number().default(0) });

            test('should derive the defaults from the conversion', () => {
                const stats = new Statistics({ stateExtension: { deserialize: productsFound } });

                expect(stats.state.productsFound).toEqual(0);

                stats.state.productsFound += 3;
                stats.reset();

                expect(stats.state.productsFound).toEqual(0);
            });

            test('should throw when the defaults cannot be derived', () => {
                expect(
                    () => new Statistics({ stateExtension: { deserialize: z.object({ productsFound: z.number() }) } }),
                ).toThrow(/Could not derive the default values .* give every field a default/s);
            });

            test('should restore the custom fields it validates', async () => {
                await persistCustomState('validated-stats');

                const state = await loadState({
                    id: 'validated-stats',
                    stateExtension: { deserialize: productsFound },
                });

                expect(state.productsFound).toEqual(7);
            });

            test('should start only the custom fields from scratch on a record it rejects', async () => {
                await persistCustomState('corrupt-custom-stats');

                const record = (await store.getValue<Dictionary>(`CRAWLEE_CRAWLER_STATISTICS_corrupt-custom-stats`))!;
                await store.setValue(`CRAWLEE_CRAWLER_STATISTICS_corrupt-custom-stats`, {
                    ...record,
                    productsFound: 'plenty',
                });

                const stats = new Statistics({
                    id: 'corrupt-custom-stats',
                    stateExtension: { deserialize: productsFound },
                });
                // @ts-expect-error Accessing private prop
                const warningSpy = vitest.spyOn(stats.log, 'warning').mockImplementation(() => {});

                await stats.startCapturing();

                expect(warningSpy).toHaveBeenCalledWith(
                    expect.stringContaining('starting those from scratch'),
                    expect.objectContaining({ persistStateKey: 'CRAWLEE_CRAWLER_STATISTICS_corrupt-custom-stats' }),
                );
                // the custom field lost its value, the crawler's own counters did not
                expect(stats.state.productsFound).toEqual(0);
                expect(stats.state.requestsFinished).toEqual(1);

                await stats.stopCapturing();
            });

            test('should take the record at its word without one', async () => {
                await persistCustomState('trusted-stats');

                const record = (await store.getValue<Dictionary>(`CRAWLEE_CRAWLER_STATISTICS_trusted-stats`))!;
                await store.setValue(`CRAWLEE_CRAWLER_STATISTICS_trusted-stats`, {
                    ...record,
                    productsFound: 'plenty',
                });

                const state = await loadState({
                    id: 'trusted-stats',
                    stateExtension: { defaultState: { productsFound: 0 } },
                });

                // the documented cost of declaring the fields without a conversion to check them with
                expect(state.productsFound).toEqual('plenty');
            });
        });

        test('should round-trip a field that is not JSON through a serialize/deserialize pair', async () => {
            const stateExtension = {
                deserialize: z.object({ lastSeenAt: z.coerce.date().default(() => new Date(0)) }),
                serialize: ({ lastSeenAt }: { lastSeenAt: Date }) => ({ lastSeenAt: lastSeenAt.toISOString() }),
            };

            const stats = new Statistics({ id: 'date-stats', stateExtension });
            await stats.startCapturing();
            stats.state.lastSeenAt = new Date('2020-01-01T00:00:00.000Z');
            await stats.stopCapturing();

            expect(await store.getValue<Dictionary>('CRAWLEE_CRAWLER_STATISTICS_date-stats')).toMatchObject({
                lastSeenAt: '2020-01-01T00:00:00.000Z',
            });

            const restored = await loadState({ id: 'date-stats', stateExtension });

            expect(restored.lastSeenAt).toEqual(new Date('2020-01-01T00:00:00.000Z'));
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
