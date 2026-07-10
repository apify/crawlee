import { getCurrentProcessCpuTicks } from '@crawlee/utils';

import type { Configuration } from '../configuration';
import { EventType } from '../events/event_manager';
import type { LoadSnapshot } from './load_signal';
import { SnapshotStore } from './load_signal';
import type { SystemInfo } from './system_status';

export interface CpuSnapshot extends LoadSnapshot {
    usedRatio: number;
    ticks?: { idle: number; total: number };
}

export interface CpuLoadSignalOptions {
    overloadedRatio?: number;
    snapshotHistoryMillis?: number;
    config: Configuration;

    /**
     * Measures this process's own CPU usage (normalized to a single core) instead of
     * the whole machine's aggregate CPU usage read from the shared `Configuration`.
     *
     * Useful when running multiple independent crawler instances (each with its own
     * `AutoscaledPool`) concurrently in the same Node.js process, since the machine-wide
     * aggregate metric gets diluted by the number of cores and can fail to detect that
     * the combined load of all instances is overloading Node's single JS thread.
     *
     * Not recommended for browser-based crawlers, since their CPU-heavy work (rendering)
     * happens in separate browser processes this doesn't measure.
     * @default false
     */
    useProcessCpuUsage?: boolean;

    /**
     * Sampling interval for `useProcessCpuUsage`, in seconds.
     * @default 0.5
     */
    processCpuSnapshotIntervalSecs?: number;
}

/**
 * Tracks CPU usage and reports overload when the CPU exceeds `maxUsedCpuRatio`.
 *
 * By default, this listens to `SYSTEM_INFO` events from the shared `Configuration`
 * (machine-wide aggregate, or platform-provided container metrics). With
 * `useProcessCpuUsage`, it instead samples this process's own CPU usage on its own
 * interval, independent of `Configuration`.
 */
export function createCpuLoadSignal(options: CpuLoadSignalOptions) {
    const maxUsedCpuRatio = options.config.get('maxUsedCpuRatio')!;

    if (options.useProcessCpuUsage) {
        const intervalMillis = (options.processCpuSnapshotIntervalSecs ?? 0.5) * 1000;

        return SnapshotStore.fromInterval<CpuSnapshot>({
            name: 'cpuInfo',
            overloadedRatio: options.overloadedRatio ?? 0.4,
            intervalMillis,
            snapshotHistoryMillis: options.snapshotHistoryMillis,
            handler(store, intervalCallback) {
                const usedRatio = getCurrentProcessCpuTicks();
                const now = new Date();
                store.push(
                    {
                        createdAt: now,
                        isOverloaded: usedRatio > maxUsedCpuRatio,
                        usedRatio,
                    },
                    now,
                );
                intervalCallback();
            },
        });
    }

    return SnapshotStore.fromEvent<CpuSnapshot, SystemInfo>({
        name: 'cpuInfo',
        overloadedRatio: options.overloadedRatio ?? 0.4,
        events: options.config.getEventManager(),
        event: EventType.SYSTEM_INFO,
        snapshotHistoryMillis: options.snapshotHistoryMillis,
        handler(store, systemInfo) {
            const { cpuCurrentUsage, isCpuOverloaded } = systemInfo;
            const createdAt = systemInfo.createdAt ? new Date(systemInfo.createdAt) : new Date();
            store.push(
                {
                    createdAt,
                    isOverloaded: isCpuOverloaded!,
                    usedRatio: Math.ceil(cpuCurrentUsage! / 100),
                },
                createdAt,
            );
        },
    });
}

/** @internal Return type for backward compat in Snapshotter facade */
export type CpuLoadSignal = ReturnType<typeof createCpuLoadSignal>;
