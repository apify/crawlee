import type { LoadSignal, LoadSignalStartContext, LoadSnapshot } from './load_signal.js';
import type { SystemInfo } from './system_status.js';
/**
 * A snapshot produced by the built-in CPU signal.
 * @internal
 */
export interface CpuSnapshot extends LoadSnapshot {
    usedRatio: number;
    ticks?: {
        idle: number;
        total: number;
    };
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
 * Built by default; construct one yourself only to wrap or adapt it — see {@apilink LoadSignal}.
 *
 * @category Scaling
 */
export declare class CpuLoadSignal implements LoadSignal {
    #private;
    readonly name = "cpuInfo";
    readonly overloadedRatio: number;
    constructor(options?: CpuLoadSignalOptions);
    start(context: LoadSignalStartContext): Promise<void>;
    stop(): Promise<void>;
    getSample(sampleDurationMillis?: number): LoadSnapshot[];
    /** @internal Records a snapshot from a `SYSTEM_INFO` payload. Exposed for tests. */
    handle(systemInfo: SystemInfo): void;
}
