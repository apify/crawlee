import { getMemoryInfo, getMemoryInfoV2, isContainerized } from '@crawlee/utils';

import type { Log } from '@apify/log';

import type { Configuration } from '../configuration';
import type { EventManager } from '../events/event_manager';
import { EventType } from '../events/event_manager';
import { log as defaultLog } from '../log';
import type { LoadSignal, LoadSnapshot } from './load_signal';
import { SnapshotStore } from './load_signal';
import type { SystemInfo } from './system_status';

const RESERVE_MEMORY_RATIO = 0.5;
const CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS = 10_000;

export interface MemorySnapshot extends LoadSnapshot {
    usedBytes?: number;
}

export interface MemoryLoadSignalOptions {
    maxUsedMemoryRatio?: number;
    overloadedRatio?: number;
    snapshotHistoryMillis?: number;
    config: Configuration;
    log?: Log;
}

/**
 * Tracks memory usage via `SYSTEM_INFO` events and reports overload when
 * the used-to-available memory ratio exceeds a threshold.
 */
export class MemoryLoadSignal implements LoadSignal {
    readonly name = 'memInfo';
    readonly overloadedRatio: number;

    private readonly store: SnapshotStore<MemorySnapshot>;
    private readonly config: Configuration;
    private readonly events: EventManager;
    private readonly log: Log;
    private readonly maxUsedMemoryRatio: number;
    private maxMemoryRatio: number | undefined;
    private maxMemoryBytes!: number;
    private lastLoggedCriticalMemoryOverloadAt: Date | null = null;

    constructor(options: MemoryLoadSignalOptions) {
        this.store = new SnapshotStore(options.snapshotHistoryMillis);
        this.config = options.config;
        this.events = this.config.getEventManager();
        this.log = options.log ?? defaultLog.child({ prefix: 'MemoryLoadSignal' });
        this.maxUsedMemoryRatio = options.maxUsedMemoryRatio ?? 0.9;
        this.overloadedRatio = options.overloadedRatio ?? 0.2;
        this._onSystemInfo = this._onSystemInfo.bind(this);
    }

    async start(): Promise<void> {
        const memoryMbytes = this.config.get('memoryMbytes', 0);

        if (memoryMbytes > 0) {
            this.maxMemoryBytes = memoryMbytes * 1024 * 1024;
        } else {
            this.maxMemoryRatio = this.config.get('availableMemoryRatio');
            if (!this.maxMemoryRatio) {
                throw new Error('availableMemoryRatio is not set in configuration.');
            } else {
                this.log.debug(
                    `Setting max memory of this run to ${this.maxMemoryRatio * 100} % of available memory. ` +
                        'Use the CRAWLEE_MEMORY_MBYTES or CRAWLEE_AVAILABLE_MEMORY_RATIO environment variable to override it.',
                );
            }
            // Fallback memory measurement in case memTotalBytes is missing from SystemInfo.
            this.maxMemoryBytes = await this._getTotalMemoryBytes();
        }

        this.events.on(EventType.SYSTEM_INFO, this._onSystemInfo);
    }

    async stop(): Promise<void> {
        this.events.off(EventType.SYSTEM_INFO, this._onSystemInfo);
    }

    getSample(sampleDurationMillis?: number): MemorySnapshot[] {
        return this.store.getSample(sampleDurationMillis);
    }

    /**
     * Returns typed memory snapshots for backward compatibility with `Snapshotter`.
     */
    getMemorySnapshots(): MemorySnapshot[] {
        return this.store.getAll();
    }

    /** @internal */
    _onSystemInfo(systemInfo: SystemInfo): void {
        const createdAt = systemInfo.createdAt ? new Date(systemInfo.createdAt) : new Date();
        const { memCurrentBytes, memTotalBytes } = systemInfo;

        let maxMemoryBytes = this.maxMemoryBytes!;
        if (this.maxMemoryRatio !== undefined && this.maxMemoryRatio > 0) {
            maxMemoryBytes = this.maxMemoryRatio * (memTotalBytes ?? this.maxMemoryBytes);
        }

        const snapshot: MemorySnapshot = {
            createdAt,
            isOverloaded: memCurrentBytes! / maxMemoryBytes > this.maxUsedMemoryRatio,
            usedBytes: memCurrentBytes,
        };

        this.store.push(snapshot, createdAt);
        this._memoryOverloadWarning(systemInfo, maxMemoryBytes);
    }

    /** @internal */
    _memoryOverloadWarning(systemInfo: SystemInfo, maxMemoryBytes?: number): void {
        const effectiveMax = maxMemoryBytes ?? this.maxMemoryBytes!;
        const { memCurrentBytes } = systemInfo;
        const createdAt = systemInfo.createdAt ? new Date(systemInfo.createdAt) : new Date();
        if (
            this.lastLoggedCriticalMemoryOverloadAt &&
            +createdAt < +this.lastLoggedCriticalMemoryOverloadAt + CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS
        )
            return;

        const maxDesiredMemoryBytes = this.maxUsedMemoryRatio * effectiveMax;
        const reserveMemory = effectiveMax * (1 - this.maxUsedMemoryRatio) * RESERVE_MEMORY_RATIO;
        const criticalOverloadBytes = maxDesiredMemoryBytes + reserveMemory;
        const isCriticalOverload = memCurrentBytes! > criticalOverloadBytes;

        if (isCriticalOverload) {
            const usedPercentage = Math.round((memCurrentBytes! / effectiveMax) * 100);
            const toMb = (bytes: number) => Math.round(bytes / 1024 ** 2);
            this.log.warning(
                'Memory is critically overloaded. ' +
                    `Using ${toMb(memCurrentBytes!)} MB of ${toMb(
                        effectiveMax,
                    )} MB (${usedPercentage}%). Consider increasing available memory.`,
            );
            this.lastLoggedCriticalMemoryOverloadAt = createdAt;
        }
    }

    private async _getTotalMemoryBytes(): Promise<number> {
        if (this.config.get('systemInfoV2')) {
            const containerized = this.config.get('containerized', await isContainerized());
            return (await getMemoryInfoV2(containerized)).totalBytes;
        }
        return (await getMemoryInfo()).totalBytes;
    }
}
