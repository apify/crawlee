import type { LoadSignal, LoadSnapshot } from '@crawlee/core';
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

    // The per-signal overloaded ratio now lives on the signal itself (SystemStatus no longer overrides it), so the
    // mock signal carries it directly. Default 0 means "any overloaded snapshot trips it", matching the earlier tests.
    function mockSignal(name: string, snapshots: any[], overloadedRatio = 0) {
        return {
            name,
            overloadedRatio,
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
            readonly overloadedRatios: Partial<
                Record<'memInfo' | 'eventLoopInfo' | 'cpuInfo' | 'clientInfo', number>
            > = {},
        ) {}

        getLoadSignals() {
            return [
                mockSignal('memInfo', this.memSnapshots, this.overloadedRatios.memInfo),
                mockSignal('eventLoopInfo', this.loopSnapshots, this.overloadedRatios.eventLoopInfo),
                mockSignal('cpuInfo', this.cpuSnapshots, this.overloadedRatios.cpuInfo),
                mockSignal('clientInfo', this.clientSnapshots, this.overloadedRatios.clientInfo),
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
        const ratios = (r: number) => ({ memInfo: r, eventLoopInfo: r, cpuInfo: r, clientInfo: r });

        // At exactly 0.5, the 50% overloaded sample should NOT trigger (uses >)
        let systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps, ratios(0.5)) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(true);

        // Drop all thresholds below 0.5 → all four overloaded
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps, ratios(0.49)) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);

        // Memory & eventLoop at threshold, CPU & client below → still overloaded
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps, {
                memInfo: 0.5,
                eventLoopInfo: 0.5,
                cpuInfo: 0.49,
                clientInfo: 0.49,
            }) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(false);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(false);

        // All thresholds well above → idle
        systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps, ratios(1)) as any,
        });
        expect(systemStatus.getCurrentStatus().isSystemIdle).toBe(true);
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(true);
    });

    test('should show different values for now and lately', () => {
        const ratios = { memInfo: 0.5, eventLoopInfo: 0.5, cpuInfo: 0.5, clientInfo: 0.5 };
        let snaps = generateSnapsSync(95, false);
        let systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps, ratios) as any,
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
            snapshotter: new MockSnapshotter(snaps, snaps, snaps, snaps, ratios) as any,
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

    test('the historical window is requested explicitly, so a long-memory custom signal cannot widen it', () => {
        const now = Date.now();
        // A custom signal that remembers far more than the configured window: overloaded a minute ago, fine since.
        const timestampedSignal: LoadSignal = {
            name: 'proxyHealth',
            overloadedRatio: 0,
            async start() {},
            async stop() {},
            getSample(sampleDurationMillis?: number) {
                // A sustained overload about a minute ago, healthy ever since. (The sample evaluation weights each
                // interval by the flag of the snapshot that ends it, so the overload needs more than one snapshot.)
                const snapshots: LoadSnapshot[] = [
                    { createdAt: new Date(now - 60_000), isOverloaded: true },
                    { createdAt: new Date(now - 59_000), isOverloaded: true },
                    { createdAt: new Date(now - 58_000), isOverloaded: true },
                    { createdAt: new Date(now - 1_000), isOverloaded: false },
                ];

                if (!sampleDurationMillis) return snapshots;
                const cutoff = now - sampleDurationMillis;
                return snapshots.filter((snapshot) => +snapshot.createdAt >= cutoff);
            },
        };

        const fine = generateSnapsSync(100, false);
        const systemStatus = new SystemStatus({
            snapshotter: new MockSnapshotter(fine, fine, fine, fine, {}) as any,
            loadSignals: [timestampedSignal],
            historySecs: 30,
        });

        // The minute-old overload falls outside the 30s window, so it must not drag the historical status down.
        expect(systemStatus.getHistoricalStatus().isSystemIdle).toBe(true);

        // Widening the window past the old snapshot brings the overload back into view.
        const widened = new SystemStatus({
            snapshotter: new MockSnapshotter(fine, fine, fine, fine, {}) as any,
            loadSignals: [timestampedSignal],
            historySecs: 120,
        });
        expect(widened.getHistoricalStatus().isSystemIdle).toBe(false);
    });

    describe('duplicate signal names', () => {
        const fine = generateSnapsSync(100, false);
        const snapshotter = () => new MockSnapshotter(fine, fine, fine, fine, {}) as any;

        it('rejects a custom signal that shadows an enabled built-in', () => {
            // Used to silently run alongside the built-in while overwriting its SystemInfo field, so the reported
            // memInfo could claim memory was fine while the built-in held concurrency down.
            expect(
                () => new SystemStatus({ snapshotter: snapshotter(), loadSignals: [mockSignal('memInfo', fine)] }),
            ).toThrow(/Duplicate load signal name "memInfo".*loadSignals: \{ memory: false \}/s);
        });

        it('rejects two custom signals sharing a name', () => {
            expect(
                () =>
                    new SystemStatus({
                        snapshotter: snapshotter(),
                        loadSignals: [mockSignal('proxyHealth', fine), mockSignal('proxyHealth', fine)],
                    }),
            ).toThrow(/Duplicate load signal name "proxyHealth".*rename one of them/s);
        });

        it('allows a custom signal to take over the name of a disabled built-in', () => {
            // The supported replacement route: switch the built-in off, keep its SystemInfo field reported by yours.
            const withoutMemory = {
                getLoadSignals: () => snapshotter().getLoadSignals().slice(1),
            } as any;

            const overloaded = generateSnapsSync(100, true);
            const systemStatus = new SystemStatus({
                snapshotter: withoutMemory,
                loadSignals: [mockSignal('memInfo', overloaded)],
            });

            const status = systemStatus.getCurrentStatus();
            expect(status.isSystemIdle).toBe(false);
            expect(status.memInfo.isOverloaded).toBe(true);
            expect(status.loadSignalInfo).toBeUndefined();
        });
    });
});
