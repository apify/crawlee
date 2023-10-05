import os from 'os';

import log from '@apify/log';
import { Configuration, EventType, LocalEventManager, Snapshotter } from '@crawlee/core';
import type { MemoryInfo } from '@crawlee/utils';
import { sleep } from '@crawlee/utils';

const toBytes = (x: number) => x * 1024 * 1024;

describe('Snapshotter', () => {
    let logLevel: number;
    beforeAll(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterAll(() => {
        log.setLevel(logLevel);
    });

    test('should collect snapshots with some values', async () => {
        // mock client data
        const apifyClient = Configuration.getStorageClient();
        const oldStats = apifyClient.stats;
        apifyClient.stats = {} as never;
        apifyClient.stats.rateLimitErrors = [0, 0, 0];

        const config = new Configuration({ systemInfoIntervalMillis: 100 });
        const snapshotter = new Snapshotter({ config });
        const events = config.getEventManager();
        await events.init();
        await snapshotter.start();

        await sleep(625);
        apifyClient.stats.rateLimitErrors = [0, 0, 2];
        await sleep(625);

        await snapshotter.stop();
        await events.close();
        const memorySnapshots = snapshotter.getMemorySample();
        const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const cpuSnapshots = snapshotter.getCpuSample();
        const clientSnapshots = snapshotter.getClientSample();

        expect(Array.isArray(cpuSnapshots)).toBe(true);
        expect(cpuSnapshots.length).toBeGreaterThanOrEqual(1);
        cpuSnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.usedRatio).toBe('number');
        });

        expect(Array.isArray(memorySnapshots)).toBe(true);
        expect(memorySnapshots.length).toBeGreaterThanOrEqual(1);
        memorySnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.usedBytes).toBe('number');
        });

        expect(Array.isArray(eventLoopSnapshots)).toBe(true);
        expect(eventLoopSnapshots.length).toBeGreaterThanOrEqual(2);
        eventLoopSnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.exceededMillis).toBe('number');
        });

        expect(Array.isArray(clientSnapshots)).toBe(true);
        expect(clientSnapshots.length).toBeGreaterThanOrEqual(1);
        clientSnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.rateLimitErrorCount).toBe('number');
        });

        apifyClient.stats = oldStats;
    });

    test('should override default timers', async () => {
        const config = new Configuration({ systemInfoIntervalMillis: 0.1 });
        const snapshotter = new Snapshotter({ config, eventLoopSnapshotIntervalSecs: 0.05 });
        await config.getEventManager().init();
        await snapshotter.start();
        await sleep(3 * 1e3);
        await snapshotter.stop();
        await config.getEventManager().close();
        const memorySnapshots = snapshotter.getMemorySample();
        const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const cpuSnapshots = snapshotter.getCpuSample();

        expect(cpuSnapshots.length).toBeGreaterThanOrEqual(5);
        expect(memorySnapshots.length).toBeGreaterThanOrEqual(5);
        expect(eventLoopSnapshots.length).toBeGreaterThanOrEqual(10);
    });

    test('correctly marks CPU overloaded using Platform event', async () => {
        let count = 0;
        const emitAndWait = async (delay: number) => {
            Configuration.getEventManager().emit(EventType.SYSTEM_INFO, {
                isCpuOverloaded: count % 2 === 0,
                createdAt: new Date().toISOString(),
                cpuCurrentUsage: 66.6,
            });
            count++;
            await sleep(delay);
        };

        const snapshotter = new Snapshotter();
        await snapshotter.start();
        await emitAndWait(10);
        await emitAndWait(10);
        await emitAndWait(10);
        await emitAndWait(0);
        await snapshotter.stop();
        const cpuSnapshots = snapshotter.getCpuSample();

        expect(cpuSnapshots).toHaveLength(4);
        cpuSnapshots.forEach((ss, i) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(ss.isOverloaded).toEqual(i % 2 === 0);
        });
    });

    test('correctly marks CPU overloaded using OS metrics', async () => {
        const cpusMock = vitest.spyOn(os, 'cpus');
        const fakeCpu = [{
            times: {
                idle: 0,
                other: 0,
            },
        }];
        const { times } = fakeCpu[0];

        cpusMock.mockReturnValue(fakeCpu as any);

        const noop = () => {};
        const config = new Configuration({ maxUsedCpuRatio: 0.5 });
        const snapshotter = new Snapshotter({ config });
        // do not initialize the event intervals as we will fire them manually
        const spy = vitest.spyOn(LocalEventManager.prototype, 'init').mockImplementation(async () => {});
        const events = config.getEventManager() as LocalEventManager;
        await snapshotter.start();

        await events.emitSystemInfoEvent(noop);

        times.idle++;
        times.other++;
        await events.emitSystemInfoEvent(noop);

        times.other += 2;
        await events.emitSystemInfoEvent(noop);

        times.idle += 2;
        await events.emitSystemInfoEvent(noop);

        times.other += 4;
        await events.emitSystemInfoEvent(noop);

        const loopSnapshots = snapshotter.getCpuSample();

        expect(loopSnapshots.length).toBe(5);
        expect(loopSnapshots[0].isOverloaded).toBe(false);
        expect(loopSnapshots[1].isOverloaded).toBe(false);
        expect(loopSnapshots[2].isOverloaded).toBe(true);
        expect(loopSnapshots[3].isOverloaded).toBe(false);
        expect(loopSnapshots[4].isOverloaded).toBe(true);
        expect(cpusMock).toBeCalledTimes(5);

        await snapshotter.stop();
    });

    test('correctly marks eventLoopOverloaded', () => {
        const clock = vitest.useFakeTimers();
        try {
            const noop = () => {};
            const snapshotter = new Snapshotter({ maxBlockedMillis: 5, eventLoopSnapshotIntervalSecs: 0 });
            // @ts-expect-error Calling protected method
            snapshotter._snapshotEventLoop(noop);
            clock.advanceTimersByTime(1);
            // @ts-expect-error Calling protected method
            snapshotter._snapshotEventLoop(noop);
            clock.advanceTimersByTime(2);
            // @ts-expect-error Calling protected method
            snapshotter._snapshotEventLoop(noop);
            clock.advanceTimersByTime(7);
            // @ts-expect-error Calling protected method
            snapshotter._snapshotEventLoop(noop);
            clock.advanceTimersByTime(3);
            // @ts-expect-error Calling protected method
            snapshotter._snapshotEventLoop(noop);
            const loopSnapshots = snapshotter.getEventLoopSample();

            expect(loopSnapshots.length).toBe(5);
            expect(loopSnapshots[0].isOverloaded).toBe(false);
            expect(loopSnapshots[1].isOverloaded).toBe(false);
            expect(loopSnapshots[2].isOverloaded).toBe(false);
            expect(loopSnapshots[3].isOverloaded).toBe(true);
            expect(loopSnapshots[4].isOverloaded).toBe(false);
        } finally {
            vitest.useRealTimers();
        }
    });

    test('correctly marks memoryOverloaded using OS metrics', async () => {
        const noop = () => {};
        const memoryData = {
            mainProcessBytes: toBytes(1000),
            childProcessesBytes: toBytes(1000),
        } as MemoryInfo;
        const getMemoryInfo = async () => ({ ...memoryData });
        vitest.spyOn(LocalEventManager.prototype as any, '_getMemoryInfo').mockImplementation(getMemoryInfo);
        vitest.spyOn(Snapshotter.prototype as any, '_getMemoryInfo').mockResolvedValueOnce({ totalBytes: toBytes(10000) });

        const config = new Configuration({ availableMemoryRatio: 1 });
        const snapshotter = new Snapshotter({ config, maxUsedMemoryRatio: 0.5 });
        // do not initialize the event intervals as we will fire them manually
        vitest.spyOn(LocalEventManager.prototype, 'init').mockImplementation(async () => {});
        const events = config.getEventManager() as LocalEventManager;
        await snapshotter.start();

        await events.emitSystemInfoEvent(noop);
        memoryData.mainProcessBytes = toBytes(2000);
        await events.emitSystemInfoEvent(noop);
        memoryData.childProcessesBytes = toBytes(2000);
        await events.emitSystemInfoEvent(noop);
        memoryData.mainProcessBytes = toBytes(3001);
        await events.emitSystemInfoEvent(noop);
        memoryData.childProcessesBytes = toBytes(1999);
        await events.emitSystemInfoEvent(noop);
        const memorySnapshots = snapshotter.getMemorySample();

        expect(memorySnapshots.length).toBe(5);
        expect(memorySnapshots[0].isOverloaded).toBe(false);
        expect(memorySnapshots[1].isOverloaded).toBe(false);
        expect(memorySnapshots[2].isOverloaded).toBe(false);
        expect(memorySnapshots[3].isOverloaded).toBe(true);
        expect(memorySnapshots[4].isOverloaded).toBe(false);

        await snapshotter.stop();
        vitest.restoreAllMocks();
    });

    test('correctly logs critical memory overload', async () => {
        vitest.spyOn(Snapshotter.prototype as any, '_getMemoryInfo').mockResolvedValueOnce({ totalBytes: toBytes(10000) });
        const config = new Configuration({ availableMemoryRatio: 1 });
        const snapshotter = new Snapshotter({ config, maxUsedMemoryRatio: 0.5 });
        await snapshotter.start();
        const warningSpy = vitest.spyOn(snapshotter.log, 'warning').mockImplementation(() => {});

        // @ts-expect-error Calling private method
        snapshotter._memoryOverloadWarning({
            memCurrentBytes: toBytes(7600),
        });
        expect(warningSpy).toBeCalled();
        warningSpy.mockReset();

        // @ts-expect-error Calling private method
        snapshotter._memoryOverloadWarning({
            memCurrentBytes: toBytes(7500),
        });
        expect(warningSpy).not.toBeCalled();

        vitest.restoreAllMocks();
        await snapshotter.stop();
    });

    test('correctly marks clientOverloaded', () => {
        const noop = () => {};
        // mock client data
        const apifyClient = Configuration.getStorageClient();
        const oldStats = apifyClient.stats;
        apifyClient.stats = {} as never;
        apifyClient.stats.rateLimitErrors = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        const snapshotter = new Snapshotter({ maxClientErrors: 1 });
        // @ts-expect-error Calling protected method
        snapshotter._snapshotClient(noop);
        apifyClient.stats.rateLimitErrors = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
        // @ts-expect-error Calling protected method
        snapshotter._snapshotClient(noop);
        apifyClient.stats.rateLimitErrors = [10, 5, 2, 0, 0, 0, 0, 0, 0, 0];
        // @ts-expect-error Calling protected method
        snapshotter._snapshotClient(noop);
        apifyClient.stats.rateLimitErrors = [100, 24, 4, 2, 0, 0, 0, 0, 0, 0];
        // @ts-expect-error Calling protected method
        snapshotter._snapshotClient(noop);

        const clientSnapshots = snapshotter.getClientSample();

        expect(clientSnapshots.length).toBe(4);
        expect(clientSnapshots[0].isOverloaded).toBe(false);
        expect(clientSnapshots[1].isOverloaded).toBe(false);
        expect(clientSnapshots[2].isOverloaded).toBe(false);
        expect(clientSnapshots[3].isOverloaded).toBe(true);

        apifyClient.stats = oldStats;
    });

    test('.get[.*]Sample limits amount of samples', async () => {
        const SAMPLE_SIZE_MILLIS = 120;
        const config = new Configuration({ systemInfoIntervalMillis: 10 });
        const snapshotter = new Snapshotter({
            eventLoopSnapshotIntervalSecs: 0.01,
            config,
        });
        await snapshotter.start();
        await config.getEventManager().init();
        await sleep(1e3);
        await snapshotter.stop();
        await config.getEventManager().close();
        const memorySnapshots = snapshotter.getMemorySample();
        const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const memorySample = snapshotter.getMemorySample(SAMPLE_SIZE_MILLIS);
        const eventLoopSample = snapshotter.getEventLoopSample(SAMPLE_SIZE_MILLIS);

        expect(memorySnapshots.length).toBeGreaterThan(memorySample.length);
        expect(eventLoopSnapshots.length).toBeGreaterThan(eventLoopSample.length);
        for (let i = 0; i < eventLoopSample.length; i++) {
            const sample = eventLoopSample[eventLoopSample.length - 1 - i];
            const snapshot = eventLoopSnapshots[eventLoopSnapshots.length - 1 - i];
            expect(sample).toEqual(snapshot);
        }
        const diffBetween = eventLoopSample[eventLoopSample.length - 1].createdAt.getTime()
            - eventLoopSnapshots[eventLoopSnapshots.length - 1].createdAt.getTime();
        const diffWithin = eventLoopSample[0].createdAt.getTime() - eventLoopSample[eventLoopSample.length - 1].createdAt.getTime();
        expect(diffBetween).toBeLessThan(SAMPLE_SIZE_MILLIS);
        expect(diffWithin).toBeLessThan(SAMPLE_SIZE_MILLIS);
    });
});
