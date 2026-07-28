import ow from 'ow';

import type { LoadSignal } from './load_signal.js';
import { evaluateLoadSignalSample } from './load_signal.js';
import { DEFAULT_SNAPSHOT_HISTORY_SECS, Snapshotter } from './snapshotter.js';

/**
 * Represents the current status of the system.
 */
export interface SystemInfo {
    /** If false, system is being overloaded. */
    isSystemIdle: boolean;
    memInfo: ClientInfo;
    eventLoopInfo: ClientInfo;
    cpuInfo: ClientInfo;
    clientInfo: ClientInfo;
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
    loadSignalInfo?: Record<string, ClientInfo>;
}

/**
 * How far back the *current* system status looks by default — the window that gates task dispatch.
 * @internal
 */
export const DEFAULT_CURRENT_HISTORY_SECS = 5;

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
     * The `Snapshotter` instance to be queried for `SystemStatus`.
     */
    snapshotter?: Snapshotter;

    /**
     * Additional load signals to include in the system status evaluation.
     * These are evaluated alongside the built-in memory, CPU, event loop,
     * and client signals. If any signal reports overload, the system is
     * considered overloaded. Each signal carries its own overload ratio.
     */
    loadSignals?: LoadSignal[];
}

export interface ClientInfo {
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

/** The four built-in signal names that map to typed `SystemInfo` fields. */
const BUILTIN_SIGNAL_NAMES = new Set(['memInfo', 'eventLoopInfo', 'cpuInfo', 'clientInfo']);

/**
 * Provides a simple interface to reading system status from a {@apilink Snapshotter} instance.
 * It only exposes two functions {@apilink SystemStatus.getCurrentStatus}
 * and {@apilink SystemStatus.getHistoricalStatus}.
 * The system status is calculated using a weighted average of overloaded
 * messages in the snapshots, with the weights being the time intervals
 * between the snapshots. Each resource is calculated separately
 * and the system is overloaded whenever at least one resource is overloaded.
 * The class is used by the {@apilink ConcurrencySystem} class.
 *
 * {@apilink SystemStatus.getCurrentStatus}
 * returns a boolean that represents the current status of the system.
 * The length of the current timeframe in seconds is configurable
 * by the `currentHistorySecs` option and represents the max age
 * of snapshots to be considered for the calculation.
 *
 * {@apilink SystemStatus.getHistoricalStatus}
 * returns a boolean that represents the long-term status
 * of the system, over the longer `historySecs` timeframe. Both windows are requested explicitly from every signal,
 * built-in or custom, so a signal's private snapshot retention cannot widen the window it contributes to.
 *
 * Configured through {@apilink ConcurrencySystemOptions}.
 * @category Scaling
 * @internal
 */
export class SystemStatus {
    private readonly currentHistoryMillis: number;
    private readonly historyMillis: number;
    private readonly snapshotter: Snapshotter;
    private readonly signals: LoadSignal[];

    constructor(options: SystemStatusOptions = {}) {
        ow(
            options,
            ow.object.exactShape({
                currentHistorySecs: ow.optional.number,
                historySecs: ow.optional.number,
                snapshotter: ow.optional.object,
                loadSignals: ow.optional.array,
            }),
        );

        const {
            currentHistorySecs = DEFAULT_CURRENT_HISTORY_SECS,
            historySecs = DEFAULT_SNAPSHOT_HISTORY_SECS,
            snapshotter,
            loadSignals = [],
        } = options;

        this.currentHistoryMillis = currentHistorySecs * 1000;
        this.historyMillis = historySecs * 1000;
        this.snapshotter = snapshotter || new Snapshotter();

        this.signals = [...this.snapshotter.getLoadSignals(), ...loadSignals];
    }

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
    getCurrentStatus(): SystemInfo {
        return this.isSystemIdle(this.currentHistoryMillis);
    }

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
    getHistoricalStatus(): SystemInfo {
        return this.isSystemIdle(this.historyMillis);
    }

    /**
     * Returns a system status object.
     */
    private isSystemIdle(sampleDurationMillis?: number): SystemInfo {
        const result: SystemInfo = {
            isSystemIdle: true,
            memInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
            eventLoopInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
            cpuInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
            clientInfo: { isOverloaded: false, limitRatio: 0, actualRatio: 0 },
        };

        let loadSignalInfo: Record<string, ClientInfo> | undefined;

        for (const signal of this.signals) {
            const sample = signal.getSample(sampleDurationMillis);
            const info = evaluateLoadSignalSample(sample, signal.overloadedRatio);

            if (info.isOverloaded) {
                result.isSystemIdle = false;
            }

            if (BUILTIN_SIGNAL_NAMES.has(signal.name)) {
                (result as any)[signal.name] = info;
            } else {
                loadSignalInfo ??= {};
                loadSignalInfo[signal.name] = info;
            }
        }

        if (loadSignalInfo) {
            result.loadSignalInfo = loadSignalInfo;
        }

        return result;
    }
}
