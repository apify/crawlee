import sinon from 'sinon';
import Statistics from '../../build/crawlers/statistics';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';
import events from '../../build/events';
import { ACTOR_EVENT_NAMES_EX } from '../../build/constants';

describe('Statistics', () => {
    const getPerMinute = (jobCount, totalTickMillis) => {
        return Math.round(jobCount / (totalTickMillis / 1000 / 60));
    };

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
            expect(stats.persistStateKey).toEqual('STATISTICS_STATE_0');
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
                jobRetryHistogram: [1],
                finishedJobs: 1,
                failedJobs: 0,
                persistedAt: startedAt + 100,
                totalJobDurationMillis: 100,
                startedAt,
            });

            await stats.stopCapturing();
            stats.reset();

            expect(stats.toJSON()).toEqual({
                jobRetryHistogram: [],
                finishedJobs: 0,
                failedJobs: 0,
                persistedAt: startedAt + 100,
                totalJobDurationMillis: 0,
                startedAt: 0,
            });

            await stats.startCapturing();

            stats.startJob(1);
            clock.tick(100);
            stats.finishJob(1);

            clock.tick(1000);

            expect(stats.toJSON()).toEqual({
                jobRetryHistogram: [2],
                finishedJobs: 2,
                failedJobs: 0,
                persistedAt: startedAt + 1200,
                totalJobDurationMillis: 200,
                startedAt,
            });

            clock.tick(10000);

            expect(stats.getCurrent()).toEqual({
                avgDurationMillis: 100,
                perMinute: getPerMinute(2, 11200),
                finished: 2,
                failed: 0,
                retryHistogram: [2],
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

            expect(spy.getCall(0).args).toEqual([stats.persistStateKey, state]);
        }, 2000);
    });

    test('should finish a job', () => {
        stats.startJob(0);
        clock.tick(1);
        stats.finishJob(0);
        clock.tick(1);
        const current = stats.getCurrent();
        expect(current).toEqual({
            avgDurationMillis: 1,
            perMinute: getPerMinute(1, 2),
            finished: 1,
            failed: 0,
            retryHistogram: [1],
        });
    });

    test('should fail a job', () => {
        stats.startJob(0);
        clock.tick(0);
        stats.failJob(0);
        clock.tick(1);
        const current = stats.getCurrent();
        expect(current).toEqual({
            avgDurationMillis: Infinity,
            perMinute: 0,
            finished: 0,
            failed: 1,
            retryHistogram: [1],
        });
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
        const current = stats.getCurrent();
        expect(current).toEqual({
            avgDurationMillis: Infinity,
            perMinute: Infinity,
            finished: 3,
            failed: 0,
            retryHistogram: [1, 1, 1],
        });
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

        const current = stats.getCurrent();
        expect(current).toEqual({
            avgDurationMillis: (13 + 3) / 2,
            perMinute: getPerMinute(2, 25),
            finished: 2,
            failed: 1,
            retryHistogram: [3],
        });
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
            avgDurationMillis: 1,
            perMinute: 1,
            finished: 1,
            failed: 0,
            retryHistogram: [1],
        });
        await stats.stopCapturing();
        clock.tick(60001);
        expect(logged).toHaveLength(1);
        expect(logged[0][0]).toBe('Statistics');
        expect(logged[0][1]).toEqual({
            avgDurationMillis: 1,
            perMinute: 1,
            finished: 1,
            failed: 0,
            retryHistogram: [1],
        });
    });

    test('should reset stats', async () => {
        await stats.startCapturing();
        stats.startJob(1);
        clock.tick(3);
        stats.finishJob(1);
        let current = stats.getCurrent();
        expect(current.finished).toEqual(1);
        expect(current.retryHistogram).toEqual([1]);
        stats.reset();
        current = stats.getCurrent();
        expect(current.finished).toEqual(0);
        expect(current.retryHistogram).toEqual([]);
    });
});
