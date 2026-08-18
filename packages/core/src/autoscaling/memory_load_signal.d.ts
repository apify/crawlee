import type { LoadSignal, LoadSignalStartContext, LoadSnapshot } from './load_signal.js';
import type { SystemInfo } from './system_status.js';
/**
 * A snapshot produced by the built-in memory signal.
 * @internal
 */
export interface MemorySnapshot extends LoadSnapshot {
    usedBytes?: number;
}
/**
 * Tuning for the built-in **memory** load signal, as accepted both by {@apilink MemoryLoadSignal} and by the
 * {@apilink LoadSignalsOptions.memory|`memory`} shorthand on {@apilink LoadSignalsOptions}.
 */
export interface MemoryLoadSignalOptions {
    /**
     * Defines the maximum ratio of total memory that can be used.
     * Exceeding this limit overloads the memory.
     * @default 0.9
     */
    maxUsedRatio?: number;
    /**
     * Maximum ratio of overloaded snapshots in a sample before memory counts as overloaded.
     * @default 0.2
     */
    overloadedRatio?: number;
}
/**
 * Tracks memory usage via `SYSTEM_INFO` events and reports overload when the used-to-available memory ratio exceeds a
 * threshold. Also warns when memory use becomes critical.
 *
 * Built by default; construct one yourself only to wrap or adapt it — see {@apilink LoadSignal}.
 *
 * @category Scaling
 */
export declare class MemoryLoadSignal implements LoadSignal {
    #private;
    readonly name = "memInfo";
    readonly overloadedRatio: number;
    constructor(options?: MemoryLoadSignalOptions);
    start(context: LoadSignalStartContext): Promise<void>;
    stop(): Promise<void>;
    getSample(sampleDurationMillis?: number): LoadSnapshot[];
    /** @internal Records a snapshot from a `SYSTEM_INFO` payload. Exposed for tests. */
    handle(systemInfo: SystemInfo): void;
    private memoryOverloadWarning;
    private getTotalMemoryBytes;
}
