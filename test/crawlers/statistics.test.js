import sinon from 'sinon';
import Statistics from '../../build/crawlers/statistics';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';
import events from '../../build/events';
import { ACTOR_EVENT_NAMES_EX } from '../../build/constants';

describe('Statistics', () => {
    const getPerMinute = (jobCount, totalTickMillis) => {
        return Math.round(jobCount / (totalTickMillis / 1000 / 60));
    };

    const toISOString = date => new Date(date).toISOString();

    let clock;
    let stats;
    let localStorageEmulator;

    beforeAll(async () => {
        localStorageEmulator = new LocalStorageDirEmulator();
    });

    beforeEach(async () => {
        await localStorageEmulator.init();
        clock = sinon.useFakeTimers();
        stats = new Statistics();
    });

    afterEach(async () => {
        events.removeAllListeners(ACTOR_EVENT_NAMES_EX.PERSIST_STATE);
        clock.restore();
        stats = null;
        clock = null;
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    describe('persist state', () => {
        // needs to go first for predictability
        test('should increment id by each new consecutive instance', () => {
            expect(stats.id).toEqual(0);
            expect(Statistics.id).toEqual(1);
            expect(stats.persistStateKey).toEqual('SDK_CRAWLER_STATISTICS_0');
            const [n1, n2] = [new Statistics(), new Statistics()];
            expect(n1.id).toEqual(1);
            expect(n2.id).toEqual(2);
            expect(Statistics.id).toEqual(3);
        });

        test('should persist the state to KV and load again', async () => {
            const startedAt = 1000;
            clock.tick(startedAt);
            stats.startJob(0);
            clock.tick(100);
            stats.finishJob(0);

            await stats.startCapturing();
            await stats.persistState();

            const state = await stats.keyValueStore.getValue(stats.persistStateKey);

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
            clock.tick(100);
            stats.finishJob(1);

            clock.tick(1000);

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

            clock.tick(10000);

            expect(stats.calculate()).toEqual({
                crawlerRuntimeMillis: 12200,
                requestAvgFailedDurationMillis: Infinity,
                requestAvgFinishedDurationMillis: 100,
                requestTotalDurationMillis: 200,
                requestsFailedPerMinute: 0,
                requestsFinishedPerMinute: getPerMinute(2, 12200),
                requestsTotal: 2,
            });
        });

        test('should remove persist state event listener', async () => {
            await stats.startCapturing();
            expect(events.listenerCount(ACTOR_EVENT_NAMES_EX.PERSIST_STATE)).toEqual(1);
            await stats.stopCapturing();

            expect(events.listenerCount(ACTOR_EVENT_NAMES_EX.PERSIST_STATE)).toEqual(0);
            await stats.startCapturing();
            expect(events.listenerCount(ACTOR_EVENT_NAMES_EX.PERSIST_STATE)).toEqual(1);
            stats.reset();

            expect(events.listenerCount(ACTOR_EVENT_NAMES_EX.PERSIST_STATE)).toEqual(0);
        });

        test('on persistState event', async () => {
            stats.startJob(0);
            clock.tick(100);
            stats.finishJob(0);

            await stats.startCapturing(); // keyValueStore is initialized here

            const state = stats.toJSON();
            const spy = sinon.spy(stats.keyValueStore, 'setValue');

            events.emit(ACTOR_EVENT_NAMES_EX.PERSIST_STATE);

            const { retryHistogram, finished, failed, ...rest } = stats.calculate();

            expect(spy.getCall(0).args).toEqual([stats.persistStateKey, { ...state, ...rest }]);
        }, 2000);
    });

    test('should finish a job', () => {
        stats.startJob(0);
        clock.tick(1);
        stats.finishJob(0);
        clock.tick(1);
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
        clock.tick(0);
        stats.failJob(0);
        clock.tick(1);
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
        clock.tick(1);
        stats.startJob(1);
        clock.tick(1);
        stats.startJob(2);
        clock.tick(2);
        stats.finishJob(1); // runtime: 3ms
        clock.tick(1); // since startedAt: 5ms
        stats.failJob(0); // runtime: irrelevant
        clock.tick(10);
        stats.finishJob(2); // runtime: 13ms
        clock.tick(10); // since startedAt: 25ms

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
        const logged = [];
        sinon.stub(stats.log, 'info').callsFake((...args) => {
            logged.push(args);
        });

        stats.startJob(0);
        clock.tick(1);
        stats.finishJob(0);
        await stats.startCapturing();
        clock.tick(50000);
        expect(logged).toHaveLength(0);
        clock.tick(10001);
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
        clock.tick(60001);
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
        clock.tick(3);
        stats.finishJob(1);
        expect(stats.state.requestsFinished).toEqual(1);
        expect(stats.requestRetryHistogram).toEqual([1]);
        stats.reset();
        expect(stats.state.requestsFinished).toEqual(0);
        expect(stats.requestRetryHistogram).toEqual([]);
    });
});
