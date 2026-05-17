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
}

/**
 * Tracks CPU usage via `SYSTEM_INFO` events and reports overload when
 * the platform or local OS metrics indicate the CPU is overloaded.
 */
export function createCpuLoadSignal(options: CpuLoadSignalOptions) {
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
