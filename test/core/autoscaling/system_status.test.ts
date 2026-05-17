import { Snapshotter, SystemStatus } from '@crawlee/core';

import log from '@apify/log';

describe('SystemStatus', () => {
    let logLevel: number;
    beforeAll(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterAll(() => {
        log.setLevel(logLevel);
    });

    function mockSignal(name: string, snapshots: any[]) {
        return {
            name,
            overloadedRatio: 0, // overridden by SystemStatusOptions anyway
            getSample(sampleDurationMillis?: number) {
                return sampleDurationMillis ? snapshots.slice(-sampleDurationMillis) : snapshots;
            },
            async start() {},
            async stop() {},
        };
    }

    class MockSnapshotter {
        constructor(
            readonly memSnapshots: any[],
            readonly loopSnapshots: any[],
            readonly cpuSnapshots: any[],
            readonly clientSnapshots: any[],
        ) {}

        getLoadSignals() {
            return [
                mockSignal('memInfo', this.memSnapshots),
                mockSignal('eventLoopInfo', this.loopSnapshots),
                mockSignal('cpuInfo', this.cpuSnapshots),
                mockSignal('clientInfo', this.clientSnapshots),
            ];
        }

        getMemorySample(offset: number) {
            return this.memSnapshots.slice(-offset);
        }

        getEventLoopSample(offset: number) {
            return this.loopSnapshots.slice(-offset);
        }

        getCpuSample(offset: number) {
            return this.cpuSnapshots.slice(-offset);
        }

        getClientSample(offset: number) {
            return this.clientSnapshots.slice(-offset);
        }
    }

    const generateSnapsSync = (percentage: number, overloaded: boolean) => {
        const snaps = [];
        const createdAt = new Date();
        for (let i = 0; i < 100; i++) {
            snaps.push({
                createdAt,
                isOverloaded: i < percentage ? overloaded : !overloaded,
            });
        }
        return snaps;
    };

    test('should return OK for OK snapshots', () => {
        const snaps = generateSnapsSync(100, false);
        const systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(true);
    });

    test('should return overloaded for overloaded snapshots', () => {
        const snaps = generateSnapsSync(100, true);
        const systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);
    });

    test('should work with some samples empty', () => {
        const snaps = generateSnapsSync(100, true);
        let systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, [], [], []) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter([], snaps, [], []) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter([], [], snaps, snaps) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter([], [], [], []) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(true);
    });

    test('should overload if only one sample is overloaded', () => {
        const overloaded = generateSnapsSync(100, true);
        const fine = generateSnapsSync(100, false);
        let systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(fine, fine, overloaded, fine) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(fine, overloaded, fine, fine) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(overloaded, fine, fine, fine) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(fine, fine, fine, overloaded) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);
    });

    test('should overload when threshold is crossed', () => {
        const snaps = generateSnapsSync(50, true);
        const mock = new MockSnapshotter(snaps, snaps, snaps, snaps) as any;

        // At exactly 0.5, the 50% overloaded sample should NOT trigger (uses >)
        let systemStatus = new SystemStatus({
            snapshotter: mock,
            maxMemoryOverloadedRatio: 0.5,
            maxEventLoopOverloadedRatio: 0.5,
            maxCpuOverloadedRatio: 0.5,
            maxClientOverloadedRatio: 0.5,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(true);

        // Drop all thresholds below 0.5 → all four overloaded
        systemStatus = new SystemStatus({
            snapshotter: mock,
            maxMemoryOverloadedRatio: 0.49,
            maxEventLoopOverloadedRatio: 0.49,
            maxCpuOverloadedRatio: 0.49,
            maxClientOverloadedRatio: 0.49,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);

        // Memory & eventLoop at threshold, CPU & client below → still overloaded
        systemStatus = new SystemStatus({
            snapshotter: mock,
            maxMemoryOverloadedRatio: 0.5,
            maxEventLoopOverloadedRatio: 0.5,
            maxCpuOverloadedRatio: 0.49,
            maxClientOverloadedRatio: 0.49,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);

        // All thresholds well above → idle
        systemStatus = new SystemStatus({
            snapshotter: mock,
            maxMemoryOverloadedRatio: 1,
            maxEventLoopOverloadedRatio: 1,
            maxCpuOverloadedRatio: 1,
            maxClientOverloadedRatio: 1,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(true);
    });

    test('should show different values for now and lately', () => {
        let snaps = generateSnapsSync(95, false);
        let systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps) as any,
            maxMemoryOverloadedRatio: 0.5,
            maxEventLoopOverloadedRatio: 0.5,
            maxCpuOverloadedRatio: 0.5,
            maxClientOverloadedRatio: 0.5,
        });

        // @ts-expect-error Overwriting readonly private prop
        systemStatus.currentHistoryMillis = 5;
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(true);

        // @ts-expect-error Overwriting readonly private prop
        systemStatus.currentHistoryMillis = 10;
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(true);

        // @ts-expect-error Overwriting readonly private prop
        systemStatus.currentHistoryMillis = 12;
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(true);

        snaps = generateSnapsSync(95, true);
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps) as any,
            maxMemoryOverloadedRatio: 0.5,
            maxEventLoopOverloadedRatio: 0.5,
            maxCpuOverloadedRatio: 0.5,
            maxClientOverloadedRatio: 0.5,
        });

        // @ts-expect-error Overwriting readonly private prop
        systemStatus.currentHistoryMillis = 5;
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);

        // @ts-expect-error Overwriting readonly private prop
        systemStatus.currentHistoryMillis = 10;
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);

        // @ts-expect-error Overwriting readonly private prop
        systemStatus.currentHistoryMillis = 12;
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);
    });

    test('creates a snapshotter when none is passed', () => {
        const systemStatus = new SystemStatus();
        // @ts-expect-error Accessing private prop
        expect(systemStatus.snapshotter).toBeInstanceOf(Snapshotter);
    });
});
