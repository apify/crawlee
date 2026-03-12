import os from 'node:os';

import { Configuration, EventType, LocalEventManager, Snapshotter } from '@crawlee/core';
import type { MemoryInfo } from '@crawlee/utils';
import { sleep } from '@crawlee/utils';

import log from '@apify/log';

describe('Snapshotter', () => {
    let logLevel: number;
    beforeAll(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterAll(() => {
        log.setLevel(logLevel);
    });

    test.each([
        true,
        false,
    ])('correctly handles dynamic vs static memory limit when total memory changes (dynamic=%s)', async (dynamic) => {
        /**
         * Two memory snapshots are emitted with the same process memory usage but different total memory.
         * First snapshot is overloaded in both modes. Using 60% of total memory, while the limit is 50% in both modes.
         * Second snapshot doubles the total memory while keeping the same usage:
         * - Dynamic mode (availableMemoryRatio): maxMemoryBytes should update → not overloaded
         * - Static mode (memoryMbytes): maxMemoryBytes stays fixed → still overloaded
         */
        const noop = () => {};
        const initialTotalBytes = 100 * 1024 * 1024;
        const allowedMemoryUsageRatio = 0.5;
        const actualMemoryUsage = 0.6 * initialTotalBytes;

        // Initial snapshot. Overloaded in both modes.
        const memoryData: MemoryInfo = {
            totalBytes: initialTotalBytes,
            freeBytes: initialTotalBytes - actualMemoryUsage,
            usedBytes: actualMemoryUsage,
            mainProcessBytes: actualMemoryUsage,
            childProcessesBytes: 0,
        };

        // Mock memory info to be able to inject custom memory measurement data.
        vitest.spyOn(LocalEventManager.prototype as any, '_getMemoryInfo').mockResolvedValue(memoryData);

        let config: Configuration;
        if (dynamic) {
            // Dynamic: Allow usage of 50 % of available memory through ratio
            config = new Configuration({ availableMemoryRatio: allowedMemoryUsageRatio });
        } else {
            // Static: Allow usage of 50 % of available memory through fixed value
            config = new Configuration({ memoryMbytes: (allowedMemoryUsageRatio * initialTotalBytes) / 1024 / 1024 });
        }

        const snapshotter = new Snapshotter({ config });
        vitest.spyOn(LocalEventManager.prototype, 'init').mockImplementation(async () => {});
        const events = config.getEventManager() as LocalEventManager;
        await snapshotter.start();

        // First snapshot - full usage of the memory, should be overloaded in both modes
        await events.emitSystemInfoEvent(noop);

        // Second snapshot - total memory doubled, should be overloaded only in static mode
        memoryData.totalBytes = initialTotalBytes * 2;
        memoryData.freeBytes = memoryData.totalBytes - actualMemoryUsage;
        await events.emitSystemInfoEvent(noop);

        const memorySnapshots = snapshotter.getMemorySample();
        expect(memorySnapshots).toHaveLength(2);
        expect(memorySnapshots[0].isOverloaded).toBe(true);
        expect(memorySnapshots[1].isOverloaded).toBe(!dynamic);

        await snapshotter.stop();
    });

    test('correctly marks clientOverloaded', () => {
        const noop = () => {};
        // mock client data
        const apifyClient = Configuration.getStorageClient();
        const oldStats = apifyClient.stats;
        apifyClient.stats = {} as any;
        apifyClient.stats!.rateLimitErrors = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        const snapshotter = new Snapshotter({ maxClientErrors: 1 });
        // @ts-expect-error Calling protected method
        snapshotter._snapshotClient(noop);
        apifyClient.stats!.rateLimitErrors = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
        // @ts-expect-error Calling protected method
        snapshotter._snapshotClient(noop);
        apifyClient.stats!.rateLimitErrors = [10, 5, 2, 0, 0, 0, 0, 0, 0, 0];
        // @ts-expect-error Calling protected method
        snapshotter._snapshotClient(noop);
        apifyClient.stats!.rateLimitErrors = [100, 24, 4, 2, 0, 0, 0, 0, 0, 0];
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
        await sleep(1.5e3);
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
        const diffBetween =
            eventLoopSample[eventLoopSample.length - 1].createdAt.getTime() -
            eventLoopSnapshots[eventLoopSnapshots.length - 1].createdAt.getTime();
        const diffWithin =
            eventLoopSample[0].createdAt.getTime() - eventLoopSample[eventLoopSample.length - 1].createdAt.getTime();
        expect(diffBetween).toBeLessThan(SAMPLE_SIZE_MILLIS);
        expect(diffWithin).toBeLessThan(SAMPLE_SIZE_MILLIS);
    });
});
