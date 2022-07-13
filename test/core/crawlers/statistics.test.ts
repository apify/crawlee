import { Statistics, Configuration, EventType } from '@crawlee/core';
import type { Dictionary } from '@crawlee/utils';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

describe('Statistics', () => {
    const getPerMinute = (jobCount: number, totalTickMillis: number) => {
        return Math.round(jobCount / (totalTickMillis / 1000 / 60));
    };

    let stats: Statistics;
    const localStorageEmulator = new MemoryStorageEmulator();
    const events = Configuration.getEventManager();

    beforeAll(async () => {
        jest.useFakeTimers();
    });

    beforeEach(async () => {
        await localStorageEmulator.init();
        stats = new Statistics();
    });

    afterEach(async () => {
        events.off(EventType.PERSIST_STATE);
        stats = null;
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
        // eslint-disable-next-line dot-notation
        Statistics['id'] = 0;
    });

    describe('persist state', () => {
        // needs to go first for predictability
        test('should increment id by each new consecutive instance', () => {
            expect(stats.id).toEqual(0);
            // @ts-expect-error Accessing private prop
            expect(Statistics.id).toEqual(1);
            // @ts-expect-error Accessing private prop
            expect(stats.persistStateKey).toEqual('SDK_CRAWLER_STATISTICS_0');
            const [n1, n2] = [new Statistics(), new Statistics()];
            expect(n1.id).toEqual(1);
            expect(n2.id).toEqual(2);
            // @ts-expect-error Accessing private prop
            expect(Statistics.id).toEqual(3);
        });

        test('should persist the state to KV and load again', async () => {
            const startedAt = 1000;
            jest.advanceTimersByTime(startedAt);
            stats.startJob(0);
            jest.advanceTimersByTime(100);
            stats.finishJob(0);

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
            jest.advanceTimersByTime(100);
            stats.finishJob(1);

            jest.advanceTimersByTime(1000);

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

            jest.advanceTimersByTime(10000);

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
            jest.advanceTimersByTime(100);
            stats.finishJob(0);

            await stats.startCapturing(); // keyValueStore is initialized here

            const state = stats.toJSON();
            // @ts-expect-error Accessing private prop
            const setValueSpy = jest.spyOn(stats.keyValueStore, 'setValue');

            events.emit(EventType.PERSIST_STATE);

            // TODO: these properties don't exist on the calculate return type
            // @ts-expect-error Incorrect types?
            const { retryHistogram, finished, failed, ...rest } = stats.calculate();

            // @ts-expect-error Accessing private prop
            expect(setValueSpy).toBeCalledWith(stats.persistStateKey, { ...state, ...rest });
            setValueSpy.mockRestore();
        }, 2000);
    });

    test('should finish a job', () => {
        stats.startJob(0);
        jest.advanceTimersByTime(1);
        stats.finishJob(0);
        jest.advanceTimersByTime(1);
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
        jest.advanceTimersByTime(0);
        stats.failJob(0);
        jest.advanceTimersByTime(1);
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
        stats.finishJob(0);
        stats.startJob(1);
        stats.startJob(2);
        stats.finishJob(1);
        stats.startJob(2);
        stats.finishJob(2);
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
        jest.advanceTimersByTime(1);
        stats.startJob(1);
        jest.advanceTimersByTime(1);
        stats.startJob(2);
        jest.advanceTimersByTime(2);
        stats.finishJob(1); // runtime: 3ms
        jest.advanceTimersByTime(1); // since startedAt: 5ms
        stats.failJob(0); // runtime: irrelevant
        jest.advanceTimersByTime(10);
        stats.finishJob(2); // runtime: 13ms
        jest.advanceTimersByTime(10); // since startedAt: 25ms

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
        const logged: [string, Dictionary?][] = [];
        // @ts-expect-error Accessing private prop
        const infoSpy = jest.spyOn(stats.log, 'info');
        infoSpy.mockImplementation((...args) => {
            logged.push(args);
        });

        stats.startJob(0);
        jest.advanceTimersByTime(1);
        stats.finishJob(0);
        await stats.startCapturing();
        jest.advanceTimersByTime(50000);
        expect(logged).toHaveLength(0);
        jest.advanceTimersByTime(10001);
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
        jest.advanceTimersByTime(60001);
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
        infoSpy.mockRestore();
    });

    test('should reset stats', async () => {
        await stats.startCapturing();
        stats.startJob(1);
        jest.advanceTimersByTime(3);
        stats.finishJob(1);
        expect(stats.state.requestsFinished).toEqual(1);
        expect(stats.requestRetryHistogram).toEqual([1]);
        stats.reset();
        expect(stats.state.requestsFinished).toEqual(0);
        expect(stats.requestRetryHistogram).toEqual([]);
    });
});
