import type { LoadSignal } from './load_signal.js';
import type { Snapshotter } from './snapshotter.js';
/**
 * Represents the current status of the system.
 */
export interface SystemInfo {
    /** If false, system is being overloaded. */
    isSystemIdle: boolean;
    memInfo: LoadSignalInfo;
    eventLoopInfo: LoadSignalInfo;
    cpuInfo: LoadSignalInfo;
    storageBackendInfo: LoadSignalInfo;
    memTotalBytes?: number;
    memCurrentBytes?: number;
    /**
     * Platform only property
     * @internal
     */
    cpuCurrentUsage?: number;
    /**
     * Platform only property
     * @internal
     */
    isCpuOverloaded?: boolean;
    /**
     * Platform only property
     * @internal
     */
    createdAt?: Date;
    /**
     * Status of additional load signals beyond the built-in four.
     * Keys are `LoadSignal.name` values, values are overload info.
     */
    loadSignalInfo?: Record<string, LoadSignalInfo>;
}
/**
 * How far back the *current* system status looks by default — the window that gates task dispatch.
 * @internal
 */
export declare const DEFAULT_CURRENT_HISTORY_SECS = 5;
/**
 * How far back the *historical* system status looks by default — the window autoscaling decisions are based on, and
 * therefore how much history the signals are asked to retain.
 * @internal
 */
export declare const DEFAULT_SNAPSHOT_HISTORY_SECS = 30;
/**
 * An implementation detail of the {@apilink ConcurrencySystem} — configure it through
 * {@apilink ConcurrencySystemOptions} (`loadSignals`, `currentHistorySecs` and `snapshotHistorySecs`).
 * @internal
 */
export interface SystemStatusOptions {
    /**
     * Defines max age of snapshots used in the {@apilink SystemStatus.getCurrentStatus} measurement.
     * @default 5
     */
    currentHistorySecs?: number;
    /**
     * Defines max age of snapshots used in the {@apilink SystemStatus.getHistoricalStatus} measurement — the window
     * autoscaling decisions are based on. Applied uniformly to every signal, built-in or custom, so that a signal's
     * private retention cannot silently widen the window.
     * @default 30
     */
    historySecs?: number;
    /**
     * The `Snapshotter` whose built-in signals are evaluated.
     */
    snapshotter: Snapshotter;
    /**
     * Additional load signals to include in the system status evaluation.
     * These are evaluated alongside the built-in memory, CPU, event loop,
     * and storage backend signals. If any signal reports overload, the system
     * is considered overloaded. Each signal carries its own overload ratio.
     */
    loadSignals?: LoadSignal[];
}
export interface LoadSignalInfo {
    isOverloaded: boolean;
    limitRatio: number;
    actualRatio: number;
}
export interface FinalStatistics {
    requestsFinished: number;
    requestsFailed: number;
    retryHistogram: number[];
    requestAvgFailedDurationMillis: number;
    requestAvgFinishedDurationMillis: number;
    requestsFinishedPerMinute: number;
    requestsFailedPerMinute: number;
    requestTotalDurationMillis: number;
    requestsTotal: number;
    crawlerRuntimeMillis: number;
}
/**
 * Reads the overload verdict of every signal — the {@apilink Snapshotter}'s built-in four plus any custom ones — and
 * combines them into a {@apilink SystemInfo}: each signal is a time-weighted average of its snapshots, and the system
 * is overloaded whenever at least one of them is.
 *
 * Evaluated over two windows, both requested explicitly from every signal so that a signal's private retention cannot
 * widen what it contributes: a short `currentHistorySecs` one ({@apilink SystemStatus.getCurrentStatus}, gating task
 * dispatch) and a longer `historySecs` one ({@apilink SystemStatus.getHistoricalStatus}, driving autoscaling).
 *
 * An implementation detail of the {@apilink ConcurrencySystem}, configured through
 * {@apilink ConcurrencySystemOptions}.
 * @internal
 */
export declare class SystemStatus {
    #private;
    constructor(options: SystemStatusOptions);
    /**
     * The widest window any signal will be queried with, and therefore exactly how much history the signals are asked
     * to retain when they start. Derived here, where the windows are resolved, so nothing has to reapply their
     * defaults.
     */
    get maxSampleWindowMillis(): number;
    /**
     * Signal names are the keys of the reported {@apilink SystemInfo}, so a duplicate would leave a status object that
     * contradicts actual behavior: both signals are still evaluated (any overloaded one holds concurrency down), but
     * only the last is reported.
     */
    private assertUniqueSignalNames;
    /**
     * Returns an {@apilink SystemInfo} object with the following structure:
     *
     * ```javascript
     * {
     *     isSystemIdle: Boolean,
     *     memInfo: Object,
     *     eventLoopInfo: Object,
     *     cpuInfo: Object
     * }
     * ```
     *
     * Where the `isSystemIdle` property is set to `false` if the system
     * has been overloaded in the last `options.currentHistorySecs` seconds,
     * and `true` otherwise.
     */
    getCurrentStatus(): SystemInfo;
    /**
     * Returns an {@apilink SystemInfo} object with the following structure:
     *
     * ```javascript
     * {
     *     isSystemIdle: Boolean,
     *     memInfo: Object,
     *     eventLoopInfo: Object,
     *     cpuInfo: Object
     * }
     * ```
     *
     * Where the `isSystemIdle` property is set to `false` if the system has been overloaded within the last
     * `historySecs` seconds and `true` otherwise.
     */
    getHistoricalStatus(): SystemInfo;
    /**
     * Returns a system status object.
     */
    private isSystemIdle;
}
