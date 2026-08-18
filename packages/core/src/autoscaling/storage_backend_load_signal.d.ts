import type { LoadSignal, LoadSignalStartContext, LoadSnapshot } from './load_signal.js';
/**
 * A snapshot produced by the built-in storage backend (rate-limit) signal.
 * @internal
 */
export interface StorageBackendSnapshot extends LoadSnapshot {
    rateLimitErrorCount: number;
}
/**
 * Tuning for the built-in **storage backend** (rate-limit) load signal, as accepted both by
 * {@apilink StorageBackendLoadSignal} and by the
 * {@apilink LoadSignalsOptions.storageBackend|`storageBackend`} shorthand on {@apilink LoadSignalsOptions}.
 */
export interface StorageBackendLoadSignalOptions {
    /**
     * Defines the interval of checking the current state of the storage backend, in seconds.
     * @default 1
     */
    snapshotIntervalSecs?: number;
    /**
     * Defines the maximum number of new rate limit errors within the given interval.
     * @default 3
     */
    maxErrors?: number;
    /**
     * Maximum ratio of overloaded snapshots in a sample before the storage backend counts as overloaded.
     * @default 0.3
     */
    overloadedRatio?: number;
}
/**
 * Periodically checks the storage backend for rate-limit errors (HTTP 429) and reports overload when the error delta
 * exceeds a threshold.
 *
 * Built by default; construct one yourself only to wrap or adapt it — see {@apilink LoadSignal}.
 *
 * Switch it off entirely ({@apilink LoadSignalsOptions.storageBackend|`storageBackend: false`}) if the storage backend
 * reports no rate-limit statistics, since it otherwise polls it every second to no purpose.
 *
 * @category Scaling
 */
export declare class StorageBackendLoadSignal implements LoadSignal {
    #private;
    readonly name = "storageBackendInfo";
    readonly overloadedRatio: number;
    constructor(options?: StorageBackendLoadSignalOptions);
    start(context: LoadSignalStartContext): Promise<void>;
    stop(): Promise<void>;
    getSample(sampleDurationMillis?: number): LoadSnapshot[];
    /**
     * Records one snapshot, overloaded when rate-limit errors grew by more than the configured limit since the
     * previous one.
     * @internal Also lets tests drive the measurement without waiting on a timer.
     */
    handle(intervalCallback: () => unknown): void;
}
