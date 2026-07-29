import { EventType } from '../events/event_manager.js';
import type { LoadSignal, LoadSignalStartContext, LoadSnapshot } from './load_signal.js';
import { SnapshotStore } from './load_signal.js';
import type { SystemInfo } from './system_status.js';

/**
 * A snapshot produced by the built-in CPU signal.
 * @internal
 */
export interface CpuSnapshot extends LoadSnapshot {
    usedRatio: number;
    ticks?: { idle: number; total: number };
}

/**
 * Tuning for the built-in **CPU** load signal, as accepted both by {@apilink CpuLoadSignal} and by the
 * {@apilink LoadSignalsOptions.cpu|`cpu`} shorthand on {@apilink LoadSignalsOptions}.
 */
export interface CpuLoadSignalOptions {
    /**
     * Maximum ratio of overloaded snapshots in a sample before the CPU counts as overloaded.
     * @default 0.4
     */
    overloadedRatio?: number;
}

/**
 * Tracks CPU usage via `SYSTEM_INFO` events and reports overload when the platform or local OS metrics indicate the
 * CPU is overloaded.
 *
 * The {@apilink ConcurrencySystem} builds one of these by default, so you only need to construct it yourself to wrap
 * or otherwise adapt it — in which case switch the default off, since two signals cannot share a name:
 *
 * ```typescript
 * const cpu = new CpuLoadSignal({ overloadedRatio: 0.5 });
 *
 * new ConcurrencySystem({
 *     loadSignals: { cpu: false, custom: [withHysteresis(cpu)] },
 * });
 * ```
 *
 * @category Scaling
 */
export class CpuLoadSignal implements LoadSignal {
    readonly name = 'cpuInfo';
    readonly overloadedRatio: number;

    private readonly signal: ReturnType<typeof SnapshotStore.fromEvent<CpuSnapshot, SystemInfo>>;

    constructor(options: CpuLoadSignalOptions = {}) {
        this.overloadedRatio = options.overloadedRatio ?? 0.4;

        this.signal = SnapshotStore.fromEvent<CpuSnapshot, SystemInfo>({
            name: this.name,
            overloadedRatio: this.overloadedRatio,
            // The event manager is left to be resolved when the signal starts, so an instance built ahead of time
            // cannot capture whichever one happened to be registered at that moment.
            event: EventType.SYSTEM_INFO,
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

    async start(context: LoadSignalStartContext): Promise<void> {
        await this.signal.start(context);
    }

    async stop(): Promise<void> {
        await this.signal.stop();
    }

    getSample(sampleDurationMillis?: number): LoadSnapshot[] {
        return this.signal.getSample(sampleDurationMillis);
    }

    /** @internal Records a snapshot from a `SYSTEM_INFO` payload. Exposed for tests. */
    handle(systemInfo: SystemInfo): void {
        this.signal.handle(systemInfo);
    }
}
